import { z } from "zod";
import { route, json } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { assertAttachmentSizes } from "@/lib/coc-inputs/server";
import { AttachmentUploadSchema, MeasurementEntrySchema, MAX_ATTACHMENTS } from "@/lib/coc-inputs/types";
import type { CreateCocInput } from "@/lib/coc/issue";
import { getWorkflowPayload, loadInspection, saveWorkflowPayload, transitionWorkflow } from "@/lib/workflow/server";
import { mergeStepData, pagesIn } from "@/lib/workflow/merge";
import { pagesForStep } from "@/lib/workflow/types";
import { Errors } from "@/lib/errors";

const schema = z.object({
  measurements: z.array(MeasurementEntrySchema).max(500).default([]),
  attachments: z.array(AttachmentUploadSchema).max(MAX_ATTACHMENTS).default([]),
  measurementValues: z.record(z.string(), z.string()).default({}),
  note: z.string().max(1000).optional(),
});

/** Completes the current (not last) step: saves its data and hands the COC to the next step. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const session = await requireSession();
  const body = schema.parse(await req.json());
  assertAttachmentSizes(body.attachments);
  const x = await loadInspection(params.id, session);
  if (x.wf.state !== "PENDING_INSPECTION") throw Errors.conflict("This COC is not waiting for a workflow step.");
  if (!x.canAct) throw Errors.forbidden(`do the step "${x.step.name}"`);
  if (x.isFinal) throw Errors.validation("This is the last step – sign and issue the COC.");

  const payload = (await getWorkflowPayload(x.doc.id)) ?? ({} as CreateCocInput);
  const base = { measurements: payload.measurements ?? [], attachments: payload.attachments ?? [], manualValues: payload.manualValues ?? {} };
  const merged = mergeStepData(base, body, pagesForStep(x.steps, x.stepIndex, pagesIn(base.measurements, body.measurements)), x.step.attachments);

  const now = new Date().toISOString();
  const who = session.user.name || session.user.email || "User";
  const next = x.steps[x.stepIndex + 1];
  // move the step first (guards against two people completing it), then store the data
  const moved = await transitionWorkflow(
    x.doc,
    "PENDING_INSPECTION",
    { state: "PENDING_INSPECTION", currentStep: x.stepIndex + 1 },
    { at: now, by: who, action: "STEP_COMPLETED", step: x.step.name, note: body.note?.trim() || undefined },
  );
  if (!moved) throw Errors.conflict("Someone else just completed this step. Refresh the page.");
  await saveWorkflowPayload(x.doc.id, { ...payload, ...merged });
  return json({ ok: true, nextStep: next?.name ?? null });
});
