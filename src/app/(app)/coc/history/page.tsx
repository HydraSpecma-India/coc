import { requireSession } from "@/lib/auth/guards";
import { listCocDocuments, type COCDocumentRow } from "@/lib/db/repositories/coc";
import { HistoryClient } from "./history-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "COC History" };

export default async function CocHistoryPage() {
  await requireSession();
  let docs: COCDocumentRow[] = [];
  try {
    docs = await listCocDocuments({ limit: 50 });
  } catch (e) {
    console.error("CocHistoryPage DB error:", e);
  }
  return <HistoryClient initialDocs={docs} />;
}
