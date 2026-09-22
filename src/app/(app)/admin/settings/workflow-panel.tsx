"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, Edit2, FlaskConical, GitBranch, Plus, Save, Trash2, XCircle } from "lucide-react";
import { Alert, Badge, Button, Card, CardBody, CardHeader, Checkbox, Dialog, Field, Input, Select, Textarea } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/utils/fetcher";
import type { TemplateInputConfig } from "@/lib/coc-inputs/types";
import {
  EMPTY_WORKFLOW_CONFIG, defaultSteps, matchWorkflowRule, newStepId, parseItemList, stepsOf, validateSteps,
  type WorkflowConfig, type WorkflowRule, type WorkflowStep,
} from "@/lib/workflow/types";

const newRuleId = () => `wf_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

type Draft = {
  id: string;
  name: string;
  active: boolean;
  company: string;
  itemsText: string;
  templateIds: string[];
  directIssueRoles: string[];
  steps: WorkflowStep[];
  instructions: string;
};

const toDraft = (r?: WorkflowRule): Draft => ({
  id: r?.id ?? newRuleId(),
  name: r?.name ?? "Production → Quality inspection",
  active: r?.active ?? true,
  company: r?.company ?? "ALL",
  itemsText: (r?.items ?? []).join("\n"),
  templateIds: r?.templateIds ?? [],
  directIssueRoles: r?.directIssueRoles ?? ["Admin"],
  steps: r ? stepsOf(r).map((s) => ({ ...s })) : defaultSteps().map((s, i) => (i === 0 ? { ...s, roles: ["Production"] } : { ...s, roles: ["Quality"] })),
  instructions: r?.instructions ?? "",
});

type TemplateInfo = { id: string; name: string; published: boolean; pages: Array<{ page: number; titles: string[] }> };

/**
 * Workflow editor: for chosen templates and part numbers the admin defines the steps –
 * who does each step (roles) and which template pages / documents each step fills.
 * Step 1 is always done in New COC (select production + sales order); the last step signs and issues.
 */
export function WorkflowPanel() {
  const [config, setConfig] = useState<WorkflowConfig>(EMPTY_WORKFLOW_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [companies, setCompanies] = useState<string[]>(["HSIN"]);
  const [roles, setRoles] = useState<string[]>(["Admin", "Quality", "Production", "Viewer"]);
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [testItem, setTestItem] = useState("");
  const [testCompany, setTestCompany] = useState("HSIN");
  const [testTemplate, setTestTemplate] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api<{ ok: boolean; config: WorkflowConfig }>("/api/admin/workflow");
      setConfig(res.config ?? EMPTY_WORKFLOW_CONFIG);
      setDirty(false);
    } catch (e) {
      toast.error("Could not load workflow settings", (e as Error).message);
    } finally {
      setLoaded(true);
    }
    api<{ ok: boolean; companies: { code: string }[] }>("/api/d365/companies")
      .then((c) => c.companies?.length && setCompanies(c.companies.map((x) => x.code.toUpperCase())))
      .catch(() => undefined);
    api<{ roles: Array<{ name: string }> }>("/api/roles")
      .then((r) => r.roles?.length && setRoles(r.roles.map((x) => x.name)))
      .catch(() => undefined);
    try {
      const t = await api<{ templates: Array<{ id: string; name: string; status: string; active_version_id: string | null }> }>("/api/templates");
      const list = (t.templates || []).filter((x) => x.status !== "archived");
      const infos = await Promise.all(
        list.map(async (x) => {
          let pages: TemplateInfo["pages"] = [];
          try {
            const c = await api<{ config: TemplateInputConfig }>(`/api/templates/${x.id}/inputs`);
            const byPage = new Map<number, string[]>();
            for (const s of c.config?.sections ?? []) {
              const p = s.pageNumber ?? 0;
              byPage.set(p, [...(byPage.get(p) ?? []), s.title]);
            }
            pages = Array.from(byPage.entries()).sort((a, b) => a[0] - b[0]).map(([page, titles]) => ({ page, titles }));
          } catch {
            /* no data-entry fields */
          }
          return { id: x.id, name: x.name, published: Boolean(x.active_version_id), pages };
        }),
      );
      setTemplates(infos);
    } catch {
      /* templates optional */
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const persist = async (next: WorkflowConfig, message: string) => {
    setSaving(true);
    try {
      const res = await api<{ ok: boolean; config: WorkflowConfig }>("/api/admin/workflow", { method: "PUT", json: { config: next } });
      setConfig(res.config);
      setDirty(false);
      toast.success(message);
      return true;
    } catch (e) {
      toast.error("Could not save workflow settings", (e as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveDraft = async () => {
    if (!editing) return;
    const items = parseItemList(editing.itemsText);
    if (!editing.name.trim()) return toast.error("Give the workflow a name");
    if (!items.length) return toast.error("Add at least one part number (or * for all items)");
    const problem = validateSteps(editing.steps);
    if (problem) return toast.error("Check the steps", problem);
    const rule: WorkflowRule = {
      id: editing.id,
      name: editing.name.trim(),
      active: editing.active,
      company: (editing.company || "ALL").toUpperCase(),
      items,
      templateIds: editing.templateIds,
      directIssueRoles: editing.directIssueRoles,
      steps: editing.steps.map((s, i) => ({
        ...s,
        name: s.name.trim(),
        orderData: i === 0 ? s.orderData : false,
        instructions: s.instructions?.trim() || undefined,
      })),
      instructions: editing.instructions.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    const rules = isNew ? [...config.rules, rule] : config.rules.map((r) => (r.id === rule.id ? rule : r));
    if (await persist({ ...config, rules }, isNew ? `Workflow "${rule.name}" created` : `Workflow "${rule.name}" updated`)) setEditing(null);
  };

  const removeRule = async (rule: WorkflowRule) => {
    if (!confirm(`Delete workflow "${rule.name}"? COCs already in this workflow finish with the steps they started with.`)) return;
    await persist({ ...config, rules: config.rules.filter((r) => r.id !== rule.id) }, `Workflow "${rule.name}" deleted`);
  };

  const toggleRule = async (rule: WorkflowRule) => {
    await persist(
      { ...config, rules: config.rules.map((r) => (r.id === rule.id ? { ...r, active: !r.active, updatedAt: new Date().toISOString() } : r)) },
      `${rule.name} ${rule.active ? "deactivated" : "activated"}`,
    );
  };

  const testResult = useMemo(() => {
    if (!testItem.trim()) return null;
    return matchWorkflowRule({ ...config, enabled: true }, testItem.trim(), testCompany, testTemplate || null);
  }, [config, testItem, testCompany, testTemplate]);

  // pages the admin can hand out in the editor (from the chosen templates, or all templates)
  const editorPages = useMemo(() => {
    if (!editing) return [] as Array<{ page: number; label: string }>;
    const source = editing.templateIds.length ? templates.filter((t) => editing.templateIds.includes(t.id)) : templates;
    const byPage = new Map<number, Set<string>>();
    for (const t of source) for (const p of t.pages) {
      const set = byPage.get(p.page) ?? new Set<string>();
      p.titles.forEach((x) => set.add(editing.templateIds.length > 1 || !editing.templateIds.length ? `${t.name}: ${x}` : x));
      byPage.set(p.page, set);
    }
    const list = Array.from(byPage.entries()).sort((a, b) => a[0] - b[0]).map(([page, set]) => ({ page, label: Array.from(set).join(" · ") }));
    return list.length ? list : [2, 3, 4, 5, 6, 7].map((page) => ({ page, label: "" }));
  }, [editing, templates]);

  const setStep = (i: number, patch: Partial<WorkflowStep>) =>
    editing && setEditing({ ...editing, steps: editing.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const togglePage = (i: number, page: number) => {
    if (!editing) return;
    setEditing({
      ...editing,
      steps: editing.steps.map((s, j) => {
        if (j === i) return { ...s, pages: s.pages.includes(page) ? s.pages.filter((p) => p !== page) : [...s.pages, page].sort((a, b) => a - b) };
        return { ...s, pages: s.pages.filter((p) => p !== page) }; // a page belongs to one step
      }),
    });
  };
  const addStep = () => {
    if (!editing) return;
    const steps = [...editing.steps];
    steps.splice(steps.length - 1, 0, { id: newStepId(), name: "Quality – measurements", roles: ["Quality"], pages: [], attachments: false, orderData: false });
    setEditing({ ...editing, steps });
  };
  const moveStep = (i: number, dir: -1 | 1) => {
    if (!editing) return;
    const j = i + dir;
    // step 1 (New COC) and the last step (sign & issue) stay in place
    if (i === 0 || i === editing.steps.length - 1 || j <= 0 || j >= editing.steps.length - 1) return;
    const steps = [...editing.steps];
    [steps[i], steps[j]] = [steps[j], steps[i]];
    setEditing({ ...editing, steps });
  };

  const templateName = (id: string) => templates.find((t) => t.id === id)?.name ?? "Template";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="COC workflow"
          description="For chosen templates and part numbers, split the COC into steps: production only selects the production order and sales order; the next steps (e.g. measurements, test reports, sign & issue) are done by the roles you choose, from the Pending Inspection menu."
          actions={
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-brand-600" />
              <Badge tone={config.enabled ? "success" : "neutral"}>{config.enabled ? "Enabled" : "Disabled"}</Badge>
            </div>
          }
        />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-200 bg-ink-50/60 p-3">
            <Checkbox
              label="Enable COC workflows"
              checked={config.enabled}
              onChange={(e) => {
                setConfig({ ...config, enabled: e.target.checked });
                setDirty(true);
              }}
            />
            <Button size="sm" loading={saving} disabled={!dirty} onClick={() => persist(config, config.enabled ? "Workflows enabled" : "Workflows disabled")} className="gap-1.5">
              <Save className="h-3.5 w-3.5" /> Save
            </Button>
          </div>
          <p className="text-[11px] text-ink-500">
            Every step names the roles that do it. A step with no role is open to everyone with the permission
            <em> Create COC</em> (step 1) or <em>Complete, sign &amp; approve COC</em> (later steps). Admins can always act.
            Template pages not given to any step are filled in the last step. Part numbers without a workflow are issued directly.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={`Workflows (${config.rules.length})`}
          description="One workflow per template / part-number group."
          actions={
            <Button size="sm" onClick={() => { setIsNew(true); setEditing(toDraft()); }} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> New workflow
            </Button>
          }
        />
        <CardBody className="space-y-3">
          {!loaded ? (
            <div className="text-xs text-ink-500">Loading…</div>
          ) : config.rules.length === 0 ? (
            <div className="rounded-lg border border-dashed border-ink-300 p-6 text-center text-sm text-ink-500">
              No workflow yet. Create one, choose the template and part numbers, and define the steps.
            </div>
          ) : (
            config.rules.map((r) => {
              const steps = stepsOf(r);
              return (
                <div key={r.id} className="space-y-2 rounded-lg border border-ink-200 bg-white p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ink-900">{r.name}</span>
                        <Badge tone={r.active ? "success" : "neutral"}>{r.active ? "Active" : "Inactive"}</Badge>
                        <Badge tone="info">{r.company === "ALL" ? "All companies" : r.company}</Badge>
                        {r.templateIds.length ? (
                          r.templateIds.map((t) => <Badge key={t} tone="brand">{templateName(t)}</Badge>)
                        ) : (
                          <Badge tone="neutral">Any template</Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {r.items.slice(0, 12).map((it) => (
                          <span key={it} className="rounded border border-brand-200 bg-brand-50 px-1.5 py-0.5 font-mono text-[11px] text-brand-900">{it}</span>
                        ))}
                        {r.items.length > 12 && <span className="text-[11px] text-ink-500">+{r.items.length - 12} more</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button size="sm" variant="outline" onClick={() => toggleRule(r)} className="text-xs">{r.active ? "Deactivate" : "Activate"}</Button>
                      <Button size="sm" variant="ghost" title="Edit" onClick={() => { setIsNew(false); setEditing(toDraft(r)); }} className="h-8 w-8 p-0">
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" title="Delete" onClick={() => removeRule(r)} className="h-8 w-8 p-0 text-ink-400 hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <ol className="flex flex-wrap items-stretch gap-1.5 text-[11px]">
                    {steps.map((s, i) => (
                      <li key={s.id} className="flex items-center gap-1.5">
                        <div className="rounded-md border border-ink-200 bg-ink-50 px-2 py-1">
                          <div className="font-semibold text-ink-900">{i + 1}. {s.name}</div>
                          <div className="text-ink-500">
                            {s.roles.length ? s.roles.join(", ") : i === 0 ? "COC creators" : "COC approvers"}
                            {s.pages.length ? ` · pages ${s.pages.join(", ")}` : i === steps.length - 1 ? " · remaining pages" : ""}
                            {s.attachments ? " · documents" : ""}
                            {i === steps.length - 1 ? " · sign & issue" : ""}
                          </div>
                        </div>
                        {i < steps.length - 1 && <span className="text-ink-400">→</span>}
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Test a part number" description="Check which workflow applies to a part number, company and template." />
        <CardBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_140px_1fr]">
            <Input value={testItem} onChange={(e) => setTestItem(e.target.value)} placeholder="Part number, e.g. 1070.0049" className="font-mono" />
            <Select value={testCompany} onChange={(e) => setTestCompany(e.target.value)}>
              {companies.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Select value={testTemplate} onChange={(e) => setTestTemplate(e.target.value)}>
              <option value="">Any template</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>
          {testItem.trim() && (testResult ? (
            <Alert tone="success">
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> <strong>{testResult.name}</strong>:
                {stepsOf(testResult).map((s, i) => `${i + 1}. ${s.name}`).join(" → ")}
                {!config.enabled && " (workflows are currently disabled)"}
              </span>
            </Alert>
          ) : (
            <Alert tone="info"><span className="inline-flex items-center gap-1.5"><XCircle className="h-4 w-4" /> No workflow – the COC is issued directly.</span></Alert>
          ))}
        </CardBody>
      </Card>

      <Dialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={isNew ? "New workflow" : `Edit: ${editing?.name ?? ""}`}
        width="max-w-3xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button loading={saving} onClick={saveDraft} className="gap-1.5"><Save className="h-3.5 w-3.5" /> Save workflow</Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
              <Field label="Workflow name">
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </Field>
              <Field label="Company">
                <Select value={editing.company} onChange={(e) => setEditing({ ...editing, company: e.target.value })}>
                  <option value="ALL">All companies</option>
                  {companies.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
            </div>

            <Field label="Templates" hint="Tick the templates this workflow is for – none ticked = any template">
              <div className="flex max-h-32 flex-wrap gap-x-4 gap-y-1.5 overflow-y-auto rounded-md border border-ink-200 p-2">
                {templates.length === 0 && <span className="text-xs text-ink-500">Loading templates…</span>}
                {templates.map((t) => (
                  <Checkbox
                    key={t.id}
                    label={`${t.name}${t.published ? "" : " (draft)"}`}
                    checked={editing.templateIds.includes(t.id)}
                    onChange={(e) =>
                      setEditing({ ...editing, templateIds: e.target.checked ? [...editing.templateIds, t.id] : editing.templateIds.filter((x) => x !== t.id) })
                    }
                  />
                ))}
              </div>
            </Field>

            <Field label="Part numbers" hint="One per line or comma separated. * = all · 1070.* = starts with 1070 · ? = any one character">
              <Textarea rows={3} value={editing.itemsText} onChange={(e) => setEditing({ ...editing, itemsText: e.target.value })} placeholder={"1070.0049\n3020.*"} className="font-mono text-xs" />
            </Field>

            {/* Steps */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-ink-900">Steps</div>
                <Button size="sm" variant="outline" onClick={addStep} className="gap-1.5 text-xs"><Plus className="h-3.5 w-3.5" /> Add step</Button>
              </div>
              {editing.steps.map((s, i) => {
                const first = i === 0;
                const last = i === editing.steps.length - 1;
                return (
                  <div key={s.id} className="space-y-2.5 rounded-lg border border-ink-200 bg-white p-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-900 text-[11px] font-bold text-white">{i + 1}</span>
                      <Input value={s.name} onChange={(e) => setStep(i, { name: e.target.value })} className="h-8 text-sm font-medium" />
                      {!first && !last && (
                        <div className="flex shrink-0 items-center">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Move up" onClick={() => moveStep(i, -1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Move down" onClick={() => moveStep(i, 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-ink-400 hover:text-red-600" title="Remove step" onClick={() => setEditing({ ...editing, steps: editing.steps.filter((_, j) => j !== i) })}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="text-[11px] text-ink-500">
                      {first
                        ? "Done in New COC: select the production order and the sales order reference."
                        : last
                          ? "Done in Pending Inspection: completes the remaining data, signs and issues the COC."
                          : "Done in Pending Inspection, then handed to the next step."}
                    </div>

                    <div>
                      <div className="mb-1 text-[11px] font-semibold text-ink-700">Who does this step</div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {roles.map((r) => (
                          <Checkbox
                            key={r}
                            label={r}
                            checked={s.roles.includes(r)}
                            onChange={(e) => setStep(i, { roles: e.target.checked ? [...s.roles, r] : s.roles.filter((x) => x !== r) })}
                          />
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="mb-1 text-[11px] font-semibold text-ink-700">
                        Template pages filled in this step {last && <span className="font-normal text-ink-500">(plus every page no other step has)</span>}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {editorPages.map((p) => {
                          const on = s.pages.includes(p.page);
                          const owner = editing.steps.findIndex((x) => x.pages.includes(p.page));
                          return (
                            <button
                              key={p.page}
                              type="button"
                              title={p.label || `Page ${p.page}`}
                              onClick={() => togglePage(i, p.page)}
                              className={`rounded-md border px-2 py-1 text-left text-[11px] ${on ? "border-brand-500 bg-brand-50 text-brand-900" : owner >= 0 ? "border-ink-200 bg-ink-50 text-ink-400" : "border-ink-300 bg-white text-ink-700 hover:bg-ink-50"}`}
                            >
                              <span className="font-semibold">{p.page === 0 ? "No page" : `Page ${p.page}`}</span>
                              {p.label && <span className="block max-w-[180px] truncate">{p.label}</span>}
                              {!on && owner >= 0 && <span className="block">step {owner + 1}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-x-5 gap-y-1">
                      <Checkbox label="Capture supplier documents / test reports" checked={s.attachments} onChange={(e) => setStep(i, { attachments: e.target.checked })} />
                      {first && (
                        <Checkbox label="Check customer order data (part no., PO, delivery date)" checked={s.orderData} onChange={(e) => setStep(i, { orderData: e.target.checked })} />
                      )}
                    </div>
                    <Input value={s.instructions ?? ""} onChange={(e) => setStep(i, { instructions: e.target.value })} placeholder="Instructions for this step (optional)" className="h-8 text-xs" />
                  </div>
                );
              })}
            </div>

            <Field label="Roles that may skip the workflow and issue directly" hint="Leave all unticked if every COC for these parts must go through the steps">
              <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-md border border-ink-200 p-2">
                {roles.map((r) => (
                  <Checkbox
                    key={r}
                    label={r}
                    checked={editing.directIssueRoles.includes(r)}
                    onChange={(e) =>
                      setEditing({ ...editing, directIssueRoles: e.target.checked ? [...editing.directIssueRoles, r] : editing.directIssueRoles.filter((x) => x !== r) })
                    }
                  />
                ))}
              </div>
            </Field>

            <Field label="Instructions for everybody (optional)">
              <Textarea rows={2} value={editing.instructions} onChange={(e) => setEditing({ ...editing, instructions: e.target.value })} />
            </Field>
            <Checkbox label="Active" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />

            {!config.enabled && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
                <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Workflows are disabled – tick “Enable COC workflows” and Save to switch them on.
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
