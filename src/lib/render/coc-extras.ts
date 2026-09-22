import { PDFDocument, PDFFont, PDFPage, StandardFonts, degrees, rgb } from "pdf-lib";
import { ensureFallbackFont } from "@/lib/render/cjk-font";
import type { AttachmentUpload, MeasurementEntry } from "@/lib/coc-inputs/types";

/**
 * Appends the manual "pages 2+" data and captured supplier documents to a COC PDF:
 *   1. Measurement data sheet(s) – one table per admin-defined section, for every
 *      field that is not already placed on the template by the designer.
 *   2. Attachments – photos become full A4 pages, PDFs are merged page by page.
 * Every appended page gets a header with COC / production order / serial number and
 * a running page footer so the pages can be traced if printed separately.
 */

export interface ExtrasContext {
  cocNumber: string;
  productionOrder?: string;
  itemNumber?: string;
  serialNumber?: string;
  isDraft?: boolean;
  measurements?: MeasurementEntry[];
  attachments?: AttachmentUpload[];
}

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 40;
const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.39, 0.45, 0.55);
const LINE = rgb(0.8, 0.83, 0.87);
const HEAD_FILL = rgb(0.95, 0.96, 0.97);
const BRAND = rgb(0.88, 0.66, 0);
const OK = rgb(0.02, 0.47, 0.34);
const NOK = rgb(0.75, 0.1, 0.1);

type Fonts = { regular: PDFFont; bold: PDFFont };

const REPLACEMENTS: Record<string, string> = {
  "≥": ">=", "≤": "<=", "≠": "!=", "≈": "~", "→": "->", "←": "<-", "✓": "OK", "✔": "OK", "✗": "X", "✘": "X",
  " ": " ", " ": " ", " ": " ", "\t": " ",
};

/** Standard 14 fonts use WinAnsi encoding – replace anything they cannot draw. */
export function makeFontSafe(font: PDFFont) {
  const cache = new Map<string, boolean>();
  return (text: string): string => {
    let out = "";
    for (const ch of String(text ?? "").replace(/\r?\n/g, " ")) {
      const r = REPLACEMENTS[ch];
      if (r !== undefined) {
        out += r;
        continue;
      }
      let ok = cache.get(ch);
      if (ok === undefined) {
        try {
          font.widthOfTextAtSize(ch, 10);
          ok = true;
        } catch {
          ok = false;
        }
        cache.set(ch, ok);
      }
      out += ok ? ch : "?";
    }
    return out;
  };
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const tryLine = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(tryLine, size) <= maxWidth) {
      cur = tryLine;
    } else {
      if (cur) lines.push(cur);
      // hard-break very long words
      let word = w;
      while (font.widthOfTextAtSize(word, size) > maxWidth && word.length > 1) {
        let cut = word.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(word.slice(0, cut), size) > maxWidth) cut--;
        lines.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawHeader(page: PDFPage, fonts: Fonts, safe: (s: string) => string, ctx: ExtrasContext, title: string, subtitle?: string): number {
  const { width, height } = page.getSize();
  let y = height - MARGIN;
  page.drawRectangle({ x: MARGIN, y: y - 3, width: 4, height: 18, color: BRAND });
  page.drawText(safe(title), { x: MARGIN + 10, y, size: 13, font: fonts.bold, color: INK, maxWidth: width - 2 * MARGIN - 10 });
  y -= 16;
  const meta = [
    `COC: ${ctx.cocNumber}`,
    ctx.productionOrder ? `Production order: ${ctx.productionOrder}` : "",
    ctx.itemNumber ? `Item: ${ctx.itemNumber}` : "",
    ctx.serialNumber ? `Serial no: ${ctx.serialNumber}` : "",
  ].filter(Boolean).join("   |   ");
  page.drawText(safe(meta), { x: MARGIN + 10, y, size: 8, font: fonts.regular, color: MUTED });
  if (subtitle) {
    y -= 12;
    page.drawText(safe(subtitle), { x: MARGIN + 10, y, size: 8.5, font: fonts.regular, color: INK, maxWidth: width - 2 * MARGIN - 10 });
  }
  y -= 10;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: width - MARGIN, y }, thickness: 0.8, color: LINE });
  return y - 12;
}

function drawDraftMark(page: PDFPage, fonts: Fonts) {
  page.drawText("DRAFT / PREVIEW", { x: 100, y: 280, size: 60, font: fonts.bold, color: rgb(0.88, 0.88, 0.88), rotate: degrees(45), opacity: 0.35 });
}

