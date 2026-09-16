import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { logger } from "@/lib/logging/logger";
import {
  ProductSequenceRule,
  SequencesConfig,
  DEFAULT_SEQUENCES_CONFIG,
  formatSequenceSerial,
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

/**
 * Retrieves the sequence rule for a given product/item number.
 * If the product series does not exist, automatically creates it by inspecting
 * existing issued certificates in the database or starting from 1.
 */
export async function getOrInitProductSequence(
  itemNumber: string,
  productName?: string
): Promise<{ rule: ProductSequenceRule; nextSerial: string; isNew: boolean }> {
  const cleanItem = (itemNumber || "").trim();
  const config = await getSequencesConfig();

  // If rule already exists for this exact product
  if (config.productRules[cleanItem]) {
    const rule = config.productRules[cleanItem];
    // Update productName if newly provided and wasn't set
    if (productName && !rule.productName) {
      rule.productName = productName;
      await saveSequencesConfig(config);
    }
    const nextSerial = formatSequenceSerial(rule.pattern, cleanItem, rule.nextNumber, rule.padding);
    return { rule, nextSerial, isNew: false };
  }

  // Auto-initialize sequence for this product
  let maxExistingSeq = 0;
  try {
    const sb = supabaseAdmin();
    const { data: existingDocs } = await sb
      .from("coc_documents")
      .select("serial_number")
      .eq("item_number", cleanItem)
      .neq("status", "CANCELLED")
      .not("serial_number", "is", null);

    if (existingDocs && existingDocs.length > 0) {
      for (const row of existingDocs) {
        if (!row.serial_number) continue;
        // Try matching SN(\d+) or trailing numbers
        const match = row.serial_number.match(/SN(\d+)/i) || row.serial_number.match(/(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxExistingSeq) {
            maxExistingSeq = num;
          }
        }
      }
    }
  } catch (e) {
    logger.warn("Could not scan existing coc_documents for max serial", { error: (e as Error).message });
  }

  const nextNumber = maxExistingSeq > 0 ? maxExistingSeq + 1 : 1;
  const newRule: ProductSequenceRule = {
    itemNumber: cleanItem,
    productName: productName || cleanItem,
    mode: config.defaultMode || "auto",
    pattern: config.defaultPattern || "{ItemNumber} - SN{###}",
    nextNumber,
    padding: config.defaultPadding || 3,
    lastGeneratedSerial: null,
    updatedAt: new Date().toISOString(),
  };

  config.productRules[cleanItem] = newRule;
  await saveSequencesConfig(config);

  const nextSerial = formatSequenceSerial(newRule.pattern, cleanItem, newRule.nextNumber, newRule.padding);
  return { rule: newRule, nextSerial, isNew: true };
}

/**
 * Advances the sequence for a product after a certificate has been successfully issued.
 */
export async function advanceProductSequence(
  itemNumber: string,
  usedSerial?: string
): Promise<void> {
  const cleanItem = (itemNumber || "").trim();
  if (!cleanItem) return;

  const config = await getSequencesConfig();
  let rule = config.productRules[cleanItem];

  if (!rule) {
    // If not found, init first
    const init = await getOrInitProductSequence(cleanItem);
    rule = init.rule;
  }

  // Parse sequence number from usedSerial if provided to ensure counter stays >= used number
  let advancedNumber = rule.nextNumber + 1;
  if (usedSerial) {
    const match = usedSerial.match(/SN(\d+)/i) || usedSerial.match(/(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num >= rule.nextNumber) {
        advancedNumber = num + 1;
      }
    }
  }

  rule.nextNumber = advancedNumber;
  if (usedSerial) {
    rule.lastGeneratedSerial = usedSerial;
  }
  rule.updatedAt = new Date().toISOString();

  config.productRules[cleanItem] = rule;
  await saveSequencesConfig(config);
}
