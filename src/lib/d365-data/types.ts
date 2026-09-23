import { z } from "zod";

/**
 * Extra D365FO data for a COC (client-safe definitions).
 *
 * The production order is always the root table (alias "order"). An admin adds further OData
 * entities (tables), picks the fields to read and says how the table is related to the root or to
 * another added table (e.g. SalesOrderHeadersV2.SalesOrderNumber = order.SalesOrder). When a COC is
 * created the app reads those rows and makes the values available to the template as
 * "alias.FieldName" – so they can be placed in the designer like any other field.
 */

export const D365_DATASOURCES_KEY = "d365.datasources";
export const ROOT_ALIAS = "order";

/** Fields of the production order that relations can use as the join value. */
export const ROOT_FIELDS = [
  "ProductionOrder",
  "ItemNumber",
  "ItemDescription",
  "SalesOrder",
  "SalesLine",
  "CustomerAccount",
  "CustomerName",
  "CustomerPO",
  "CustomerPartNumber",
  "SerialNumber",
  "BatchNumber",
  "DeliveryDate",
  "Quantity",
  "dataAreaId",
] as const;

export const DataEntitySchema = z.object({
  id: z.string().min(1).max(60),
  /** short name used in field names, e.g. "so" → so.SalesOrderNumber */
  alias: z
    .string()
    .trim()
    .min(1, "Give the table a short name")
    .max(20)
    .regex(/^[A-Za-z][A-Za-z0-9_]*$/, "Use letters, digits and _ only (must start with a letter)"),
  label: z.string().trim().max(80).optional(),
  /** OData entity set, e.g. SalesOrderHeadersV2 */
  entity: z.string().trim().min(1, "Enter the D365FO entity name").max(120),
  /** properties to read (empty = all properties of the row) */
  fields: z.array(z.string().trim().min(1).max(120)).max(60).default([]),
  /** extra OData filter, e.g. "SalesOrderStatus eq 'Open'" */
  filter: z.string().trim().max(400).optional(),
  /** also filter on the COC's company (dataAreaId) */
  filterByCompany: z.boolean().default(true),
  /** how many rows to read (1 = only the matching row) */
  top: z.number().int().min(1).max(50).default(1),
  active: z.boolean().default(true),
});
export type DataEntity = z.infer<typeof DataEntitySchema>;

export const DataLinkSchema = z.object({
  id: z.string().min(1).max(60),
  /** alias whose value is used ("order" = the production order) */
  fromAlias: z.string().trim().min(1).max(20),
  fromField: z.string().trim().min(1).max(120),
  /** the added table and the property that must match */
  toAlias: z.string().trim().min(1).max(20),
  toField: z.string().trim().min(1).max(120),
  /** exact match or "starts with" (D365 numbers sometimes carry a suffix) */
  operator: z.enum(["eq", "startswith", "contains"]).default("eq"),
});
export type DataLink = z.infer<typeof DataLinkSchema>;

export const DataSourcesConfigSchema = z.object({
  enabled: z.boolean().default(false),
  entities: z.array(DataEntitySchema).max(30).default([]),
  links: z.array(DataLinkSchema).max(60).default([]),
});
export type DataSourcesConfig = z.infer<typeof DataSourcesConfigSchema>;

export const EMPTY_DATASOURCES: DataSourcesConfig = { enabled: false, entities: [], links: [] };

export const newId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Field name a template element uses for a value of an added table. */
export const qualifiedName = (alias: string, field: string) => `${alias}.${field}`;

/**
 * Order in which the tables can be read: a table can only be read once the table its relation
 * points at is available. Returns null when a relation is circular or points nowhere.
 */
export function resolutionOrder(cfg: DataSourcesConfig): DataEntity[] | null {
  const active = cfg.entities.filter((e) => e.active);
  const byAlias = new Map(active.map((e) => [e.alias, e]));
  const ready = new Set<string>([ROOT_ALIAS]);
  const out: DataEntity[] = [];
  let guard = active.length + 1;
  while (out.length < active.length && guard-- > 0) {
    for (const e of active) {
      if (ready.has(e.alias)) continue;
      const links = cfg.links.filter((l) => l.toAlias === e.alias);
      if (!links.length) continue; // a table without a relation is never read
      if (links.every((l) => ready.has(l.fromAlias) || !byAlias.has(l.fromAlias))) {
        ready.add(e.alias);
        out.push(e);
      }
    }
  }
  return out.length === active.filter((e) => cfg.links.some((l) => l.toAlias === e.alias)).length ? out : null;
}

/** Problems an admin should fix before saving. */
export function validateDataSources(cfg: DataSourcesConfig): string | null {
  const aliases = new Set<string>();
  for (const e of cfg.entities) {
    const a = e.alias.toLowerCase();
    if (a === ROOT_ALIAS) return `"${ROOT_ALIAS}" is the production order – choose another short name.`;
    if (aliases.has(a)) return `The short name "${e.alias}" is used twice.`;
    aliases.add(a);
  }
  for (const l of cfg.links) {
    if (!cfg.entities.some((e) => e.alias === l.toAlias)) return `Relation points to unknown table "${l.toAlias}".`;
    if (l.fromAlias !== ROOT_ALIAS && !cfg.entities.some((e) => e.alias === l.fromAlias)) {
      return `Relation starts at unknown table "${l.fromAlias}".`;
    }
    if (l.fromAlias === l.toAlias) return `A table cannot be related to itself ("${l.toAlias}").`;
  }
  const active = cfg.entities.filter((e) => e.active);
  for (const e of active) {
    if (!cfg.links.some((l) => l.toAlias === e.alias)) return `Table "${e.alias}" has no relation – add one so the app knows which row to read.`;
  }
  if (!resolutionOrder(cfg)) return "The relations form a circle – every table must lead back to the production order.";
  return null;
}
