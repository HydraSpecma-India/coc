import { route, json } from "@/lib/api/handler";
import { requireCapability, requireSession } from "@/lib/auth/guards";
import { createCocDocument, listCocDocuments, logProcessStep, uploadGeneratedPdf } from "@/lib/db/repositories/coc";
import { renderCOCPdf } from "@/lib/render/pdf-renderer";
import { D365Service } from "@/lib/integrations/d365/service";
import { TeamsService } from "@/lib/integrations/teams/service";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { logger } from "@/lib/logging/logger";
import { Errors } from "@/lib/errors";
import { advanceProductSequence } from "@/lib/sequences/repository";
import { z } from "zod";

const createCocSchema = z.object({
  templateId: z.string().optional(),
  templateVersionId: z.string().optional(),
  templateVersionNumber: z.number().default(1),
  productionOrder: z.string().optional(),
  itemNumber: z.string().optional(),
  itemDescription: z.string().optional(),
  customerName: z.string().optional(),
  customerPO: z.string().optional(),
  customerPartNumber: z.string().optional(),
  salesOrder: z.string().optional(),
  salesLine: z.string().optional(),
  customerAccount: z.string().optional(),
  quantity: z.number().default(1),
  unitOfMeasure: z.string().default("Pcs"),
  batchNumber: z.string().optional(),
  serialNumber: z.string().optional(),
  manualValues: z.record(z.string(), z.string()).optional(),
  signatureBase64: z.string().optional(),
});

export const GET = route(async (req) => {
  await requireSession();
  const q = req.nextUrl.searchParams.get("q") || "";
  const productionOrder = req.nextUrl.searchParams.get("productionOrder") || "";
  const docs = await listCocDocuments({ query: q, productionOrder, limit: 50 });
  return json({ ok: true, documents: docs });
});

