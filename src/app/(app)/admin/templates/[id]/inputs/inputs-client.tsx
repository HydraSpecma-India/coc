"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown, ArrowUp, Camera, ChevronDown, ChevronRight, Copy, FileStack, ListPlus, Plus, QrCode, Save, Trash2,
} from "lucide-react";
import { Badge, Button, Card, CardBody, CardHeader, Checkbox, Field, Input, PageHeader, Select, Textarea, Alert } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/utils/fetcher";
import { cn } from "@/lib/utils/cn";
import {
  INPUT_FIELD_TYPES, INPUT_FIELD_TYPE_LABELS, newId, validateInputConfig, describeLimits,
  type InputFieldDef, type InputSection, type TemplateInputConfig,
} from "@/lib/coc-inputs/types";

type PageInfo = { number: number; name: string; placedFields: string[] };

const toKey = (label: string) => {
  const k = label
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
  return /^[A-Za-z]/.test(k) ? k : `F${k || "ield"}`;
};

function uniqueKey(base: string, taken: Set<string>) {
  let k = base;
  let n = 2;
  while (taken.has(k.toLowerCase())) k = `${base}${n++}`;
  return k;
}

function move<T>(arr: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

const numOrNull = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export function InputsEditorClient({
  templateId,
  templateName,
  initialConfig,
  pages,
  canManage,
}: {
  templateId: string;
  templateName: string;
  initialConfig: TemplateInputConfig;
  pages: PageInfo[];
  canManage: boolean;
}) {
  const [config, setConfig] = useState<TemplateInputConfig>(initialConfig);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [openField, setOpenField] = useState<string | null>(null);
  const [bulk, setBulk] = useState<{ sectionId: string; text: string } | null>(null);

  const allKeys = useMemo(() => new Set(config.sections.flatMap((s) => s.fields.map((f) => f.key.toLowerCase()))), [config]);
  const placedAnywhere = useMemo(() => new Set(pages.flatMap((p) => p.placedFields.map((f) => f.toLowerCase()))), [pages]);
  const fieldCount = config.sections.reduce((n, s) => n + s.fields.length, 0);
  const problem = validateInputConfig(config);

  const update = (fn: (c: TemplateInputConfig) => TemplateInputConfig) => {
    setConfig((c) => fn(c));
    setDirty(true);
  };
  const updateSection = (id: string, patch: Partial<InputSection>) =>
    update((c) => ({ ...c, sections: c.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const updateField = (sid: string, fid: string, patch: Partial<InputFieldDef>) =>
    update((c) => ({
      ...c,
      sections: c.sections.map((s) => (s.id === sid ? { ...s, fields: s.fields.map((f) => (f.id === fid ? { ...f, ...patch } : f)) } : s)),
    }));

  const addSection = () => {
    const used = new Set(config.sections.map((s) => s.pageNumber));
    const nextPage = pages.find((p) => p.number > 1 && !used.has(p.number))?.number ?? Math.max(2, config.sections.length + 2);
    const pageName = pages.find((p) => p.number === nextPage)?.name;
    update((c) => ({
      ...c,
      sections: [
        ...c.sections,
        { id: newId("s"), title: pageName && !/^page \d+$/i.test(pageName) ? pageName : `Page ${nextPage} – Measurements`, pageNumber: nextPage, printSheet: true, fields: [] },
      ],
    }));
  };

  const addField = (sid: string, label = "New measurement", type: InputFieldDef["type"] = "number") => {
    const key = uniqueKey(toKey(label), allKeys);
    const f: InputFieldDef = { id: newId("f"), key, label, type, required: false, qr: true };
    update((c) => ({ ...c, sections: c.sections.map((s) => (s.id === sid ? { ...s, fields: [...s.fields, f] } : s)) }));
    setOpenField(f.id);
  };

  const applyBulk = () => {
    if (!bulk) return;
    const taken = new Set(allKeys);
    const lines = bulk.text.split("\n").map((l) => l.trim()).filter(Boolean);
    const created: InputFieldDef[] = lines.map((line) => {
      // Format: Label | unit | min | max   (unit/min/max optional)
      const [label, unit, min, max] = line.split("|").map((p) => p?.trim());
      const key = uniqueKey(toKey(label), taken);
      taken.add(key.toLowerCase());
      const hasLimits = numOrNull(min ?? "") != null || numOrNull(max ?? "") != null;
      return {
        id: newId("f"), key, label, type: hasLimits || unit ? "number" : "text", unit: unit || undefined,
        min: numOrNull(min ?? ""), max: numOrNull(max ?? ""), required: false, qr: true,
      };
    });
    update((c) => ({ ...c, sections: c.sections.map((s) => (s.id === bulk.sectionId ? { ...s, fields: [...s.fields, ...created] } : s)) }));
    setBulk(null);
    toast.success(`${created.length} field(s) added`);
  };

  const save = async () => {
    if (problem) {
      toast.error("Please fix the configuration", problem);
      return;
    }
    setSaving(true);
    try {
      const res = await api<{ ok: boolean; config: TemplateInputConfig }>(`/api/templates/${templateId}/inputs`, { method: "PUT", json: { config } });
      setConfig(res.config);
      setDirty(false);
      toast.success("Data entry fields saved", "Users will see the new fields in the New COC wizard immediately.");
    } catch (e) {
      toast.error("Save failed", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const sampleQr = useMemo(() => {
    const first = config.sections.flatMap((s) => s.fields).filter((f) => f.qr).slice(0, 3);
    if (!first.length) return null;
    return JSON.stringify(Object.fromEntries(first.map((f) => [f.key, f.type === "number" ? (f.min ?? 0).toString() : f.type === "passfail" ? "OK" : "value"])));
  }, [config]);

  return (
    <div className="mx-auto max-w-5xl pb-24">
      <PageHeader
        crumbs={[{ label: "Templates", href: "/admin/templates" }, { label: templateName, href: `/admin/templates/${templateId}` }, { label: "Data entry fields" }]}
        title="Data entry fields"
        description="Page 1 is filled from D365FO. Define the manual fields users must complete for the other pages (measurements, test results, serial registration) and whether supplier documents must be captured."
        actions={
          canManage && (
            <Button onClick={save} loading={saving} disabled={!dirty} className="gap-1.5">
              <Save className="h-4 w-4" /> Save
            </Button>
          )
        }
      />

      {!canManage && (
        <div className="mb-4">
          <Alert tone="info">You can view this configuration. Only users with “manage templates” permission can change it.</Alert>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <Badge tone="brand">{config.sections.length} section(s)</Badge>
        <Badge tone="info">{fieldCount} field(s)</Badge>
        {config.attachments.enabled && <Badge tone="success">Camera capture on</Badge>}
        {config.updatedAt && <span className="text-ink-400">Last saved {new Date(config.updatedAt).toLocaleString()} {config.updatedBy ? `by ${config.updatedBy}` : ""}</span>}
      </div>

      {problem && dirty && (
        <div className="mb-4">
          <Alert tone="warning">{problem}</Alert>
        </div>
      )}

      <div className="space-y-4">
        {config.sections.length === 0 && (
          <Card>
            <CardBody className="py-10 text-center">
              <FileStack className="mx-auto h-8 w-8 text-ink-300" />
              <div className="mt-2 text-sm font-semibold text-ink-800">No data entry sections yet</div>
              <p className="mx-auto mt-1 max-w-md text-xs text-ink-500">
                Add one section per template page (e.g. “Appendix A – Measurement sheet”) and list the fields the user must fill.
              </p>
              {canManage && (
                <Button className="mt-4" onClick={addSection}>
                  <Plus className="h-4 w-4" /> Add first section
                </Button>
              )}
            </CardBody>
          </Card>
        )}

        {config.sections.map((s, si) => {
          const pageInfo = pages.find((p) => p.number === s.pageNumber);
          return (
            <Card key={s.id}>
              <div className="flex flex-col gap-3 border-b border-ink-200 px-4 py-3 sm:flex-row sm:items-end sm:px-5">
                <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_140px]">
                  <Field label="Section title">
                    <Input value={s.title} disabled={!canManage} onChange={(e) => updateSection(s.id, { title: e.target.value })} />
                  </Field>
                  <Field label="Template page">
                    <Select
                      value={s.pageNumber ?? ""}
                      disabled={!canManage}
                      onChange={(e) => updateSection(s.id, { pageNumber: e.target.value ? Number(e.target.value) : null })}
                    >
                      <option value="">—</option>
                      {(pages.length ? pages : Array.from({ length: 10 }, (_, i) => ({ number: i + 1, name: `Page ${i + 1}`, placedFields: [] }))).map((p) => (
                        <option key={p.number} value={p.number}>
                          {p.number}
                          {p.name && p.name !== `Page ${p.number}` ? ` · ${p.name}` : ""}
                          {p.number === 1 ? " (D365FO)" : ""}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" title="Move up" onClick={() => update((c) => ({ ...c, sections: move(c.sections, si, -1) }))}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" title="Move down" onClick={() => update((c) => ({ ...c, sections: move(c.sections, si, 1) }))}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Delete section"
                      onClick={() => {
                        if (confirm(`Delete section "${s.title}" and its ${s.fields.length} field(s)?`)) update((c) => ({ ...c, sections: c.sections.filter((x) => x.id !== s.id) }));
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                )}
              </div>
              <CardBody className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <Input
                    value={s.description ?? ""}
                    disabled={!canManage}
                    placeholder="Instructions shown to the user (optional)"
                    onChange={(e) => updateSection(s.id, { description: e.target.value })}
                  />
                  <Checkbox
                    label="Print data sheet in PDF"
                    checked={s.printSheet}
                    disabled={!canManage}
                    onChange={(e) => updateSection(s.id, { printSheet: e.target.checked })}
                    title="Fields that are not placed on the template in the designer are printed on an appended data sheet"
                  />
                </div>
                {pageInfo && pageInfo.placedFields.length > 0 && (
                  <p className="text-[11px] text-ink-500">
                    Placed in designer on page {pageInfo.number}: <span className="font-mono">{pageInfo.placedFields.slice(0, 12).join(", ")}</span>
                    {pageInfo.placedFields.length > 12 ? "…" : ""}
                  </p>
                )}

                {/* Fields */}
                <div className="divide-y divide-ink-100 rounded-lg border border-ink-200">
                  {s.fields.length === 0 && <div className="px-3 py-4 text-center text-xs text-ink-400">No fields in this section yet.</div>}
                  {s.fields.map((f, fi) => {
                    const open = openField === f.id;
                    const placed = placedAnywhere.has(f.key.toLowerCase());
                    return (
                      <div key={f.id} className={cn(open && "bg-ink-50/60")}>
                        <button
                          type="button"
                          onClick={() => setOpenField(open ? null : f.id)}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
                        >
                          {open ? <ChevronDown className="h-4 w-4 shrink-0 text-ink-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" />}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="truncate text-sm font-medium text-ink-900">{f.label}</span>
                              {f.required && <span className="text-xs font-bold text-red-600">*</span>}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-500">
                              <span className="font-mono">{f.key}</span>
                              <span>· {INPUT_FIELD_TYPE_LABELS[f.type]}</span>
                              {describeLimits(f) && <span>· {describeLimits(f)}</span>}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            {f.qr && <QrCode className="h-3.5 w-3.5 text-brand-600" aria-label="QR enabled" />}
                            {placed && <Badge tone="success" className="text-[10px]">placed</Badge>}
                          </div>
                        </button>
                        {open && (
                          <div className="grid gap-3 px-3 pb-3 sm:grid-cols-2 lg:grid-cols-3">
                            <Field label="Label *">
                              <Input value={f.label} disabled={!canManage} onChange={(e) => updateField(s.id, f.id, { label: e.target.value })} />
                            </Field>
                            <Field label="Key" hint="designer field name">
                              <Input
                                value={f.key}
                                disabled={!canManage}
                                className="font-mono"
                                onChange={(e) => updateField(s.id, f.id, { key: e.target.value.replace(/[^A-Za-z0-9_]/g, "") })}
                              />
                            </Field>
                            <Field label="Type">
                              <Select value={f.type} disabled={!canManage} onChange={(e) => updateField(s.id, f.id, { type: e.target.value as InputFieldDef["type"] })}>
                                {INPUT_FIELD_TYPES.map((t) => (
                                  <option key={t} value={t}>{INPUT_FIELD_TYPE_LABELS[t]}</option>
                                ))}
                              </Select>
                            </Field>
                            {f.type === "number" && (
                              <>
                                <Field label="Unit">
                                  <Input value={f.unit ?? ""} placeholder="mm, bar, Nm…" disabled={!canManage} onChange={(e) => updateField(s.id, f.id, { unit: e.target.value || undefined })} />
                                </Field>
                                <Field label="Minimum">
                                  <Input type="number" inputMode="decimal" step="any" value={f.min ?? ""} disabled={!canManage} onChange={(e) => updateField(s.id, f.id, { min: numOrNull(e.target.value) })} />
                                </Field>
                                <Field label="Maximum">
                                  <Input type="number" inputMode="decimal" step="any" value={f.max ?? ""} disabled={!canManage} onChange={(e) => updateField(s.id, f.id, { max: numOrNull(e.target.value) })} />
                                </Field>
                              </>
                            )}
                            {f.type === "dropdown" && (
                              <Field label="Options" hint="comma separated" className="sm:col-span-2">
                                <Input
                                  value={(f.options ?? []).join(", ")}
                                  disabled={!canManage}
                                  onChange={(e) => updateField(s.id, f.id, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })}
                                />
                              </Field>
                            )}
                            <Field label="Nominal / specification" hint="shown to user & printed">
                              <Input value={f.nominal ?? ""} placeholder="e.g. 25.0 ± 0.2" disabled={!canManage} onChange={(e) => updateField(s.id, f.id, { nominal: e.target.value || undefined })} />
                            </Field>
                            <Field label="Default value">
                              <Input value={f.defaultValue ?? ""} disabled={!canManage} onChange={(e) => updateField(s.id, f.id, { defaultValue: e.target.value || undefined })} />
                            </Field>
                            <Field label="Help text" className="sm:col-span-2 lg:col-span-1">
                              <Input value={f.help ?? ""} disabled={!canManage} onChange={(e) => updateField(s.id, f.id, { help: e.target.value || undefined })} />
                            </Field>
                            <div className="flex flex-wrap items-center gap-4 sm:col-span-2 lg:col-span-3">
                              <Checkbox label="Required" checked={f.required} disabled={!canManage} onChange={(e) => updateField(s.id, f.id, { required: e.target.checked })} />
                              <Checkbox label="Allow QR scan" checked={f.qr} disabled={!canManage} onChange={(e) => updateField(s.id, f.id, { qr: e.target.checked })} />
                              {canManage && (
                                <div className="ml-auto flex items-center gap-1">
                                  <Button size="icon" variant="ghost" title="Move up" onClick={() => updateSection(s.id, { fields: move(s.fields, fi, -1) })}>
                                    <ArrowUp className="h-4 w-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" title="Move down" onClick={() => updateSection(s.id, { fields: move(s.fields, fi, 1) })}>
                                    <ArrowDown className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    title="Duplicate"
                                    onClick={() => {
                                      const copy = { ...f, id: newId("f"), key: uniqueKey(f.key, allKeys), label: `${f.label} (copy)` };
                                      updateSection(s.id, { fields: [...s.fields.slice(0, fi + 1), copy, ...s.fields.slice(fi + 1)] });
                                      setOpenField(copy.id);
                                    }}
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" title="Delete field" onClick={() => updateSection(s.id, { fields: s.fields.filter((x) => x.id !== f.id) })}>
                                    <Trash2 className="h-4 w-4 text-red-600" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {canManage && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => addField(s.id)}>
                      <Plus className="h-3.5 w-3.5" /> Add field
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setBulk({ sectionId: s.id, text: "" })}>
                      <ListPlus className="h-3.5 w-3.5" /> Bulk add
                    </Button>
                  </div>
                )}

                {bulk?.sectionId === s.id && (
                  <div className="space-y-2 rounded-lg border border-brand-200 bg-brand-50/40 p-3">
                    <div className="text-xs text-ink-700">
                      One field per line. Optional: <code className="font-mono">Label | unit | min | max</code>
                    </div>
                    <Textarea
                      value={bulk.text}
                      onChange={(e) => setBulk({ ...bulk, text: e.target.value })}
                      placeholder={"Flatness | mm | 0 | 0.5\nAir leak test pressure | bar | 6 | 8\nFan test result"}
                      className="min-h-28 font-mono text-xs"
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setBulk(null)}>Cancel</Button>
                      <Button size="sm" onClick={applyBulk} disabled={!bulk.text.trim()}>Add fields</Button>
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>
          );
        })}

        {canManage && config.sections.length > 0 && (
          <Button variant="outline" onClick={addSection} className="w-full justify-center border-dashed">
            <Plus className="h-4 w-4" /> Add section / page
          </Button>
        )}

        {/* Attachments */}
        <Card>
          <CardHeader
            title="Supplier documents (camera capture)"
            description="Users photograph paper quality documents and test reports from suppliers. Photos are stored with the COC and merged into the final PDF."
            actions={<Camera className="h-5 w-5 text-brand-600" />}
          />
          <CardBody className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
              <Checkbox
                label="Enable camera capture / attachments"
                checked={config.attachments.enabled}
                disabled={!canManage}
                onChange={(e) => update((c) => ({ ...c, attachments: { ...c.attachments, enabled: e.target.checked } }))}
              />
              <Checkbox
                label="Required"
                checked={config.attachments.required}
                disabled={!canManage || !config.attachments.enabled}
                onChange={(e) =>
                  update((c) => ({ ...c, attachments: { ...c.attachments, required: e.target.checked, minCount: e.target.checked ? Math.max(1, c.attachments.minCount) : 0 } }))
                }
              />
            </div>
            <Field label="Heading shown to user">
              <Input
                value={config.attachments.label}
                disabled={!canManage || !config.attachments.enabled}
                onChange={(e) => update((c) => ({ ...c, attachments: { ...c.attachments, label: e.target.value } }))}
              />
            </Field>
            <Field label="Minimum documents">
              <Input
                type="number"
                min={0}
                max={50}
                value={config.attachments.minCount}
                disabled={!canManage || !config.attachments.enabled}
                onChange={(e) => update((c) => ({ ...c, attachments: { ...c.attachments, minCount: Math.max(0, Math.min(50, Number(e.target.value) || 0)) } }))}
              />
            </Field>
            <Field label="Instructions" className="sm:col-span-2">
              <Input
                value={config.attachments.hint ?? ""}
                placeholder="e.g. Capture the supplier material certificate and pressure test report"
                disabled={!canManage || !config.attachments.enabled}
                onChange={(e) => update((c) => ({ ...c, attachments: { ...c.attachments, hint: e.target.value || undefined } }))}
              />
            </Field>
          </CardBody>
        </Card>

        {/* QR help */}
        <Card>
          <CardHeader title="QR code format" description="A QR code can fill a single field, or many fields at once." />
          <CardBody className="space-y-2 text-xs text-ink-700">
            <p>
              <strong>Single value:</strong> any text – it is placed in the field whose scan button was pressed.
            </p>
            <p>
              <strong>Many fields:</strong> JSON using field keys or labels, or <code className="font-mono">Key=Value;Key=Value</code> pairs.
            </p>
            {sampleQr && (
              <pre className="overflow-x-auto rounded-md bg-ink-900 p-3 font-mono text-[11px] text-emerald-200">{sampleQr}</pre>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 text-xs text-ink-500">
        Tip: to print a value at an exact position on a template page, add a <em>Field</em> element in the{" "}
        <Link href={`/admin/templates/${templateId}`} className="font-semibold underline">designer</Link> and set its field name to the key shown above.
      </div>

      {/* Sticky save bar (phones / long forms) */}
      {canManage && dirty && (
        <div className="fixed inset-x-0 bottom-16 z-30 flex justify-center px-3 md:bottom-4">
          <div className="flex w-full max-w-md items-center gap-3 rounded-xl border border-ink-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
            <span className="flex-1 text-xs font-medium text-ink-700">Unsaved changes</span>
            <Button size="sm" variant="ghost" onClick={() => { setConfig(initialConfig); setDirty(false); }}>Discard</Button>
            <Button size="sm" onClick={save} loading={saving}>
              <Save className="h-3.5 w-3.5" /> Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
