import { route, json } from "@/lib/api/handler";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getCocDocumentById, logProcessStep } from "@/lib/db/repositories/coc";
import { D365Service } from "@/lib/integrations/d365/service";
import { supabaseAdmin } from "@/lib/db/supabase-admin";

export const POST = route(async (_req, { params }) => {
  const session = await requireSession();
  requireRole(session, ["Admin", "Quality", "Production"]);

  const { id } = await params;
  const result = await getCocDocumentById(id);
  if (!result) return json({ ok: false, error: "Document not found" }, { status: 404 });

  const { doc } = result;
  const sb = supabaseAdmin();

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
