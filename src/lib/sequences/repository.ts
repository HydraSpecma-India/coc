import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { logger } from "@/lib/logging/logger";
import {
  ProductSequenceRule,
  SequencesConfig,
  DEFAULT_SEQUENCES_CONFIG,
  formatSequenceSerial,
  patternUsesCompany,
} from "./types";

const SETTINGS_KEY = "product_number_sequences";

/**
 * Loads the number sequences configuration from coc_app_settings.
 * Falls back to DEFAULT_SEQUENCES_CONFIG if not found or on error.
 */
export async function getSequencesConfig(): Promise<SequencesConfig> {
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("coc_app_settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();

    if (error) {
      logger.warn("Could not load product_number_sequences from coc_app_settings", { error: error.message });
      return { ...DEFAULT_SEQUENCES_CONFIG };
    }

    if (data?.value && typeof data.value === "object") {
      const val = data.value as Partial<SequencesConfig>;
      return {
        autoCreateProductSeries: val.autoCreateProductSeries ?? true,
        defaultMode: val.defaultMode ?? "auto",
        defaultPattern: val.defaultPattern ?? "{ItemNumber} - SN{###}",
        defaultPadding: val.defaultPadding ?? 3,
        productRules: val.productRules || { ...DEFAULT_SEQUENCES_CONFIG.productRules },
      };
    }
  } catch (e) {
    logger.warn("Exception loading product sequences config", { error: (e as Error).message });
  }

  return { ...DEFAULT_SEQUENCES_CONFIG };
}

/**
 * Saves the number sequences configuration to coc_app_settings.
 */
export async function saveSequencesConfig(
  config: SequencesConfig,
  userId?: string
): Promise<boolean> {
  try {
    const sb = supabaseAdmin();
    const { error } = await sb.from("coc_app_settings").upsert({
      key: SETTINGS_KEY,
      value: config,
      description: "Product-specific continuous serial number sequence rules and state",
      updated_by: userId || null,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      logger.error("Failed to save product_number_sequences", { error: error.message });
      return false;
    }
    return true;
  } catch (e) {
    logger.error("Exception saving product_number_sequences", { error: (e as Error).message });
    return false;
  }
}

const normCompany = (c?: string) => (c || "").trim().toUpperCase();

/** Next number for this rule – per company when the pattern contains {Company}. */
function nextNumberFor(rule: ProductSequenceRule, company: string): number {
  if (company && patternUsesCompany(rule.pattern)) {
    return rule.companyNext?.[company] ?? 1;
  }
  return rule.nextNumber;
}

/** Highest sequence number already used by issued COCs for this item (optionally only serials of one company). */
async function scanMaxExistingSeq(itemNumber: string, company?: string): Promise<number> {
  let max = 0;
  try {
    const { data } = await supabaseAdmin()
      .from("coc_documents")
      .select("serial_number")
      .eq("item_number", itemNumber)
      .neq("status", "CANCELLED")
      .not("serial_number", "is", null);
    for (const row of data ?? []) {
      const sn = String(row.serial_number || "");
      if (!sn) continue;
      if (company && !sn.toUpperCase().includes(company)) continue;
      const match = sn.match(/SN(\d+)/i) || sn.match(/(\d+)$/);
      const num = match ? parseInt(match[1], 10) : NaN;
      if (!isNaN(num) && num > max) max = num;
    }
  } catch (e) {
    logger.warn("Could not scan existing coc_documents for max serial", { error: (e as Error).message });
  }
  return max;
}

/**
 * Retrieves the sequence rule for a given product/item number.
 * If the product series does not exist, automatically creates it by inspecting
 * existing issued certificates in the database or starting from 1.
 * When the rule's pattern contains {Company}, every company keeps its own counter.
 */
export async function getOrInitProductSequence(
  itemNumber: string,
  productName?: string,
  companyRaw?: string,
): Promise<{ rule: ProductSequenceRule; nextSerial: string; nextNumber: number; isNew: boolean }> {
  const cleanItem = (itemNumber || "").trim();
  const company = normCompany(companyRaw);
  const config = await getSequencesConfig();
  let rule = config.productRules[cleanItem];
  let isNew = false;
  let dirty = false;

  if (!rule) {
    isNew = true;
    const pattern = config.defaultPattern || "{ItemNumber} - SN{###}";
    const perCompany = company && patternUsesCompany(pattern);
    const max = await scanMaxExistingSeq(cleanItem, perCompany ? company : undefined);
    rule = {
      itemNumber: cleanItem,
      productName: productName || cleanItem,
      mode: config.defaultMode || "auto",
      pattern,
      nextNumber: perCompany ? 1 : max + 1,
      padding: config.defaultPadding || 3,
      lastGeneratedSerial: null,
      ...(perCompany ? { companyNext: { [company]: max + 1 } } : {}),
      updatedAt: new Date().toISOString(),
    };
    config.productRules[cleanItem] = rule;
    dirty = true;
  } else {
    if (productName && !rule.productName) {
      rule.productName = productName;
      dirty = true;
    }
    // First time this company uses a company-wise series: start after its highest issued serial.
    if (company && patternUsesCompany(rule.pattern) && rule.companyNext?.[company] === undefined) {
      const max = await scanMaxExistingSeq(cleanItem, company);
      rule.companyNext = { ...(rule.companyNext || {}), [company]: max + 1 };
      dirty = true;
    }
  }

  if (dirty) await saveSequencesConfig(config);

  const nextNumber = nextNumberFor(rule, company);
  const nextSerial = formatSequenceSerial(rule.pattern, cleanItem, nextNumber, rule.padding, {
    company: company || undefined,
    productName: rule.productName || productName,
  });
  return { rule, nextSerial, nextNumber, isNew };
}

/**
 * Advances the sequence for a product after a certificate has been successfully issued.
 */
export async function advanceProductSequence(
  itemNumber: string,
  usedSerial?: string,
  companyRaw?: string,
): Promise<void> {
  const cleanItem = (itemNumber || "").trim();
  if (!cleanItem) return;
  const company = normCompany(companyRaw);

  await getOrInitProductSequence(cleanItem, undefined, company); // make sure rule / company counter exist
  const config = await getSequencesConfig();
  const rule = config.productRules[cleanItem];
  if (!rule) return;

  const current = nextNumberFor(rule, company);
  let advanced = current + 1;
  if (usedSerial) {
    const match = usedSerial.match(/SN(\d+)/i) || usedSerial.match(/(\d+)$/);
    const num = match ? parseInt(match[1], 10) : NaN;
    if (!isNaN(num) && num >= current) advanced = num + 1;
  }

  if (company && patternUsesCompany(rule.pattern)) {
    rule.companyNext = { ...(rule.companyNext || {}), [company]: advanced };
  } else {
    rule.nextNumber = advanced;
  }
  if (usedSerial) rule.lastGeneratedSerial = usedSerial;
  rule.updatedAt = new Date().toISOString();

  config.productRules[cleanItem] = rule;
  await saveSequencesConfig(config);
}
