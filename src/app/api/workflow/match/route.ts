import { route, json } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { getWorkflowConfig } from "@/lib/workflow/server";
import { canIssueDirectly, matchWorkflowRule, roleMatchesStep, stepsOf } from "@/lib/workflow/types";

/** Does a workflow apply to this item / company / template for the signed-in user – and what is step 1? */
export const GET = route(async (req) => {
  const session = await requireSession();
  const item = (req.nextUrl.searchParams.get("itemNumber") || "").trim();
  const company = (req.nextUrl.searchParams.get("company") || "").trim().toUpperCase();
  const templateId = (req.nextUrl.searchParams.get("templateId") || "").trim() || null;
  const cfg = await getWorkflowConfig();
  const rule = item ? matchWorkflowRule(cfg, item, company, templateId) : null;
  if (!rule) return json({ ok: true, enabled: cfg.enabled, applies: false });
  const direct = canIssueDirectly(rule, session.user.role);
  const steps = stepsOf(rule);
  return json({
    ok: true,
    enabled: cfg.enabled,
    applies: !direct,
    direct,
    canStart: roleMatchesStep(steps[0], session.user.role, true),
    rule: {
      id: rule.id,
      name: rule.name,
      instructions: rule.instructions || "",
      firstStep: steps[0],
      nextSteps: steps.slice(1).map((s) => ({ name: s.name, roles: s.roles })),
    },
  });
});
