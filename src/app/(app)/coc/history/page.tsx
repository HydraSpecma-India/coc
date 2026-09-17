import { requireSession } from "@/lib/auth/guards";
import { listCocDocuments, type COCDocumentRow } from "@/lib/db/repositories/coc";
import { HistoryClient } from "./history-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Completed COCs" };

export default async function CocHistoryPage() {
  const session = await requireSession();
  let docs: COCDocumentRow[] = [];
  try {
    docs = await listCocDocuments({ limit: 200 });
  } catch (e) {
    console.error("CocHistoryPage DB error:", e);
  }

  const allowedCompanies =
    session.user.allowedCompanies && session.user.allowedCompanies.length > 0
      ? session.user.allowedCompanies
      : ["ALL"];

  return <HistoryClient initialDocs={docs} allowedCompanies={allowedCompanies} />;
}
