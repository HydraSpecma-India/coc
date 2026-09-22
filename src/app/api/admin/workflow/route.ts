import { route, json } from "@/lib/api/handler";
import { requireCapability } from "@/lib/auth/guards";
import { audit } from "@/lib/audit/audit";
import { Errors } from "@/lib/errors";
import { getWorkflowConfig, saveWorkflowConfig } from "@/lib/workflow/server";
import { WorkflowConfigSchema, stepsOf, validateSteps } from "@/lib/workflow/types";

export const GET = route(async () => {
  await requireCapability("manageSettings");
  return json({ ok: true, config: await getWorkflowConfig() });
});

export const PUT = route(async (req) => {
  const session = await requireCapability("manageSettings");
  const body = await req.json();
  const cfg = WorkflowConfigSchema.parse(body.config ?? body);
  const ids = new Set<string>();
  for (const r of cfg.rules) {
    if (ids.has(r.id)) throw Errors.validation(`Duplicate workflow id ${r.id}`);
    ids.add(r.id);
    const problem = validateSteps(stepsOf(r));
    if (problem) throw Errors.validation(`${r.name}: ${problem}`);
  }
  const stamped = {
    ...cfg,
    rules: cfg.rules.map((r) => ({
      ...r,
      steps: stepsOf(r),
      productionCanEnterData: undefined,
      company: (r.company || "ALL").toUpperCase(),
      updatedAt: r.updatedAt || new Date().toISOString(),
      updatedBy: r.updatedBy || session.user.email || undefined,
    })),
  };
  await saveWorkflowConfig(stamped, session.user.id);
  await audit({
    entityType: "settings",
    entityId: "workflow.inspection",
    action: "SETTINGS_CHANGED",
    user: session.user,
    details: { enabled: stamped.enabled, rules: stamped.rules.map((r) => ({ name: r.name, active: r.active, company: r.company, items: r.items.length, steps: r.steps.map((st) => `${st.name} [${st.roles.join("/") || "any"}]`) })) },
  });
  return json({ ok: true, config: stamped });
});
