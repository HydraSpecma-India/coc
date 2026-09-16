import "server-only";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { env } from "@/lib/env";

export interface IntegrationConfig {
  entra: {
    clientId: string;
    clientSecret: string;
    tenantId: string;
    issuer: string;
    adminEmails: string;
    devBypass: boolean;
  };
  d365: {
    mode: "mock" | "live";
    baseUrl: string;
    tenantId: string;
    clientId: string;
    clientSecret: string;
    company: string;
    productionEntity: string;
    cocEntity: string;
    salesOrderEntity: string;
  };
  sharepoint: {
    mode: "mock" | "live";
    tenantId: string;
    clientId: string;
    clientSecret: string;
    siteId: string;
    driveId: string;
    rootFolder: string;
  };
  app: {
    name: string;
    url: string;
    automationApiKey: string;
    logLevel: "debug" | "info" | "warn" | "error";
    numberFormat: string;
    numberAuthority: "app" | "d365";
    enforceRemainingQty: boolean;
    signatureRequired: boolean;
  };
}

let cachedSettings: Record<string, unknown> | null = null;
let lastFetch = 0;
const CACHE_TTL_MS = 10_000; // 10s cache to avoid repetitive DB calls

export async function fetchAllDbSettings(force = false): Promise<Record<string, unknown>> {
  const now = Date.now();
  if (!force && cachedSettings && now - lastFetch < CACHE_TTL_MS) {
    return cachedSettings;
  }
  try {
    const { data, error } = await supabaseAdmin().from("coc_app_settings").select("key, value");
    if (error) {
      console.warn("Failed to fetch settings from DB, falling back to env:", error.message);
      return cachedSettings || {};
    }
    const map: Record<string, unknown> = {};
    for (const row of data || []) {
      map[row.key] = row.value;
    }
    cachedSettings = map;
    lastFetch = now;
    return map;
  } catch (err) {
    console.warn("Exception fetching settings from DB:", err);
    return cachedSettings || {};
  }
}

export function invalidateConfigCache() {
  cachedSettings = null;
  lastFetch = 0;
}

/**
 * Returns merged configuration: Supabase DB values take priority,
 * falling back to process.env variables.
 */
export async function getActiveConfig(): Promise<IntegrationConfig> {
  const db = await fetchAllDbSettings();
  const e = env();

  const str = (key: string, fallback?: string): string => {
    const val = db[key];
    if (typeof val === "string" && val.trim().length > 0) return val.trim();
    return fallback ?? "";
  };

  const bool = (key: string, fallback = false): boolean => {
    const val = db[key];
    if (typeof val === "boolean") return val;
    if (typeof val === "string") return val.toLowerCase() === "true";
    return fallback;
  };

  const mode = (key: string, fallback: "mock" | "live"): "mock" | "live" => {
    const val = db[key];
    if (val === "mock" || val === "live") return val;
    return fallback;
  };

  const entraTenant = str("auth.entra.tenantId", "");
  const entraIssuer = str(
    "auth.entra.issuer",
    e.AUTH_MICROSOFT_ENTRA_ID_ISSUER || (entraTenant ? `https://login.microsoftonline.com/${entraTenant}/v2.0` : "")
  );

  return {
    entra: {
      clientId: str("auth.entra.clientId", e.AUTH_MICROSOFT_ENTRA_ID_ID),
      clientSecret: str("auth.entra.clientSecret", e.AUTH_MICROSOFT_ENTRA_ID_SECRET),
      tenantId: entraTenant,
      issuer: entraIssuer,
      adminEmails: str("auth.adminEmails", e.ADMIN_EMAILS),
      devBypass: bool("auth.devBypass", e.AUTH_DEV_BYPASS === "true"),
    },
    d365: {
      mode: mode("d365.mode", e.D365_MODE),
      baseUrl: str("d365.baseUrl", e.D365_BASE_URL),
      tenantId: str("d365.tenantId", e.D365_TENANT_ID),
      clientId: str("d365.clientId", e.D365_CLIENT_ID),
      clientSecret: str("d365.clientSecret", e.D365_CLIENT_SECRET),
      company: str("d365.company", e.D365_COMPANY),
      productionEntity: str("d365.productionEntity", e.D365_PRODUCTION_ENTITY),
      cocEntity: str("d365.cocEntity", e.D365_COC_ENTITY),
      salesOrderEntity: str("d365.salesOrderEntity", "SalesOrderLines"),
    },
    sharepoint: {
      mode: mode("sharepoint.mode", e.STORAGE_MODE),
      tenantId: str("sharepoint.tenantId", e.AZURE_TENANT_ID),
      clientId: str("sharepoint.clientId", e.AZURE_CLIENT_ID),
      clientSecret: str("sharepoint.clientSecret", e.AZURE_CLIENT_SECRET),
      siteId: str("sharepoint.siteId", e.SHAREPOINT_SITE_ID),
      driveId: str("sharepoint.driveId", e.SHAREPOINT_DRIVE_ID),
      rootFolder: str("sharepoint.rootFolder", e.SHAREPOINT_ROOT_FOLDER),
    },
    app: {
      name: str("app.name", e.APP_NAME),
      url: str("app.url", e.APP_URL),
      automationApiKey: str("app.automationApiKey", e.AUTOMATION_API_KEY),
      logLevel: (str("app.logLevel", e.LOG_LEVEL) as "debug" | "info" | "warn" | "error") || "info",
      numberFormat: str("coc.numberFormat", "COC-{yyyy}-{seq:4}"),
      numberAuthority: (str("coc.numberAuthority", "app") as "app" | "d365") || "app",
      enforceRemainingQty: bool("coc.enforceRemainingQty", true),
      signatureRequired: bool("signature.required", true),
    },
  };
}
