import { z } from "zod";

/**
 * Per-template "data entry" configuration.
 *
 * Page 1 of a COC is filled from D365FO data. Every other page of the template
 * (measurement sheets, serial-number registration, test reports …) is filled
 * manually by the user. Admins decide – per template – which fields exist on
 * those pages, and users fill them in the New COC wizard either by typing or by
 * scanning a QR code. Captured supplier documents (photos / PDFs) are merged
 * into the final certificate PDF as attachments.
 *
 * Client-safe module (no server imports).
 */

export const INPUT_FIELD_TYPES = ["text", "number", "passfail", "dropdown", "date", "multiline", "checkbox", "photo"] as const;
export type InputFieldType = (typeof INPUT_FIELD_TYPES)[number];

export const INPUT_FIELD_TYPE_LABELS: Record<InputFieldType, string> = {
  text: "Text",
  number: "Measurement (number)",
  passfail: "OK / NOK",
  dropdown: "Dropdown",
  date: "Date",
  multiline: "Long text / remarks",
  checkbox: "Checkbox",
  photo: "Photo / test print-out (camera)",
};

const keyRegex = /^[A-Za-z][A-Za-z0-9_]*$/;

export const InputFieldDefSchema = z.object({
  id: z.string().min(1),
  /** Stable key – also usable as a `fieldName` in the template designer to place the value on the page. */
  key: z.string().regex(keyRegex, "Key must start with a letter and contain only letters, digits and _"),
  label: z.string().min(1).max(200),
  type: z.enum(INPUT_FIELD_TYPES).default("text"),
  unit: z.string().max(30).optional(),
  required: z.boolean().default(false),
  /** Nominal / specification text shown to the user, e.g. "25.0 ± 0.2" */
  nominal: z.string().max(120).optional(),
  min: z.number().nullable().optional(),
  max: z.number().nullable().optional(),
  options: z.array(z.string().max(120)).optional(),
  /** Show a "scan QR" button next to the input */
  qr: z.boolean().default(false),
  placeholder: z.string().max(200).optional(),
  help: z.string().max(400).optional(),
  defaultValue: z.string().max(400).optional(),
});
export type InputFieldDef = z.infer<typeof InputFieldDefSchema>;

export const InputSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  /** Template page this section belongs to (2 = second page …). Informational + used for grouping. */
  pageNumber: z.number().int().min(1).max(99).nullable().optional(),
  description: z.string().max(600).optional(),
  /** Append an auto-generated data sheet to the PDF for fields that are not placed in the designer. */
  printSheet: z.boolean().default(true),
  fields: z.array(InputFieldDefSchema).default([]),
});
export type InputSection = z.infer<typeof InputSectionSchema>;

export const AttachmentSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  required: z.boolean().default(false),
  minCount: z.number().int().min(0).max(50).default(0),
  label: z.string().max(200).default("Supplier quality documents & test reports"),
  hint: z.string().max(400).optional(),
});
export type AttachmentSettings = z.infer<typeof AttachmentSettingsSchema>;

export const TemplateInputConfigSchema = z.object({
  version: z.literal(1).default(1),
  sections: z.array(InputSectionSchema).default([]),
  attachments: AttachmentSettingsSchema.prefault({}),
  updatedAt: z.string().optional(),
  updatedBy: z.string().optional(),
});
export type TemplateInputConfig = z.infer<typeof TemplateInputConfigSchema>;

export const EMPTY_INPUT_CONFIG: TemplateInputConfig = TemplateInputConfigSchema.parse({});

export const settingsKeyForTemplate = (templateId: string) => `template.inputs.${templateId}`;

/** Validate a key list – returns an error message or null. */
export function validateInputConfig(cfg: TemplateInputConfig): string | null {
  const seen = new Set<string>();
  for (const s of cfg.sections) {
    for (const f of s.fields) {
      const k = f.key.toLowerCase();
      if (seen.has(k)) return `Field key "${f.key}" is used more than once. Keys must be unique per template.`;
      seen.add(k);
      if (f.type === "dropdown" && (!f.options || f.options.filter(Boolean).length === 0)) {
        return `Dropdown field "${f.label}" needs at least one option.`;
      }
      if (f.min != null && f.max != null && f.min > f.max) return `Field "${f.label}": minimum is greater than maximum.`;
    }
  }
  return null;
}

/* ───────────────────────── captured values ───────────────────────── */

export type MeasurementStatus = "OK" | "NOK" | "";

export const MeasurementEntrySchema = z.object({
  sectionId: z.string(),
  sectionTitle: z.string(),
  pageNumber: z.number().nullable().optional(),
  key: z.string(),
  label: z.string(),
  type: z.string(),
  value: z.string().max(4000),
  unit: z.string().optional(),
  nominal: z.string().optional(),
  min: z.number().nullable().optional(),
  max: z.number().nullable().optional(),
  status: z.enum(["OK", "NOK", ""]).default(""),
  source: z.enum(["manual", "qr"]).default("manual"),
  printSheet: z.boolean().default(true),
});
export type MeasurementEntry = z.infer<typeof MeasurementEntrySchema>;

