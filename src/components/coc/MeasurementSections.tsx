"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, QrCode, ScanLine, XCircle } from "lucide-react";
import { Badge, Card, CardBody, CardHeader, Input, Select, Textarea } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";
import { QrScanner } from "./QrScanner";
import {
  describeLimits, evaluateField, parseQrPayload,
  type InputFieldDef, type InputSection, type MeasurementEntry,
} from "@/lib/coc-inputs/types";

export type MeasureValue = { value: string; source: "manual" | "qr" };
export type MeasureValues = Record<string, MeasureValue>;

/** Initial values from field defaults. Keeps anything already typed. */
export function initMeasureValues(sections: InputSection[], prev: MeasureValues = {}): MeasureValues {
  const out: MeasureValues = {};
  for (const s of sections)
    for (const f of s.fields) out[f.key] = prev[f.key] ?? { value: f.defaultValue ?? (f.type === "checkbox" ? "No" : ""), source: "manual" };
  return out;
}

export function missingRequired(sections: InputSection[], values: MeasureValues): InputFieldDef[] {
  return sections.flatMap((s) => s.fields.filter((f) => f.required && !(values[f.key]?.value ?? "").trim()));
}

export function toMeasurementEntries(sections: InputSection[], values: MeasureValues): MeasurementEntry[] {
  return sections.flatMap((s) =>
    s.fields.map((f) => {
      const v = values[f.key] ?? { value: "", source: "manual" as const };
      return {
        sectionId: s.id,
        sectionTitle: s.title,
        pageNumber: s.pageNumber ?? null,
        key: f.key,
        label: f.label,
        type: f.type,
        value: v.value ?? "",
        unit: f.unit,
        nominal: f.nominal,
        min: f.min ?? null,
        max: f.max ?? null,
        status: evaluateField(f, v.value ?? ""),
        source: v.source,
        printSheet: s.printSheet,
      };
    }),
  );
}

function FieldInput({ f, value, onChange }: { f: InputFieldDef; value: string; onChange: (v: string) => void }) {
  const common = { id: `m-${f.key}`, placeholder: f.placeholder || (f.nominal ? `Spec: ${f.nominal}` : undefined) };
  switch (f.type) {
    case "number":
      return <Input {...common} type="text" inputMode="decimal" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} />;
    case "date":
      return <Input {...common} type="date" value={value} onChange={(e) => onChange(e.target.value)} />;
    case "multiline":
      return <Textarea {...common} value={value} onChange={(e) => onChange(e.target.value)} className="min-h-16" />;
    case "dropdown":
      return (
        <Select id={common.id} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {(f.options ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </Select>
      );
    case "passfail":
      return (
        <div className="grid grid-cols-2 gap-2">
          {(["OK", "NOK"] as const).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => onChange(value === o ? "" : o)}
              className={cn(
                "h-10 rounded-md border text-sm font-semibold transition-colors sm:h-9",
                value === o
                  ? o === "OK"
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-red-600 bg-red-600 text-white"
                  : "border-ink-300 bg-white text-ink-700 hover:bg-ink-50",
              )}
            >
              {o}
            </button>
          ))}
        </div>
      );
    case "checkbox":
      return (
        <label className="flex h-10 items-center gap-2 text-sm sm:h-9">
          <input type="checkbox" className="h-5 w-5 accent-ink-900" checked={value === "Yes"} onChange={(e) => onChange(e.target.checked ? "Yes" : "No")} />
          {value === "Yes" ? "Yes" : "No"}
        </label>
      );
    default:
      return <Input {...common} value={value} autoComplete="off" onChange={(e) => onChange(e.target.value)} />;
  }
}

/**
 * Renders the admin-defined data entry sections (template pages 2+) for the user to fill.
 * Every QR-enabled field has its own scan button; each section also has a
 * "scan to fill section" button that accepts multi-value QR payloads.
 */
