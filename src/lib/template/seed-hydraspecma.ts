import { parseTemplate, type TemplateJson, type TemplateElement } from "./schema";

/**
 * Seed template for the HydraSpecma COC-1070.0049 Rev.02 (7-page PDF).
 * Coordinates were measured from the reference PDF (points, top-left origin,
 * page 595.56 × 842.04). Every element is an ordinary template element that the
 * admin can move, restyle or delete in the designer – nothing here is special-cased.
 */
export function buildHydraSpecmaSeed(backgroundAssetId: string, pageCount: number): TemplateJson {
  const style = { fontFamily: "Helvetica", fontSize: 10, valign: "middle" as const, padding: 1 };

  const field = (id: string, fieldName: string, x: number, y: number, width: number, height: number, extra: Partial<TemplateElement> = {}): TemplateElement =>
    ({ id, type: "field", fieldName, x, y, width, height, style, binding: {}, ...extra }) as TemplateElement;

  const serialNo = (page: number, x: number, y: number, width = 120) =>
    field(`p${page}-serial`, "TopLevelSerialNumber", x, y, width, 13, { name: "Serial no." });

  const pages: TemplateJson["pages"] = [];

  // ── Page 1: the certificate ────────────────────────────────────────────────
  pages.push({
    id: "page-1",
    name: "Certificate",
    background: { assetId: backgroundAssetId, pageIndex: 0, opacity: 1 },
    elements: [
      serialNo(1, 416, 110, 135),
      field("p1-hsre-part", "HSREPartNumber", 60, 274, 150, 14, { name: "HSRE part no." }),
      field("p1-cust-part", "CustomerPartNumber", 230, 274, 150, 14, { name: "Customer part no." }),
      field("p1-desc", "ItemDescription", 395, 274, 155, 14, { name: "Description" }),
      field("p1-batch", "BatchNumber", 374, 317, 176, 14, { name: "Batch number" }),
      field("p1-qty", "Quantity", 374, 338, 176, 14, { name: "Quantity / Unit" }),
      field("p1-customer-po", "CustomerPO", 374, 358, 176, 15, { name: "Customer Purchase order" }),
      field("p1-top-serial", "TopLevelSerialNumber", 430, 379, 120, 14, { name: "Top level Serial number", binding: { required: true } }),
      field("p1-prod-order", "ProductionOrder", 374, 399, 176, 14, { name: "Manufacturing Order number", binding: { readOnly: true } }),
      field("p1-date", "COCDate", 70, 705, 220, 22, { name: "Date of Signature", binding: { format: "yyyy-MM-dd" } }),
      { id: "p1-signature", type: "signature", fieldName: "Signature", x: 320, y: 700, width: 220, height: 30, name: "Signature", binding: { required: true } } as TemplateElement,
      { id: "p1-header-line", type: "line", x: 55, y: 145, width: 485, height: 0, stroke: { color: "#000000", width: 0.75 } } as TemplateElement,
      { id: "p1-section-line", type: "line", x: 55, y: 445, width: 485, height: 0, stroke: { color: "#000000", width: 0.75 } } as TemplateElement,
    ],
  });

  // ── Appendix pages: serial number on each ─────────────────────────────────
  const serialPositions: Record<number, Array<[number, number, number?]>> = {
    2: [], // Appendix B (flatness) – rotated layout, serial added by admin if needed
    3: [[430, 148]],
    4: [[434, 107]],
    5: [[122, 90], [228, 523]],
    6: [[438, 114]],
    7: [[467, 115, 100]],
  };

  for (let p = 2; p <= pageCount; p++) {
    const positions = serialPositions[p] ?? [];
    pages.push({
      id: `page-${p}`,
      name: p === 2 ? "Appendix B – Flatness" : p === 3 ? "Appendix A – Interface holes" : p === 4 ? "Serial number registration" : `Page ${p}`,
      background: { assetId: backgroundAssetId, pageIndex: p - 1, opacity: 1 },
      elements: positions.map(([x, y, w], i) => ({ ...serialNo(p, x, y, w), id: `p${p}-serial-${i + 1}` })),
    });
  }

  return parseTemplate({
    schemaVersion: 1,
    templateName: "HydraSpecma COC 1070.0049",
    templateType: "COC",
    version: 1,
    revision: "Rev 02",
    page: { size: "A4", orientation: "portrait", width: 595.56, height: 842.04 },
    settings: { defaultFont: "Helvetica", signatureRequired: true, allowDateOverride: false, fileNamePattern: "{COCNumber}.pdf" },
    fonts: [],
    pages,
  });
}
