import { route, json } from "@/lib/api/handler";
import { companyAllowed, requireSession, sessionCan } from "@/lib/auth/guards";
import { getCocDocumentById } from "@/lib/db/repositories/coc";
import { getWorkflowPayload, workflowOf } from "@/lib/workflow/server";
import { Errors } from "@/lib/errors";

/** Everything the inspector needs: order data prepared by production + the captured data. */
export const GET = route<{ id: string }>(async (_req, { params }) => {
  const session = await requireSession();
  const { id } = params;
  const found = await getCocDocumentById(id);
  const wf = found ? workflowOf(found.doc) : null;
  if (!found || !wf) throw Errors.notFound("Inspection");
  const { doc } = found;
  const company = String((doc.d365_context_json as Record<string, unknown> | null)?.dataAreaId || doc.customer_account || "HSIN").toUpperCase();
  if (!companyAllowed(session, company)) throw Errors.forbidden(`company ${company}`);

  const canInspect = await sessionCan(session, "completeCoc");
  const canCreate = await sessionCan(session, "createCoc");
  if (!canInspect && !canCreate) throw Errors.forbidden("view inspections");

  const email = (session.user.email || "").toLowerCase();
  const mine = (wf.submittedBy?.email || "").toLowerCase() === email;
  const payload = wf.state === "PENDING_INSPECTION" || wf.state === "ISSUING" || wf.state === "REJECTED" ? await getWorkflowPayload(id) : null;

  return json({
    ok: true,
    document: {
      id: doc.id,
      coc_number: doc.coc_number,
      status: doc.status,
      production_order: doc.production_order,
      item_number: doc.item_number,
      item_description: doc.item_description,
      serial_number: doc.serial_number,
      sales_order: doc.sales_order,
      sales_line: doc.sales_line,
      customer_po: doc.customer_po,
      quantity: doc.quantity,
      template_id: doc.template_id,
      template_version_id: doc.template_version_id,
      company,
      created_at: doc.created_at,
    },
    workflow: wf,
    payload,
    canInspect: canInspect && (wf.state === "PENDING_INSPECTION" || wf.state === "ISSUING"),
    canWithdraw: mine && wf.state === "PENDING_INSPECTION",
  });
});
