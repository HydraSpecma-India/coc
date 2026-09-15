import { requireSession } from "@/lib/auth/guards";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { SignaturesClient } from "./signatures-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stored Signatures" };

export default async function SignaturesPage() {
  await requireSession();
  const { data } = await supabaseAdmin()
    .from("coc_signatures")
    .select("*")
    .order("created_at", { ascending: false });

  return <SignaturesClient initialSignatures={data || []} />;
}
