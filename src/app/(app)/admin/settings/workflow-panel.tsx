"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Edit2, FlaskConical, GitBranch, Plus, Save, Trash2, XCircle } from "lucide-react";
import { Alert, Badge, Button, Card, CardBody, CardHeader, Checkbox, Dialog, Field, Input, Select, Textarea } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/utils/fetcher";
import {
  EMPTY_WORKFLOW_CONFIG, matchWorkflowRule, parseItemList,
  type WorkflowConfig, type WorkflowRule,
} from "@/lib/workflow/types";

const newRuleId = () => `wf_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

type Draft = {
  id: string;
  name: string;
  active: boolean;
  company: string;
  itemsText: string;
  directIssueRoles: string[];
  productionCanEnterData: boolean;
  instructions: string;
};

const toDraft = (r?: WorkflowRule): Draft => ({
  id: r?.id ?? newRuleId(),
  name: r?.name ?? "Quality inspection before issue",
  active: r?.active ?? true,
  company: r?.company ?? "ALL",
  itemsText: (r?.items ?? []).join("\n"),
  directIssueRoles: r?.directIssueRoles ?? ["Admin"],
  productionCanEnterData: r?.productionCanEnterData ?? true,
  instructions: r?.instructions ?? "",
});

/**
 * Inspection workflow: for selected item numbers production prepares the COC and sends it to
 * quality; quality inspects, enters the data, signs and issues it from "Pending Inspection".
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
  const [testItem, setTestItem] = useState("");
  const [testCompany, setTestCompany] = useState("HSIN");

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
    if (!items.length) return toast.error("Add at least one item number (or * for all items)");
    const rule: WorkflowRule = {
      id: editing.id,
      name: editing.name.trim(),
      active: editing.active,
      company: (editing.company || "ALL").toUpperCase(),
      items,
      directIssueRoles: editing.directIssueRoles,
      productionCanEnterData: editing.productionCanEnterData,
      instructions: editing.instructions.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    const rules = isNew ? [...config.rules, rule] : config.rules.map((r) => (r.id === rule.id ? rule : r));
    if (await persist({ ...config, rules }, isNew ? `Workflow "${rule.name}" created` : `Workflow "${rule.name}" updated`)) setEditing(null);
  };

  const removeRule = async (rule: WorkflowRule) => {
    if (!confirm(`Delete workflow "${rule.name}"? COCs already waiting for inspection stay in Pending Inspection.`)) return;
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
    return matchWorkflowRule({ ...config, enabled: true }, testItem.trim(), testCompany);
  }, [config, testItem, testCompany]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Quality inspection workflow"
          description="For the item numbers you choose, production selects the production order and sales order reference and sends the COC to quality. Quality inspects, enters the data, signs and issues it from the Pending Inspection menu."
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
              label="Enable the inspection workflow"
              checked={config.enabled}
              onChange={(e) => {
                setConfig({ ...config, enabled: e.target.checked });
                setDirty(true);
              }}
            />
            <Button size="sm" loading={saving} disabled={!dirty} onClick={() => persist(config, config.enabled ? "Inspection workflow enabled" : "Inspection workflow disabled")} className="gap-1.5">
              <Save className="h-3.5 w-3.5" /> Save
            </Button>
          </div>

          <ol className="grid gap-2 text-xs text-ink-700 sm:grid-cols-3">
            <li className="rounded-lg border border-ink-200 bg-white p-3">
              <div className="font-semibold text-ink-900">1 · Production</div>
              New COC → selects production order, sales order reference and serial number → <strong>Send to Quality Inspection</strong>.
            </li>
            <li className="rounded-lg border border-ink-200 bg-white p-3">
              <div className="font-semibold text-ink-900">2 · Pending Inspection</div>
              The COC waits in the <strong>Pending Inspection</strong> menu. No COC number is used yet.
            </li>
            <li className="rounded-lg border border-ink-200 bg-white p-3">
              <div className="font-semibold text-ink-900">3 · Quality</div>
              Inspects, enters the template data, captures documents, signs and <strong>issues</strong> the COC – or rejects it with a reason.
            </li>
          </ol>
          <p className="text-[11px] text-ink-500">
            Who can inspect: every role with the permission <em>Complete, sign &amp; approve COC</em> (Quality and Admin by default – see Users &amp; Roles).
            Items that match no active workflow are issued directly as before.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={`Workflows (${config.rules.length})`}
          description="Each workflow lists the item numbers that need quality inspection. Use * for all items, 1070.* for every item starting with 1070."
          actions={
            <Button
              size="sm"
              onClick={() => {
                setIsNew(true);
                setEditing(toDraft());
              }}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> New workflow
            </Button>
          }
        />
        <CardBody className="space-y-3">
          {!loaded ? (
            <div className="text-xs text-ink-500">Loading…</div>
          ) : config.rules.length === 0 ? (
            <div className="rounded-lg border border-dashed border-ink-300 p-6 text-center text-sm text-ink-500">
              No workflow yet. Create one and add the item numbers that need quality inspection.
            </div>
          ) : (
            config.rules.map((r) => (
              <div key={r.id} className="flex flex-col gap-3 rounded-lg border border-ink-200 bg-white p-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink-900">{r.name}</span>
                    <Badge tone={r.active ? "success" : "neutral"}>{r.active ? "Active" : "Inactive"}</Badge>
                    <Badge tone="info">{r.company === "ALL" ? "All companies" : r.company}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {r.items.slice(0, 12).map((it) => (
                      <span key={it} className="rounded border border-brand-200 bg-brand-50 px-1.5 py-0.5 font-mono text-[11px] text-brand-900">{it}</span>
                    ))}
                    {r.items.length > 12 && <span className="text-[11px] text-ink-500">+{r.items.length - 12} more</span>}
                  </div>
                  <div className="text-[11px] text-ink-500">
                    Direct issue allowed for: {r.directIssueRoles.length ? r.directIssueRoles.join(", ") : "nobody (always inspected)"} ·
                    {r.productionCanEnterData ? " production may pre-fill inspection data" : " quality enters all inspection data"}
                  </div>
                  {r.instructions && <div className="text-[11px] italic text-ink-600">“{r.instructions}”</div>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button size="sm" variant="outline" onClick={() => toggleRule(r)} className="text-xs">
                    {r.active ? "Deactivate" : "Activate"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    title="Edit"
                    onClick={() => {
                      setIsNew(false);
                      setEditing(toDraft(r));
                    }}
                    className="h-8 w-8 p-0"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" title="Delete" onClick={() => removeRule(r)} className="h-8 w-8 p-0 text-ink-400 hover:text-red-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Test an item" description="Check which workflow applies to an item number and company." />
        <CardBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
            <Input value={testItem} onChange={(e) => setTestItem(e.target.value)} placeholder="Item number, e.g. 1070.0049" className="font-mono" />
            <Select value={testCompany} onChange={(e) => setTestCompany(e.target.value)}>
              {companies.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </div>
          {testItem.trim() && (
            testResult ? (
              <Alert tone={testResult.active ? "success" : "warning"}>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  <strong>{testResult.name}</strong> applies – production sends it to quality inspection
                  {!config.enabled && " (workflow is currently disabled)"}.
                </span>
              </Alert>
            ) : (
              <Alert tone="info">
                <span className="inline-flex items-center gap-1.5">
                  <XCircle className="h-4 w-4" /> No workflow – the COC is issued directly.
                </span>
              </Alert>
            )
          )}
        </CardBody>
      </Card>

      <Dialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={isNew ? "New inspection workflow" : `Edit: ${editing?.name ?? ""}`}
        width="max-w-2xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button loading={saving} onClick={saveDraft} className="gap-1.5">
              <Save className="h-3.5 w-3.5" /> Save workflow
            </Button>
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
                  {companies.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="Item numbers" hint="One per line or comma separated. * = all items · 1070.* = starts with 1070 · ? = any one character">
              <Textarea
                rows={5}
                value={editing.itemsText}
                onChange={(e) => setEditing({ ...editing, itemsText: e.target.value })}
                placeholder={"1070.0049\n1070.0050\n3020.*"}
                className="font-mono text-xs"
              />
            </Field>
            <div className="text-[11px] text-ink-500">{parseItemList(editing.itemsText).length} item pattern(s)</div>

            <Field label="Roles that may still issue directly (skip inspection)" hint="Leave all unticked if every COC for these items must be inspected">
              <div className="flex flex-wrap gap-3 rounded-md border border-ink-200 p-2">
                {roles.map((r) => (
                  <Checkbox
                    key={r}
                    label={r}
                    checked={editing.directIssueRoles.includes(r)}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        directIssueRoles: e.target.checked ? [...editing.directIssueRoles, r] : editing.directIssueRoles.filter((x) => x !== r),
                      })
                    }
                  />
                ))}
              </div>
            </Field>

            <Checkbox
              label="Production may already fill the template data fields and capture documents (quality can change them)"
              checked={editing.productionCanEnterData}
              onChange={(e) => setEditing({ ...editing, productionCanEnterData: e.target.checked })}
            />

            <Field label="Instructions (shown to production and quality)">
              <Textarea
                rows={2}
                value={editing.instructions}
                onChange={(e) => setEditing({ ...editing, instructions: e.target.value })}
                placeholder="e.g. Quality checks flatness and air-leak test before the COC is issued."
              />
            </Field>

            <Checkbox label="Active" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />

            {!config.enabled && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
                <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                The inspection workflow is disabled – tick “Enable the inspection workflow” and Save to switch it on.
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
