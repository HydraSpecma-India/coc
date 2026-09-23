import { route, json } from "@/lib/api/handler";
import { requireCapability } from "@/lib/auth/guards";
import { D365Service } from "@/lib/integrations/d365/service";

const quote = (v: string) => v.replace(/'/g, "''");

/** Entities that hold released products – the first one that answers is used. */
const PRODUCT_ENTITIES = ["ReleasedProductsV2", "ReleasedDistinctProducts", "EcoResReleasedProductV2"];

/** Property names different D365FO versions use for the product description. */
const NAME_PROPS = [
  "ProductName",
  "ProductSearchName",
  "SearchName",
  "ItemName",
  "ProductDescription",
  "Description",
  "ProductNameAlias",
  "ItemNameAlias",
  "ProductDisplayName",
];

/** entity → the name property this D365FO actually has (found once, then reused) */
const nameProperty: Record<string, string> = {};
/** the product entity this D365FO answered on (found once, then tried first) */
let workingEntity: string | null = null;

const describe = (row: Record<string, unknown>): string => {
  for (const p of NAME_PROPS) {
    const v = row[p];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
};

/**
 * Look up released products in D365FO so an admin can pick item numbers instead of typing them.
 *
 * Environments differ in which properties a product entity exposes, so the item number is the only
 * property this ever filters on by default; a name search is tried afterwards and any property that
 * does not exist is simply skipped instead of failing the whole lookup.
 */
export const GET = route(async (req) => {
  await requireCapability("manageSettings");
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const company = (req.nextUrl.searchParams.get("company") || "").trim();
  if (q.length < 2) return json({ ok: false, items: [], error: "Type at least two characters" });

  const companyClause =
    company && company.toUpperCase() !== "ALL" ? `dataAreaId eq '${quote(company.toLowerCase())}'` : "";
  const withCompany = (clause: string) => [clause, companyClause].filter(Boolean).join(" and ");

  const seen = new Set<string>();
  const items: Array<{ item: string; label: string; company: string }> = [];
  const collect = (rows: Array<Record<string, unknown>>) => {
    for (const r of rows) {
      const item = String(r.ItemNumber ?? r.ProductNumber ?? r.ItemId ?? "").trim();
      if (!item) continue;
      const key = item.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ item, label: describe(r), company: String(r.dataAreaId ?? "").toUpperCase() });
    }
  };

  let entity = "";
  let lastError: string | null = null;
  let mode: "mock" | "live" = "live";

  // 1. item number – the only property every version is guaranteed to have
  const entities = workingEntity ? [workingEntity, ...PRODUCT_ENTITIES.filter((e) => e !== workingEntity)] : PRODUCT_ENTITIES;
  for (const candidate of entities) {
    const res = await D365Service.queryEntity({
      entity: candidate,
      filter: withCompany(`contains(ItemNumber, '${quote(q)}')`),
      top: 30,
      crossCompany: true,
    });
    mode = res.mode;
    if (res.error) {
      lastError = res.error;
      continue;
    }
    entity = candidate;
    workingEntity = candidate;
    lastError = null;
    collect(res.rows);
    break;
  }

  // 2. product name – only when the item number search came up short. The property that this
  //    environment actually has is remembered, so the probing happens once per server start.
  if (entity && items.length < 5) {
    const candidates = nameProperty[entity] ? [nameProperty[entity]] : NAME_PROPS;
    for (const prop of candidates) {
      const res = await D365Service.queryEntity({
        entity,
        filter: withCompany(`contains(${prop}, '${quote(q)}')`),
        top: 30 - items.length,
        crossCompany: true,
      });
      if (res.error) continue; // this version does not have that property
      nameProperty[entity] = prop;
      collect(res.rows);
      break;
    }
  }

  const error = items.length
    ? null
    : lastError || (entity ? null : "Could not read the product list from Dynamics 365.");

  return json({ ok: !error, mode, entity: entity || null, items: items.slice(0, 30), error });
});
