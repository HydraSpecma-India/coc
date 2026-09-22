"use client";

import { useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, ClipboardList, Loader2, QrCode, RotateCw, ScanLine, Trash2, XCircle } from "lucide-react";
import { processImage } from "./DocumentCapture";
import { Badge, Card, CardBody, CardHeader, Input, Select, Textarea } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";
import { QrScanner } from "./QrScanner";
import { enterMovesToNext } from "@/lib/utils/form-nav";
import {
  describeLimits, evaluateField, formatPrinted, parseQrPayload,
  type AttachmentUpload, type InputFieldDef, type InputSection, type MeasurementEntry,
} from "@/lib/coc-inputs/types";

export type FieldPhoto = { dataBase64: string; previewUrl: string; mimeType: "image/jpeg" };
export type MeasureValue = { value: string; source: "manual" | "qr"; photo?: FieldPhoto };
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
        value: f.type === "photo" ? (v.photo ? "Photo attached" : "") : v.value ?? "",
        unit: f.unit,
        nominal: f.nominal,
        min: f.min ?? null,
        max: f.max ?? null,
        status: evaluateField(f, v.value ?? ""),
        printed: f.type === "photo" ? undefined : formatPrinted(f, v.value ?? "") || undefined,
        source: v.source,
        printSheet: s.printSheet,
      };
    }),
  );
}

/** Photos captured for "photo" fields → uploads drawn into the designer image slot with the same key. */
export function photoUploads(sections: InputSection[], values: MeasureValues): AttachmentUpload[] {
  return sections.flatMap((s) =>
    s.fields
      .filter((f) => f.type === "photo" && values[f.key]?.photo)
      .map((f) => ({
        name: `${f.key}.jpg`,
        mimeType: "image/jpeg" as const,
        caption: f.label,
        fieldKey: f.key,
        dataBase64: values[f.key]!.photo!.dataBase64,
      })),
  );
}

/** Camera capture for a single "photo" field (e.g. the air-leak test print-out glued on the test page). */
function PhotoFieldInput({ f, value, onChange }: { f: InputFieldDef; value?: MeasureValue; onChange: (v: MeasureValue) => void }) {
  const ref = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const photo = value?.photo;

  const take = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await processImage(file, { enhance: true });
      onChange({ value: "Photo captured", source: "manual", photo: { dataBase64: dataUrl.slice(dataUrl.indexOf(",") + 1), previewUrl: dataUrl, mimeType: "image/jpeg" } });
    } catch {
      toast.error("Could not read the photo", "Please take the photo again.");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };

  const rotate = async () => {
    if (!photo) return;
    const blob = await (await fetch(photo.previewUrl)).blob();
    const dataUrl = await processImage(blob, { enhance: false, rotate: 90 });
    onChange({ value: "Photo captured", source: "manual", photo: { dataBase64: dataUrl.slice(dataUrl.indexOf(",") + 1), previewUrl: dataUrl, mimeType: "image/jpeg" } });
  };

  return (
    <div className="space-y-2">
      <input ref={ref} id={`m-${f.key}`} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => take(e.target.files?.[0])} />
      {photo ? (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-ink-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.previewUrl} alt={f.label} className="mx-auto max-h-56 w-auto object-contain" />
          <div className="flex items-center gap-1 border-t border-ink-200 bg-white p-1.5">
            <button type="button" onClick={() => ref.current?.click()} className="inline-flex h-9 items-center gap-1 rounded-md px-2.5 text-xs font-semibold text-ink-700 hover:bg-ink-100">
              <Camera className="h-4 w-4" /> Retake
            </button>
            <button type="button" onClick={rotate} className="inline-flex h-9 items-center gap-1 rounded-md px-2.5 text-xs font-semibold text-ink-700 hover:bg-ink-100">
              <RotateCw className="h-4 w-4" /> Rotate
            </button>
            <button type="button" onClick={() => onChange({ value: "", source: "manual" })} className="ml-auto inline-flex h-9 items-center gap-1 rounded-md px-2.5 text-xs font-semibold text-red-600 hover:bg-red-50">
              <Trash2 className="h-4 w-4" /> Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => ref.current?.click()}
          className="flex h-24 w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-ink-300 bg-white text-sm font-semibold text-ink-700 hover:border-brand-400 hover:bg-brand-50/40 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5 text-brand-600" />}
          Take photo
          <span className="text-[11px] font-normal text-ink-500">Printed on the template page where the admin placed it</span>
        </button>
      )}
    </div>
  );
}

