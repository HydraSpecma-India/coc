import "server-only";
import { supabaseAdmin, Buckets } from "@/lib/db/supabase-admin";
import { Errors } from "@/lib/errors";

export interface StoredSignatureRow {
  id: string;
  user_id: string;
  label: string | null;
  storage_path: string;
  mime_type: string;
  is_default: boolean;
  created_at: string;
  dataUrl: string | null;
}

/** The signature owner id – stored signatures always belong to one user account. */
export function signatureOwnerId(userId?: string | null): string {
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
    throw Errors.forbidden("save a signature – sign in with your own user account");
  }
  return userId;
}

/** Only the signatures of this user (never another user's signature). */
export async function listOwnSignatures(userId?: string | null): Promise<StoredSignatureRow[]> {
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) return [];
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("coc_signatures")
    .select("*")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return Promise.all(
    (data || []).map(async (sig) => {
      let dataUrl: string | null = null;
      try {
        if (sig.storage_path) {
          const { data: blob } = await sb.storage.from(Buckets.signatures).download(sig.storage_path);
          if (blob) dataUrl = `data:${sig.mime_type || "image/png"};base64,${Buffer.from(await blob.arrayBuffer()).toString("base64")}`;
        }
      } catch {
        /* missing file – shown without preview */
      }
      return { ...(sig as Omit<StoredSignatureRow, "dataUrl">), dataUrl };
    }),
  );
}

/** Loads a signature and checks it belongs to the user. */
export async function getOwnSignature(id: string, userId: string) {
  const { data } = await supabaseAdmin().from("coc_signatures").select("*").eq("id", id).maybeSingle();
  if (!data) throw Errors.notFound("Signature");
  if (data.user_id !== userId) throw Errors.forbidden("change another user's signature");
  return data as Omit<StoredSignatureRow, "dataUrl">;
}
