import { route, json } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { supabaseAdmin, Buckets } from "@/lib/db/supabase-admin";
import { z } from "zod";

const createSignatureSchema = z.object({
  label: z.string().default("My Signature"),
  base64Png: z.string().min(1),
  isDefault: z.boolean().default(false),
});

export const GET = route(async () => {
  const session = await requireSession();
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("coc_signatures")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return json({ ok: true, signatures: data || [] });
});

export const POST = route(async (req) => {
  const session = await requireSession();
  const body = await req.json();
  const parsed = createSignatureSchema.parse(body);

  const cleanBase64 = parsed.base64Png.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(cleanBase64, "base64");
  const fileName = `${session.user.id || "user"}_${Date.now()}.png`;

  const sb = supabaseAdmin();
  const { error: uploadErr } = await sb.storage.from(Buckets.signatures).upload(fileName, buffer, {
    contentType: "image/png",
    upsert: true,
  });

  if (uploadErr) throw uploadErr;

  const { data, error } = await sb
    .from("coc_signatures")
    .insert({
      user_id: session.user.id && /^[0-9a-f-]{36}$/i.test(session.user.id) ? session.user.id : "00000000-0000-0000-0000-000000000001",
      label: parsed.label,
      storage_path: fileName,
      mime_type: "image/png",
      is_default: parsed.isDefault,
    })
    .select()
    .single();

  if (error) throw error;
  return json({ ok: true, signature: data }, { status: 201 });
});

export const DELETE = route(async (req) => {
  await requireSession();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return json({ ok: false, error: "Missing id" }, { status: 400 });

  const sb = supabaseAdmin();
  await sb.from("coc_signatures").delete().eq("id", id);
  return json({ ok: true });
});
