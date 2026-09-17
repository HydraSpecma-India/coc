import { route, json } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { supabaseAdmin } from "@/lib/db/supabase-admin";

export const GET = route(async (req) => {
  await requireSession();
  const po = (req.nextUrl.searchParams.get("po") || "").trim();
  if (!po) {
    return json({ ok: true, cocs: [] });
  }

  const sb = supabaseAdmin();
  const { data: cocs, error } = await sb
    .from("coc_documents")
    .select("id, coc_number, production_order, serial_number, quantity, status, created_at")
    .eq("production_order", po)
    .neq("status", "CANCELLED")
    .order("created_at", { ascending: true });

  if (error) {
    return json({ ok: false, error: error.message, cocs: [] }, { status: 500 });
  }

  return json({ ok: true, cocs: cocs || [] });
});