function FieldInput({ f, value, onChange, last }: { f: InputFieldDef; value: string; onChange: (v: string) => void; last?: boolean }) {
  // the phone keyboard shows "next" (last field: "done") – Enter / next jumps to the following field
  const common = {
    id: `m-${f.key}`,
    placeholder: f.placeholder || (f.nominal ? `Spec: ${f.nominal}` : undefined),
    "data-entry-input": "true",
    enterKeyHint: (last ? "done" : "next") as "done" | "next",
  };
  switch (f.type) {
    case "number":
      return <Input {...common} type="text" inputMode="decimal" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} />;
    case "date":
      return <Input {...common} type="date" value={value} onChange={(e) => onChange(e.target.value)} />;
    case "multiline":
      return <Textarea {...common} value={value} onChange={(e) => onChange(e.target.value)} className="min-h-16" />;
    case "dropdown":
      return (
        <Select id={common.id} data-entry-input="true" value={value} onChange={(e) => onChange(e.target.value)}>
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
        <label className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 sm:min-h-9">
          <input type="checkbox" className="h-5 w-5 shrink-0 accent-ink-900" checked={value === "Yes"} onChange={(e) => onChange(e.target.checked ? "Yes" : "No")} />
          <span className="min-w-0 flex-1">
            {f.label}
            {f.required && <span className="ml-0.5 text-red-600">*</span>}
          </span>
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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lastKey = allFields.filter((f) => f.type !== "photo").at(-1)?.key;

  const onEnter = (e: React.KeyboardEvent<HTMLDivElement>) => enterMovesToNext(e, rootRef.current);

  const set = (key: string, value: string, source: "manual" | "qr" = "manual") => onChange({ ...values, [key]: { value, source } });

  const handleScan = (text: string) => {
    const target = scan;
    setScan(null);
    if (!target) return;
    const scope = target.sectionId ? sections.find((s) => s.id === target.sectionId)?.fields ?? allFields : allFields;
    const parsed = parseQrPayload(text, scope, target.fieldKey);
    const keys = Object.keys(parsed);
    if (!keys.length) {
      toast.error("Code not recognised", `Scanned “${text.slice(0, 80)}” but it does not match any field. Scan it from the field's own QR button to use it as a value.`);
      return;
    }
    const next = { ...values };
    for (const k of keys) next[k] = { value: parsed[k], source: "qr" };
    onChange(next);
    const labels = keys.map((k) => allFields.find((f) => f.key === k)?.label || k);
    toast.success(keys.length === 1 ? `${labels[0]} filled from QR` : `${keys.length} fields filled from QR`, keys.length > 1 ? labels.join(", ") : parsed[keys[0]]);
  };

  return (
    <div ref={rootRef} className="space-y-6" onKeyDown={onEnter}>
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
                      <div key={f.key} data-missing={missing ? "true" : undefined} className={cn((f.type === "multiline" || f.type === "photo") && "sm:col-span-2 xl:col-span-3")}>
                        <label htmlFor={`m-${f.key}`} className={cn("mb-1 flex items-start justify-between gap-2 text-xs font-medium text-ink-700", f.type === "checkbox" && "sr-only")}>
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
                            {f.type === "photo" ? (
                              <PhotoFieldInput f={f} value={values[f.key]} onChange={(nv) => onChange({ ...values, [f.key]: nv })} />
                            ) : (
                              <FieldInput f={f} value={v} onChange={(nv) => set(f.key, nv)} last={f.key === lastKey} />
                            )}
                          </div>
                          {f.qr && f.type !== "photo" && (
                            <button
                              type="button"
                              title={`Scan QR / barcode for ${f.label}`}
                              aria-label={`Scan QR / barcode for ${f.label}`}
                              onClick={() => setScan({ fieldKey: f.key, sectionId: s.id, title: `Scan · ${f.label}` })}
                              className="flex w-10 shrink-0 items-center justify-center rounded-md border border-ink-300 bg-white text-ink-700 hover:bg-ink-50 active:bg-ink-100 sm:w-9"
                            >
                              <QrCode className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                        <div className={cn("mt-1 flex min-h-4 items-center gap-2 text-[11px]", f.type === "checkbox" && !missing && "hidden")}>
                          {limits && <span className="text-ink-500">Spec: {limits}</span>}
                          {f.printFormat && v.trim() && (
                            <span className="rounded bg-ink-100 px-1.5 font-mono text-ink-700" title="As stamped on the certificate">
                              PDF: {formatPrinted(f, v)}
                            </span>
                          )}
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
        subtitle={scan?.fieldKey ? "QR code or barcode – value goes into this field" : "Multi-value QR codes fill several fields"}
        onClose={() => setScan(null)}
        onResult={handleScan}
      />
    </div>
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
