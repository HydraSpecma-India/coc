"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Copy, Sparkles, Archive, Trash2, PencilRuler } from "lucide-react";
import { Button, Badge, Dialog, Field, Input, Select, Textarea, PageHeader, Table, Th, Td, EmptyState } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/utils/fetcher";
import type { TemplateRow, TemplateVersionSummary } from "@/lib/db/repositories/templates";

type T = TemplateRow & { versions: TemplateVersionSummary[] };

export function TemplatesClient({ templates, templateTypes, canManage }: { templates: T[]; templateTypes: string[]; canManage: boolean }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [dupTarget, setDupTarget] = useState<T | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", templateType: templateTypes[0] ?? "COC" });
  const [dupName, setDupName] = useState("");

  async function create() {
    setBusy("create");
    try {
      const res = await api<{ template: TemplateRow; version: { id: string } }>("/api/templates", { method: "POST", json: form });
      toast.success("Template created");
      setCreateOpen(false);
      router.push(`/admin/templates/${res.template.id}/designer/${res.version.id}`);
    } catch (e) {
      toast.error("Could not create template", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function seed() {
    setBusy("seed");
    try {
      const res = await api<{ template: TemplateRow; version: { id: string } }>("/api/templates/seed", { method: "POST" });
      toast.success("Sample HydraSpecma COC created", "7-page reference PDF loaded as background with the standard fields placed.");
      router.push(`/admin/templates/${res.template.id}/designer/${res.version.id}`);
    } catch (e) {
      toast.error("Could not create sample", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function duplicate() {
    if (!dupTarget) return;
    setBusy("dup");
    try {
      await api(`/api/templates/${dupTarget.id}/duplicate`, { method: "POST", json: { name: dupName } });
      toast.success("Template duplicated");
      setDupTarget(null);
      router.refresh();
    } catch (e) {
      toast.error("Could not duplicate", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function archive(t: T) {
    try {
      await api(`/api/templates/${t.id}`, { method: "PATCH", json: { status: t.status === "archived" ? "active" : "archived" } });
      router.refresh();
    } catch (e) {
      toast.error("Could not update", (e as Error).message);
    }
  }

  async function remove(t: T) {
    if (!confirm(`Delete template "${t.name}"? Only possible when nothing was ever published.`)) return;
    try {
      await api(`/api/templates/${t.id}`, { method: "DELETE" });
      toast.success("Template deleted");
      router.refresh();
    } catch (e) {
      toast.error("Could not delete", (e as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Templates"
        description="Document templates with version control. Only one version per template can be published at a time."
        actions={
          canManage && (
            <>
              <Button variant="outline" onClick={seed} loading={busy === "seed"}>
                <Sparkles className="h-4 w-4" /> Create sample HydraSpecma COC
              </Button>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> New template
              </Button>
            </>
          )
        }
      />

      {templates.length === 0 ? (
        <EmptyState
          title="No templates yet"
          description="Create a blank template, or load the HydraSpecma COC reference document as a ready-made 7-page template."
          action={canManage && <Button onClick={seed} loading={busy === "seed"}><Sparkles className="h-4 w-4" /> Create sample HydraSpecma COC</Button>}
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Type</Th>
              <Th>Published</Th>
              <Th>Versions</Th>
              <Th>Updated</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => {
              const active = t.versions.find((v) => v.id === t.active_version_id);
              const latestDraft = t.versions.find((v) => v.status === "draft");
              return (
                <tr key={t.id} className="hover:bg-ink-50">
                  <Td>
                    <Link href={`/admin/templates/${t.id}`} className="font-medium hover:underline">
                      {t.name}
                    </Link>
                    {t.status === "archived" && <Badge className="ml-2">Archived</Badge>}
                    {t.description && <div className="text-xs text-ink-500">{t.description}</div>}
                  </Td>
                  <Td>
                    <Badge tone="brand">{t.template_type}</Badge>
                  </Td>
                  <Td>{active ? <Badge tone="success">v{active.version_number} · {active.revision}</Badge> : <span className="text-ink-400">—</span>}</Td>
                  <Td>{t.versions.length}</Td>
                  <Td className="text-ink-500">{new Date(t.updated_at).toLocaleString()}</Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      {canManage && latestDraft && (
                        <Link href={`/admin/templates/${t.id}/designer/${latestDraft.id}`}>
                          <Button size="sm" variant="outline"><PencilRuler className="h-3.5 w-3.5" /> Design</Button>
                        </Link>
                      )}
                      {canManage && (
                        <>
                          <Button size="icon" variant="ghost" title="Duplicate" onClick={() => { setDupTarget(t); setDupName(`${t.name} (copy)`); }}><Copy className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" title={t.status === "archived" ? "Restore" : "Archive"} onClick={() => archive(t)}><Archive className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" title="Delete" onClick={() => remove(t)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                        </>
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New template"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={create} loading={busy === "create"} disabled={form.name.trim().length < 2}>Create & open designer</Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. HydraSpecma COC 1070.0049" autoFocus /></Field>
          <Field label="Template type">
            <Select value={form.templateType} onChange={(e) => setForm({ ...form, templateType: e.target.value })}>
              {templateTypes.map((t) => <option key={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Description" hint="(optional)"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(dupTarget)}
        onClose={() => setDupTarget(null)}
        title={`Duplicate "${dupTarget?.name}"`}
        footer={
          <>
            <Button variant="outline" onClick={() => setDupTarget(null)}>Cancel</Button>
            <Button onClick={duplicate} loading={busy === "dup"} disabled={dupName.trim().length < 2}>Duplicate</Button>
          </>
        }
      >
        <Field label="New template name"><Input value={dupName} onChange={(e) => setDupName(e.target.value)} autoFocus /></Field>
        <p className="mt-2 text-xs text-ink-500">The published version (or the latest draft) is copied as version 1 of the new template.</p>
      </Dialog>
    </div>
  );
}
