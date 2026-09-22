import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/guards";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { AuditClient } from "./audit-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit Trail" };

export default async function AuditPage() {
  // Audit trail: administrators only
  const session = await requireSession();
  if (String(session.user.role || "").toLowerCase() !== "admin") redirect("/");
  const { data } = await supabaseAdmin()
    .from("coc_audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  return <AuditClient initialLogs={data || []} />;
}
