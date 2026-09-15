import { route, json } from "@/lib/api/handler";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { supabaseAdmin } from "@/lib/db/supabase-admin";

export const GET = route(async (req) => {
  const session = await requireSession();
  requireRole(session, ["Admin", "Quality"]);

  const q = req.nextUrl.searchParams.get("q") || "";
  const sb = supabaseAdmin();
  let query = sb.from("coc_audit_logs").select("*").order("created_at", { ascending: false }).limit(100);

  if (q) {
    query = query.or(`action.ilike.%${q}%,entity_type.ilike.%${q}%,user_email.ilike.%${q}%,coc_number.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return json({ ok: true, logs: data || [] });
});
