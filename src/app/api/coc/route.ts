import { route, json } from "@/lib/api/handler";
import { requireCapability, requireSession } from "@/lib/auth/guards";
import { createCocDocument, listCocDocuments } from "@/lib/db/repositories/coc";
import { assertAttachmentSizes } from "@/lib/coc-inputs/server";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { logger } from "@/lib/logging/logger";
import { Errors } from "@/lib/errors";
import { advanceProductSequence } from "@/lib/sequences/repository";
import { createCocSchema, runIssuePipeline, uuidOrNull } from "@/lib/coc/issue";
import { getWorkflowConfig, saveWorkflowPayload } from "@/lib/workflow/server";
import { fetchRelatedData } from "@/lib/d365-data/server";
import { canIssueDirectly, matchWorkflowRule, pagesForStep, roleMatchesStep, stepsOf, type WorkflowInfo } from "@/lib/workflow/types";
import { mergeStepData, pagesIn } from "@/lib/workflow/merge";

export const GET = route(async (req) => {
  await requireSession();
  const q = req.nextUrl.searchParams.get("q") || "";
  const productionOrder = req.nextUrl.searchParams.get("productionOrder") || "";
  const limitParam = Number.parseInt(req.nextUrl.searchParams.get("limit") || "50", 10);
  const offsetParam = Number.parseInt(req.nextUrl.searchParams.get("offset") || "0", 10);
  const limit = Number.isFinite(limitParam) ? Math.min(100, Math.max(1, limitParam)) : 50;
  const offset = Number.isFinite(offsetParam) ? Math.max(0, offsetParam) : 0;
  const isoOrUndef = (v: string | null) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : undefined);
  const from = isoOrUndef(req.nextUrl.searchParams.get("from"));
  const to = isoOrUndef(req.nextUrl.searchParams.get("to"));
  const docs = await listCocDocuments({ query: q, productionOrder, limit, offset, from, to });
  return json({ ok: true, documents: docs, hasMore: docs.length === limit });
});

