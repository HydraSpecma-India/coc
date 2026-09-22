import "server-only";
import { companyAllowed, sessionCan, type AppSession } from "@/lib/auth/guards";
import { getCocDocumentById } from "@/lib/db/repositories/coc";
import { Errors } from "@/lib/errors";
import { currentStepIndex, roleMatchesStep, stepsOfInfo, type WorkflowStep } from "./types";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { getSetting, setSetting } from "@/lib/db/repositories/settings";
import type { COCDocumentRow } from "@/lib/db/repositories/coc";
import { logger } from "@/lib/logging/logger";
import type { CreateCocInput } from "@/lib/coc/issue";
import {
  EMPTY_WORKFLOW_CONFIG, WORKFLOW_SETTINGS_KEY, WorkflowConfigSchema,
  type WorkflowConfig, type WorkflowEvent, type WorkflowInfo, type WorkflowState,
} from "./types";

export const WORKFLOW_PAYLOAD_FIELD = "__workflow_payload";

export async function getWorkflowConfig(): Promise<WorkflowConfig> {
  const raw = await getSetting<unknown>(WORKFLOW_SETTINGS_KEY, EMPTY_WORKFLOW_CONFIG);
  const parsed = WorkflowConfigSchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn("Invalid inspection workflow settings – workflow disabled", { error: parsed.error.message });
    return EMPTY_WORKFLOW_CONFIG;
  }
  return parsed.data;
}

export async function saveWorkflowConfig(cfg: WorkflowConfig, userId?: string): Promise<void> {
  await setSetting(WORKFLOW_SETTINGS_KEY, WorkflowConfigSchema.parse(cfg), userId);
}

export function workflowOf(doc: Pick<COCDocumentRow, "d365_context_json">): WorkflowInfo | null {
  const wf = (doc.d365_context_json as { workflow?: WorkflowInfo } | null)?.workflow;
  return wf && typeof wf === "object" && wf.state ? wf : null;
}

export interface PendingDocSummary {
  id: string;
  production_order: string;
  item_number: string | null;
  item_description: string | null;
  serial_number: string | null;
  sales_order: string | null;
  customer_po: string | null;
  quantity: number | null;
  company: string;
  customerName: string;
  created_by: string | null;
  created_at: string;
  workflow: WorkflowInfo;
}

function toSummary(d: COCDocumentRow): PendingDocSummary | null {
  const wf = workflowOf(d);
  if (!wf) return null;
  const ctx = (d.d365_context_json || {}) as Record<string, unknown>;
  return {
    id: d.id,
    production_order: d.production_order,
    item_number: d.item_number,
    item_description: d.item_description,
    serial_number: d.serial_number,
    sales_order: d.sales_order,
    customer_po: d.customer_po,
    quantity: d.quantity,
    company: String(ctx.dataAreaId || d.customer_account || "HSIN").toUpperCase(),
    customerName: String(ctx.customerName || ""),
    created_by: d.created_by,
    created_at: d.created_at,
    workflow: wf,
  };
}

/** Documents in a workflow state (pending first-in-first-out, rejected newest first). */
export async function listWorkflowDocs(state: WorkflowState, limit = 200): Promise<PendingDocSummary[]> {
  const states = state === "PENDING_INSPECTION" ? ["PENDING_INSPECTION", "ISSUING"] : [state];
  const { data, error } = await supabaseAdmin()
    .from("coc_documents")
    .select("*")
    .in("d365_context_json->workflow->>state", states)
    .order("created_at", { ascending: state === "PENDING_INSPECTION" })
    .limit(limit);
  if (error) throw error;
  return ((data || []) as COCDocumentRow[]).map(toSummary).filter((x): x is PendingDocSummary => Boolean(x));
}

export async function countPending(): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from("coc_documents")
    .select("id", { count: "exact", head: true })
    .in("d365_context_json->workflow->>state", ["PENDING_INSPECTION", "ISSUING"]);
  if (error) throw error;
  return count ?? 0;
}

export async function getWorkflowPayload(docId: string): Promise<CreateCocInput | null> {
  const { data } = await supabaseAdmin()
    .from("coc_document_values")
    .select("value_json")
    .eq("coc_document_id", docId)
    .eq("field_name", WORKFLOW_PAYLOAD_FIELD)
    .maybeSingle();
  return (data?.value_json as CreateCocInput) ?? null;
}

