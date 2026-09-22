import "server-only";
import { z } from "zod";
import { logProcessStep, uploadGeneratedPdf, uploadAttachmentPdf, type COCDocumentRow } from "@/lib/db/repositories/coc";
import { attachmentToPdf } from "@/lib/render/coc-extras";
import { AttachmentUploadSchema, MeasurementEntrySchema, MAX_ATTACHMENTS, type StoredAttachment } from "@/lib/coc-inputs/types";
import { renderCOCPdf } from "@/lib/render/pdf-renderer";
import { D365Service } from "@/lib/integrations/d365/service";
import { TeamsService } from "@/lib/integrations/teams/service";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { logger } from "@/lib/logging/logger";
import { advanceProductSequence } from "@/lib/sequences/repository";

export const createCocSchema = z.object({
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
  /** legal entity / dataAreaId of the production order (company-wise COC numbering) */
  company: z.string().max(10).optional(),
  quantity: z.number().default(1),
  unitOfMeasure: z.string().default("Pcs"),
  batchNumber: z.string().optional(),
  deliveryDate: z.string().optional(),
  serialNumber: z.string().optional(),
  manualValues: z.record(z.string(), z.string()).optional(),
  signatureBase64: z.string().optional(),
  measurements: z.array(MeasurementEntrySchema).max(500).optional(),
  attachments: z.array(AttachmentUploadSchema).max(MAX_ATTACHMENTS).optional(),
  /** optional note from production for the quality inspector (inspection workflow) */
  workflowNote: z.string().max(1000).optional(),
});
export type CreateCocInput = z.infer<typeof createCocSchema>;

export interface ResolvedCoc {
  prodOrder: string;
  itemNum: string;
  itemDesc: string;
  customerName: string;
  deliveryDate: string;
  tplId: string;
  tplVerId: string;
}

export const uuidOrNull = (id?: string | null) => (id && /^[0-9a-f-]{36}$/i.test(id) ? id : null);

export function resolveCustomerName(input: CreateCocInput): string {
  const raw = input.customerName || input.manualValues?.["CustomerName"] || "";
  return raw && !raw.toLowerCase().includes("hydraspecma")
    ? raw
    : input.customerAccount === "HGCN" || input.company === "HGCN"
      ? "VESTAS WIND TECHNOLOGY CHINA CO LTD"
      : "VESTAS WIND TECHNOLOGYS INDIA PVT LTD";
}

/**
 * Renders, stores and registers an issued COC (PDF, supplier documents, Teams, D365, values,
 * status COMPLETED, audit). Shared by direct issue and by the quality inspection step.
 */