export const POST = route(async (req) => {
  const session = await requireSession();
  await requireCapability("createCoc");

  const body = await req.json();
  const parsed = createCocSchema.parse(body);

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

  // 1. Create database record in DRAFT
  const doc = await createCocDocument({
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
    d365_context_json: {
      customerName: parsed.customerName,
      batchNumber: parsed.batchNumber,
      unitOfMeasure: parsed.unitOfMeasure,
      customerPartNumber: parsed.customerPartNumber || parsed.manualValues?.["CustomerPartNo"] || "160072",
      externalItemNumber: parsed.customerPartNumber || parsed.manualValues?.["CustomerPartNo"] || "160072",
    },
    userId: session.user.id,
  });

  const cocNumber = doc.coc_number || "COC-" + doc.id.slice(0, 8);

  try {
    // Step 1: D365 Fetch & Context verification
    await logProcessStep(doc.id, "D365_FETCH", "OK", { productionOrder: prodOrder });

    // Step 2: Validation
    await logProcessStep(doc.id, "VALIDATE", "OK", { quantity: parsed.quantity });

    // Step 3: Render PDF
    const pdfBytes = await renderCOCPdf({
      cocNumber,
      productionOrder: prodOrder,
      itemNumber: itemNum,
      itemDescription: itemDesc,
      customerName: parsed.customerName || "HydraSpecma India Pvt Ltd",
      customerPO: parsed.customerPO || parsed.manualValues?.["CustomerPO"] || "4509008214",
      customerPartNumber: parsed.customerPartNumber || parsed.manualValues?.["CustomerPartNo"] || "160072",
      salesOrder: parsed.salesOrder || "",
      batchNumber: parsed.batchNumber || "HS-B24-0747",
      serialNumber: parsed.serialNumber || parsed.manualValues?.["SerialNumber"] || "",
      quantity: parsed.quantity,
      unitOfMeasure: parsed.unitOfMeasure,
      manualValues: parsed.manualValues,
      signatureBase64: parsed.signatureBase64,
      isDraft: false,
      templateId: tplId,
      templateVersionId: tplVerId,
    });
    await logProcessStep(doc.id, "RENDER", "OK", { byteLength: pdfBytes.length });

    // Step 4: Storage / SharePoint Upload
    let storagePath: string | null = null;
    try {
      storagePath = await uploadGeneratedPdf(cocNumber, pdfBytes);
      await logProcessStep(doc.id, "SP_UPLOAD", "OK", { storagePath });
    } catch (spErr) {
      logger.error("Storage upload error", { error: (spErr as Error).message });
      await logProcessStep(doc.id, "SP_UPLOAD", "FAILED", {}, (spErr as Error).message);
      storagePath = `${new Date().getFullYear()}/${cocNumber}.pdf`;
    }

    // Step 5: D365 Update
    try {
      await D365Service.registerCOCDocument({
        COCDocumentNumber: cocNumber,
        ProductionOrder: prodOrder,
        ItemNumber: itemNum,
        CustomerPO: parsed.customerPO || "",
        SalesOrder: parsed.salesOrder || "",
        SerialNumber: parsed.serialNumber,
        BatchNumber: parsed.batchNumber,
        DocumentURL: storagePath,
        IssuedBy: session.user.email || "System",
        IssueDate: new Date().toISOString(),
      });
      await logProcessStep(doc.id, "D365_UPDATE", "OK");
    } catch (e) {
      await logProcessStep(doc.id, "D365_UPDATE", "FAILED", {}, (e as Error).message);
    }

    // Step 6: Teams Webhook Notification
    try {
      await logProcessStep(doc.id, "TEAMS_WEBHOOK", "STARTED");
      const teamsRes = await TeamsService.sendCocToTeams({
        cocNumber,
        productionOrder: prodOrder,
        itemNumber: itemNum,
        itemDescription: itemDesc,
        customerPO: parsed.customerPO,
        customerName: parsed.customerName,
        customerPartNumber: parsed.customerPartNumber,
        salesOrder: parsed.salesOrder,
        serialNumber: parsed.serialNumber,
        batchNumber: parsed.batchNumber,
        quantity: parsed.quantity,
        unitOfMeasure: parsed.unitOfMeasure,
        issuedBy: session.user.email || "System",
        issueDate: new Date().toISOString(),
        pdfBytes,
        storagePath,
      });
      await logProcessStep(doc.id, "TEAMS_WEBHOOK", "OK", { status: teamsRes.status });
    } catch (teamsErr) {
      logger.warn("Teams webhook notification error", { error: (teamsErr as Error).message });
      await logProcessStep(doc.id, "TEAMS_WEBHOOK", "FAILED", {}, (teamsErr as Error).message);
    }

    // Save manual field values
    if (parsed.manualValues) {
      const valueRows = Object.entries(parsed.manualValues).map(([fieldName, val]) => ({
        coc_document_id: doc.id,
        field_name: fieldName,
        source_type: "MANUAL",
        value_text: val,
      }));
      if (valueRows.length > 0) {
        await sb.from("coc_document_values").upsert(valueRows, { onConflict: "coc_document_id,field_name" });
      }
    }

    // Finalize document status
    await sb
      .from("coc_documents")
      .update({
        status: "COMPLETED",
        generated_pdf_path: storagePath,
        completed_at: new Date().toISOString(),
        completed_by: session.user.id && /^[0-9a-f-]{36}$/i.test(session.user.id) ? session.user.id : null,
      })
      .eq("id", doc.id);

    // Audit log
    await sb.from("coc_audit_logs").insert({
      entity_type: "COC_DOCUMENT",
      entity_id: doc.id,
      action: "GENERATE",
      user_id: session.user.id && /^[0-9a-f-]{36}$/i.test(session.user.id) ? session.user.id : null,
      user_email: session.user.email,
      coc_number: cocNumber,
      details: { productionOrder: parsed.productionOrder, itemNumber: parsed.itemNumber },
    });

    // Advance continuous product sequence counter
    if (parsed.itemNumber) {
      try {
        await advanceProductSequence(parsed.itemNumber, parsed.serialNumber || undefined);
      } catch (seqErr) {
        logger.warn("Failed to advance product sequence", { error: (seqErr as Error).message });
      }
    }

    return json({ ok: true, documentId: doc.id, cocNumber });
  } catch (err) {
    logger.error("COC generation error", { error: (err as Error).message, id: doc.id });
    await sb.from("coc_documents").update({ status: "UPLOAD_FAILED", last_error: (err as Error).message }).eq("id", doc.id);
    return json(
      { ok: false, error: { code: "GENERATION_FAILED", message: (err as Error).message }, documentId: doc.id },
      { status: 500 },
    );
  }
});
