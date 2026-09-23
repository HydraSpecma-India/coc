import "server-only";
import { getSetting, setSetting } from "@/lib/db/repositories/settings";
import { logger } from "@/lib/logging/logger";
import {
  COC_PRODUCTS_KEY, CocProductsConfigSchema, EMPTY_COC_PRODUCTS, itemPatternsFor,
  type CocProductsConfig, type ItemPattern,
} from "./types";

export async function getCocProducts(): Promise<CocProductsConfig> {
  const raw = await getSetting<unknown>(COC_PRODUCTS_KEY, EMPTY_COC_PRODUCTS);
  const parsed = CocProductsConfigSchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn("Invalid COC product settings – ignored", { error: parsed.error.message });
    return EMPTY_COC_PRODUCTS;
  }
  return parsed.data;
}

export async function saveCocProducts(cfg: CocProductsConfig, userId?: string): Promise<void> {
  await setSetting(COC_PRODUCTS_KEY, CocProductsConfigSchema.parse(cfg), userId);
}

/** Item numbers the production order search must be limited to, or null when everything is allowed. */
export async function cocItemPatterns(company?: string): Promise<ItemPattern[] | null> {
  return itemPatternsFor(await getCocProducts(), company);
}
