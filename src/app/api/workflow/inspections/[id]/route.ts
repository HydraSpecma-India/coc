import { route, json } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { getWorkflowPayload, loadInspection } from "@/lib/workflow/server";
import { Errors } from "@/lib/errors";

/** Everything the next step needs: order data from production + the data entered so far. */
export const GET = route<{ id: string }>(async (_req, { params }) => {
  const session = await requireSession();
  const x = await loadInspection(params.id, session);
  if (!x.canComplete && !x.canCreate && !x.canAct) throw Errors.forbidden("view inspections");
  const { doc, wf } = x;
  const open = wf.state === "PENDING_INSPECTION" || wf.state === "ISSUING" || wf.state === "REJECTED";
  const payload = open ? await getWorkflowPayload(doc.id) : null;

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
      company: x.company,
      created_at: doc.created_at,
    },
    workflow: wf,
    steps: x.steps,
    stepIndex: x.stepIndex,
    isFinal: x.isFinal,
    payload,
    canInspect: x.canAct,
    canWithdraw: x.mine && wf.state === "PENDING_INSPECTION",
  });
});
