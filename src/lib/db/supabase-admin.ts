import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";

/**
 * Server-only Supabase client using the SERVICE ROLE key.
 * Never import this from a client component. RLS is bypassed, so every
 * caller must have already enforced authentication + role checks.
 */
let client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (client) return client;
  const e = requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"], "Supabase");
  client = createClient(e.SUPABASE_URL!, e.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-application-name": "coc-platform" } },
  });
  return client;
}

export const Buckets = {
  templateAssets: "coc-template-assets",
  signatures: "coc-signatures",
  cocGenerated: "coc-generated",
} as const;
