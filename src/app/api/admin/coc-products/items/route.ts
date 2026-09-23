import { route, json } from "@/lib/api/handler";
import { requireCapability } from "@/lib/auth/guards";
import { D365Service } from "@/lib/integrations/d365/service";

const quote = (v: string) => v.replace(/'/g, "''");

/** Entities that can hold released products – the first one this environment answers on is used. */
const PRODUCT_ENTITIES = ["ReleasedProductsV2", "ReleasedProducts", "ReleasedDistinctProducts", "EcoResReleasedProductV2"];

/** Property names different D365FO versions use for the item number. */
const ITEM_PROPS = ["ItemNumber", "ProductNumber", "ItemId", "ItemCode", "ReleasedProductNumber"];

/** Property names different D365FO versions use for the product description. */
const NAME_PROPS = [
  "ProductName", "ProductSearchName", "SearchName", "ItemName", "ProductDescription",
  "Description", "ProductNameAlias", "ItemNameAlias", "ProductDisplayName", "ItemNameEnglish",
];

interface Shape {
  entity: string;
  itemProp: string;
  nameProp: string | null;
  hasCompany: boolean;
}

/** What this D365FO actually looks like – worked out once from a sample row, then reused. */
let shape: Shape | null = null;
let shapeError: string | null = null;

/**
 * Reads one row from each candidate entity to learn which properties exist, instead of assuming a
 * naming convention. Environments differ, and one unknown property makes D365 reject the whole query.
 */
async function discoverShape(): Promise<{ shape: Shape | null; attempts: string[] }> {
  const attempts: string[] = [];
  for (const entity of PRODUCT_ENTITIES) {
    const probe = await D365Service.entityFields(entity);
    if (probe.error) {
      attempts.push(`${entity}: ${probe.error.slice(0, 160)}`);
      continue;
    }
    if (!probe.fields.length) {
      attempts.push(`${entity}: no rows, so the properties could not be read`);
      continue;
    }
    const itemProp = ITEM_PROPS.find((p) => probe.fields.includes(p));
    if (!itemProp) {
      attempts.push(`${entity}: no item number property (has ${probe.fields.slice(0, 12).join(", ")}…)`);
      continue;
    }
    return {
      shape: {
        entity,
        itemProp,
        nameProp: NAME_PROPS.find((p) => probe.fields.includes(p)) ?? null,
        hasCompany: probe.fields.includes("dataAreaId"),
      },
      attempts,
    };
  }
  return { shape: null, attempts };
}

/** Look up released products in D365FO so an admin can pick item numbers instead of typing them. */
export const GET = route(async (req) => {
  await requireCapability("manageSettings");
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const company = (req.nextUrl.searchParams.get("company") || "").trim();
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  if (q.length < 2) return json({ ok: false, items: [], error: "Type at least two characters" });

  if (refresh) {
    shape = null;
    shapeError = null;
  }
  if (!shape) {
    const found = await discoverShape();
    shape = found.shape;
    shapeError = found.shape
      ? null
      : `Could not read a product list from Dynamics 365. Tried – ${found.attempts.join(" | ")}`;
  }
  if (!shape) return json({ ok: false, items: [], error: shapeError });

  const { entity, itemProp, nameProp, hasCompany } = shape;
  const companyClause =
    hasCompany && company && company.toUpperCase() !== "ALL" ? `dataAreaId eq '${quote(company.toLowerCase())}'` : "";
  const withCompany = (clause: string) => [clause, companyClause].filter(Boolean).join(" and ");

  const seen = new Set<string>();
  const items: Array<{ item: string; label: string; company: string }> = [];
  const collect = (rows: Array<Record<string, unknown>>) => {
    for (const r of rows) {
      const item = String(r[itemProp] ?? "").trim();
      if (!item) continue;
      const key = item.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        item,
        label: nameProp ? String(r[nameProp] ?? "").trim() : "",
        company: String(r.dataAreaId ?? "").toUpperCase(),
      });
    }
  };

  const byItem = await D365Service.queryEntity({
    entity,
    filter: withCompany(`contains(${itemProp}, '${quote(q)}')`),
    top: 30,
    crossCompany: true,
  });
  if (byItem.error) {
    // the entity moved or the property was removed – look again next time
    shape = null;
    return json({ ok: false, items: [], entity, error: byItem.error });
  }
  collect(byItem.rows);

  // the query may also be part of a product name
  if (nameProp && items.length < 5) {
    const byName = await D365Service.queryEntity({
      entity,
      filter: withCompany(`contains(${nameProp}, '${quote(q)}')`),
      top: 30 - items.length,
      crossCompany: true,
    });
    if (!byName.error) collect(byName.rows);
  }

  return json({
    ok: true,
    mode: byItem.mode,
    entity,
    itemProp,
    nameProp,
    items: items.slice(0, 30),
    error: items.length ? null : `No product in ${entity} matched "${q}".`,
  });
});
