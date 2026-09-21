import { notFound } from "next/navigation";
import { requireCapability } from "@/lib/auth/guards";
import { can } from "@/lib/auth/roles";
import { getTemplate } from "@/lib/db/repositories/templates";
import { getTemplateInputConfig } from "@/lib/db/repositories/template-inputs";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { EMPTY_INPUT_CONFIG } from "@/lib/coc-inputs/types";
import { InputsEditorClient } from "./inputs-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Data entry fields" };

type PageInfo = { number: number; name: string; placedFields: string[] };

export default async function TemplateInputsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireCapability("viewTemplates");
  const { id } = await params;
  const template = await getTemplate(id).catch(() => null);
  if (!template) notFound();

  const config = await getTemplateInputConfig(id).catch(() => EMPTY_INPUT_CONFIG);

  // Pages of the active (or latest) version, so the admin can map sections to template pages
  let pages: PageInfo[] = [];
  try {
    const versionId = template.active_version_id || template.versions[0]?.id;
    if (versionId) {
      const { data } = await supabaseAdmin().from("coc_template_versions").select("template_json").eq("id", versionId).maybeSingle();
      const tj = data?.template_json as { pages?: Array<{ name?: string; elements?: Array<{ fieldName?: string }> }> } | undefined;
      pages = (tj?.pages ?? []).map((p, i) => ({
        number: i + 1,
        name: p.name || `Page ${i + 1}`,
        placedFields: [...new Set((p.elements ?? []).map((e) => e.fieldName).filter((f): f is string => Boolean(f)))],
      }));
    }
  } catch {
    pages = [];
  }

  return (
    <InputsEditorClient
      templateId={template.id}
      templateName={template.name}
      initialConfig={config}
      pages={pages}
      canManage={can(session.user.role, "manageTemplates", session.user.capabilities)}
    />
  );
}
