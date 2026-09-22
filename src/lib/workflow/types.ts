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

/**
 * One step of a workflow. Step 1 is always done in "New COC" (select production order + sales
 * order); every following step is done from "Pending Inspection" by the roles of that step.
 * The last step signs and issues the COC.
 */
export const WorkflowStepSchema = z.object({
  id: z.string().min(1).max(60),
  name: z.string().trim().min(1).max(80),
  /** roles that do this step; empty = step 1: anyone who may create COCs · later: anyone who may complete COCs */
  roles: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  /** template pages whose data-entry fields are filled in this step (pages not given to any step go to the last step) */
  pages: z.array(z.number().int().min(1).max(200)).max(200).default([]),
  /** capture supplier documents / test reports in this step */
  attachments: z.boolean().default(false),
  /** step 1 only: check / edit the customer order data (customer part no., PO, delivery date, specification) */
  orderData: z.boolean().default(true),
  instructions: z.string().max(500).optional(),
});
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

export const WorkflowRuleSchema = z.object({
  id: z.string().min(1).max(60),
  name: z.string().trim().min(1, "Give the workflow a name").max(120),
  active: z.boolean().default(true),
  /** legal entity (dataAreaId) or "ALL" */
  company: z.string().trim().max(10).default("ALL"),
  /** item numbers; "*" = every item, "1070.*" = prefix, "10??.0049" = single-character wildcard */
  items: z.array(z.string().trim().min(1).max(80)).min(1, "Add at least one item number").max(500),
  /** only for these templates (empty = any template) */
  templateIds: z.array(z.string().max(60)).max(50).default([]),
  /** roles that may still issue these COCs directly without the workflow */
  directIssueRoles: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  /** @deprecated replaced by steps – kept to read older settings */
  productionCanEnterData: z.boolean().optional(),
  /** ordered steps (at least 2: prepare + issue); older rules without steps get the default 2 steps */
  steps: z.array(WorkflowStepSchema).max(10).default([]),
  /** instructions shown to everybody in the workflow */
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
  action: "SUBMITTED" | "STEP_COMPLETED" | "RETURNED" | "ISSUED" | "REJECTED" | "WITHDRAWN" | "ISSUE_FAILED";
  /** step the event belongs to (name) */
  step?: string;
  note?: string;
}

/** Stored on the COC document (d365_context_json.workflow). */
export interface WorkflowInfo {
  state: WorkflowState;
  ruleId: string;
  ruleName: string;
  instructions?: string;
  /** steps as they were when the COC was submitted (later edits of the workflow do not affect it) */
  steps?: WorkflowStep[];
  /** index of the step that has to be done now (0 = prepared in New COC, so >= 1 while pending) */
  currentStep?: number;
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

/** First active rule for the item + company (+ template), or null when the workflow does not apply. */
export function matchWorkflowRule(cfg: WorkflowConfig, itemNumber: string, company?: string | null, templateId?: string | null): WorkflowRule | null {
  if (!cfg.enabled) return null;
  const comp = normCompany(company);
  // template-specific > company-specific > exact item number > wildcard
  const score = (r: WorkflowRule) =>
    (r.templateIds.length ? 4 : 0) +
    (normCompany(r.company) !== "ALL" ? 2 : 0) +
    (r.items.some((p) => !/[*?]/.test(p) && itemMatches(p, itemNumber)) ? 1 : 0);
  const candidates = cfg.rules.filter(
    (r) =>
      r.active &&
      (normCompany(r.company) === "ALL" || !normCompany(r.company) || normCompany(r.company) === comp) &&
      (!r.templateIds.length || (templateId ? r.templateIds.includes(templateId) : false)) &&
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

export const newStepId = () => `st_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Default flow: production selects the orders, quality enters all data, signs and issues. */
export function defaultSteps(legacyProductionEntersData = false): WorkflowStep[] {
  return [
    { id: "prepare", name: "Production – select production & sales order", roles: [], pages: [], attachments: legacyProductionEntersData, orderData: true },
    { id: "issue", name: "Quality – inspect, sign & issue", roles: [], pages: [], attachments: true, orderData: false },
  ];
}

/** Steps of a rule (older rules without steps get the default two steps). */
export function stepsOf(rule: Pick<WorkflowRule, "steps" | "productionCanEnterData">): WorkflowStep[] {
  return rule.steps && rule.steps.length >= 2 ? rule.steps : defaultSteps(Boolean(rule.productionCanEnterData));
}

/** Steps of a running COC (snapshot) – falls back to the default flow for COCs from the first version. */
export function stepsOfInfo(wf: Pick<WorkflowInfo, "steps">): WorkflowStep[] {
  return wf.steps && wf.steps.length >= 2 ? wf.steps : defaultSteps(true);
}

export function currentStepIndex(wf: Pick<WorkflowInfo, "currentStep" | "steps">): number {
  const steps = stepsOfInfo(wf);
  return Math.min(Math.max(1, wf.currentStep ?? steps.length - 1), steps.length - 1);
}

/**
 * Template pages handled by a step. Pages no step claims belong to the last step (it signs and
 * issues, so everything still open is completed there). `allPages` = pages of the template.
 */
export function pagesForStep(steps: WorkflowStep[], index: number, allPages: number[]): Set<number> {
  const last = steps.length - 1;
  if (index !== last) return new Set(steps[index]?.pages ?? []);
  const claimed = new Set(steps.slice(0, last).flatMap((s) => s.pages));
  return new Set([...(steps[last]?.pages ?? []), ...allPages.filter((p) => !claimed.has(p))]);
}

/** Pages handled up to and including a step (for showing earlier data read-only). */
export function pagesDoneBefore(steps: WorkflowStep[], index: number): Set<number> {
  return new Set(steps.slice(0, index).flatMap((s) => s.pages));
}

/** Does the role do this step? Empty role list = anyone with the base permission. */
export function roleMatchesStep(step: WorkflowStep | undefined, role?: string | null, hasBasePermission = true): boolean {
  if (!step) return false;
  const r = (role || "").trim().toLowerCase();
  if (r === "admin") return true;
  if (!step.roles.length) return hasBasePermission;
  return step.roles.some((x) => x.trim().toLowerCase() === r);
}

/** Checks the admin's step list; returns a problem or null. */
export function validateSteps(steps: WorkflowStep[]): string | null {
  if (steps.length < 2) return "A workflow needs at least 2 steps: prepare (New COC) and sign & issue.";
  const seen = new Map<number, string>();
  for (const s of steps) {
    if (!s.name.trim()) return "Every step needs a name.";
    for (const p of s.pages) {
      if (seen.has(p)) return `Page ${p} is given to "${seen.get(p)}" and "${s.name}" – each page belongs to one step.`;
      seen.set(p, s.name);
    }
  }
  return null;
}
