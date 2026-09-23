import { z } from "zod";

/**
 * COC products per company (client-safe definitions).
 *
 * An admin lists the item numbers that get a Certificate of Conformity, per company. When the list
 * is switched on, the production order search only asks D365FO for orders of those items – so users
 * no longer scroll through orders that never need a COC. A company that is not listed here is not
 * restricted, and the "all production orders" switch on the New COC page reads everything again.
 */

export const COC_PRODUCTS_KEY = "coc.products";

export const ProductMatchSchema = z.enum(["exact", "prefix"]);
export type ProductMatch = z.infer<typeof ProductMatchSchema>;

export const CocProductItemSchema = z.object({
  /** item number as it is in D365FO, or the first characters of it when match = prefix */
  item: z.string().trim().min(1, "Enter an item number").max(60),
  label: z.string().trim().max(120).optional(),
});
export type CocProductItem = z.infer<typeof CocProductItemSchema>;

export const CocProductCompanySchema = z.object({
  id: z.string().min(1).max(60),
  /** dataAreaId, e.g. HSIN */
  company: z.string().trim().min(1, "Choose a company").max(10),
  /** whole item number, or everything that starts with what is entered */
  match: ProductMatchSchema.default("exact"),
  items: z.array(CocProductItemSchema).max(500).default([]),
  active: z.boolean().default(true),
});
export type CocProductCompany = z.infer<typeof CocProductCompanySchema>;

export const CocProductsConfigSchema = z.object({
  /** restrict the production order search to the listed items */
  enabled: z.boolean().default(false),
  /** offer the "all production orders" switch on the New COC page */
  allowSearchAll: z.boolean().default(true),
  companies: z.array(CocProductCompanySchema).max(50).default([]),
});
export type CocProductsConfig = z.infer<typeof CocProductsConfigSchema>;

export const EMPTY_COC_PRODUCTS: CocProductsConfig = { enabled: false, allowSearchAll: true, companies: [] };

export const newProductId = (p: string) =>
  `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export interface ItemPattern {
  item: string;
  match: ProductMatch;
}

/**
 * The item numbers the search must be limited to for one company.
 * `null` = no restriction (switched off, company not listed, or the list is empty).
 * "ALL"/empty company = every listed company together, so a cross-company search still works.
 */
export function itemPatternsFor(cfg: CocProductsConfig | null | undefined, company?: string): ItemPattern[] | null {
  if (!cfg?.enabled) return null;
  const target = (company || "").trim().toUpperCase();
  const rows = cfg.companies.filter((c) => c.active && c.items.length > 0);
  const chosen =
    !target || target === "ALL"
      ? rows
      : rows.filter((c) => c.company.trim().toUpperCase() === target);
  if (!chosen.length) return null;
  const seen = new Set<string>();
  const out: ItemPattern[] = [];
  for (const row of chosen) {
    for (const it of row.items) {
      const value = it.item.trim();
      if (!value) continue;
      const key = `${row.match}|${value.toUpperCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ item: value, match: row.match });
    }
  }
  return out.length ? out : null;
}

/** Does this item number belong to the COC product list? */
export function matchesItemPatterns(patterns: ItemPattern[] | null, itemNumber?: string): boolean {
  if (!patterns) return true;
  const value = (itemNumber || "").trim().toUpperCase();
  if (!value) return false;
  return patterns.some((p) =>
    p.match === "prefix" ? value.startsWith(p.item.trim().toUpperCase()) : value === p.item.trim().toUpperCase(),
  );
}

/** Problems an admin should fix before saving. */
export function validateCocProducts(cfg: CocProductsConfig): string | null {
  const seen = new Set<string>();
  for (const row of cfg.companies) {
    const key = row.company.trim().toUpperCase();
    if (!key) return "Every row needs a company.";
    if (seen.has(key)) return `The company "${row.company}" is listed twice – put all its items in one row.`;
    seen.add(key);
  }
  if (cfg.enabled && !cfg.companies.some((c) => c.active && c.items.length > 0)) {
    return "Add at least one item number, or switch the product list off.";
  }
  return null;
}

/** "1071.0747, 1070.0049" / one per line → items, duplicates removed. */
export function parseItemList(text: string): CocProductItem[] {
  const out: CocProductItem[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/[\n,;]+/)) {
    const item = raw.trim();
    if (!item) continue;
    const key = item.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ item });
  }
  return out;
}
