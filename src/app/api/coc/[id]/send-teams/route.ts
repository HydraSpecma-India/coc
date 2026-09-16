import { route, json } from "@/lib/api/handler";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getCocDocumentById, getGeneratedPdfBytes, logProcessStep } from "@/lib/db/repositories/coc";
import { TeamsService } from "@/lib/integrations/teams/service";
import { renderCOCPdf } from "@/lib/render/pdf-renderer";
import { logger } from "@/lib/logging/logger";

export const POST = route(async (_req, { params }) => {
  const session = await requireSession();
  requireRole(session, ["Admin", "Quality", "Production"]);

  const { id } = await params;
  const result = await getCocDocumentById(id);
  if (!result) {
    return json({ ok: false, error: "Document not found" }, { status: 404 });
  }

  const { doc, values } = result;

  // Retrieve PDF bytes
  let pdfBytes: Uint8Array | null = null;
  if (doc.generated_pdf_path) {
    try {
      pdfBytes = await getGeneratedPdfBytes(doc.generated_pdf_path);
    } catch (e) {
      logger.warn("Could not retrieve stored PDF, regenerating:", { error: String(e) });
    }
  }

  // If stored PDF wasn't available, regenerate from document context
  if (!pdfBytes) {
    try {
      const manualValues: Record<string, string> = {};
      for (const v of values) {
        if (v.value_text) manualValues[v.field_name] = v.value_text;
      }
      pdfBytes = await renderCOCPdf({
        cocNumber: doc.coc_number || `COC-${doc.id.slice(0, 8)}`,
        productionOrder: doc.production_order,
        itemNumber: doc.item_number || "",
        itemDescription: doc.item_description || "",
        customerPO: doc.customer_po || undefined,
        salesOrder: doc.sales_order || undefined,
        serialNumber: doc.serial_number || undefined,
        quantity: doc.quantity || 1,
        manualValues,
        templateId: doc.template_id,
        templateVersionId: doc.template_version_id,
        isDraft: false,
      });
    } catch (renderErr) {
      logger.error("Failed to regenerate PDF for Teams send", { error: (renderErr as Error).message });
    }
  }

  try {
    await logProcessStep(doc.id, "TEAMS_WEBHOOK", "STARTED", { retriedBy: session.user.email });

    const teamsRes = await TeamsService.sendCocToTeams({
      cocId: doc.id,
      cocNumber: doc.coc_number || `COC-${doc.id.slice(0, 8)}`,
      productionOrder: doc.production_order,
      itemNumber: doc.item_number || "",
      itemDescription: doc.item_description || "",
      customerPO: doc.customer_po,
      salesOrder: doc.sales_order,
      serialNumber: doc.serial_number,
      quantity: doc.quantity,
      issuedBy: session.user.email || "System",
      issueDate: doc.created_at,
      pdfBytes,
      storagePath: doc.generated_pdf_path,
    });

    await logProcessStep(doc.id, "TEAMS_WEBHOOK", "OK", {
      status: teamsRes.status,
      sentBy: session.user.email,
    });

    return json({
      ok: true,
      message: `Successfully posted ${doc.coc_number || "Certificate"} to Teams channel!`,
    });
  } catch (err) {
    const errMsg = (err as Error).message;
    await logProcessStep(doc.id, "TEAMS_WEBHOOK", "FAILED", { retriedBy: session.user.email }, errMsg);
    return json({ ok: false, error: errMsg }, { status: 500 });
  }
});
