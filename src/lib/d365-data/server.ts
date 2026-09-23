import "server-only";
import { getSetting, setSetting } from "@/lib/db/repositories/settings";
import { D365Service } from "@/lib/integrations/d365/service";
import { logger } from "@/lib/logging/logger";
import {
  D365_DATASOURCES_KEY, DataSourcesConfigSchema, EMPTY_DATASOURCES, ROOT_ALIAS,
  qualifiedName, resolutionOrder, type DataEntity, type DataSourcesConfig,
} from "./types";

export async function getDataSources(): Promise<DataSourcesConfig> {
  const raw = await getSetting<unknown>(D365_DATASOURCES_KEY, EMPTY_DATASOURCES);
  const parsed = DataSourcesConfigSchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn("Invalid D365 data source settings – ignored", { error: parsed.error.message });
    return EMPTY_DATASOURCES;
  }
  return parsed.data;
}

export async function saveDataSources(cfg: DataSourcesConfig, userId?: string): Promise<void> {
  await setSetting(D365_DATASOURCES_KEY, DataSourcesConfigSchema.parse(cfg), userId);
}

const quote = (v: string) => `'${String(v).replace(/'/g, "''")}'`;

export interface RelatedData {
  /** field name → value, e.g. "so.SalesOrderNumber" */
  values: Record<string, string>;
  /** all rows per table (first row is the one used for the values) */
  rows: Record<string, Array<Record<string, unknown>>>;
  steps: Array<{ alias: string; entity: string; filter: string; rows: number; error?: string }>;
}

const asText = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return /^\d{4}-\d{2}-\d{2}T/.test(v) ? v.slice(0, 10) : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
};

/**
 * Reads every configured table for one production order and returns the values as
 * "alias.Field" so the template designer / PDF can use them like any other field.
 */
export async function fetchRelatedData(
  order: Record<string, unknown>,
  company?: string,
  cfg?: DataSourcesConfig,
): Promise<RelatedData> {
  const config = cfg ?? (await getDataSources());
  const out: RelatedData = { values: {}, rows: {}, steps: [] };
  if (!config.enabled) return out;
  const order2 = resolutionOrder(config);
  if (!order2) return out;

  const valueOf = (alias: string, field: string): string => {
    if (alias === ROOT_ALIAS) return asText(order[field]);
    return asText(out.rows[alias]?.[0]?.[field]);
  };

  for (const e of order2) {
    const links = config.links.filter((l) => l.toAlias === e.alias);
    const clauses: string[] = [];
    let missing = false;
    for (const l of links) {
      const v = valueOf(l.fromAlias, l.fromField).trim();
      if (!v) {
        missing = true;
        break;
      }
      clauses.push(
        l.operator === "startswith"
          ? `startswith(${l.toField}, ${quote(v)})`
          : l.operator === "contains"
            ? `contains(${l.toField}, ${quote(v)})`
            : `${l.toField} eq ${quote(v)}`,
      );
    }
    if (missing || !clauses.length) {
      out.steps.push({ alias: e.alias, entity: e.entity, filter: "", rows: 0, error: "No value for the relation – table skipped" });
      continue;
    }
    if (e.filterByCompany && company && company.toUpperCase() !== "ALL") clauses.push(`dataAreaId eq ${quote(company)}`);
    if (e.filter?.trim()) clauses.push(`(${e.filter.trim()})`);
    const filter = clauses.join(" and ");

    const res = await D365Service.queryEntity({ entity: e.entity, filter, select: e.fields.length ? e.fields : undefined, top: e.top });
    out.rows[e.alias] = res.rows;
    out.steps.push({ alias: e.alias, entity: e.entity, filter, rows: res.rows.length, error: res.error });

    const first = res.rows[0];
    if (first) {
      const keys = e.fields.length ? e.fields : Object.keys(first).filter((k) => !k.startsWith("@"));
      for (const k of keys) {
        const text = asText(first[k]);
        if (text) out.values[qualifiedName(e.alias, k)] = text;
      }
    }
  }
  return out;
}

/** Field names an admin can place in the designer, from the configured tables. */
export function availableFieldNames(cfg: DataSourcesConfig): Array<{ name: string; entity: DataEntity }> {
  return cfg.entities
    .filter((e) => e.active)
    .flatMap((e) => e.fields.map((f) => ({ name: qualifiedName(e.alias, f), entity: e })));
}
