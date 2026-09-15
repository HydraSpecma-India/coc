import { requireSession } from "@/lib/auth/guards";
import { listCocDocuments } from "@/lib/db/repositories/coc";
import { HistoryClient } from "./history-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "COC History" };

export default async function CocHistoryPage() {
  await requireSession();
  const docs = await listCocDocuments({ limit: 50 });
  return <HistoryClient initialDocs={docs} />;
}