export const POST = route(async (req) => {
  const session = await requireSession();
  await requireCapability("createCoc");

  const body = await req.json();
  const parsed = createCocSchema.parse(body);
  assertAttachmentSizes(parsed.attachments);

  const prodOrder = (parsed.productionOrder || "").trim() || (parsed.itemNumber || "").trim() || "PO-HSIN-" + Date.now();
  const itemNum = (parsed.itemNumber || "").trim() || prodOrder;
  const itemDesc = (parsed.itemDescription || "").trim() || `HydraSpecma Assembly (${itemNum})`;

  const sb = supabaseAdmin();
  let tplId = parsed.templateId;
  let tplVerId = parsed.templateVersionId;
  let tplVerNum = parsed.templateVersionNumber;

  const isUuid = (val?: string) => Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val));

  if (!isUuid(tplId)) {
    const { data: dbTpl } = await sb
      .from("coc_templates")
      .select("id, active_version_id, name")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (dbTpl) {
      tplId = dbTpl.id;
      tplVerId = dbTpl.active_version_id;
    }
  }

  if (tplId && !isUuid(tplVerId)) {
    const { data: dbVer } = await sb
      .from("coc_template_versions")
      .select("id, version_number")
      .eq("template_id", tplId)
      .eq("status", "published")
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (dbVer) {
      tplVerId = dbVer.id;
      tplVerNum = dbVer.version_number;
    }
  }

  // Only a published version of an active (not archived) template may be used to issue a COC.
  if (isUuid(tplId) && isUuid(tplVerId)) {
    const [{ data: tplRow }, { data: verRow }] = await Promise.all([
      sb.from("coc_templates").select("status").eq("id", tplId!).maybeSingle(),
      sb.from("coc_template_versions").select("status").eq("id", tplVerId!).eq("template_id", tplId!).maybeSingle(),
    ]);
    if (tplRow && tplRow.status === "archived") {
      throw Errors.conflict("This template is archived. Choose a published template.");
    }
    if (verRow && verRow.status !== "published") {
      throw Errors.conflict("This template version is not published. Choose a published template.");
    }
  }

  // Pre-validate uniqueness of Production Order + Serial Number before insertion
  if (parsed.serialNumber && prodOrder) {
    const cleanSerial = parsed.serialNumber.trim();
    const { data: existingDoc } = await sb
      .from("coc_documents")
      .select("id, coc_number, status, serial_number")
      .eq("production_order", prodOrder)
      .eq("serial_number", cleanSerial)
      .neq("status", "CANCELLED")
      .maybeSingle();

    if (existingDoc) {
      throw Errors.conflict(
        `A Certificate of Conformity (${existingDoc.coc_number || "Certificate"}) has already been issued for Production Order "${prodOrder}" with Serial Number "${cleanSerial}". Please change the Serial Number (e.g. SN002) in Step 2 to issue a certificate for the next unit.`
      );
    }
  }

  const rawCustomer = parsed.customerName || parsed.manualValues?.["CustomerName"] || "";
  const resolvedCustomerName =
    (rawCustomer && !rawCustomer.toLowerCase().includes("hydraspecma"))
      ? rawCustomer
      : (parsed.customerAccount === "HGCN" ? "VESTAS WIND TECHNOLOGY CHINA CO LTD" : "VESTAS WIND TECHNOLOGYS INDIA PVT LTD");

  const resolvedDeliveryDate =
    parsed.deliveryDate ||
    parsed.manualValues?.["DeliveryDate"] ||
    "";

  const companyCode = (parsed.company || parsed.customerAccount || "HSIN").toUpperCase();

  // Values from the related D365FO tables (D365FO Field Mapping → Tables & relations)
  try {
    const related = await fetchRelatedData(
      {
        ProductionOrder: prodOrder,
        ItemNumber: itemNum,
        ItemDescription: itemDesc,
        SalesOrder: parsed.salesOrder,
        SalesLine: parsed.salesLine,
        CustomerAccount: parsed.customerAccount,
        CustomerName: resolvedCustomerName,
        CustomerPO: parsed.customerPO,
        CustomerPartNumber: parsed.customerPartNumber,
        SerialNumber: parsed.serialNumber,
        BatchNumber: parsed.batchNumber,
        DeliveryDate: resolvedDeliveryDate,
        Quantity: parsed.quantity,
        dataAreaId: companyCode,
      },
      companyCode,
    );
    if (Object.keys(related.values).length) {
      parsed.manualValues = { ...related.values, ...(parsed.manualValues ?? {}) };
    }
  } catch (e) {
    logger.warn("Could not read related D365 tables", { error: (e as Error).message });
  }
  const d365Context = {
    customerName: resolvedCustomerName,
    deliveryDate: resolvedDeliveryDate,
    batchNumber: parsed.batchNumber,
    unitOfMeasure: parsed.unitOfMeasure,
    customerPartNumber: parsed.customerPartNumber || parsed.manualValues?.["CustomerPartNo"] || "160072",
    externalItemNumber: parsed.customerPartNumber || parsed.manualValues?.["CustomerPartNo"] || "160072",
    dataAreaId: companyCode,
  };
  const docInput = {
    template_id: tplId!,
    template_version_id: tplVerId!,
    template_version_number: tplVerNum,
    production_order: prodOrder,
    item_number: itemNum,
    item_description: itemDesc,
    customer_po: parsed.customerPO,
    sales_order: parsed.salesOrder,
    sales_line: parsed.salesLine,
    customer_account: parsed.customerAccount,
    quantity: parsed.quantity,
    serial_number: parsed.serialNumber,
    userId: session.user.id,
    company: parsed.company || parsed.customerAccount || "HSIN",
  };

  // Inspection workflow: prepared by production, issued by quality
  const rule = matchWorkflowRule(await getWorkflowConfig(), itemNum, companyCode, tplId);
  if (rule && !canIssueDirectly(rule, session.user.role)) {
    const steps = stepsOf(rule);
    if (!roleMatchesStep(steps[0], session.user.role, true)) {
      throw Errors.forbidden(`start "${rule.name}" – step 1 is done by ${steps[0].roles.join(", ")}`);
    }
    const now = new Date().toISOString();
    const who = session.user.name || session.user.email || "User";
    const workflow: WorkflowInfo = {
      state: "PENDING_INSPECTION",
      ruleId: rule.id,
      ruleName: rule.name,
      instructions: rule.instructions,
      steps,
      currentStep: 1,
      submittedBy: { id: session.user.id, email: session.user.email, name: session.user.name },
      submittedAt: now,
      note: parsed.workflowNote?.trim() || undefined,
      history: [{ at: now, by: who, action: "SUBMITTED", step: steps[0].name, note: parsed.workflowNote?.trim() || undefined }],
    };
    // step 1 may only fill its own pages / documents – the rest is done by the next steps
    const incomingMeasurements = parsed.measurements ?? [];
    const firstStep = mergeStepData(
      {
        measurements: [],
        attachments: [],
        // page-1 values only – data-entry values come from the fields this step is allowed to fill
        manualValues: Object.fromEntries(Object.entries(parsed.manualValues ?? {}).filter(([k]) => !incomingMeasurements.some((m) => m.key === k))),
      },
      { measurements: incomingMeasurements, attachments: parsed.attachments ?? [], measurementValues: parsed.manualValues ?? {} },
      pagesForStep(steps, 0, pagesIn(incomingMeasurements)),
      steps[0].attachments,
    );
    const doc = await createCocDocument({ ...docInput, reserveNumber: false, d365_context_json: { ...d365Context, workflow } });
    try {
      await saveWorkflowPayload(doc.id, {
        ...parsed,
        productionOrder: prodOrder,
        itemNumber: itemNum,
        itemDescription: itemDesc,
        customerName: resolvedCustomerName,
        deliveryDate: resolvedDeliveryDate,
        company: companyCode,
        templateId: tplId,
        templateVersionId: tplVerId,
        templateVersionNumber: tplVerNum,
        measurements: firstStep.measurements,
        attachments: firstStep.attachments,
        manualValues: firstStep.manualValues,
      });
    } catch (e) {
      await sb.from("coc_documents").delete().eq("id", doc.id);
      throw e;
    }
    // the serial number is taken now – the next unit gets the next one
    if (itemNum) {
      try {
        await advanceProductSequence(itemNum, parsed.serialNumber || undefined, companyCode);
      } catch (seqErr) {
        logger.warn("Failed to advance product sequence", { error: (seqErr as Error).message });
      }
    }
    await sb.from("coc_audit_logs").insert({
      entity_type: "COC_DOCUMENT",
      entity_id: doc.id,
      action: "SUBMIT_FOR_INSPECTION",
      user_id: uuidOrNull(session.user.id),
      user_email: session.user.email,
      coc_number: null,
      details: { productionOrder: prodOrder, itemNumber: itemNum, serialNumber: parsed.serialNumber, workflow: rule.name },
    });
    return json({ ok: true, pending: true, documentId: doc.id, workflow: rule.name });
  }

  const doc = await createCocDocument({ ...docInput, d365_context_json: d365Context });
  const cocNumber = doc.coc_number || "COC-" + doc.id.slice(0, 8);

  const result = await runIssuePipeline({
    doc,
    cocNumber,
    input: parsed,
    resolved: { prodOrder, itemNum, itemDesc, customerName: resolvedCustomerName, deliveryDate: resolvedDeliveryDate, tplId: tplId!, tplVerId: tplVerId! },
    user: { id: session.user.id, email: session.user.email },
    advanceSequence: true,
  });
  if (!result.ok) {
    return json(
      { ok: false, error: { code: "GENERATION_FAILED", message: result.message }, documentId: doc.id },
      { status: 500 },
    );
  }
  return json({ ok: true, documentId: doc.id, cocNumber });
});
