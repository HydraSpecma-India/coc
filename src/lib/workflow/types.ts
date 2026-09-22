import { z } from "zod";

/**
 * Inspection workflow (client-safe definitions).
 *
 * For item numbers covered by an active rule, a production user only prepares the COC
 * (production order, sales order reference, serial number, customer data) and sends it to
 * quality. The document then waits in "Pending Inspection" until a user with the
 * "Complete, sign & approve COC" permission enters the inspection data, signs and issues it.
 */

export const WORKFLOW_SETTINGS_KEY = "workflow.inspection";

export const WorkflowRuleSchema = z.object({
  id: z.string().min(1).max(60),
  name: z.string().trim().min(1, "Give the workflow a name").max(120),
  active: z.boolean().default(true),
  /** legal entity (dataAreaId) or "ALL" */
  company: z.string().trim().max(10).default("ALL"),
  /** item numbers; "*" = every item, "1070.*" = prefix, "10??.0049" = single-character wildcard */
  items: z.array(z.string().trim().min(1).max(80)).min(1, "Add at least one item number").max(500),
  /** roles that may still issue these COCs directly without the inspection step */
  directIssueRoles: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  /** production may already fill the template data-entry fields (quality can still change them) */
  productionCanEnterData: z.boolean().default(true),
  /** instructions shown to production and quality */
  instructions: z.string().max(1000).optional(),
  updatedAt: z.string().optional(),
  updatedBy: z.string().optional(),
});
export type WorkflowRule = z.infer<typeof WorkflowRuleSchema>;

export const WorkflowConfigSchema = z.object({
  enabled: z.boolean().default(false),
  rules: z.array(WorkflowRuleSchema).max(200).default([]),
});
export type WorkflowConfig = z.infer<typeof WorkflowConfigSchema>;

export const EMPTY_WORKFLOW_CONFIG: WorkflowConfig = { enabled: false, rules: [] };

/** ISSUING = an inspector is issuing it right now (claimed) */
export type WorkflowState = "PENDING_INSPECTION" | "ISSUING" | "REJECTED" | "ISSUED";

export interface WorkflowEvent {
  at: string;
  by: string;
  action: "SUBMITTED" | "ISSUED" | "REJECTED" | "WITHDRAWN" | "ISSUE_FAILED";
  note?: string;
}

/** Stored on the COC document (d365_context_json.workflow). */
export interface WorkflowInfo {
  state: WorkflowState;
  ruleId: string;
  ruleName: string;
  instructions?: string;
  submittedBy: { id?: string | null; email?: string | null; name?: string | null };
  submittedAt: string;
  note?: string;
  inspectedBy?: { id?: string | null; email?: string | null; name?: string | null };
  inspectedAt?: string;
  rejectReason?: string;
  history: WorkflowEvent[];
}

const escapeRe = (s: string) => s.replace(/[.+^${}()|[\]\\]/g, "\\$&");

/** Item pattern match: exact (case-insensitive), "*" wildcard for any text, "?" for one character. */
export function itemMatches(pattern: string, itemNumber: string): boolean {
  const p = pattern.trim();
  const item = itemNumber.trim();
  if (!p || !item) return false;
  if (p === "*") return true;
  if (!/[*?]/.test(p)) return p.toLowerCase() === item.toLowerCase();
  const re = new RegExp(`^${escapeRe(p).replace(/\*/g, ".*").replace(/\?/g, ".")}$`, "i");
  return re.test(item);
}

const normCompany = (c?: string | null) => (c || "").trim().toUpperCase();

/** First active rule for the item + company, or null when the workflow does not apply. */
export function matchWorkflowRule(cfg: WorkflowConfig, itemNumber: string, company?: string | null): WorkflowRule | null {
  if (!cfg.enabled) return null;
  const comp = normCompany(company);
  // exact item rules win over wildcard rules; company-specific rules win over "ALL"
  const score = (r: WorkflowRule) =>
    (normCompany(r.company) !== "ALL" ? 2 : 0) + (r.items.some((p) => !/[*?]/.test(p) && itemMatches(p, itemNumber)) ? 1 : 0);
  const candidates = cfg.rules.filter(
    (r) =>
      r.active &&
      (normCompany(r.company) === "ALL" || !normCompany(r.company) || normCompany(r.company) === comp) &&
      r.items.some((p) => itemMatches(p, itemNumber)),
  );
  candidates.sort((a, b) => score(b) - score(a));
  return candidates[0] ?? null;
}

export function canIssueDirectly(rule: WorkflowRule, role?: string | null): boolean {
  const r = (role || "").trim().toLowerCase();
  return rule.directIssueRoles.some((x) => x.trim().toLowerCase() === r);
}

/** Parses the admin's item list (comma, semicolon or new line separated). */
export function parseItemList(text: string): string[] {
  return Array.from(new Set(text.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean)));
}
