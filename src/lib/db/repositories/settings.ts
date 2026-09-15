import "server-only";
import { supabaseAdmin } from "@/lib/db/supabase-admin";

export interface SettingRow { key: string; value: unknown; description: string | null; updated_at: string }

export async function getAllSettings(): Promise<SettingRow[]> {
  const { data, error } = await supabaseAdmin().from("coc_app_settings").select("*").order("key");
  if (error) throw error;
  return data as SettingRow[];
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const { data } = await supabaseAdmin().from("coc_app_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? fallback;
}

export async function setSetting(key: string, value: unknown, userId?: string): Promise<void> {
  const { error } = await supabaseAdmin().from("coc_app_settings").upsert({
    key, value, updated_by: userId && /^[0-9a-f-]{36}$/i.test(userId) ? userId : null, updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
