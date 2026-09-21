import "server-only";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { invalidateConfigCache } from "@/lib/config";
import {
  TemplateInputConfigSchema,
  EMPTY_INPUT_CONFIG,
  settingsKeyForTemplate,
  type TemplateInputConfig,
} from "@/lib/coc-inputs/types";

/**
 * Template data-entry configuration (measurement fields for pages 2+ and
 * attachment rules) is stored in `coc_app_settings` under
 * `template.inputs.<templateId>` so admins can change it at any time without
 * publishing a new template version. Each issued COC stores a snapshot of the
 * fields it was filled with, so later edits never change historical records.
 */
export async function getTemplateInputConfig(templateId: string): Promise<TemplateInputConfig> {
  const { data, error } = await supabaseAdmin()
    .from("coc_app_settings")
    .select("value")
    .eq("key", settingsKeyForTemplate(templateId))
    .maybeSingle();
  if (error || !data?.value) return EMPTY_INPUT_CONFIG;
  const parsed = TemplateInputConfigSchema.safeParse(data.value);
  return parsed.success ? parsed.data : EMPTY_INPUT_CONFIG;
}

export async function saveTemplateInputConfig(
  templateId: string,
  config: TemplateInputConfig,
  user: { id?: string; email?: string },
): Promise<TemplateInputConfig> {
  const value: TemplateInputConfig = {
    ...config,
    updatedAt: new Date().toISOString(),
    updatedBy: user.email || undefined,
  };
  const { error } = await supabaseAdmin()
    .from("coc_app_settings")
    .upsert({
      key: settingsKeyForTemplate(templateId),
      value,
      description: "COC data-entry fields (pages 2+) and attachment rules for this template",
      updated_by: user.id && /^[0-9a-f-]{36}$/i.test(user.id) ? user.id : null,
      updated_at: value.updatedAt,
    });
  if (error) throw error;
  invalidateConfigCache();
  return value;
}
