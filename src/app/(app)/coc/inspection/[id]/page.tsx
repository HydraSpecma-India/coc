import { requireSession, sessionCan } from "@/lib/auth/guards";
import { redirect } from "next/navigation";
import { InspectClient } from "./inspect-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quality Inspection" };

export default async function InspectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const canInspect = await sessionCan(session, "completeCoc");
  const canCreate = await sessionCan(session, "createCoc");
  if (!canInspect && !canCreate) redirect("/");
  return <InspectClient id={id} userName={session.user.name || session.user.email || "Quality"} />;
}