/* ───────────────────────── measurement sheets ───────────────────────── */

const COLS = [
  { key: "no", title: "#", w: 22 },
  { key: "label", title: "Parameter", w: 170 },
  { key: "spec", title: "Specification", w: 110 },
  { key: "value", title: "Measured / value", w: 110 },
  { key: "result", title: "Result", w: 50 },
  { key: "src", title: "Src", w: 53.28 },
] as const;

function appendMeasurementSheets(pdf: PDFDocument, fonts: Fonts, ctx: ExtrasContext, placed: Set<string>): PDFPage[] {
  const entries = (ctx.measurements ?? []).filter((m) => m.printSheet !== false && !placed.has(m.key.toLowerCase()));
  if (!entries.length) return [];
  const safe = makeFontSafe(fonts.regular);
  const pages: PDFPage[] = [];

  // group by section (keep order of appearance)
  const groups = new Map<string, { title: string; pageNumber?: number | null; items: MeasurementEntry[] }>();
  for (const e of entries) {
    const g = groups.get(e.sectionId) ?? { title: e.sectionTitle, pageNumber: e.pageNumber, items: [] };
    g.items.push(e);
    groups.set(e.sectionId, g);
  }

  const size = 8.5;
  const lineH = 11;
  const tableW = COLS.reduce((n, c) => n + c.w, 0);

  for (const g of groups.values()) {
    let page = pdf.addPage(A4);
    pages.push(page);
    const subtitle = g.pageNumber ? `Data recorded for template page ${g.pageNumber}` : "Recorded values";
    let y = drawHeader(page, fonts, safe, ctx, `Measurement data sheet – ${g.title}`, subtitle);

    const drawHeadRow = () => {
      const h = 18;
      page.drawRectangle({ x: MARGIN, y: y - h, width: tableW, height: h, color: HEAD_FILL, borderColor: LINE, borderWidth: 0.6 });
      let x = MARGIN;
      for (const c of COLS) {
        page.drawText(c.title, { x: x + 4, y: y - 12, size: 8, font: fonts.bold, color: INK });
        x += c.w;
      }
      y -= h;
    };
    drawHeadRow();

    g.items.forEach((m, idx) => {
      const spec = m.nominal || (m.min != null && m.max != null ? `${m.min} - ${m.max}` : m.min != null ? `>= ${m.min}` : m.max != null ? `<= ${m.max}` : "");
      const specText = spec ? `${spec}${m.unit && !spec.includes(m.unit) ? ` ${m.unit}` : ""}` : "";
      const valueText = m.printed ? m.printed : m.value ? `${m.value}${m.unit && m.type === "number" ? ` ${m.unit}` : ""}` : "-";
      const cells: Record<string, string[]> = {
        no: [String(idx + 1)],
        label: wrap(safe(m.label), fonts.regular, size, COLS[1].w - 8),
        spec: wrap(safe(specText), fonts.regular, size, COLS[2].w - 8),
        value: wrap(safe(valueText), fonts.bold, size, COLS[3].w - 8),
        result: [m.status || ""],
        src: [m.source === "qr" ? "QR" : "Manual"],
      };
      const rows = Math.max(...Object.values(cells).map((l) => l.length));
      const h = Math.max(18, rows * lineH + 7);
      if (y - h < MARGIN + 30) {
        page = pdf.addPage(A4);
        pages.push(page);
        y = drawHeader(page, fonts, safe, ctx, `Measurement data sheet – ${g.title} (cont.)`, subtitle);
        drawHeadRow();
      }
      if (m.status === "NOK") page.drawRectangle({ x: MARGIN, y: y - h, width: tableW, height: h, color: rgb(1, 0.95, 0.95) });
      let x = MARGIN;
      for (const c of COLS) {
        page.drawRectangle({ x, y: y - h, width: c.w, height: h, borderColor: LINE, borderWidth: 0.6 });
        const lines = cells[c.key];
        lines.forEach((ln, li) => {
          const isResult = c.key === "result";
          page.drawText(ln, {
            x: x + 4,
            y: y - 12 - li * lineH,
            size,
            font: c.key === "value" || isResult ? fonts.bold : fonts.regular,
            color: isResult ? (ln === "OK" ? OK : ln === "NOK" ? NOK : INK) : c.key === "src" || c.key === "no" ? MUTED : INK,
          });
        });
        x += c.w;
      }
      y -= h;
    });

    const nok = g.items.filter((m) => m.status === "NOK").length;
    y -= 16;
    if (y > MARGIN + 20) {
      page.drawText(
        safe(nok ? `${nok} value(s) outside the specified tolerance.` : "All recorded values are within the specified limits where limits are defined."),
        { x: MARGIN, y, size: 8.5, font: fonts.bold, color: nok ? NOK : OK },
      );
    }
  }
  return pages;
}

