import "server-only";
import { z } from "zod";

/**
 * Server-side environment contract. Parsed lazily so `next build` does not
 * require every integration variable to be present; individual integrations
 * validate their own subset when first used.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_NAME: z.string().default("COC Platform"),
  APP_URL: z.string().default("http://localhost:3000"),

  AUTH_SECRET: z.string().optional(),
  AUTH_MICROSOFT_ENTRA_ID_ID: z.string().optional(),
  AUTH_MICROSOFT_ENTRA_ID_SECRET: z.string().optional(),
  AUTH_MICROSOFT_ENTRA_ID_ISSUER: z.string().optional(),
  ADMIN_EMAILS: z.string().default(""),
  AUTH_DEV_BYPASS: z.string().default("false"),

  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  D365_MODE: z.enum(["mock", "live"]).default("mock"),
  D365_BASE_URL: z.string().optional(),
  D365_TENANT_ID: z.string().optional(),
  D365_CLIENT_ID: z.string().optional(),
  D365_CLIENT_SECRET: z.string().optional(),
  D365_COMPANY: z.string().default("hsin"),
  D365_PRODUCTION_ENTITY: z.string().default("COCProductionDatas"),
  D365_COC_ENTITY: z.string().default("COCDocuments"),

  STORAGE_MODE: z.enum(["mock", "live"]).default("mock"),
  AZURE_TENANT_ID: z.string().optional(),
  AZURE_CLIENT_ID: z.string().optional(),
  AZURE_CLIENT_SECRET: z.string().optional(),
  SHAREPOINT_SITE_ID: z.string().optional(),
  SHAREPOINT_DRIVE_ID: z.string().optional(),
  SHAREPOINT_ROOT_FOLDER: z.string().default("COC"),

  AUTOMATION_API_KEY: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;
export function env(): Env {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}

export const isProd = () => env().NODE_ENV === "production";
export const devBypassEnabled = () => !isProd() && env().AUTH_DEV_BYPASS === "true";
export const adminEmails = () =>
  env()
    .ADMIN_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

/** Throws a clear error listing the missing variables for an integration. */
export function requireEnv<K extends keyof Env>(keys: K[], integration: string): Pick<Env, K> {
  const e = env();
  const missing = keys.filter((k) => !e[k]);
  if (missing.length) {
    throw new Error(`${integration} is not configured. Missing environment variables: ${missing.join(", ")}`);
  }
  return e;
}
