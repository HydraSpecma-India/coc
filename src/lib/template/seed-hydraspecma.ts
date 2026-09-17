import { parseTemplate, type TemplateJson, type TemplateElement, type TextStyle } from "./schema";

/**
 * Seed template for the HydraSpecma COC-1070.0049 Rev.02 (7-page PDF).
 * Coordinates were measured from the reference PDF (points, top-left origin,
 * page 595.56 × 842.04). Every element is an ordinary template element that the
 * admin can move, restyle or delete in the designer – nothing here is special-cased.
 */
export function buildHydraSpecmaSeed(backgroundAssetId: string, pageCount: number): TemplateJson {
  const defaultStyle: TextStyle = {
    fontFamily: "Helvetica",
    fontSize: 10,
    bold: false,
    italic: false,
    underline: false,
    color: "#000000",
    align: "left",
    valign: "middle",
    lineHeight: 1.2,
    letterSpacing: 0,
    padding: 1,
    wrap: true,
    overflow: "shrink",
  };

  const field = (
    id: string,
    fieldName: string,
    x: number,
    y: number,
    width: number,
    height: number,
    extra: Record<string, unknown> = {}
  ): TemplateElement =>
    ({
      id,
      type: "field",
      fieldName,
      x,
      y,
      width,
      height,
      binding: {},
      ...extra,
      style: { ...defaultStyle, ...((extra.style as Partial<TextStyle>) || {}) },
    }) as TemplateElement;

  const text = (
    id: string,
    content: string,
    x: number,
    y: number,
    width: number,
    height: number,
    extra: Record<string, unknown> = {}
  ): TemplateElement =>
    ({
      id,
      type: "text",
      text: content,
      x,
      y,
      width,
      height,
      ...extra,
      style: { ...defaultStyle, ...((extra.style as Partial<TextStyle>) || {}) },
    }) as TemplateElement;

  const line = (
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
    strokeWidth = 0.75,
    color = "#000000"
  ): TemplateElement =>
    ({ id, type: "line", x, y, width, height, stroke: { color, width: strokeWidth } }) as TemplateElement;

  const serialNo = (page: number, x: number, y: number, width = 120) =>
    field(`p${page}-serial`, "TopLevelSerialNumber", x, y, width, 13, { name: "Serial no." });

  const pages: TemplateJson["pages"] = [];

  // ── Page 1: the certificate ────────────────────────────────────────────────
  pages.push({
    id: "page-1",
    name: "Certificate",
    background: { assetId: backgroundAssetId, pageIndex: 0, opacity: 1 },
    elements: [
      // Certificate Title & Header Text Elements (Fully Editable)
      text("p1-title", "CERTIFICATE OF CONFORMITY", 160, 153, 275, 20, {
        style: { fontFamily: "Helvetica", fontSize: 13, bold: true, align: "center" },
      }),
      text("p1-doc-type", "Document Type: Certificate Of Conformity", 56, 60, 200, 14, {
        style: { fontFamily: "Helvetica", fontSize: 8, bold: true },
      }),
      text("p1-product", "Product: Baseframe Module", 56, 84, 200, 14, {
        style: { fontFamily: "Helvetica", fontSize: 8 },
      }),
      text("p1-part-no", "Part number: COC-1070.0049", 258, 60, 120, 14, {
        style: { fontFamily: "Helvetica", fontSize: 8 },
      }),
      text("p1-spec-title", "Customer Technical Purchase Specification No. and Revision", 58, 188, 340, 24, {
        style: { fontFamily: "Helvetica", fontSize: 9, bold: true },
      }),
      text("p1-spec-1", "0068-7211 - Latest version", 410, 180, 130, 14, {
        style: { fontFamily: "Helvetica", fontSize: 8 },
      }),
      text("p1-spec-2", "0069-2093 - Latest version", 410, 198, 130, 14, {
        style: { fontFamily: "Helvetica", fontSize: 8 },
      }),
      text(
        "p1-decl-statement",
        "HydraSpecma Renewables hereby declare these products have been inspected, tested and, unless otherwise is stated below, conform to purchase order and specifications from Customer.",
        58,
        233,
        480,
        26,
        { style: { fontFamily: "Helvetica", fontSize: 8, bold: true } }
      ),

      // Table Header Text Elements
      text("p1-th-hsre", "HSRE part no.", 60, 268, 140, 12, {
        style: { fontFamily: "Helvetica", fontSize: 8, bold: true },
      }),
      text("p1-th-cust", "Customer part no.", 230, 268, 140, 12, {
        style: { fontFamily: "Helvetica", fontSize: 8, bold: true },
      }),
      text("p1-th-desc", "Description", 395, 268, 140, 12, {
        style: { fontFamily: "Helvetica", fontSize: 8, bold: true },
      }),

      // Labels for Order Details
      text("p1-lbl-delivery-date", "Production order delivery date:", 60, 317, 200, 14, {
        style: { fontFamily: "Helvetica", fontSize: 9, bold: true },
      }),
      text("p1-lbl-qty", "Quantity / Unit:", 60, 338, 200, 14, {
        style: { fontFamily: "Helvetica", fontSize: 9, bold: true },
      }),
      text("p1-lbl-custpo", "Customer Purchase order:", 60, 358, 200, 14, {
        style: { fontFamily: "Helvetica", fontSize: 9, bold: true },
      }),
      text("p1-lbl-topserial", "Top level Serial number:", 60, 379, 200, 14, {
        style: { fontFamily: "Helvetica", fontSize: 9, bold: true },
      }),
      text("p1-lbl-mfgorder", "Manufacturing Order number:", 60, 399, 200, 14, {
        style: { fontFamily: "Helvetica", fontSize: 9, bold: true },
      }),

      // Dynamic Fields
      serialNo(1, 416, 110, 135),
      field("p1-hsre-part", "HSREPartNumber", 60, 282, 150, 14, { name: "HSRE part no." }),
      field("p1-cust-part", "CustomerPartNumber", 230, 282, 150, 14, { name: "Customer part no." }),
      field("p1-desc", "ItemDescription", 395, 282, 155, 14, { name: "Description" }),
      field("p1-delivery-date", "DeliveryDate", 374, 317, 176, 14, { name: "Production order delivery date" }),
      field("p1-qty", "Quantity", 374, 338, 176, 14, { name: "Quantity / Unit" }),
      field("p1-customer-po", "CustomerPO", 374, 358, 176, 15, { name: "Customer Purchase order" }),
      field("p1-top-serial", "TopLevelSerialNumber", 430, 379, 120, 14, { name: "Top level Serial number", binding: { required: true } }),
      field("p1-prod-order", "ProductionOrder", 374, 399, 176, 14, { name: "Manufacturing Order number", binding: { readOnly: true } }),
      field("p1-date", "COCDate", 70, 705, 220, 22, { name: "Date of Signature", binding: { format: "yyyy-MM-dd" } }),
      { id: "p1-signature", type: "signature", fieldName: "Signature", x: 320, y: 700, width: 220, height: 30, name: "Signature", binding: { required: true } } as TemplateElement,

      // Structural Certificate Lines (Movable, Restylable, Editable)
      line("p1-line-header-top", 55, 56, 485, 0, 0.75),
      line("p1-line-header-mid", 55, 125, 485, 0, 0.75),
      line("p1-line-cert-top", 55, 145, 485, 0, 0.75),
      line("p1-line-cert-bot", 55, 175, 485, 0, 0.75),
      line("p1-line-spec-mid", 55, 222, 485, 0, 0.75),
      line("p1-line-tbl-top", 55, 265, 485, 0, 0.75),
      line("p1-line-tbl-mid", 55, 280, 485, 0, 0.75),
      line("p1-line-tbl-bot", 55, 305, 485, 0, 0.75),
      line("p1-line-section-end", 55, 445, 485, 0, 0.75),
      line("p1-line-sign-box", 55, 735, 485, 0, 0.75),
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
