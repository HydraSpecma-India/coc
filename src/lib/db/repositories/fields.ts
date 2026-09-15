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

export interface D365MappingRow {
  id: string;
  field_id: string;
  entity: string;
  property: string;
  path: string | null;
  odata_type: string | null;
  transform: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  field?: FieldDefinitionRow;
}

export async function listFieldDefinitions(opts: { includeInactive?: boolean } = {}): Promise<FieldDefinitionRow[]> {
  let q = supabaseAdmin().from("coc_field_definitions").select("*").order("sort_order").order("display_name");
  if (!opts.includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw error;
  return data as FieldDefinitionRow[];
}

export async function createFieldDefinition(
  input: Omit<FieldDefinitionRow, "id" | "created_at" | "updated_at" | "is_system_defined">
): Promise<FieldDefinitionRow> {
  const { data, error } = await supabaseAdmin()
    .from("coc_field_definitions")
    .insert({
      ...input,
      is_system_defined: false,
    })
    .select()
    .single();
  if (error) throw error;
  return data as FieldDefinitionRow;
}

export async function updateFieldDefinition(
  id: string,
  input: Partial<FieldDefinitionRow>
): Promise<FieldDefinitionRow> {
  const { data, error } = await supabaseAdmin()
    .from("coc_field_definitions")
    .update({
      ...input,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as FieldDefinitionRow;
}

export async function deleteFieldDefinition(id: string): Promise<void> {
  // Soft delete by setting active = false
  const { error } = await supabaseAdmin()
    .from("coc_field_definitions")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function listD365Mappings(): Promise<D365MappingRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("coc_d365_field_mappings")
    .select("*, field:coc_field_definitions(*)")
    .order("created_at");
  if (error) throw error;
  return data as D365MappingRow[];
}

export async function upsertD365Mapping(input: {
  id?: string;
  field_id: string;
  entity: string;
  property: string;
  path?: string;
  odata_type?: string;
  transform?: string;
  active?: boolean;
}): Promise<D365MappingRow> {
  const { data, error } = await supabaseAdmin()
    .from("coc_d365_field_mappings")
    .upsert({
      ...(input.id ? { id: input.id } : {}),
      field_id: input.field_id,
      entity: input.entity,
      property: input.property,
      path: input.path || null,
      odata_type: input.odata_type || "Edm.String",
      transform: input.transform || "none",
      active: input.active !== undefined ? input.active : true,
      updated_at: new Date().toISOString(),
    })
    .select("*, field:coc_field_definitions(*)")
    .single();
  if (error) throw error;
  return data as D365MappingRow;
}