/* ───────────────────────── unplaced values on their own page ───────────────────────── */

function stampUnplacedOnPages(pdf: PDFDocument, fonts: Fonts, ctx: ExtrasContext, placed: Set<string>) {
  const pageCount = pdf.getPageCount();
  const byPage = new Map<number, MeasurementEntry[]>();
  for (const m of ctx.measurements ?? []) {
    if (m.printSheet || m.type === "photo" || !m.value || placed.has(m.key.toLowerCase())) continue;
    const pg = m.pageNumber ?? 0;
    if (pg < 2 || pg > pageCount) continue;
    byPage.set(pg, [...(byPage.get(pg) ?? []), m]);
  }
  const safe = makeFontSafe(fonts.regular);
  const size = 7.5;
  const lineH = 9.5;
  for (const [pg, items] of byPage) {
    const page = pdf.getPage(pg - 1);
    const { width } = page.getSize();
    const boxW = width - 2 * MARGIN;
    const colW = boxW / 2;
    const rows = Math.ceil(items.length / 2);
    const boxH = rows * lineH + 16;
    const y0 = 50; // just above the page footer
    page.drawRectangle({ x: MARGIN, y: y0, width: boxW, height: boxH, color: rgb(1, 1, 1), borderColor: LINE, borderWidth: 0.6, opacity: 0.95 });
    page.drawText("Recorded values", { x: MARGIN + 4, y: y0 + boxH - 10, size: 7, font: fonts.bold, color: MUTED });
    items.forEach((m, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const label = safe(`${m.label}: `);
      const val = safe(`${m.printed || `${m.value}${m.unit && m.type === "number" ? ` ${m.unit}` : ""}`}${m.status ? ` (${m.status})` : ""}`);
      const x = MARGIN + 4 + col * colW;
      const y = y0 + boxH - 22 - row * lineH;
      let lab = label;
      const valW = fonts.bold.widthOfTextAtSize(val, size);
      while (lab.length > 4 && fonts.regular.widthOfTextAtSize(lab, size) + valW > colW - 10) lab = lab.slice(0, -4) + "…: ";
      page.drawText(lab, { x, y, size, font: fonts.regular, color: INK });
      page.drawText(val, { x: x + fonts.regular.widthOfTextAtSize(lab, size), y, size, font: fonts.bold, color: m.status === "NOK" ? NOK : rgb(0.04, 0.24, 0.57) });
    });
  }
}

/* ───────────────────────── attachments ───────────────────────── */

