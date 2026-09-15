import { requireCapability } from "@/lib/auth/guards";
import { getAllSettings } from "@/lib/db/repositories/settings";
import { env } from "@/lib/env";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "System Settings" };

export default async function SettingsPage() {
  await requireCapability("manageSettings");
  const settings = await getAllSettings();
  const e = env();
  const integrations = {
    entra: Boolean(e.AUTH_MICROSOFT_ENTRA_ID_ID),
    supabase: Boolean(e.SUPABASE_URL),
    d365: { mode: e.D365_MODE, configured: Boolean(e.D365_BASE_URL && e.D365_CLIENT_ID && e.D365_CLIENT_SECRET && e.D365_TENANT_ID) },
    sharepoint: { mode: e.STORAGE_MODE, configured: Boolean(e.AZURE_CLIENT_ID && e.AZURE_CLIENT_SECRET && e.AZURE_TENANT_ID && e.SHAREPOINT_SITE_ID && e.SHAREPOINT_DRIVE_ID) },
    automation: Boolean(e.AUTOMATION_API_KEY),
  };
  return <SettingsClient settings={settings} integrations={integrations} />;
}
