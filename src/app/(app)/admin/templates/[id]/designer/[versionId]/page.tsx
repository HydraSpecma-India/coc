import { notFound } from "next/navigation";
import { requireCapability } from "@/lib/auth/guards";
import { can } from "@/lib/auth/roles";
import { getTemplate, getVersion } from "@/lib/db/repositories/templates";
import { listFieldDefinitions } from "@/lib/db/repositories/fields";
import { listAssets } from "@/lib/db/repositories/assets";
import { Designer } from "@/components/designer/Designer";
import { getTemplateInputConfig } from "@/lib/db/repositories/template-inputs";
import { dataEntryFieldDefs } from "@/lib/coc-inputs/designer-fields";

export const dynamic = "force-dynamic";
export const metadata = { title: "Template designer" };

export default async function DesignerPage({ params }: { params: Promise<{ id: string; versionId: string }> }) {
  const session = await requireCapability("viewTemplates");
  const { id, versionId } = await params;
  const [template, version, baseFields, assets, inputConfig] = await Promise.all([
    getTemplate(id),
    getVersion(id, versionId),
    listFieldDefinitions(),
    listAssets(),
    getTemplateInputConfig(id).catch(() => null),
  ]);
  // Data-entry fields (pages 2+) defined for this template appear in the designer palette so the
  // admin can map each one onto its exact position on the page.
  const extra = inputConfig ? dataEntryFieldDefs(inputConfig) : [];
  const taken = new Set(baseFields.map((f) => f.field_name.toLowerCase()));
  const fields = [...extra.filter((f) => !taken.has(f.field_name.toLowerCase())), ...baseFields];
  if (!template || !version) notFound();

  return (
    <Designer
      templateId={id}
      versionId={versionId}
      versionNumber={version.version_number}
      versionStatus={version.status}
      templateName={template.name}
      initial={version.template_json}
      fields={fields}
      assets={assets.map((a) => ({ id: a.id, mime_type: a.mime_type, file_name: a.file_name, page_count: a.page_count, width_pt: a.width_pt, height_pt: a.height_pt }))}
      canEdit={can(session.user.role, "manageTemplates")}
    />
  );
}