export async function saveWorkflowPayload(docId: string, payload: CreateCocInput): Promise<void> {
  const { signatureBase64: _drop, ...rest } = payload;
  void _drop;
  const { error } = await supabaseAdmin().from("coc_document_values").upsert(
    {
      coc_document_id: docId,
      field_name: WORKFLOW_PAYLOAD_FIELD,
      source_type: "MANUAL",
      value_text: "Prepared by production – waiting for quality inspection",
      value_json: rest,
    },
    { onConflict: "coc_document_id,field_name" },
  );
  if (error) throw error;
}

/**
 * Moves a document from one workflow state to the next. The update only succeeds while the
 * document is still in `from` (two inspectors cannot issue / reject the same COC twice).
 */
export async function transitionWorkflow(
  doc: COCDocumentRow,
  from: WorkflowState | "ISSUING",
  patch: Partial<WorkflowInfo> & { state: WorkflowState | "ISSUING" },
  event: WorkflowEvent | null,
  docPatch: Record<string, unknown> = {},
): Promise<COCDocumentRow | null> {
  const wf = workflowOf(doc);
  if (!wf) return null;
  const nextWf = { ...wf, ...patch, history: event ? [...(wf.history || []), event] : wf.history || [] };
  const ctx = { ...((doc.d365_context_json || {}) as Record<string, unknown>), workflow: nextWf };
  let q = supabaseAdmin()
    .from("coc_documents")
    .update({ d365_context_json: ctx, ...docPatch })
    .eq("id", doc.id)
    .eq("d365_context_json->workflow->>state", from);
  // the step must still be the one the user saw (two people cannot complete the same step)
  if (typeof wf.currentStep === "number") q = q.eq("d365_context_json->workflow->>currentStep", String(wf.currentStep));
  const { data, error } = await q.select("*");
  if (error) throw error;
  return ((data || []) as COCDocumentRow[])[0] ?? null;
}

/* ── loading a COC in the workflow for the signed-in user ─────────────────────── */


export interface LoadedInspection {
  doc: COCDocumentRow;
  wf: WorkflowInfo;
  company: string;
  steps: WorkflowStep[];
  stepIndex: number;
  step: WorkflowStep;
  isFinal: boolean;
  /** the signed-in user does the current step */
  canAct: boolean;
  mine: boolean;
  canComplete: boolean;
  canCreate: boolean;
}

export async function loadInspection(id: string, session: AppSession): Promise<LoadedInspection> {
  const found = await getCocDocumentById(id);
  const wf = found ? workflowOf(found.doc) : null;
  if (!found || !wf) throw Errors.notFound("Inspection");
  const doc = found.doc;
  const company = String((doc.d365_context_json as Record<string, unknown> | null)?.dataAreaId || doc.customer_account || "HSIN").toUpperCase();
  if (!companyAllowed(session, company)) throw Errors.forbidden(`company ${company}`);
  const [canComplete, canCreate] = await Promise.all([sessionCan(session, "completeCoc"), sessionCan(session, "createCoc")]);
  const steps = stepsOfInfo(wf);
  const stepIndex = currentStepIndex(wf);
  const step = steps[stepIndex];
  const open = wf.state === "PENDING_INSPECTION" || wf.state === "ISSUING";
  return {
    doc,
    wf,
    company,
    steps,
    stepIndex,
    step,
    isFinal: stepIndex === steps.length - 1,
    canAct: open && roleMatchesStep(step, session.user.role, canComplete),
    mine: (wf.submittedBy?.email || "").toLowerCase() === (session.user.email || "").toLowerCase(),
    canComplete,
    canCreate,
  };
}

/** Is it this user's turn on a pending COC (for the list + menu badge)? */
export function isUsersTurn(wf: WorkflowInfo, role: string | undefined | null, canComplete: boolean): boolean {
  if (wf.state !== "PENDING_INSPECTION") return false;
  const steps = stepsOfInfo(wf);
  return roleMatchesStep(steps[currentStepIndex(wf)], role, canComplete);
}
