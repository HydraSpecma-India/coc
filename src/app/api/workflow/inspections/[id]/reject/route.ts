import { z } from "zod";
import { route, json } from "@/lib/api/handler";
import { companyAllowed, requireSession, sessionCan } from "@/lib/auth/guards";
import { getCocDocumentById } from "@/lib/db/repositories/coc";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { transitionWorkflow, workflowOf } from "@/lib/workflow/server";
import { uuidOrNull } from "@/lib/coc/issue";
import { Errors } from "@/lib/errors";

const schema = z.object({
  reason: z.string().trim().min(3, "Enter a reason").max(1000),
  /** production withdraws its own submission */
  withdraw: z.boolean().default(false),
});

/** Quality rejects (or production withdraws) a COC waiting for inspection. The serial number is released. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const session = await requireSession();
  const { id } = params;
  const body = schema.parse(await req.json());

  const found = await getCocDocumentById(id);
  const wf = found ? workflowOf(found.doc) : null;
  if (!found || !wf) throw Errors.notFound("Inspection");
  const doc = found.doc;
  const company = String((doc.d365_context_json as Record<string, unknown> | null)?.dataAreaId || doc.customer_account || "HSIN").toUpperCase();
  if (!companyAllowed(session, company)) throw Errors.forbidden(`company ${company}`);

  const mine = (wf.submittedBy?.email || "").toLowerCase() === (session.user.email || "").toLowerCase();
  if (body.withdraw ? !mine && !(await sessionCan(session, "completeCoc")) : !(await sessionCan(session, "completeCoc"))) {
    throw Errors.forbidden(body.withdraw ? "withdraw this submission" : "reject inspections");
  }
  if (wf.state !== "PENDING_INSPECTION") throw Errors.conflict("Only COCs waiting for inspection can be rejected.");

  const now = new Date().toISOString();
  const who = session.user.name || session.user.email || "User";
  const updated = await transitionWorkflow(
    doc,
    "PENDING_INSPECTION",
    { state: "REJECTED", rejectReason: body.reason, inspectedBy: { id: session.user.id, email: session.user.email, name: session.user.name }, inspectedAt: now },
    { at: now, by: who, action: body.withdraw ? "WITHDRAWN" : "REJECTED", note: body.reason },
    { status: "CANCELLED", last_error: `${body.withdraw ? "Withdrawn" : "Rejected in inspection"}: ${body.reason}` },
  );
  if (!updated) throw Errors.conflict("This COC was just handled by someone else. Refresh the list.");

  await supabaseAdmin().from("coc_audit_logs").insert({
    entity_type: "COC_DOCUMENT",
    entity_id: id,
    action: body.withdraw ? "WITHDRAW_INSPECTION" : "REJECT_INSPECTION",
    user_id: uuidOrNull(session.user.id),
    user_email: session.user.email,
    coc_number: null,
    details: { productionOrder: doc.production_order, itemNumber: doc.item_number, serialNumber: doc.serial_number, reason: body.reason },
  });
  return json({ ok: true });
});
