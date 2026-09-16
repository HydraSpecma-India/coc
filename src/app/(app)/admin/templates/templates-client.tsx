"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Copy, Sparkles, Archive, Trash2, PencilRuler, Upload, FileUp } from "lucide-react";
import { Button, Badge, Dialog, Field, Input, Select, Textarea, PageHeader, Table, Th, Td, EmptyState } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/utils/fetcher";
import type { TemplateRow, TemplateVersionSummary } from "@/lib/db/repositories/templates";

type T = TemplateRow & { versions: TemplateVersionSummary[] };

export function TemplatesClient({ templates, templateTypes, canManage }: { templates: T[]; templateTypes: string[]; canManage: boolean }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [uploadPdfOpen, setUploadPdfOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadRev, setUploadRev] = useState("Rev 01");
  const [dupTarget, setDupTarget] = useState<T | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", templateType: templateTypes[0] ?? "COC" });
  const [dupName, setDupName] = useState("");

  async function handleModifyTemplate(templateId: string) {
    setBusy(`edit-${templateId}`);
    try {
      const res = await api<{ ok: boolean; templateId: string; versionId: string }>("/api/templates/ensure-draft", {
        method: "POST",
        json: { templateId },
      });
      if (res.ok && res.templateId && res.versionId) {
        router.push(`/admin/templates/${res.templateId}/designer/${res.versionId}`);
      }
    } catch (e) {
      toast.error("Could not open designer", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleUploadPdf() {
    if (!uploadFile) {
      toast.error("Please select a PDF file");
      return;
    }
    setBusy("upload-pdf");
    try {
      const fd = new FormData();
      fd.append("file", uploadFile);
      fd.append("name", uploadName.trim() || uploadFile.name.replace(/\.[^/.]+$/, ""));
      fd.append("description", uploadDesc.trim() || "Created from uploaded PDF");
      fd.append("revision", uploadRev.trim() || "Rev 01");
      fd.append("publish", "true");

      const res = await api<{ ok: boolean; template: { id: string }; version: { id: string } }>("/api/templates/from-pdf", {
        method: "POST",
        body: fd,
      });

      if (res.ok) {
        toast.success("Template created from PDF!");
        setUploadPdfOpen(false);
        setUploadFile(null);
        setUploadName("");
        setUploadDesc("");
        router.push(`/admin/templates/${res.template.id}/designer/${res.version.id}`);
      }
    } catch (e) {
      toast.error("Failed to create template from PDF", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

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
              <Button variant="outline" onClick={() => setUploadPdfOpen(true)}>
                <Upload className="h-4 w-4" /> Upload PDF Template
              </Button>
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
                      {canManage && (
                        <Button
                          size="sm"
                          variant="outline"
                          loading={busy === `edit-${t.id}`}
                          onClick={() => handleModifyTemplate(t.id)}
                        >
                          <PencilRuler className="h-3.5 w-3.5" /> Design
                        </Button>
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

      <Dialog
        open={uploadPdfOpen}
        onClose={() => setUploadPdfOpen(false)}
        title="Upload PDF & Create Template"
        footer={
          <>
            <Button variant="outline" onClick={() => setUploadPdfOpen(false)}>Cancel</Button>
            <Button onClick={handleUploadPdf} loading={busy === "upload-pdf"} disabled={!uploadFile}>
              <Upload className="h-4 w-4" /> Create & Open Designer
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-ink-600">
            Upload any HydraSpecma or customer PDF certificate. It will be saved as the background and standard COC fields will be mapped automatically.
          </p>
          <div
            onClick={() => document.getElementById("admin-template-pdf-input")?.click()}
            className="cursor-pointer rounded-xl border-2 border-dashed border-brand-300 bg-brand-50/40 p-6 text-center hover:bg-brand-50 transition-colors"
          >
            <input
              id="admin-template-pdf-input"
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setUploadFile(f);
                  if (!uploadName) {
                    setUploadName(f.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "));
                  }
                }
              }}
            />
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-brand-700">
              <FileUp className="h-5 w-5" />
            </div>
            {uploadFile ? (
              <div className="mt-3">
                <div className="text-sm font-bold text-ink-900">{uploadFile.name}</div>
                <div className="text-xs text-ink-500 font-mono mt-0.5">
                  {(uploadFile.size / 1024).toFixed(1)} KB &bull; Ready to convert
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <div className="text-sm font-semibold text-ink-900">Click to select a PDF certificate file</div>
                <div className="text-xs text-ink-500 mt-1">Accepts standard PDF documents up to 20MB</div>
              </div>
            )}
          </div>

          <Field label="Template Name">
            <Input
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              placeholder="e.g. HydraSpecma COC 1070.0049"
            />
          </Field>

          <Field label="Revision">
            <Input
              value={uploadRev}
              onChange={(e) => setUploadRev(e.target.value)}
              placeholder="Rev 01"
            />
          </Field>

          <Field label="Description (Optional)">
            <Textarea
              value={uploadDesc}
              onChange={(e) => setUploadDesc(e.target.value)}
              placeholder="e.g. Customer approved COC layout..."
            />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