export async function runIssuePipeline(opts: {
  doc: COCDocumentRow;
  cocNumber: string;
  input: CreateCocInput;
  resolved: ResolvedCoc;
  user: { id?: string | null; email?: string | null };
  /** false when the serial counter was already advanced (production submitted for inspection) */
  advanceSequence: boolean;
  auditAction?: string;
  auditDetails?: Record<string, unknown>;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { doc, cocNumber, input: parsed, resolved, user } = opts;
  const { prodOrder, itemNum, itemDesc, tplId, tplVerId } = resolved;
  const resolvedCustomerName = resolved.customerName;
  const resolvedDeliveryDate = resolved.deliveryDate;
  const sb = supabaseAdmin();

  try {
    await logProcessStep(doc.id, "D365_FETCH", "OK", { productionOrder: prodOrder });
    await logProcessStep(doc.id, "VALIDATE", "OK", { quantity: parsed.quantity });

    const pdfBytes = await renderCOCPdf({
      cocNumber,
      productionOrder: prodOrder,
      itemNumber: itemNum,
      itemDescription: itemDesc,
      customerName: resolvedCustomerName,
      customerPO: parsed.customerPO || parsed.manualValues?.["CustomerPO"] || "4509008214",
      customerPartNumber: parsed.customerPartNumber || parsed.manualValues?.["CustomerPartNo"] || "160072",
      salesOrder: parsed.salesOrder || "",
      batchNumber: parsed.batchNumber || "",
      deliveryDate: resolvedDeliveryDate,
      serialNumber: parsed.serialNumber || parsed.manualValues?.["SerialNumber"] || "",
      quantity: parsed.quantity,
      unitOfMeasure: parsed.unitOfMeasure,
      manualValues: parsed.manualValues,
      signatureBase64: parsed.signatureBase64,
      isDraft: false,
      templateId: tplId,
      templateVersionId: tplVerId,
      measurements: parsed.measurements,
      attachments: parsed.attachments,
    });
    await logProcessStep(doc.id, "RENDER", "OK", {
      byteLength: pdfBytes.length,
      measurements: parsed.measurements?.length ?? 0,
      attachments: parsed.attachments?.length ?? 0,
    });

    // Store every captured supplier document individually as well (traceability / re-use)
    const storedAttachments: StoredAttachment[] = [];
    const atts = parsed.attachments ?? [];
    for (let i = 0; i < atts.length; i++) {
      const a = atts[i];
      const entry: StoredAttachment = { index: i, name: a.name, caption: a.caption, mimeType: a.mimeType, storagePath: null, pageCount: 0, sizeBytes: Math.floor((a.dataBase64.length * 3) / 4) };
      try {
        const single = await attachmentToPdf(a, { cocNumber, productionOrder: prodOrder, itemNumber: itemNum, serialNumber: parsed.serialNumber }, i, atts.length);
        entry.pageCount = single.pageCount;
        entry.storagePath = await uploadAttachmentPdf(cocNumber, i, a.name, single.bytes);
      } catch (attErr) {
        logger.warn("Attachment storage failed", { cocNumber, index: i, error: (attErr as Error).message });
      }
      storedAttachments.push(entry);
    }

    let storagePath: string | null = null;
    try {
      storagePath = await uploadGeneratedPdf(cocNumber, pdfBytes);
      await logProcessStep(doc.id, "SP_UPLOAD", "OK", { storagePath });
    } catch (spErr) {
      logger.error("Storage upload error", { error: (spErr as Error).message });
      await logProcessStep(doc.id, "SP_UPLOAD", "FAILED", {}, (spErr as Error).message);
      storagePath = `${new Date().getFullYear()}/${cocNumber}.pdf`;
    }

    try {
      await logProcessStep(doc.id, "TEAMS_WEBHOOK", "STARTED");
      const teamsRes = await TeamsService.sendCocToTeams({
        cocId: doc.id,
        cocNumber,
        productionOrder: prodOrder,
        itemNumber: itemNum,
        itemDescription: itemDesc,
        customerPO: parsed.customerPO,
        customerName: resolvedCustomerName,
        customerPartNumber: parsed.customerPartNumber,
        salesOrder: parsed.salesOrder,
        company: parsed.customerAccount || prodOrder.slice(0, 4) || "HSIN",
        serialNumber: parsed.serialNumber,
        batchNumber: parsed.batchNumber,
        deliveryDate: resolvedDeliveryDate,
        quantity: parsed.quantity,
        unitOfMeasure: parsed.unitOfMeasure,
        issuedBy: user.email || "System",
        issueDate: new Date().toISOString(),
        pdfBytes,
        storagePath,
      });
      await logProcessStep(doc.id, "TEAMS_WEBHOOK", "OK", { status: teamsRes.status });
    } catch (teamsErr) {
      logger.warn("Teams webhook notification error", { error: (teamsErr as Error).message });
      await logProcessStep(doc.id, "TEAMS_WEBHOOK", "FAILED", {}, (teamsErr as Error).message);
    }

    try {
      await D365Service.registerCOCDocument({
        COCDocumentNumber: cocNumber,
        ProductionOrder: prodOrder,
        ItemNumber: itemNum,
        CustomerPO: parsed.customerPO || "",
        SalesOrder: parsed.salesOrder || "",
        SerialNumber: parsed.serialNumber,
        BatchNumber: parsed.batchNumber,
        DeliveryDate: resolvedDeliveryDate,
        DocumentURL: storagePath,
        IssuedBy: user.email || "System",
        IssueDate: new Date().toISOString(),
      });
      await logProcessStep(doc.id, "D365_UPDATE", "OK");
    } catch (e) {
      await logProcessStep(doc.id, "D365_UPDATE", "FAILED", {}, (e as Error).message);
    }

    if (parsed.manualValues) {
      const merged = { ...parsed.manualValues, CustomerName: resolvedCustomerName };
      const valueRows = Object.entries(merged).map(([fieldName, val]) => ({
        coc_document_id: doc.id,
        field_name: fieldName,
        source_type: "MANUAL",
        value_text: val,
      }));
      if (valueRows.length > 0) {
        await sb.from("coc_document_values").upsert(valueRows, { onConflict: "coc_document_id,field_name" });
      }
    }

    const snapshotRows: Array<Record<string, unknown>> = [];
    if (parsed.measurements?.length) {
      const nok = parsed.measurements.filter((m) => m.status === "NOK").length;
      snapshotRows.push({
        coc_document_id: doc.id,
        field_name: "__measurements",
        source_type: "MANUAL",
        value_text: `${parsed.measurements.length} value(s)${nok ? `, ${nok} out of tolerance` : ""}`,
        value_json: parsed.measurements,
      });
    }
    if (storedAttachments.length) {
      snapshotRows.push({
        coc_document_id: doc.id,
        field_name: "__attachments",
        source_type: "MANUAL",
        value_text: `${storedAttachments.length} document(s)`,
        value_json: storedAttachments,
      });
    }
    if (snapshotRows.length) {
      const { error: snapErr } = await sb.from("coc_document_values").upsert(snapshotRows, { onConflict: "coc_document_id,field_name" });
      if (snapErr) logger.warn("Could not store measurement/attachment snapshot", { error: snapErr.message });
    }

    await sb
      .from("coc_documents")
      .update({
        status: "COMPLETED",
        last_error: null,
        generated_pdf_path: storagePath,
        completed_at: new Date().toISOString(),
        completed_by: uuidOrNull(user.id),
      })
      .eq("id", doc.id);

    await sb.from("coc_audit_logs").insert({
      entity_type: "COC_DOCUMENT",
      entity_id: doc.id,
      action: opts.auditAction || "GENERATE",
      user_id: uuidOrNull(user.id),
      user_email: user.email,
      coc_number: cocNumber,
      details: { productionOrder: parsed.productionOrder, itemNumber: parsed.itemNumber, ...(opts.auditDetails || {}) },
    });

    if (opts.advanceSequence && parsed.itemNumber) {
      try {
        await advanceProductSequence(parsed.itemNumber, parsed.serialNumber || undefined, (parsed.company || "").toUpperCase() || undefined);
      } catch (seqErr) {
        logger.warn("Failed to advance product sequence", { error: (seqErr as Error).message });
      }
    }

    return { ok: true };
  } catch (err) {
    logger.error("COC generation error", { error: (err as Error).message, id: doc.id });
    await sb.from("coc_documents").update({ status: "UPLOAD_FAILED", last_error: (err as Error).message }).eq("id", doc.id);
    return { ok: false, message: (err as Error).message };
  }
}
