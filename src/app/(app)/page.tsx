import Link from "next/link";
import { FileText, FilePlus2, ListTree, ArrowRight } from "lucide-react";
import { requireSession } from "@/lib/auth/guards";
import { can } from "@/lib/auth/roles";
import { Card, CardBody, PageHeader, Badge } from "@/components/ui";
import { listTemplates } from "@/lib/db/repositories/templates";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const session = await requireSession();
  let templates: Awaited<ReturnType<typeof listTemplates>> = [];
  let dbError: string | null = null;
  try {
    templates = await listTemplates();
  } catch (e) {
    dbError = (e as Error).message;
  }
  const published = templates.filter((t) => t.active_version_id);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={`Welcome, ${session.user.name || session.user.email}`} description="Certificate of Conformity automation for HydraSpecma India." />

      {dbError && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <div className="font-semibold">Supabase is not reachable</div>
          <div className="mt-0.5">{dbError}. Apply <code>supabase/migrations/0001_init.sql</code> and set <code>SUPABASE_URL</code> / <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardBody>
            <div className="text-xs font-medium uppercase tracking-wide text-ink-500">Templates</div>
            <div className="mt-1 text-3xl font-semibold">{templates.length}</div>
            <div className="mt-1 text-xs text-ink-500">{published.length} with a published version</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-xs font-medium uppercase tracking-wide text-ink-500">COCs this month</div>
            <div className="mt-1 text-3xl font-semibold">—</div>
            <div className="mt-1 text-xs text-ink-500">Available from Phase 3</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-xs font-medium uppercase tracking-wide text-ink-500">Your role</div>
            <div className="mt-1 text-3xl font-semibold">{session.user.role}</div>
            <div className="mt-1 text-xs text-ink-500">{session.user.email}</div>
          </CardBody>
        </Card>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {can(session.user.role, "createCoc") && (
          <Link href="/coc/new" className="group rounded-lg border border-ink-200 bg-white p-5 hover:border-ink-400">
            <FilePlus2 className="h-6 w-6 text-brand-600" />
            <div className="mt-3 font-semibold">Create a COC</div>
            <div className="mt-1 text-sm text-ink-500">Select a production order, fill manual fields, sign and generate.</div>
            <div className="mt-3 flex items-center gap-1 text-xs font-medium text-ink-600 group-hover:text-ink-900">Phase 3 <ArrowRight className="h-3 w-3" /></div>
          </Link>
        )}
        {can(session.user.role, "viewTemplates") && (
          <Link href="/admin/templates" className="group rounded-lg border border-ink-200 bg-white p-5 hover:border-ink-400">
            <FileText className="h-6 w-6 text-brand-600" />
            <div className="mt-3 font-semibold">Template designer</div>
            <div className="mt-1 text-sm text-ink-500">Design A4 documents with backgrounds, fields, tables and signatures.</div>
            <div className="mt-3 flex items-center gap-1 text-xs font-medium text-ink-600 group-hover:text-ink-900">Open <ArrowRight className="h-3 w-3" /></div>
          </Link>
        )}
        {can(session.user.role, "manageFields") && (
          <Link href="/admin/fields" className="group rounded-lg border border-ink-200 bg-white p-5 hover:border-ink-400">
            <ListTree className="h-6 w-6 text-brand-600" />
            <div className="mt-3 font-semibold">Field definitions</div>
            <div className="mt-1 text-sm text-ink-500">Create D365FO, manual, system and custom fields without code changes.</div>
            <div className="mt-3 flex items-center gap-1 text-xs font-medium text-ink-600 group-hover:text-ink-900">Phase 2 <ArrowRight className="h-3 w-3" /></div>
          </Link>
        )}
      </div>

      {templates.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">Recent templates</h2>
          <div className="divide-y divide-ink-100 rounded-lg border border-ink-200 bg-white">
            {templates.slice(0, 5).map((t) => (
              <Link key={t.id} href={`/admin/templates/${t.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-ink-50">
                <div>
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-ink-500">{t.template_type} · {t.versions.length} version(s)</div>
                </div>
                {t.active_version_id ? <Badge tone="success">Published</Badge> : <Badge>Draft only</Badge>}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
