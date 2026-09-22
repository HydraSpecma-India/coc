import { requireSession, sessionCan } from "@/lib/auth/guards";
import { redirect } from "next/navigation";
import { InspectionListClient } from "./inspection-list-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pending Inspection" };

export default async function PendingInspectionPage() {
  const session = await requireSession();
  const canInspect = await sessionCan(session, "completeCoc");
  const canCreate = await sessionCan(session, "createCoc");
  if (!canInspect && !canCreate) redirect("/");
  return <InspectionListClient canInspect={canInspect} />;
}
