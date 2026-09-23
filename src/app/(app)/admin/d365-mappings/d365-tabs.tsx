"use client";

import { useState } from "react";
import { Database, Link2 } from "lucide-react";
import type { D365MappingRow, FieldDefinitionRow } from "@/lib/db/repositories/fields";
import type { DataSourcesConfig } from "@/lib/d365-data/types";
import { MappingsClient } from "./mappings-client";
import { DataSourcesPanel } from "./datasources-panel";

export function D365Tabs({
  initialMappings,
  fields,
  dataSources,
}: {
  initialMappings: D365MappingRow[];
  fields: FieldDefinitionRow[];
  dataSources: DataSourcesConfig;
}) {
  const [tab, setTab] = useState<"mappings" | "tables">("mappings");

  const btn = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
      active ? "bg-brand-600 text-white" : "bg-white text-ink-700 hover:bg-ink-100 border border-ink-200"
    }`;

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" className={btn(tab === "mappings")} onClick={() => setTab("mappings")}>
          <Link2 className="h-4 w-4" /> Field mappings
        </button>
        <button type="button" className={btn(tab === "tables")} onClick={() => setTab("tables")}>
          <Database className="h-4 w-4" /> Tables &amp; relations
          {dataSources.entities.length > 0 && (
            <span className="rounded bg-black/10 px-1.5 text-[11px]">{dataSources.entities.length}</span>
          )}
        </button>
      </div>

      {tab === "mappings" ? (
        <MappingsClient initialMappings={initialMappings} fields={fields} />
      ) : (
        <DataSourcesPanel initialConfig={dataSources} />
      )}
    </div>
  );
}
