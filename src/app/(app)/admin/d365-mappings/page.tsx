import { requireCapability } from "@/lib/auth/guards";
import { listD365Mappings, listFieldDefinitions } from "@/lib/db/repositories/fields";
import { MappingsClient } from "./mappings-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "D365FO Field Mapping" };

export default async function D365MappingsPage() {
  await requireCapability("manageFields");
  const [mappings, fields] = await Promise.all([
    listD365Mappings(),
    listFieldDefinitions({ includeInactive: false }),
  ]);

  return <MappingsClient initialMappings={mappings} fields={fields} />;
}
