import { z } from "zod";
import { route, json } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { loadInspection, transitionWorkflow } from "@/lib/workflow/server";
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

  const x = await loadInspection(id, session);
  const { doc, wf, mine } = x;
  // reject: whoever does the current step · withdraw: the person who sent it
  if (body.withdraw ? !mine && !x.canAct : !x.canAct) {
    throw Errors.forbidden(body.withdraw ? "withdraw this submission" : `reject at step "${x.step.name}"`);
  }
  if (wf.state !== "PENDING_INSPECTION") throw Errors.conflict("Only COCs waiting for inspection can be rejected.");

  const now = new Date().toISOString();
  const who = session.user.name || session.user.email || "User";
  const updated = await transitionWorkflow(
    doc,
    "PENDING_INSPECTION",
    { state: "REJECTED", rejectReason: body.reason, inspectedBy: { id: session.user.id, email: session.user.email, name: session.user.name }, inspectedAt: now },
    { at: now, by: who, action: body.withdraw ? "WITHDRAWN" : "REJECTED", step: x.step.name, note: body.reason },
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
