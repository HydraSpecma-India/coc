import { requireSession } from "@/lib/auth/guards";
import { PageHeader, EmptyState } from "@/components/ui";

export const metadata = { title: "Signatures" };

export default async function Page() {
  await requireSession();
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Signatures" />
      <EmptyState title="Arrives in Phase 4" description="This section is part of a later development phase. The database schema and API contracts for it are already defined in docs/." />
    </div>
  );
}
