import { route, json } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { supabaseAdmin, Buckets } from "@/lib/db/supabase-admin";
import { getOwnSignature, listOwnSignatures, signatureOwnerId } from "@/lib/signature/stored";
import { z } from "zod";

const createSignatureSchema = z.object({
  label: z.string().default("My Signature"),
  base64Png: z.string().min(1),
  isDefault: z.boolean().default(false),
});

const patchSignatureSchema = z.object({
  id: z.string().uuid(),
  isDefault: z.boolean().optional(),
  label: z.string().optional(),
});

/** Stored signatures are personal: every user only sees and uses their own. */
export const GET = route(async () => {
  const session = await requireSession();
  return json({ ok: true, signatures: await listOwnSignatures(session.user.id) });
});

export const POST = route(async (req) => {
  const session = await requireSession();
  const owner = signatureOwnerId(session.user.id);
  const parsed = createSignatureSchema.parse(await req.json());

  const cleanBase64 = parsed.base64Png.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(cleanBase64, "base64");
  const fileName = `${owner}_${Date.now()}.png`;
  const sb = supabaseAdmin();

  const { count } = await sb.from("coc_signatures").select("id", { count: "exact", head: true }).eq("user_id", owner);
  const makeDefault = parsed.isDefault || !count;
  if (makeDefault) await sb.from("coc_signatures").update({ is_default: false }).eq("user_id", owner);

  const { error: uploadErr } = await sb.storage.from(Buckets.signatures).upload(fileName, buffer, { contentType: "image/png", upsert: true });
  if (uploadErr) throw uploadErr;

  const { data, error } = await sb
    .from("coc_signatures")
    .insert({ user_id: owner, label: parsed.label, storage_path: fileName, mime_type: "image/png", is_default: makeDefault })
    .select()
    .single();
  if (error) throw error;
  const fullDataUrl = parsed.base64Png.startsWith("data:") ? parsed.base64Png : `data:image/png;base64,${parsed.base64Png}`;
  return json({ ok: true, signature: { ...data, dataUrl: fullDataUrl } }, { status: 201 });
});

export const PATCH = route(async (req) => {
  const session = await requireSession();
  const owner = signatureOwnerId(session.user.id);
  const parsed = patchSignatureSchema.parse(await req.json());
  await getOwnSignature(parsed.id, owner);

  const sb = supabaseAdmin();
  if (parsed.isDefault) await sb.from("coc_signatures").update({ is_default: false }).eq("user_id", owner).neq("id", parsed.id);

  const updates: Record<string, unknown> = {};
  if (parsed.isDefault !== undefined) updates.is_default = parsed.isDefault;
  if (parsed.label !== undefined) updates.label = parsed.label;
  const { data, error } = await sb.from("coc_signatures").update(updates).eq("id", parsed.id).eq("user_id", owner).select().single();
  if (error) throw error;
  return json({ ok: true, signature: data });
});

export const DELETE = route(async (req) => {
  const session = await requireSession();
  const owner = signatureOwnerId(session.user.id);
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return json({ ok: false, error: "Missing id" }, { status: 400 });
  const sig = await getOwnSignature(id, owner);

  const sb = supabaseAdmin();
  if (sig.storage_path) {
    try {
      await sb.storage.from(Buckets.signatures).remove([sig.storage_path]);
    } catch {
      // ignore storage cleanup failure
    }
  }
  await sb.from("coc_signatures").delete().eq("id", id).eq("user_id", owner);
  return json({ ok: true });
});
