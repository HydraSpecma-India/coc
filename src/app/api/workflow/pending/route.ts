import { route, json } from "@/lib/api/handler";
import { companyAllowed, requireSession, sessionCan } from "@/lib/auth/guards";
import { getWorkflowConfig, isUsersTurn, listWorkflowDocs } from "@/lib/workflow/server";
import { currentStepIndex, stepsOfInfo } from "@/lib/workflow/types";

/**
 * GET ?state=pending|rejected   → COCs in the workflow (with the current step and whose turn it is)
 * GET ?count=1                  → { enabled, count } – COCs waiting for the signed-in user's step (menu badge)
 */
export const GET = route(async (req) => {
  const session = await requireSession();
  const canComplete = await sessionCan(session, "completeCoc");
  const canCreate = await sessionCan(session, "createCoc");
  const cfg = await getWorkflowConfig();
  const role = session.user.role;
  const email = (session.user.email || "").toLowerCase();

  if (req.nextUrl.searchParams.get("count")) {
    const hasRules = cfg.enabled && cfg.rules.some((r) => r.active);
    const docs = await listWorkflowDocs("PENDING_INSPECTION", 500).catch(() => []);
    const visible = docs.filter((d) => companyAllowed(session, d.company));
    const mineOrTurn = visible.filter((d) => isUsersTurn(d.workflow, role, canComplete) || (d.workflow.submittedBy?.email || "").toLowerCase() === email);
    const count = visible.filter((d) => isUsersTurn(d.workflow, role, canComplete)).length;
    // keep the menu while COCs are still in the workflow, even if it was switched off
    return json({ ok: true, enabled: hasRules || mineOrTurn.length > 0 || (canComplete && visible.length > 0), count });
  }

  const state = req.nextUrl.searchParams.get("state") === "rejected" ? "REJECTED" : "PENDING_INSPECTION";
  const docs = (await listWorkflowDocs(state)).filter((d) => companyAllowed(session, d.company));
  const rows = docs.map((d) => {
    const steps = stepsOfInfo(d.workflow);
    const idx = currentStepIndex(d.workflow);
    return {
      ...d,
      mine: (d.workflow.submittedBy?.email || "").toLowerCase() === email,
      yourTurn: isUsersTurn(d.workflow, role, canComplete),
      stepIndex: idx,
      stepCount: steps.length,
      stepName: steps[idx]?.name ?? "",
      stepRoles: steps[idx]?.roles ?? [],
    };
  });
  // users without COC permissions only see COCs they sent or that wait for their step
  const visible = canComplete || canCreate ? rows : rows.filter((r) => r.mine || r.yourTurn);
  return json({ ok: true, enabled: cfg.enabled, canInspect: canComplete, documents: visible });
});