export function MeasurementSections({
  sections,
  values,
  onChange,
  showErrors,
}: {
  sections: InputSection[];
  values: MeasureValues;
  onChange: (next: MeasureValues) => void;
  showErrors?: boolean;
}) {
  const [scan, setScan] = useState<{ sectionId?: string; fieldKey?: string; title: string } | null>(null);
  const allFields = useMemo(() => sections.flatMap((s) => s.fields), [sections]);

  const set = (key: string, value: string, source: "manual" | "qr" = "manual") => onChange({ ...values, [key]: { value, source } });

  const handleScan = (text: string) => {
    const target = scan;
    setScan(null);
    if (!target) return;
    const scope = target.sectionId ? sections.find((s) => s.id === target.sectionId)?.fields ?? allFields : allFields;
    const parsed = parseQrPayload(text, scope, target.fieldKey);
    const keys = Object.keys(parsed);
    if (!keys.length) {
      toast.error("QR code not recognised", `Scanned “${text.slice(0, 80)}” but it does not match any field. Scan it from the field's own QR button to use it as a value.`);
      return;
    }
    const next = { ...values };
    for (const k of keys) next[k] = { value: parsed[k], source: "qr" };
    onChange(next);
    const labels = keys.map((k) => allFields.find((f) => f.key === k)?.label || k);
    toast.success(keys.length === 1 ? `${labels[0]} filled from QR` : `${keys.length} fields filled from QR`, keys.length > 1 ? labels.join(", ") : parsed[keys[0]]);
  };

  return (
    <>
      {sections.map((s) => {
        const filled = s.fields.filter((f) => (values[f.key]?.value ?? "").trim()).length;
        const nok = s.fields.filter((f) => evaluateField(f, values[f.key]?.value ?? "") === "NOK").length;
        const hasQr = s.fields.some((f) => f.qr);
        return (
          <Card key={s.id}>
            <CardHeader
              title={s.title}
              description={s.description || (s.pageNumber ? `Template page ${s.pageNumber} · manual entry` : "Manual entry")}
              actions={
                <>
                  <Badge tone={filled === s.fields.length ? "success" : "neutral"}>
                    {filled}/{s.fields.length} filled
                  </Badge>
                  {nok > 0 && <Badge tone="danger">{nok} out of tolerance</Badge>}
                  {hasQr && (
                    <button
                      type="button"
                      onClick={() => setScan({ sectionId: s.id, title: `Scan QR · ${s.title}` })}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-brand-300 bg-brand-50 px-2.5 text-xs font-semibold text-brand-800 hover:bg-brand-100"
                    >
                      <ScanLine className="h-3.5 w-3.5" /> Scan to fill
                    </button>
                  )}
                </>
              }
            />
            <CardBody>
              {s.fields.length === 0 ? (
                <div className="py-4 text-center text-xs text-ink-400">No fields configured for this section.</div>
              ) : (
                <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
                  {s.fields.map((f) => {
                    const v = values[f.key]?.value ?? "";
                    const status = evaluateField(f, v);
                    const limits = describeLimits(f);
                    const missing = showErrors && f.required && !v.trim();
                    return (
                      <div key={f.key} data-missing={missing ? "true" : undefined} className={cn(f.type === "multiline" && "sm:col-span-2 xl:col-span-3")}>
                        <label htmlFor={`m-${f.key}`} className="mb-1 flex items-start justify-between gap-2 text-xs font-medium text-ink-700">
                          <span>
                            {f.label}
                            {f.required && <span className="ml-0.5 text-red-600">*</span>}
                            {f.unit && f.type === "number" && <span className="ml-1 font-normal text-ink-400">({f.unit})</span>}
                          </span>
                          {values[f.key]?.source === "qr" && v && (
                            <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-brand-50 px-1 text-[10px] font-semibold text-brand-800">
                              <QrCode className="h-3 w-3" /> QR
                            </span>
                          )}
                        </label>
                        <div className="flex items-stretch gap-2">
                          <div className={cn("min-w-0 flex-1", missing && "[&_input]:border-red-400 [&_select]:border-red-400 [&_textarea]:border-red-400")}>
                            <FieldInput f={f} value={v} onChange={(nv) => set(f.key, nv)} />
                          </div>
                          {f.qr && (
                            <button
                              type="button"
                              title={`Scan QR for ${f.label}`}
                              aria-label={`Scan QR for ${f.label}`}
                              onClick={() => setScan({ fieldKey: f.key, sectionId: s.id, title: `Scan · ${f.label}` })}
                              className="flex w-10 shrink-0 items-center justify-center rounded-md border border-ink-300 bg-white text-ink-700 hover:bg-ink-50 active:bg-ink-100 sm:w-9"
                            >
                              <QrCode className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                        <div className="mt-1 flex min-h-4 items-center gap-2 text-[11px]">
                          {limits && <span className="text-ink-500">Spec: {limits}</span>}
                          {status === "OK" && (
                            <span className="inline-flex items-center gap-0.5 font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" /> OK
                            </span>
                          )}
                          {status === "NOK" && (
                            <span className="inline-flex items-center gap-0.5 font-semibold text-red-700">
                              <XCircle className="h-3 w-3" /> Out of tolerance
                            </span>
                          )}
                          {missing && <span className="font-semibold text-red-600">Required</span>}
                        </div>
                        {f.help && <p className="text-[11px] text-ink-400">{f.help}</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>
        );
      })}

      <QrScanner
        open={Boolean(scan)}
        title={scan?.title}
        subtitle={scan?.fieldKey ? "Value is placed in this field" : "Multi-value QR codes fill several fields"}
        onClose={() => setScan(null)}
        onResult={handleScan}
      />
    </>
  );
}

export function MeasurementEmptyHint({ canManage, templateId }: { canManage: boolean; templateId?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed border-ink-300 bg-white p-4 text-xs text-ink-600">
      <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
      <div>
        No data entry fields are configured for pages 2+ of this template.
        {canManage && templateId && (
          <>
            {" "}
            <a href={`/admin/templates/${templateId}/inputs`} className="font-semibold text-brand-800 underline">
              Configure fields
            </a>
          </>
        )}
      </div>
    </div>
  );
}
