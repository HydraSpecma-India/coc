import { route, json } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { getWorkflowConfig } from "@/lib/workflow/server";
import { canIssueDirectly, matchWorkflowRule } from "@/lib/workflow/types";

/** Does the inspection workflow apply to this item / company for the signed-in user? */
export const GET = route(async (req) => {
  const session = await requireSession();
  const item = (req.nextUrl.searchParams.get("itemNumber") || "").trim();
  const company = (req.nextUrl.searchParams.get("company") || "").trim().toUpperCase();
  const cfg = await getWorkflowConfig();
  const rule = item ? matchWorkflowRule(cfg, item, company) : null;
  if (!rule) return json({ ok: true, enabled: cfg.enabled, applies: false });
  const direct = canIssueDirectly(rule, session.user.role);
  return json({
    ok: true,
    enabled: cfg.enabled,
    applies: !direct,
    direct,
    rule: { id: rule.id, name: rule.name, instructions: rule.instructions || "", productionCanEnterData: rule.productionCanEnterData },
  });
});
