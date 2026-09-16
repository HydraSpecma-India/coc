import { requireCapability, requireSession } from "@/lib/auth/guards";
import { listTemplates } from "@/lib/db/repositories/templates";
import { CocWizard } from "./coc-wizard";

export const dynamic = "force-dynamic";
export const metadata = { title: "New COC" };

export default async function NewCocPage() {
  const session = await requireSession();
  await requireCapability("createCoc");

  let templateSummaries: Array<{
    id: string;
    name: string;
    template_type: string;
    active_version_id: string | null;
    active_version_number: number;
  }> = [];

  try {
    const rawTemplates = await listTemplates();
    templateSummaries = rawTemplates.map((t) => {
      const activeVer = t.versions.find((v) => v.id === t.active_version_id);
      return {
        id: t.id,
        name: t.name,
        template_type: t.template_type,
        active_version_id: t.active_version_id,
        active_version_number: activeVer?.version_number || 1,
      };
    });
  } catch (e) {
    console.error("NewCocPage DB error:", e);
  }

  // Always prioritize the official Standard HydraSpecma template
  const standardTemplate = {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Standard HydraSpecma A4 Certificate",
    template_type: "COC",
    active_version_id: "00000000-0000-0000-0000-000000000002",
    active_version_number: 1,
  };

  const hasStandard = templateSummaries.some(
    (t) => t.id === standardTemplate.id || t.name.toLowerCase().includes("hydraspecma")
  );

  const templates = hasStandard
    ? templateSummaries.sort((a) => (a.id === standardTemplate.id ? -1 : 1))
    : [standardTemplate, ...templateSummaries];

  return (
    <CocWizard
      templates={templates}
      userName={session.user.name || "Manigandan Parthasarathi"}
      userEmail={session.user.email || "manigandan.parthasarathi@hydraspecma.com"}
    />
  );
}
