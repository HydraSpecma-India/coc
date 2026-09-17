import Link from "next/link";
import { FileText, FilePlus2, ListTree, ArrowRight, History, Settings } from "lucide-react";
import { requireSession } from "@/lib/auth/guards";
import { can } from "@/lib/auth/roles";
import { Card, CardBody, PageHeader, Badge } from "@/components/ui";
import { listTemplates } from "@/lib/db/repositories/templates";
import { listCocDocuments } from "@/lib/db/repositories/coc";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const session = await requireSession();
  let templates: Awaited<ReturnType<typeof listTemplates>> = [];
  let cocDocs: Awaited<ReturnType<typeof listCocDocuments>> = [];
  let dbError: string | null = null;

  try {
    const [tList, cList] = await Promise.all([
      listTemplates(),
      listCocDocuments({ limit: 10 }),
    ]);
    templates = tList;
    cocDocs = cList;
  } catch (e) {
    dbError = (e as Error).message;
  }

  const published = templates.filter((t) => t.active_version_id);

  return (
    <div className="mx-auto max-w-6xl pb-16">
      <PageHeader
        title={`Welcome, ${session.user.name || session.user.email}`}
        description="Certificate of Conformity automation for HydraSpecma India."
      />

      {dbError && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <div className="font-semibold">Supabase is not reachable</div>
          <div className="mt-0.5">{dbError}</div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardBody>
            <div className="text-xs font-medium uppercase tracking-wide text-ink-500">Document Templates</div>
            <div className="mt-1 text-3xl font-semibold">{templates.length}</div>
            <div className="mt-1 text-xs text-ink-500">{published.length} with an active published version</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-xs font-medium uppercase tracking-wide text-ink-500">COCs Issued</div>
            <div className="mt-1 text-3xl font-semibold">{cocDocs.length}</div>
            <div className="mt-1 text-xs text-ink-500">
              {cocDocs.filter((c) => c.status === "COMPLETED").length} completed &amp; registered
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-xs font-medium uppercase tracking-wide text-ink-500">Current Role</div>
            <div className="mt-1 text-3xl font-semibold">{session.user.role}</div>
            <div className="mt-1 text-xs text-ink-500">{session.user.email}</div>
          </CardBody>
        </Card>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {can(session.user.role, "createCoc") && (
          <Link href="/coc/new" className="group rounded-lg border border-ink-200 bg-white p-5 hover:border-brand-500 hover:shadow-sm transition-all">
            <FilePlus2 className="h-6 w-6 text-brand-600" />
            <div className="mt-3 font-semibold text-ink-900">Create a COC</div>
            <div className="mt-1 text-sm text-ink-500">Select a production order, verify inspection parameters, sign and generate.</div>
            <div className="mt-3 flex items-center gap-1 text-xs font-medium text-brand-700 group-hover:underline">Start Wizard <ArrowRight className="h-3 w-3" /></div>
          </Link>
        )}

        <Link href="/coc/history" className="group rounded-lg border border-ink-200 bg-white p-5 hover:border-brand-500 hover:shadow-sm transition-all">
          <History className="h-6 w-6 text-brand-600" />
          <div className="mt-3 font-semibold text-ink-900">Completed COCs</div>
          <div className="mt-1 text-sm text-ink-500">Search, view cards, and download completed certificates across production orders.</div>
          <div className="mt-3 flex items-center gap-1 text-xs font-medium text-brand-700 group-hover:underline">View Completed COCs <ArrowRight className="h-3 w-3" /></div>
        </Link>

        {can(session.user.role, "viewTemplates") && (
          <Link href="/admin/templates" className="group rounded-lg border border-ink-200 bg-white p-5 hover:border-brand-500 hover:shadow-sm transition-all">
            <FileText className="h-6 w-6 text-brand-600" />
            <div className="mt-3 font-semibold text-ink-900">Template Designer</div>
            <div className="mt-1 text-sm text-ink-500">Design A4 documents with canvas backgrounds, fields, tables and signatures.</div>
            <div className="mt-3 flex items-center gap-1 text-xs font-medium text-brand-700 group-hover:underline">Open Designer <ArrowRight className="h-3 w-3" /></div>
          </Link>
        )}

        {can(session.user.role, "manageFields") && (
          <Link href="/admin/fields" className="group rounded-lg border border-ink-200 bg-white p-5 hover:border-brand-500 hover:shadow-sm transition-all">
            <ListTree className="h-6 w-6 text-brand-600" />
            <div className="mt-3 font-semibold text-ink-900">Field Definitions</div>
            <div className="mt-1 text-sm text-ink-500">Manage D365FO, manual, quality, and custom calculation fields.</div>
            <div className="mt-3 flex items-center gap-1 text-xs font-medium text-brand-700 group-hover:underline">Manage Fields <ArrowRight className="h-3 w-3" /></div>
          </Link>
        )}

        {can(session.user.role, "manageSettings") && (
          <Link href="/admin/settings" className="group rounded-lg border border-ink-200 bg-white p-5 hover:border-brand-500 hover:shadow-sm transition-all">
            <Settings className="h-6 w-6 text-brand-600" />
            <div className="mt-3 font-semibold text-ink-900">System Settings</div>
            <div className="mt-1 text-sm text-ink-500">Update D365 URLs, Entra ID SSO, SharePoint keys, and number sequences.</div>
            <div className="mt-3 flex items-center gap-1 text-xs font-medium text-brand-700 group-hover:underline">Configure Integrations <ArrowRight className="h-3 w-3" /></div>
          </Link>
        )}
      </div>

      {templates.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">Active Templates</h2>
          <div className="divide-y divide-ink-100 rounded-lg border border-ink-200 bg-white">
            {templates.slice(0, 5).map((t) => (
              <Link key={t.id} href={`/admin/templates/${t.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-ink-50">
                <div>
                  <div className="font-medium text-sm text-ink-900">{t.name}</div>
                  <div className="text-xs text-ink-500">{t.template_type} · {t.versions.length} version(s)</div>
                </div>
                {t.active_version_id ? <Badge tone="success">Published</Badge> : <Badge tone="neutral">Draft only</Badge>}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
