import { requireCapability } from "@/lib/auth/guards";
import { listTemplates } from "@/lib/db/repositories/templates";
import { can } from "@/lib/auth/roles";
import { getSetting } from "@/lib/db/repositories/settings";
import { TemplatesClient } from "./templates-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Templates" };

export default async function TemplatesPage() {
  const session = await requireCapability("viewTemplates");
  const [templates, types] = await Promise.all([
    listTemplates(),
    getSetting<string[]>("template.types", ["COC"]),
  ]);
  return <TemplatesClient templates={templates} templateTypes={types} canManage={can(session.user.role, "manageTemplates")} />;
}
