import { requireSession } from "@/lib/auth/guards";
import { PageHeader, EmptyState } from "@/components/ui";

export const metadata = { title: "D365FO Field Mapping" };

export default async function Page() {
  await requireSession();
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="D365FO Field Mapping" />
      <EmptyState title="Arrives in Phase 2" description="This section is part of a later development phase. The database schema and API contracts for it are already defined in docs/." />
    </div>
  );
}
