import { z } from "zod";
import { route, json } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { assertAttachmentSizes } from "@/lib/coc-inputs/server";
import { AttachmentUploadSchema, MeasurementEntrySchema, MAX_ATTACHMENTS } from "@/lib/coc-inputs/types";
import { runIssuePipeline, type CreateCocInput } from "@/lib/coc/issue";
import { reserveCompanyCocNumber } from "@/lib/sequences/coc-numbers";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { getWorkflowPayload, loadInspection, transitionWorkflow, WORKFLOW_PAYLOAD_FIELD } from "@/lib/workflow/server";
import { mergeStepData, pagesIn } from "@/lib/workflow/merge";
import { pagesForStep } from "@/lib/workflow/types";
import { Errors } from "@/lib/errors";
import { logger } from "@/lib/logging/logger";

const issueSchema = z.object({
  measurements: z.array(MeasurementEntrySchema).max(500).default([]),
  attachments: z.array(AttachmentUploadSchema).max(MAX_ATTACHMENTS).default([]),
  /** values stamped on the template pages (after each field's print format) */
  measurementValues: z.record(z.string(), z.string()).default({}),
  signatureBase64: z.string().min(50, "Sign the certificate before issuing it"),
  note: z.string().max(1000).optional(),
});

const STALE_CLAIM_MS = 5 * 60 * 1000;

/** Quality: enter inspection data, sign and issue a COC prepared by production. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const session = await requireSession();
  const { id } = params;
  const body = issueSchema.parse(await req.json());
  assertAttachmentSizes(body.attachments);

  const x = await loadInspection(id, session);
  const { doc, wf, company } = x;
  if (wf.state === "ISSUED") throw Errors.conflict(`This COC was already issued as ${doc.coc_number}.`);
  if (wf.state === "REJECTED") throw Errors.conflict("This COC was rejected and can no longer be issued.");
  if (!x.isFinal) throw Errors.validation(`The COC is at step "${x.step.name}" – complete the steps before it is issued.`);
  if (!x.canAct) throw Errors.forbidden(`sign and issue this COC (step "${x.step.name}")`);

  // claim the document so two inspectors cannot issue it at the same time
  let claimed = await transitionWorkflow(doc, "PENDING_INSPECTION", { state: "ISSUING" }, null);
  if (!claimed && wf.state === "ISSUING" && Date.now() - Date.parse(doc.updated_at) > STALE_CLAIM_MS) {
    claimed = await transitionWorkflow(doc, "ISSUING", { state: "ISSUING" }, null);
  }
  if (!claimed) throw Errors.conflict("Another inspector is issuing this COC right now. Refresh in a moment.");

  const who = session.user.name || session.user.email || "Quality";
  const payload = (await getWorkflowPayload(id)) ?? ({} as CreateCocInput);

  // The last step fills its own pages + every page no earlier step handled; earlier steps' data stays
  const base = { measurements: payload.measurements ?? [], attachments: payload.attachments ?? [], manualValues: payload.manualValues ?? {} };
  const merged = mergeStepData(base, body, pagesForStep(x.steps, x.stepIndex, pagesIn(base.measurements, body.measurements)), x.step.attachments);
  const input: CreateCocInput = {
    ...payload,
    quantity: payload.quantity ?? doc.quantity ?? 1,
    unitOfMeasure: payload.unitOfMeasure || "Pcs",
    templateVersionNumber: payload.templateVersionNumber ?? doc.template_version_number,
    manualValues: merged.manualValues,
    measurements: merged.measurements,
    attachments: merged.attachments,
    signatureBase64: body.signatureBase64,
  };

  let cocNumber = claimed.coc_number;
  try {
    if (!cocNumber) {
      cocNumber = await reserveCompanyCocNumber(company);
      const { error } = await supabaseAdmin().from("coc_documents").update({ coc_number: cocNumber }).eq("id", id);
      if (error) throw error;
    }
  } catch (e) {
    await transitionWorkflow(claimed, "ISSUING", { state: "PENDING_INSPECTION" }, null);
    throw e;
  }

  const result = await runIssuePipeline({
    doc: { ...claimed, coc_number: cocNumber },
    cocNumber,
    input,
    resolved: {
      prodOrder: doc.production_order,
      itemNum: doc.item_number || doc.production_order,
      itemDesc: doc.item_description || "",
      customerName: payload.customerName || String((doc.d365_context_json as Record<string, unknown> | null)?.customerName || ""),
      deliveryDate: payload.deliveryDate || "",
      tplId: doc.template_id,
      tplVerId: doc.template_version_id,
    },
    user: { id: session.user.id, email: session.user.email },
    advanceSequence: false, // advanced when production submitted it
    auditAction: "INSPECT_AND_ISSUE",
    auditDetails: { workflow: wf.ruleName, preparedBy: wf.submittedBy?.email, inspectedBy: session.user.email },
  });

  const now = new Date().toISOString();
  if (!result.ok) {
    await transitionWorkflow(claimed, "ISSUING", { state: "PENDING_INSPECTION" }, { at: now, by: who, action: "ISSUE_FAILED", note: result.message });
    return json({ ok: false, error: { code: "GENERATION_FAILED", message: result.message }, documentId: id }, { status: 500 });
  }

  await transitionWorkflow(
    claimed,
    "ISSUING",
    { state: "ISSUED", inspectedBy: { id: session.user.id, email: session.user.email, name: session.user.name }, inspectedAt: now },
    { at: now, by: who, action: "ISSUED", step: x.step.name, note: body.note?.trim() || undefined },
  );
  // the prepared payload (with the raw photos) is no longer needed – the issued values are stored on the COC
  const { error: delErr } = await supabaseAdmin().from("coc_document_values").delete().eq("coc_document_id", id).eq("field_name", WORKFLOW_PAYLOAD_FIELD);
  if (delErr) logger.warn("Could not remove workflow payload", { id, error: delErr.message });

  return json({ ok: true, documentId: id, cocNumber });
});
