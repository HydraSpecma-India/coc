import { requireSession } from "@/lib/auth/guards";
import { PageHeader, EmptyState } from "@/components/ui";

export const metadata = { title: "COC History" };

export default async function Page() {
  await requireSession();
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="COC History" />
      <EmptyState title="Arrives in Phase 5" description="The COC creation workflow is built in Phase 3 (D365FO retrieval, manual fields, preview) and Phase 4/5 (PDF, SharePoint, D365FO update, history)." />
    </div>
  );
}
