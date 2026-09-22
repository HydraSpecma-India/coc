export interface ProductSequenceRule {
  itemNumber: string;
  productName?: string;
  mode: "auto" | "manual";
  pattern: string; // e.g. "{ItemNumber} - SN{###}"
  nextNumber: number;
  padding: number;
  lastGeneratedSerial?: string | null;
  /** next number per company – used when the pattern contains {Company} */
  companyNext?: Record<string, number>;
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

export interface SerialContext {
  /** legal entity / dataAreaId of the production order, e.g. HSIN */
  company?: string;
  productName?: string;
  date?: Date;
}

/** True when the pattern contains a company token – such series keep one counter per company. */
export function patternUsesCompany(pattern: string): boolean {
  return /\{(company|companycode|dataareaid)\}/i.test(pattern || "");
}

/**
 * Formats a sequence serial number given a pattern, item number, sequence number, and padding.
 * Supported tokens (case-insensitive):
 * - {ItemNumber}: item number (e.g. 1070.0049)
 * - {Company} / {CompanyCode} / {DataAreaId}: company of the production order (e.g. HSIN)
 * - {ProductName}: item description
 * - {yyyy} {yy} {MM} {dd}: date parts
 * - {###...}: zero-padded number with width equal to number of hashes
 * - {seq:N}: zero-padded number with width N
 */
export function formatSequenceSerial(
  pattern: string,
  itemNumber: string,
  seqNum: number,
  padding: number = 3,
  ctx: SerialContext = {},
): string {
  const d = ctx.date ?? new Date();
  const two = (n: number) => String(n).padStart(2, "0");
  let result = pattern || "{ItemNumber} - SN{###}";

  result = result.replace(/\{ItemNumber\}/gi, itemNumber || "PROD");
  result = result.replace(/\{(Company|CompanyCode|DataAreaId)\}/gi, (ctx.company || "HSIN").trim().toUpperCase());
  result = result.replace(/\{ProductName\}/gi, (ctx.productName || "").trim());
  result = result.replace(/\{yyyy\}/gi, String(d.getFullYear()));
  result = result.replace(/\{yy\}/gi, String(d.getFullYear()).slice(-2));
  result = result.replace(/\{MM\}/g, two(d.getMonth() + 1));
  result = result.replace(/\{dd\}/gi, two(d.getDate()));

  result = result.replace(/\{(#+)\}/g, (_, hashes) => String(seqNum).padStart(hashes.length, "0"));
  result = result.replace(/\{seq:(\d+)\}/gi, (_, len) => String(seqNum).padStart(Number(len), "0"));

  // If pattern doesn't contain a number placeholder, append padded serial
  if (!(pattern || "").includes("{#") && !(pattern || "").toLowerCase().includes("{seq")) {
    const pad = Math.max(1, padding);
    result = `${result.trim()}${String(seqNum).padStart(pad, "0")}`;
  }

  return result;
}