async function appendOneAttachment(
  pdf: PDFDocument,
  fonts: Fonts,
  ctx: ExtrasContext,
  att: AttachmentUpload,
  index: number,
  total: number,
): Promise<PDFPage[]> {
  const safe = makeFontSafe(fonts.regular);
  const bytes = Buffer.from(att.dataBase64, "base64");
  const label = `Attachment ${index + 1} of ${total}${att.caption ? ` – ${att.caption}` : ""}`;

  if (att.mimeType === "application/pdf") {
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const count = Math.min(src.getPageCount(), 60);
    const copied = await pdf.copyPages(src, Array.from({ length: count }, (_, i) => i));
    const pages: PDFPage[] = [];
    copied.forEach((p, i) => {
      pdf.addPage(p);
      pages.push(p);
      const { width } = p.getSize();
      const tag = safe(`${label} (${att.name}) · page ${i + 1}/${count} · ${ctx.cocNumber}${ctx.serialNumber ? ` · SN ${ctx.serialNumber}` : ""}`);
      const tw = Math.min(width - 20, fonts.regular.widthOfTextAtSize(tag, 7) + 8);
      p.drawRectangle({ x: 10, y: 6, width: tw, height: 11, color: rgb(1, 1, 1), opacity: 0.85 });
      p.drawText(tag, { x: 14, y: 9, size: 7, font: fonts.regular, color: MUTED, maxWidth: width - 28 });
    });
    return pages;
  }

  const img = att.mimeType === "image/png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  const landscape = img.width > img.height * 1.15;
  const page = pdf.addPage(landscape ? [A4[1], A4[0]] : A4);
  const { width } = page.getSize();
  const top = drawHeader(page, fonts, safe, ctx, label, att.name);
  const boxW = width - 2 * MARGIN;
  const boxH = top - MARGIN - 14;
  const scale = Math.min(boxW / img.width, boxH / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  const x = MARGIN + (boxW - w) / 2;
  const y = MARGIN + 14 + (boxH - h) / 2;
  page.drawRectangle({ x: x - 1, y: y - 1, width: w + 2, height: h + 2, borderColor: LINE, borderWidth: 0.6 });
  page.drawImage(img, { x, y, width: w, height: h });
  return [page];
}

/** Collect every field name the designer placed anywhere on the template (lower-case). */
export function placedFieldNames(templateJson: unknown): Set<string> {
  const set = new Set<string>();
  const pages = (templateJson as { pages?: Array<{ elements?: Array<{ fieldName?: string; rows?: Array<Array<{ fieldName?: string }>> }> }> })?.pages;
  if (!Array.isArray(pages)) return set;
  for (const p of pages)
    for (const el of p.elements ?? []) {
      if (el.fieldName) set.add(el.fieldName.toLowerCase());
      for (const row of el.rows ?? []) for (const c of row) if (c.fieldName) set.add(c.fieldName.toLowerCase());
    }
  return set;
}

/** Append measurement sheets and attachments to an in-progress COC document. */
export async function appendCocExtras(pdf: PDFDocument, ctx: ExtrasContext, templateJson?: unknown): Promise<void> {
  const placed = placedFieldNames(templateJson);
  const hasMeasurements = (ctx.measurements ?? []).length > 0;
  // Photo fields placed in the designer are drawn on their page – everything else is appended
  const atts = (ctx.attachments ?? []).filter((a) => !a.fieldKey || !placed.has(a.fieldKey.toLowerCase()));
  if (!hasMeasurements && !atts.length) return;

  const fonts: Fonts = { regular: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold) };
  await ensureFallbackFont(pdf, { ...ctx, attachments: atts.map((a) => ({ name: a.name, caption: a.caption })) });
  const appended: PDFPage[] = [];

  // Fields that were not placed in the designer are stamped on their own template page
  // (sections with "print data sheet" off – the default), so no extra pages are created.
  stampUnplacedOnPages(pdf, fonts, ctx, placed);
  appended.push(...appendMeasurementSheets(pdf, fonts, ctx, placed));

  for (let i = 0; i < atts.length; i++) {
    try {
      appended.push(...(await appendOneAttachment(pdf, fonts, ctx, atts[i], i, atts.length)));
    } catch (e) {
      // A corrupt attachment must not block the certificate – record a placeholder page instead.
      const safe = makeFontSafe(fonts.regular);
      const page = pdf.addPage(A4);
      const y = drawHeader(page, fonts, safe, ctx, `Attachment ${i + 1} of ${atts.length}`, atts[i].name);
      page.drawText(safe(`This attachment could not be merged: ${(e as Error).message}`), { x: MARGIN, y, size: 9, font: fonts.regular, color: NOK, maxWidth: A4[0] - 2 * MARGIN });
      appended.push(page);
    }
  }

  const total = pdf.getPageCount();
  const safe = makeFontSafe(fonts.regular);
  for (const p of appended) {
    if (ctx.isDraft) drawDraftMark(p, fonts);
    const idx = pdf.getPages().indexOf(p);
    const { width } = p.getSize();
    const footer = safe(`${ctx.cocNumber} · Page ${idx + 1} of ${total}`);
    p.drawText(footer, { x: width - MARGIN - fonts.regular.widthOfTextAtSize(footer, 7), y: 18, size: 7, font: fonts.regular, color: MUTED });
  }
}

/** Build a standalone PDF for one attachment (used to store each captured document separately). */
export async function attachmentToPdf(att: AttachmentUpload, ctx: ExtrasContext, index: number, total: number): Promise<{ bytes: Uint8Array; pageCount: number }> {
  if (att.mimeType === "application/pdf") {
    const bytes = Buffer.from(att.dataBase64, "base64");
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return { bytes: new Uint8Array(bytes), pageCount: doc.getPageCount() };
  }
  const pdf = await PDFDocument.create();
  const fonts: Fonts = { regular: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold) };
  await ensureFallbackFont(pdf, [att.name, att.caption, ctx.cocNumber, ctx.serialNumber, ctx.productionOrder, ctx.itemNumber]);
  const pages = await appendOneAttachment(pdf, fonts, ctx, att, index, total);
  return { bytes: await pdf.save(), pageCount: pages.length };
}
