import "server-only";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import type { Role } from "@/lib/auth/roles";

export interface UserRow {
  id: string;
  entra_object_id: string | null;
  email: string;
  display_name: string | null;
  role: Role;
  active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export async function upsertUserOnSignIn(input: {
  entraObjectId?: string;
  email: string;
  displayName?: string;
  roleHint?: Role;
  bootstrapAdmin: boolean;
}): Promise<UserRow> {
  const db = supabaseAdmin();
  const { data: existing } = await db.from("coc_users").select("*").eq("email", input.email).maybeSingle();

  if (existing) {
    const patch: Partial<UserRow> = {
      last_login_at: new Date().toISOString(),
      display_name: input.displayName ?? existing.display_name,
      entra_object_id: input.entraObjectId ?? existing.entra_object_id,
    };
    // An Entra app role always wins over the stored role.
    if (input.roleHint) patch.role = input.roleHint;
    const { data, error } = await db.from("coc_users").update(patch).eq("id", existing.id).select("*").single();
    if (error) throw error;
    return data as UserRow;
  }

  const role: Role = input.roleHint ?? (input.bootstrapAdmin ? "Admin" : "Viewer");
  const { data, error } = await db
    .from("coc_users")
    .insert({
      entra_object_id: input.entraObjectId ?? null,
      email: input.email,
      display_name: input.displayName ?? null,
      role,
      last_login_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as UserRow;
}

export async function listUsers(): Promise<UserRow[]> {
  const { data, error } = await supabaseAdmin().from("coc_users").select("*").order("email");
  if (error) throw error;
  return data as UserRow[];
}

export async function updateUser(id: string, patch: { role?: Role; active?: boolean }): Promise<UserRow> {
  const { data, error } = await supabaseAdmin().from("coc_users").update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return data as UserRow;
}
