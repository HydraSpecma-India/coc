import { requireCapability } from "@/lib/auth/guards";
import { listD365Mappings, listFieldDefinitions, type D365MappingRow, type FieldDefinitionRow } from "@/lib/db/repositories/fields";
import { getDataSources } from "@/lib/d365-data/server";
import { EMPTY_DATASOURCES, type DataSourcesConfig } from "@/lib/d365-data/types";
import { D365Tabs } from "./d365-tabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "D365FO Field Mapping" };

export default async function D365MappingsPage() {
  await requireCapability("manageFields");
  let mappings: D365MappingRow[] = [];
  let fields: FieldDefinitionRow[] = [];
  let dataSources: DataSourcesConfig = EMPTY_DATASOURCES;

  try {
    const [m, f, ds] = await Promise.all([
      listD365Mappings(),
      listFieldDefinitions({ includeInactive: false }),
      getDataSources(),
    ]);
    mappings = m;
    fields = f;
    dataSources = ds;
  } catch (e) {
    console.error("D365MappingsPage DB error:", e);
  }

  return <D365Tabs initialMappings={mappings} fields={fields} dataSources={dataSources} />;
}
