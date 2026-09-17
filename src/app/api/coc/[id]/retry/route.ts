import { route, json } from "@/lib/api/handler";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getCocDocumentById, getGeneratedPdfBytes, logProcessStep } from "@/lib/db/repositories/coc";
import { D365Service } from "@/lib/integrations/d365/service";
import { TeamsService } from "@/lib/integrations/teams/service";
import { supabaseAdmin } from "@/lib/db/supabase-admin";

export const POST = route(async (_req, { params }) => {
  const session = await requireSession();
  requireRole(session, ["Admin", "Quality", "Production"]);

  const { id } = await params;
  const result = await getCocDocumentById(id);
  if (!result) return json({ ok: false, error: "Document not found" }, { status: 404 });

  const { doc, steps } = result;
  const sb = supabaseAdmin();

  const failedTeams = steps.some((s) => s.step === "TEAMS_WEBHOOK" && s.status === "FAILED");
  const failedD365 = steps.some((s) => s.step === "D365_UPDATE" && s.status === "FAILED");

  // Retry Teams Webhook if it failed
  if (failedTeams) {
    try {
      let pdfBytes: Uint8Array | null = null;
      if (doc.generated_pdf_path) {
        try {
          pdfBytes = await getGeneratedPdfBytes(doc.generated_pdf_path);
        } catch {}
      }

      const ctx = (doc.d365_context_json as Record<string, any>) || {};
      await TeamsService.sendCocToTeams({
        cocId: doc.id,
        cocNumber: doc.coc_number || `COC-${doc.id.slice(0, 8)}`,
        productionOrder: doc.production_order,
        itemNumber: doc.item_number || "",
        itemDescription: doc.item_description || "",
        customerPO: doc.customer_po,
        customerName: ctx.customerName,
        deliveryDate: ctx.deliveryDate,
        salesOrder: doc.sales_order,
        serialNumber: doc.serial_number,
        quantity: doc.quantity,
        issuedBy: session.user.email || "System",
        issueDate: doc.created_at,
        pdfBytes,
        storagePath: doc.generated_pdf_path,
      });

      await logProcessStep(doc.id, "TEAMS_WEBHOOK", "OK", { retriedBy: session.user.email });
      return json({ ok: true, message: "Teams notification retried and succeeded!" });
    } catch (err) {
      await logProcessStep(doc.id, "TEAMS_WEBHOOK", "FAILED", { retriedBy: session.user.email }, (err as Error).message);
      return json({ ok: false, error: (err as Error).message }, { status: 500 });
    }
  }

  // Retry D365 Update
  try {
    await D365Service.registerCOCDocument({
      COCDocumentNumber: doc.coc_number || `COC-${doc.id.slice(0, 8)}`,
      ProductionOrder: doc.production_order,
      ItemNumber: doc.item_number || "",
      CustomerPO: doc.customer_po || "",
      SalesOrder: doc.sales_order || "",
      SerialNumber: doc.serial_number || undefined,
      DocumentURL: doc.generated_pdf_path || "",
      IssuedBy: session.user.email || "System",
      IssueDate: new Date().toISOString(),
    });

    await logProcessStep(doc.id, "D365_UPDATE", "OK", { retriedBy: session.user.email });
    await sb.from("coc_documents").update({ status: "COMPLETED", last_error: null }).eq("id", doc.id);

    return json({ ok: true, message: "D365 registration retried and succeeded!" });
  } catch (err) {
    await logProcessStep(doc.id, "D365_UPDATE", "FAILED", { retriedBy: session.user.email }, (err as Error).message);
    return json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});
