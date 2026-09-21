import type { TemplateInputConfig } from "@/lib/coc-inputs/types";

/** Shape of a field definition as the designer palette expects it (see components/designer/store.ts). */
export interface DesignerFieldDef {
  id: string;
  field_name: string;
  display_name: string;
  data_type: string;
  source_type: string;
  category: string;
  required: boolean;
  read_only: boolean;
  allow_override: boolean;
  default_value: string | null;
  unit: string | null;
  config_json: Record<string, unknown>;
  validation_json: Record<string, unknown>;
}

const TYPE_MAP: Record<string, string> = {
  text: "TEXT",
  number: "NUMBER",
  passfail: "TEXT",
  dropdown: "DROPDOWN",
  date: "DATE",
  multiline: "MULTILINE",
  checkbox: "BOOLEAN",
  photo: "IMAGE",
};

/** Convert the template's data-entry configuration into designer palette entries ("Data entry · Page N"). */
export function dataEntryFieldDefs(cfg: TemplateInputConfig): DesignerFieldDef[] {
  return cfg.sections.flatMap((s) =>
    s.fields.map((f) => ({
      id: `input:${f.key}`,
      field_name: f.key,
      display_name: f.label,
      data_type: TYPE_MAP[f.type] ?? "TEXT",
      source_type: "MANUAL",
      category: `Data entry · ${s.pageNumber ? `Page ${s.pageNumber}` : s.title}`,
      required: f.required,
      read_only: false,
      allow_override: false,
      default_value: f.defaultValue ?? null,
      unit: f.unit ?? null,
      config_json: { dataEntry: true, section: s.title, qr: f.qr },
      validation_json: {},
    })),
  );
}
