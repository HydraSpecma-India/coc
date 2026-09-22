import { route, json } from "@/lib/api/handler";
import { companyAllowed, requireSession, sessionCan } from "@/lib/auth/guards";
import { countPending, getWorkflowConfig, listWorkflowDocs } from "@/lib/workflow/server";
import { Errors } from "@/lib/errors";

/**
 * GET ?state=pending|rejected   → documents in the inspection workflow
 * GET ?count=1                  → { enabled, count } for the menu badge
 */
export const GET = route(async (req) => {
  const session = await requireSession();
  const canInspect = await sessionCan(session, "completeCoc");
  const canCreate = await sessionCan(session, "createCoc");
  const cfg = await getWorkflowConfig();

  if (req.nextUrl.searchParams.get("count")) {
    if (!canInspect && !canCreate) return json({ ok: true, enabled: false, count: 0 });
    const hasRules = cfg.rules.some((r) => r.active);
    const count = await countPending().catch(() => 0);
    // keep the menu while documents are still waiting, even if the workflow was switched off
    return json({ ok: true, enabled: (cfg.enabled && hasRules) || count > 0, count });
  }

  if (!canInspect && !canCreate) throw Errors.forbidden("view pending inspections");
  const state = req.nextUrl.searchParams.get("state") === "rejected" ? "REJECTED" : "PENDING_INSPECTION";
  const docs = (await listWorkflowDocs(state)).filter((d) => companyAllowed(session, d.company));
  const email = (session.user.email || "").toLowerCase();
  return json({
    ok: true,
    enabled: cfg.enabled,
    canInspect,
    documents: docs.map((d) => ({ ...d, mine: (d.workflow.submittedBy?.email || "").toLowerCase() === email })),
  });
});
