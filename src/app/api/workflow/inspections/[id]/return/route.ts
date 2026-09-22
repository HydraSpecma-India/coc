import { z } from "zod";
import { route, json } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { loadInspection, transitionWorkflow } from "@/lib/workflow/server";
import { Errors } from "@/lib/errors";

const schema = z.object({ reason: z.string().trim().min(3, "Enter a reason").max(1000) });

/** Sends the COC back to the previous step (not to New COC – use Reject for that). */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const session = await requireSession();
  const body = schema.parse(await req.json());
  const x = await loadInspection(params.id, session);
  if (x.wf.state !== "PENDING_INSPECTION") throw Errors.conflict("This COC is not waiting for a workflow step.");
  if (!x.canAct) throw Errors.forbidden(`do the step "${x.step.name}"`);
  if (x.stepIndex < 2) throw Errors.validation("The previous step is New COC – reject the COC so production can create it again.");

  const now = new Date().toISOString();
  const moved = await transitionWorkflow(
    x.doc,
    "PENDING_INSPECTION",
    { state: "PENDING_INSPECTION", currentStep: x.stepIndex - 1 },
    { at: now, by: session.user.name || session.user.email || "User", action: "RETURNED", step: x.step.name, note: body.reason },
  );
  if (!moved) throw Errors.conflict("This COC was just handled by someone else. Refresh the page.");
  return json({ ok: true, step: x.steps[x.stepIndex - 1].name });
});
