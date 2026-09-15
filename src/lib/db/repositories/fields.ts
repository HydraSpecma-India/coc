import "server-only";
import { supabaseAdmin } from "@/lib/db/supabase-admin";

export interface FieldDefinitionRow {
  id: string;
  field_name: string;
  display_name: string;
  description: string | null;
  data_type: string;
  source_type: string;
  category: string;
  required: boolean;
  read_only: boolean;
  allow_override: boolean;
  default_value: string | null;
  unit: string | null;
  validation_json: Record<string, unknown>;
  config_json: Record<string, unknown>;
  is_system_defined: boolean;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export async function listFieldDefinitions(opts: { includeInactive?: boolean } = {}): Promise<FieldDefinitionRow[]> {
  let q = supabaseAdmin().from("coc_field_definitions").select("*").order("sort_order").order("display_name");
  if (!opts.includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw error;
  return data as FieldDefinitionRow[];
}
