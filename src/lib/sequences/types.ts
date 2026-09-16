export interface ProductSequenceRule {
  itemNumber: string;
  productName?: string;
  mode: "auto" | "manual";
  pattern: string; // e.g. "{ItemNumber} - SN{###}"
  nextNumber: number;
  padding: number;
  lastGeneratedSerial?: string | null;
  updatedAt?: string;
}

export interface SequencesConfig {
  autoCreateProductSeries: boolean;
  defaultMode: "auto" | "manual";
  defaultPattern: string;
  defaultPadding: number;
  productRules: Record<string, ProductSequenceRule>;
}

export const DEFAULT_SEQUENCES_CONFIG: SequencesConfig = {
  autoCreateProductSeries: true,
  defaultMode: "auto",
  defaultPattern: "{ItemNumber} - SN{###}",
  defaultPadding: 3,
  productRules: {
    "1070.0049": {
      itemNumber: "1070.0049",
      productName: "Baseframe Module",
      mode: "auto",
      pattern: "{ItemNumber} - SN{###}",
      nextNumber: 1,
      padding: 3,
      lastGeneratedSerial: null,
      updatedAt: new Date().toISOString(),
    },
  },
};

/**
 * Formats a sequence serial number given a pattern, item number, sequence number, and padding.
 * Supported tokens:
 * - {ItemNumber}: Replaced by the item number (e.g. 1070.0049)
 * - {###...}: Replaced by zero-padded number with width equal to number of hashes
 * - {seq:N}: Replaced by zero-padded number with width N
 * - {yyyy}: Current year
 */
export function formatSequenceSerial(
  pattern: string,
  itemNumber: string,
  seqNum: number,
  padding: number = 3
): string {
  const currentYear = new Date().getFullYear();
  let result = pattern || "{ItemNumber} - SN{###}";

  // Replace {ItemNumber}
  result = result.replace(/\{ItemNumber\}/gi, itemNumber || "PROD");

  // Replace {yyyy}
  result = result.replace(/\{yyyy\}/gi, String(currentYear));

  // Replace {###...}
  result = result.replace(/\{(#+)\}/g, (_, hashes) => {
    return String(seqNum).padStart(hashes.length, "0");
  });

  // Replace {seq:N}
  result = result.replace(/\{seq:(\d+)\}/gi, (_, len) => {
    return String(seqNum).padStart(Number(len), "0");
  });

  // If pattern doesn't contain a number placeholder, append padded serial
  if (!pattern.includes("{#") && !pattern.toLowerCase().includes("{seq")) {
    const pad = Math.max(1, padding);
    result = `${result.trim()}${String(seqNum).padStart(pad, "0")}`;
  }

  return result;
}