export const AttachmentUploadSchema = z.object({
  name: z.string().max(200),
  mimeType: z.enum(["image/jpeg", "image/png", "application/pdf"]),
  caption: z.string().max(300).optional(),
  /** Set for "photo" data-entry fields – drawn into the designer image slot bound to this key */
  fieldKey: z.string().max(80).optional(),
  /** base64 (no data: prefix) */
  dataBase64: z.string().min(10),
});
export type AttachmentUpload = z.infer<typeof AttachmentUploadSchema>;

export interface StoredAttachment {
  index: number;
  name: string;
  caption?: string;
  mimeType: string;
  storagePath: string | null;
  pageCount: number;
  sizeBytes: number;
}

export const MAX_ATTACHMENTS = 20;
export const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024; // per file, decoded
export const MAX_TOTAL_ATTACHMENT_BYTES = 40 * 1024 * 1024;

/** Evaluate a value against the field's limits. Numbers outside [min,max] → NOK. */
export function evaluateField(field: Pick<InputFieldDef, "type" | "min" | "max">, raw: string): MeasurementStatus {
  const value = (raw ?? "").trim();
  if (!value) return "";
  if (field.type === "passfail") {
    const v = value.toUpperCase();
    if (["OK", "PASS", "PASSED", "YES", "CONFORMS"].includes(v)) return "OK";
    if (["NOK", "NOT OK", "FAIL", "FAILED", "NO", "NC"].includes(v)) return "NOK";
    return "";
  }
  if (field.type === "number") {
    // Accept "0.32", "727,4", "0.3 mm", and bounded readings like "<1", "≤ 1mm", ">5"
    const m = value.replace(/\s+/g, "").match(/^(<=|>=|≤|≥|<|>)?([-+]?\d+(?:[.,]\d+)?)/);
    if (!m) return "";
    const op = m[1] ?? "";
    const n = Number(m[2].replace(",", "."));
    if (!Number.isFinite(n)) return "";
    const below = op === "<" || op === "<=" || op === "≤"; // reading is "less than n"
    const above = op === ">" || op === ">=" || op === "≥"; // reading is "more than n"
    if (field.max != null && !below && n > field.max) return "NOK";
    if (field.max != null && below && n > field.max) return "NOK";
    if (field.min != null && !above && !below && n < field.min) return "NOK";
    if (field.min != null && below && n <= field.min) return "NOK";
    return field.min != null || field.max != null ? "OK" : "";
  }
  return "";
}

export function describeLimits(f: Pick<InputFieldDef, "min" | "max" | "unit" | "nominal">): string {
  const u = f.unit ? ` ${f.unit}` : "";
  if (f.nominal) return f.nominal + (f.unit && !f.nominal.includes(f.unit) ? u : "");
  if (f.min != null && f.max != null) return `${f.min} – ${f.max}${u}`;
  if (f.min != null) return `≥ ${f.min}${u}`;
  if (f.max != null) return `≤ ${f.max}${u}`;
  return "";
}

/* ───────────────────────── QR payload parsing ───────────────────────── */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Parse a scanned QR payload into { fieldKey: value } pairs.
 * Supported formats:
 *  • JSON object          {"Length":"25.02","Diameter":"12.00"}
 *  • key=value pairs      Length=25.02;Diameter=12.00   (separators: ; | newline &)
 *  • key: value lines     Length: 25.02
 *  • anything else        → treated as a single value for `targetKey`
 * Keys are matched against field keys and labels case/punctuation-insensitively.
 */
export function parseQrPayload(payload: string, fields: Pick<InputFieldDef, "key" | "label">[], targetKey?: string): Record<string, string> {
  const text = (payload ?? "").trim();
  const out: Record<string, string> = {};
  if (!text) return out;

  const lookup = new Map<string, string>();
  for (const f of fields) {
    lookup.set(norm(f.key), f.key);
    lookup.set(norm(f.label), f.key);
  }
  const assign = (k: string, v: unknown) => {
    const key = lookup.get(norm(k));
    if (key && v !== undefined && v !== null) out[key] = String(v).trim();
  };

  if (text.startsWith("{")) {
    try {
      const obj = JSON.parse(text) as Record<string, unknown>;
      for (const [k, v] of Object.entries(obj)) assign(k, v);
      if (Object.keys(out).length) return out;
    } catch {
      /* not JSON – continue */
    }
  }

  const parts = text.split(/[;\n|&]+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length && parts.every((p) => /[=:]/.test(p))) {
    for (const p of parts) {
      const m = p.match(/^([^=:]+)[=:](.*)$/);
      if (m) assign(m[1], m[2]);
    }
    if (Object.keys(out).length) return out;
  }

  if (targetKey) out[targetKey] = text;
  return out;
}

export function newId(prefix = "f"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;
}
