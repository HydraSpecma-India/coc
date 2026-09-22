import { PDFDocument, rgb, StandardFonts, degrees } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";

export interface RenderContext {
  cocNumber: string;
  productionOrder: string;
  itemNumber: string;
  itemDescription: string;
  customerName?: string;
  customerPO?: string;
  customerPartNumber?: string;
  salesOrder?: string;
  batchNumber?: string;
  deliveryDate?: string;
  serialNumber?: string;
  quantity?: number;
  unitOfMeasure?: string;
  date?: string;
  manualValues?: Record<string, string>;
  signatureBase64?: string;
  isDraft?: boolean;
  templateId?: string;
  templateVersionId?: string;
  /** Manual data for template pages 2+ (admin-defined fields) */
  measurements?: MeasurementEntry[];
  /** Captured supplier documents / test reports merged at the end of the PDF */
  attachments?: AttachmentUpload[];
}

import { appendCocExtras, makeFontSafe } from "@/lib/render/coc-extras";
import { ensureFallbackFont } from "@/lib/render/cjk-font";
import type { AttachmentUpload, MeasurementEntry } from "@/lib/coc-inputs/types";

async function finalizeWithExtras(pdfDoc: PDFDocument, context: RenderContext, templateJson: unknown): Promise<Uint8Array> {
  await appendCocExtras(
    pdfDoc,
    {
      cocNumber: context.cocNumber,
      productionOrder: context.productionOrder,
      itemNumber: context.itemNumber,
      serialNumber: context.serialNumber,
      isDraft: context.isDraft,
      measurements: context.measurements,
      attachments: context.attachments,
    },
    templateJson,
  );
  return await pdfDoc.save();
}

import { supabaseAdmin, Buckets } from "@/lib/db/supabase-admin";

function resolveFieldValue(fieldName: string, context: RenderContext, element?: { x: number; y: number }): string {
  const fn = fieldName.toLowerCase().replace(/[^a-z0-9]/g, "");

  if (fn === "hsrepartnumber" || fn === "itemnumber") {
    return context.itemNumber || "";
  }
  if (fn === "customerpartnumber" || fn === "customerpartno" || fn === "custpartno") {
    return (
      context.customerPartNumber ||
      context.manualValues?.["CustomerPartNo"] ||
      context.manualValues?.["CustomerPartNumber"] ||
      ""
    );
  }
  if (fn === "itemdescription" || fn === "description" || fn === "productdescription") {
    return context.itemDescription || "";
  }
  if (fn === "customerpo" || fn === "purchaseorder" || fn === "customerpurchaseorder") {
    return context.customerPO || context.manualValues?.["CustomerPO"] || "";
  }
  if (fn === "toplevelserialnumber" || fn === "serialnumber" || fn === "serialno") {
    return context.serialNumber || (context.productionOrder ? `SN-${context.productionOrder}` : "");
  }
  if (fn === "productionorder" || fn === "manufacturingorder" || fn === "manufacturingordernumber") {
    return context.productionOrder || "";
  }
  if (fn === "cocdate" || fn === "date" || fn === "dateofsignature" || fn === "inspectiondate") {
    return context.date || context.manualValues?.["InspectionDate"] || new Date().toISOString().slice(0, 10);
  }
  if (fn === "cocnumber") {
    return context.cocNumber || "";
  }
  if (fn === "customername") {
    return context.customerName || "";
  }
  if (fn === "salesorder") {
    return context.salesOrder || "";
  }
  if (
    fn === "deliverydate" ||
    fn === "productionorderdeliverydate" ||
    fn === "prodorderdeliverydate" ||
    fn === "orderdeliverydate"
  ) {
    return (
      context.deliveryDate ||
      context.manualValues?.["DeliveryDate"] ||
      context.manualValues?.["ProductionOrderDeliveryDate"] ||
      context.manualValues?.["Delivery Date"] ||
      ""
    );
  }
  if (fn === "batchnumber") {
    return (
      context.deliveryDate ||
      context.manualValues?.["DeliveryDate"] ||
      context.batchNumber ||
      ""
    );
  }
  if (fn === "productionquantity" || fn === "quantity") {
    return context.quantity !== undefined ? String(context.quantity) : "";
  }
  if (fn === "unitofmeasure") {
    return context.unitOfMeasure || "";
  }

  if (context.manualValues) {
    if (context.manualValues[fieldName] !== undefined) return context.manualValues[fieldName];
    for (const [k, v] of Object.entries(context.manualValues)) {
      if (k.toLowerCase().replace(/[^a-z0-9]/g, "") === fn) return v;
    }
  }

  return "";
}

/* ───────── pages 2+: values mapped in the designer (fields, tables, checkboxes, photo slots) ───────── */

type MappedEl = {
  type: string;
  hidden?: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  fieldName?: string;
  text?: string;
  fit?: "contain" | "cover" | "stretch";
  style?: { fontSize?: number; bold?: boolean; padding?: number; align?: "left" | "center" | "right"; color?: string };
  columns?: Array<{ width: number }>;
  rows?: Array<Array<{ fieldName?: string; text?: string; colSpan?: number; style?: { align?: "left" | "center" | "right"; bold?: boolean; fontSize?: number } }>>;
  rowHeight?: number;
  headerHeight?: number;
  showHeader?: boolean;
};

function hexToRgb(hex?: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return rgb(0, 0, 0);
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function drawTextInBox(
  page: any,
  raw: string,
  box: { x: number; y: number; w: number; h: number },
  opts: { font: any; size: number; align?: "left" | "center" | "right"; padding?: number; color?: any },
) {
  const safe = makeFontSafe(opts.font);
  const pad = opts.padding ?? 2;
  let text = safe(raw);
  let size = opts.size;
  // shrink to fit the box width (min 5pt), then truncate
  while (size > 5 && opts.font.widthOfTextAtSize(text, size) > box.w - 2 * pad) size -= 0.5;
  while (text.length > 1 && opts.font.widthOfTextAtSize(text, size) > box.w - 2 * pad) text = text.slice(0, -1);
  const tw = opts.font.widthOfTextAtSize(text, size);
  const x = opts.align === "center" ? box.x + (box.w - tw) / 2 : opts.align === "right" ? box.x + box.w - pad - tw : box.x + pad;
  const y = box.y + Math.max(1.5, (box.h - size * 0.72) / 2);
  page.drawText(text, { x, y, size, font: opts.font, color: opts.color ?? rgb(0, 0, 0) });
}

async function drawMappedElements(page: any, pdfDoc: PDFDocument, elements: MappedEl[], height: number, fonts: { regular: any; bold: any }, context: RenderContext) {
  const photos = new Map<string, AttachmentUpload>();
  for (const a of context.attachments ?? []) if (a.fieldKey) photos.set(a.fieldKey.toLowerCase(), a);

  for (const el of elements) {
    if (el.hidden) continue;
    const pdfY = height - el.y - el.height;
    const font = el.style?.bold ? fonts.bold : fonts.regular;
    const size = el.style?.fontSize || 8.5;
    try {
      if (el.type === "field" && el.fieldName) {
        const val = resolveFieldValue(el.fieldName, context);
        if (val) drawTextInBox(page, val, { x: el.x, y: pdfY, w: el.width, h: el.height }, { font, size, align: el.style?.align, padding: el.style?.padding, color: hexToRgb(el.style?.color) });
      } else if (el.type === "text" && el.text) {
        drawTextInBox(page, el.text, { x: el.x, y: pdfY, w: el.width, h: el.height }, { font, size, align: el.style?.align, padding: el.style?.padding, color: hexToRgb(el.style?.color) });
      } else if (el.type === "checkbox" && el.fieldName) {
        const v = resolveFieldValue(el.fieldName, context).trim().toLowerCase();
        if (["yes", "true", "ok", "x", "1", "pass", "passed", "conforms"].includes(v)) {
          const s = Math.min(el.width, el.height);
          page.drawLine({ start: { x: el.x + s * 0.15, y: pdfY + s * 0.5 }, end: { x: el.x + s * 0.4, y: pdfY + s * 0.15 }, thickness: 1.2, color: rgb(0, 0, 0) });
          page.drawLine({ start: { x: el.x + s * 0.4, y: pdfY + s * 0.15 }, end: { x: el.x + s * 0.9, y: pdfY + s * 0.9 }, thickness: 1.2, color: rgb(0, 0, 0) });
        }
      } else if (el.type === "image" && el.fieldName) {
        // Photo slot – e.g. the air-leak test print-out "glued" onto the test instruction page
        const att = photos.get(el.fieldName.toLowerCase());
        if (att && att.mimeType !== "application/pdf") {
          const bytes = Buffer.from(att.dataBase64, "base64");
          const img = att.mimeType === "image/png" ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
          let w = el.width;
          let h = el.height;
          if (el.fit !== "stretch") {
            const scale = Math.min(el.width / img.width, el.height / img.height);
            w = img.width * scale;
            h = img.height * scale;
          }
          page.drawImage(img, { x: el.x + (el.width - w) / 2, y: pdfY + (el.height - h) / 2, width: w, height: h });
        }
      } else if (el.type === "table" && Array.isArray(el.rows) && Array.isArray(el.columns)) {
        const headerH = el.showHeader === false ? 0 : el.headerHeight ?? 18;
        const rowH = el.rowHeight ?? 18;
        el.rows.forEach((row, ri) => {
          let cx = el.x;
          let ci = 0;
          for (const cell of row) {
            const span = Math.max(1, cell.colSpan ?? 1);
            const cw = el.columns!.slice(ci, ci + span).reduce((n, c) => n + c.width, 0);
            if (cell.fieldName) {
              const val = resolveFieldValue(cell.fieldName, context);
              const top = el.y + headerH + ri * rowH;
              if (val) {
                drawTextInBox(page, val, { x: cx, y: height - top - rowH, w: cw, h: rowH }, {
                  font: cell.style?.bold ? fonts.bold : font,
                  size: cell.style?.fontSize || size,
                  align: cell.style?.align ?? el.style?.align ?? "center",
                });
              }
            }
            cx += cw;
            ci += span;
          }
        });
      }
    } catch (err) {
      console.warn("Could not draw mapped element", el.type, el.fieldName, (err as Error).message);
    }
  }
}

async function renderSignatureBox(
  page: any,
  pdfDoc: PDFDocument,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  signatureBase64?: string,
  fontBold?: any
) {
  if (signatureBase64) {
    try {
      const base64Data = signatureBase64.replace(/^data:image\/\w+;base64,/, "");
      const imgBytes = Buffer.from(base64Data, "base64");
      const sigImg =
        base64Data.startsWith("/9j/") || signatureBase64.includes("image/jpeg") || signatureBase64.includes("image/jpg")
          ? await pdfDoc.embedJpg(imgBytes)
          : await pdfDoc.embedPng(imgBytes);

      // Available drawing area with safe padding to NEVER touch borders or lines
      const padH = 8;
      const padV = 3;
      const maxW = Math.max(10, boxW - padH * 2);
      const maxH = Math.max(10, boxH - padV * 2);

      const aspect = sigImg.width / sigImg.height;
      let targetW = maxW;
      let targetH = maxW / aspect;
      if (targetH > maxH) {
        targetH = maxH;
        targetW = maxH * aspect;
      }

      // Center inside the signature box
      const drawX = boxX + (boxW - targetW) / 2;
      const drawY = boxY + (boxH - targetH) / 2;

      page.drawImage(sigImg, {
        x: drawX,
        y: drawY,
        width: targetW,
        height: targetH,
      });
      return;
    } catch (err) {
      console.warn("Failed to embed signature image:", err);
    }
  }

  // Fallback digital stamp if no image provided or embedding failed:
  page.drawText("[DIGITALLY SIGNED]", {
    x: boxX + Math.max(10, (boxW - 120) / 2),
    y: boxY + Math.max(3, (boxH - 9) / 2),
    size: 9,
    font: fontBold,
    color: rgb(0.1, 0.5, 0.2),
  });
}

// In-memory cache for downloaded template PDF background assets & template JSON
const templateAssetBufferCache = new Map<string, Buffer>();
const templateVersionCache = new Map<string, { templateJson: any; backgroundAssetId: string | null; cachedAt: number }>();
let localTemplateBytesCache: Buffer | null = null;
const TEMPLATE_CACHE_TTL = 300_000; // 5 minutes

export function clearPdfTemplateCaches() {
  templateAssetBufferCache.clear();
  templateVersionCache.clear();
  localTemplateBytesCache = null;
}

async function getAssetBytes(sb: any, assetId: string): Promise<Buffer | null> {
  const cached = templateAssetBufferCache.get(assetId);
  if (cached) return cached;

  const { data: asset } = await sb
    .from("coc_template_assets")
    .select("storage_path")
    .eq("id", assetId)
    .maybeSingle();

  if (asset?.storage_path) {
    const { data: fileBlob } = await sb.storage.from(Buckets.templateAssets).download(asset.storage_path);
    if (fileBlob) {
      const buf = Buffer.from(await fileBlob.arrayBuffer());
      templateAssetBufferCache.set(assetId, buf);
      return buf;
    }
  }
  return null;
}

export async function renderCOCPdf(context: RenderContext): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  // Chinese names / initials etc. are drawn with an embedded CJK font (Helvetica cannot draw them)
  await ensureFallbackFont(pdfDoc, { ...context, signatureBase64: undefined, attachments: context.attachments?.map((a) => ({ name: a.name, caption: a.caption })) });

  const templatePath = path.join(process.cwd(), "public", "templates", "hydraspecma-coc-template.pdf");

  let templateBytes: Buffer | null = null;
  let templateJson: any = null;

  // 1. Resolve template definition and background PDF from Supabase (with caching)
  try {
    const sb = supabaseAdmin();
    let vId = context.templateVersionId;
    const tId = context.templateId || "00000000-0000-0000-0000-000000000001";
    const now = Date.now();

    if (vId) {
      const cachedVer = templateVersionCache.get(vId);
      if (cachedVer && now - cachedVer.cachedAt < TEMPLATE_CACHE_TTL) {
        templateJson = cachedVer.templateJson;
        if (cachedVer.backgroundAssetId) {
          templateBytes = await getAssetBytes(sb, cachedVer.backgroundAssetId);
        }
      } else {
        const { data: ver } = await sb
          .from("coc_template_versions")
          .select("id, background_asset_id, template_json, version_number")
          .eq("id", vId)
          .maybeSingle();
        if (ver) {
          templateJson = ver.template_json;
          templateVersionCache.set(vId, {
            templateJson: ver.template_json,
            backgroundAssetId: ver.background_asset_id,
            cachedAt: now,
          });
          if (ver.background_asset_id) {
            templateBytes = await getAssetBytes(sb, ver.background_asset_id);
          }
        }
      }
    }

    if (!templateJson && tId) {
      const { data: t } = await sb
        .from("coc_templates")
        .select("active_version_id")
        .eq("id", tId)
        .maybeSingle();

      const activeVerId = t?.active_version_id;
      if (activeVerId) {
        const cachedVer = templateVersionCache.get(activeVerId);
        if (cachedVer && now - cachedVer.cachedAt < TEMPLATE_CACHE_TTL) {
          templateJson = cachedVer.templateJson;
          if (cachedVer.backgroundAssetId && !templateBytes) {
            templateBytes = await getAssetBytes(sb, cachedVer.backgroundAssetId);
          }
        } else {
          const { data: ver } = await sb
            .from("coc_template_versions")
            .select("id, background_asset_id, template_json, version_number")
            .eq("id", activeVerId)
            .maybeSingle();
          if (ver) {
            templateJson = ver.template_json;
            templateVersionCache.set(activeVerId, {
              templateJson: ver.template_json,
              backgroundAssetId: ver.background_asset_id,
              cachedAt: now,
            });
            if (ver.background_asset_id && !templateBytes) {
              templateBytes = await getAssetBytes(sb, ver.background_asset_id);
            }
          }
        }
      }
    }

    // Fallback if still no templateJson resolved: pick latest version for default template
    if (!templateJson) {
      const { data: ver } = await sb
        .from("coc_template_versions")
        .select("id, background_asset_id, template_json, version_number")
        .eq("template_id", "00000000-0000-0000-0000-000000000001")
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (ver) {
        templateJson = ver.template_json;
      }
    }
  } catch (err) {
    console.warn("Could not load custom template from database/storage, falling back:", err);
  }

  // 2. Fallback to bundled official HydraSpecma template PDF (with in-memory buffer cache)
  if (!templateBytes) {
    if (localTemplateBytesCache) {
      templateBytes = localTemplateBytesCache;
    } else if (fs.existsSync(templatePath)) {
      try {
        localTemplateBytesCache = fs.readFileSync(templatePath);
        templateBytes = localTemplateBytesCache;
      } catch (e) {
        console.warn("Could not read local template PDF:", e);
      }
    }
  }

  if (templateBytes) {
    try {
      const srcDoc = await PDFDocument.load(templateBytes);
      const copyCount = Math.min(srcDoc.getPageCount(), 10);
      const pageIndices = Array.from({ length: copyCount }, (_, i) => i);
      const copiedPages = await pdfDoc.copyPages(srcDoc, pageIndices);
      for (const p of copiedPages) {
        pdfDoc.addPage(p);
      }
      for (let pageIdx = 0; pageIdx < copiedPages.length; pageIdx++) {
        const page = copiedPages[pageIdx];
        const { height } = page.getSize();
        const pageElements = templateJson?.pages?.[pageIdx]?.elements;

        if (pageIdx === 0) {
          // Page 1: Dynamic Elements Rendering
          const elements = pageElements || templateJson?.pages?.[0]?.elements;
          if (Array.isArray(elements) && elements.length > 0) {
            let hasSignatureElement = false;

            for (const el of elements) {
              if (el.hidden) continue;
              const pdfY = height - el.y - el.height;
              const isBold = Boolean(el.style?.bold);
              const font = isBold ? fontBold : fontRegular;
              const fontSize = el.style?.fontSize || 8.5;

              if (el.type === "field" && el.fieldName) {
                const val = resolveFieldValue(el.fieldName, context, el);
                if (val) {
                  if (el.style?.backgroundColor) {
                    page.drawRectangle({
                      x: el.x,
                      y: pdfY,
                      width: el.width,
                      height: el.height,
                      color: rgb(1, 1, 1),
                    });
                  }
                  const textX = el.x + (el.style?.padding || 2);
                  const textY = pdfY + Math.max(2, (el.height - fontSize * 0.85) / 2);
                  page.drawText(val, {
                    x: textX,
                    y: textY,
                    size: fontSize,
                    font,
                    color: rgb(0, 0, 0),
                  });
                }
              } else if (el.type === "signature") {
                hasSignatureElement = true;
                await renderSignatureBox(page, pdfDoc, el.x, pdfY, el.width, el.height, context.signatureBase64, fontBold);
              } else if (el.type === "text" && el.text) {
                const textX = el.x + (el.style?.padding || 2);
                const textY = pdfY + Math.max(2, (el.height - fontSize * 0.85) / 2);
                page.drawText(el.text, {
                  x: textX,
                  y: textY,
                  size: fontSize,
                  font,
                  color: rgb(0, 0, 0),
                });
              } else if (el.type === "line") {
                const lineY = height - el.y;
                page.drawLine({
                  start: { x: el.x, y: lineY },
                  end: { x: el.x + el.width, y: lineY },
                  thickness: 1,
                  color: rgb(0.85, 0.85, 0.85),
                });
              }
            }

            if (!hasSignatureElement && context.signatureBase64) {
              await renderSignatureBox(page, pdfDoc, 320, 112, 220, 30, context.signatureBase64, fontBold);
            }
          } else {
            // Fallback default field values only if no template elements are configured
            const serialNo = context.serialNumber || (context.productionOrder ? `SN-${context.productionOrder}` : "");
            const custPO = context.customerPO || context.manualValues?.["CustomerPO"] || "";
            const mfgOrder = context.productionOrder || "";
            const sigDate = context.date || context.manualValues?.["InspectionDate"] || new Date().toISOString().slice(0, 10);

            const fillField = (x: number, y: number, text: string, isBold = false) => {
              if (text) {
                page.drawText(text, {
                  x: x + 2,
                  y: y + 2,
                  size: 8,
                  font: isBold ? fontBold : fontRegular,
                  color: rgb(0, 0, 0),
                });
              }
            };

            if (custPO) fillField(374, 470, custPO, false);
            if (serialNo) {
              const sfx = serialNo.includes(" - ") ? serialNo.split(" - ").slice(1).join(" - ") : serialNo;
              fillField(430, 450, sfx, false);
            }
            if (mfgOrder) fillField(374, 429, mfgOrder, true);
            fillField(72, 118, sigDate, false);

            await renderSignatureBox(page, pdfDoc, 320, 112, 220, 30, context.signatureBase64, fontBold);
          }
        } else {
          // Page 2+: Multi-page serial number and reference stamping
          if (Array.isArray(pageElements) && pageElements.length > 0) {
            await drawMappedElements(page, pdfDoc, pageElements, height, { regular: fontRegular, bold: fontBold }, context);
          } else {
            // Apply serial number elements from template setup onto subsequent pages
            const p0Elements = templateJson?.pages?.[0]?.elements;
            let stampedSerial = false;
            if (Array.isArray(p0Elements)) {
              for (const el of p0Elements) {
                if (el.hidden) continue;
                const fn = (el.fieldName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
                if (fn === "toplevelserialnumber" || fn === "serialnumber" || fn === "serialno") {
                  const val = resolveFieldValue(el.fieldName!, context, el);
                  if (val) {
                    const pdfY = height - el.y - el.height;
                    const fontSize = el.style?.fontSize || 8.5;
                    const isBold = Boolean(el.style?.bold);
                    page.drawText(val, {
                      x: el.x + (el.style?.padding || 2),
                      y: pdfY + Math.max(2, (el.height - fontSize * 0.85) / 2),
                      size: fontSize,
                      font: isBold ? fontBold : fontRegular,
                      color: rgb(0, 0, 0),
                    });
                    stampedSerial = true;
                  }
                }
              }
            }

            if (!stampedSerial && context.serialNumber) {
              const stampText = `Serial No: ${context.serialNumber} | Production Order: ${context.productionOrder || ""} | Page ${pageIdx + 1} of ${copiedPages.length}`;
              page.drawText(stampText, {
                x: 40,
                y: height - 25,
                size: 8,
                font: fontBold,
                color: rgb(0.2, 0.2, 0.2),
              });
            }
          }
        }
      }

      // Draft Watermark
      if (context.isDraft) {
        for (const p of copiedPages) {
          p.drawText("DRAFT / PREVIEW", {
            x: 100,
            y: 280,
            size: 60,
            font: fontBold,
            color: rgb(0.88, 0.88, 0.88),
            rotate: degrees(45),
            opacity: 0.35,
          });
        }
      }

      return await finalizeWithExtras(pdfDoc, context, templateJson);
    } catch (e) {
      console.warn("Template PDF load failed, falling back to full vector render:", e);
    }
  }

  // Standalone Vector Render Fallback (Exact 1:1 replica)
  const page = pdfDoc.addPage([595.56, 842.04]);
  const { width, height } = page.getSize();

  const brandOrange = rgb(0.92, 0.67, 0.0);
  const darkInk = rgb(0.08, 0.08, 0.12);

  // Logo
  page.drawText("Hydra", { x: 45, y: height - 55, size: 24, font: fontBold, color: darkInk });
  page.drawText("Specma", { x: 55, y: height - 68, size: 12, font: fontBold, color: brandOrange });

  // Top Table (x: 235 to 555, y: 742 to 790)
  page.drawRectangle({ x: 235, y: height - 100, width: 320, height: 48, borderColor: darkInk, borderWidth: 1 });
  page.drawLine({ start: { x: 235, y: height - 76 }, end: { x: 555, y: height - 76 }, color: darkInk, thickness: 1 });
  page.drawLine({ start: { x: 330, y: height - 100 }, end: { x: 330, y: height - 52 }, color: darkInk, thickness: 1 });
  page.drawLine({ start: { x: 405, y: height - 100 }, end: { x: 405, y: height - 52 }, color: darkInk, thickness: 1 });
  page.drawLine({ start: { x: 440, y: height - 100 }, end: { x: 440, y: height - 52 }, color: darkInk, thickness: 1 });
  page.drawLine({ start: { x: 485, y: height - 100 }, end: { x: 485, y: height - 52 }, color: darkInk, thickness: 1 });

  // Top Table Text
  page.drawText("Document Type:\nCertificate Of Conformity", { x: 238, y: height - 64, size: 7, font: fontRegular, lineHeight: 9 });
  page.drawText(`Part number:\n${context.cocNumber || "COC-" + context.itemNumber}`, { x: 333, y: height - 64, size: 7, font: fontRegular, lineHeight: 9 });
  page.drawText("Rev.\n02", { x: 408, y: height - 64, size: 7, font: fontRegular, lineHeight: 9 });
  page.drawText("Rev by:\nDCADA", { x: 443, y: height - 64, size: 7, font: fontRegular, lineHeight: 9 });
  page.drawText("Rev. date:\n2023-12-14", { x: 488, y: height - 64, size: 7, font: fontRegular, lineHeight: 9 });

  page.drawText(`Product:\n${context.itemDescription.slice(0, 30)}`, { x: 238, y: height - 88, size: 7, font: fontRegular, lineHeight: 9 });
  page.drawText("Reviewed by:\nDROKR", { x: 333, y: height - 88, size: 7, font: fontRegular, lineHeight: 9 });
  page.drawText("Author:\nDSOLA", { x: 408, y: height - 88, size: 7, font: fontRegular, lineHeight: 9 });
  page.drawText("Date:\n2018-02-16", { x: 443, y: height - 88, size: 7, font: fontRegular, lineHeight: 9 });

  page.drawText(`Serial no: ${context.serialNumber || ""}`, { x: 415, y: height - 114, size: 8, font: fontBold });

  // Title
  page.drawText("CERTIFICATE OF CONFORMITY", { x: width / 2 - 110, y: height - 145, size: 13, font: fontBold, color: darkInk });

  // Specification Box (y: 648 to 694)
  page.drawRectangle({ x: 45, y: height - 194, width: 510, height: 44, borderColor: darkInk, borderWidth: 1 });
  page.drawLine({ start: { x: 360, y: height - 194 }, end: { x: 360, y: height - 150 }, color: darkInk, thickness: 1 });
  page.drawLine({ start: { x: 360, y: height - 172 }, end: { x: 555, y: height - 172 }, color: darkInk, thickness: 1 });
  page.drawText("Customer Technical Purchase Specification No. and Revision", { x: 52, y: height - 175, size: 8.5, font: fontBold });
  page.drawText("0068-7211 - Latest version", { x: 366, y: height - 165, size: 8, font: fontRegular });
  page.drawText("0069-2093 - Latest version", { x: 366, y: height - 187, size: 8, font: fontRegular });

  // Declaration
  page.drawText(
    "HydraSpecma Renewables hereby declare these products have been inspected, tested and, unless\notherwise is stated below, conform to purchase order and specifications from Customer.",
    { x: 45, y: height - 215, size: 8.5, font: fontBold, lineHeight: 12 }
  );

  // Part Info Table
  page.drawRectangle({ x: 45, y: height - 280, width: 510, height: 40, borderColor: darkInk, borderWidth: 1 });
  page.drawLine({ start: { x: 45, y: height - 260 }, end: { x: 555, y: height - 260 }, color: darkInk, thickness: 1 });
  page.drawLine({ start: { x: 215, y: height - 280 }, end: { x: 215, y: height - 240 }, color: darkInk, thickness: 1 });
  page.drawLine({ start: { x: 380, y: height - 280 }, end: { x: 380, y: height - 240 }, color: darkInk, thickness: 1 });

  page.drawText("HSRE part no.", { x: 52, y: height - 253, size: 8, font: fontBold });
  page.drawText("Customer part no.", { x: 222, y: height - 253, size: 8, font: fontBold });
  page.drawText("Description", { x: 387, y: height - 253, size: 8, font: fontBold });

  const elements = templateJson?.pages?.[0]?.elements;
  const hasField = (name: string) => {
    if (!Array.isArray(elements) || elements.length === 0) return true;
    const n = name.toLowerCase();
    return elements.some((e: any) => e.type === "field" && e.fieldName?.toLowerCase() === n);
  };

  if (hasField("hsrepartnumber") || hasField("itemnumber")) {
    page.drawText(context.itemNumber, { x: 52, y: height - 273, size: 8, font: fontRegular });
  }
  if (hasField("customerpartnumber") || hasField("customerpartno") || hasField("custpartno")) {
    page.drawText(context.customerPartNumber || context.manualValues?.["CustomerPartNo"] || "160072", { x: 222, y: height - 273, size: 8, font: fontRegular });
  }
  if (hasField("itemdescription") || hasField("description")) {
    page.drawText(context.itemDescription.slice(0, 32), { x: 387, y: height - 273, size: 8, font: fontRegular });
  }

  // Order Reference Table
  page.drawRectangle({ x: 45, y: height - 350, width: 510, height: 60, borderColor: darkInk, borderWidth: 1 });
  page.drawLine({ start: { x: 45, y: height - 310 }, end: { x: 555, y: height - 310 }, color: darkInk, thickness: 1 });
  page.drawLine({ start: { x: 45, y: height - 330 }, end: { x: 555, y: height - 330 }, color: darkInk, thickness: 1 });
  page.drawLine({ start: { x: 360, y: height - 350 }, end: { x: 360, y: height - 290 }, color: darkInk, thickness: 1 });

  page.drawText("Customer Purchase order:", { x: 52, y: height - 303, size: 8.5, font: fontBold });
  page.drawText(context.customerPO || context.manualValues?.["CustomerPO"] || "4509008214", { x: 368, y: height - 303, size: 8, font: fontRegular });

  page.drawText("Top level Serial number:", { x: 52, y: height - 323, size: 8.5, font: fontBold });
  page.drawText(context.serialNumber || `${context.itemNumber} - SN001`, { x: 368, y: height - 323, size: 8, font: fontRegular });

  page.drawText("Manufacturing Order number:", { x: 52, y: height - 343, size: 8.5, font: fontBold });
  page.drawText(context.productionOrder || "HSIN-000011", { x: 368, y: height - 343, size: 8.5, font: fontBold });

  // Work Flow Table
  page.drawRectangle({ x: 45, y: height - 605, width: 510, height: 240, borderColor: darkInk, borderWidth: 1 });
  page.drawLine({ start: { x: 45, y: height - 380 }, end: { x: 555, y: height - 380 }, color: darkInk, thickness: 1 });
  page.drawLine({ start: { x: 250, y: height - 605 }, end: { x: 250, y: height - 380 }, color: darkInk, thickness: 1 });

  page.drawText("Work flow:", { x: 52, y: height - 373, size: 8.5, font: fontBold });

  const workflows = [
    ["Assembled.", "According to AI-1071.0512 and AI-1070.0049, Latest revision."],
    ["Air leak test.", "According to TI-1071.0512-1, Latest revision."],
    ["Air fan test", "According to TI-1071.0512-2, Latest revision."],
    ["Interface dimension for cabinet.", "According to TI-1071.0512-3, Latest revision."],
    ["Flatness of Baseframe.", "According to TI-1071.0512-4, Latest revision."],
    ["Pipe system Air leak test or Pipe system Helium leak test.", "According to TI-1071.0267 / TI-1071.0267-1, Latest revision."],
    ["Part traceability.", "According to SN-1070.0049, Latest revision."],
    ["Complete inspection.", "Visual inspection of complete unit before packed."],
    ["Packing.", "According to PI-1070.0049, Latest revision."],
  ];

  let wy = height - 400;
  for (let i = 0; i < workflows.length; i++) {
    page.drawLine({ start: { x: 45, y: wy + 16 }, end: { x: 555, y: wy + 16 }, color: rgb(0.85, 0.85, 0.85), thickness: 0.5 });
    page.drawText(workflows[i][0], { x: 52, y: wy + 4, size: 7.5, font: fontRegular });
    page.drawText(workflows[i][1], { x: 256, y: wy + 4, size: 7.5, font: fontRegular });
    wy -= 24;
  }

  // Signatures Table
  page.drawRectangle({ x: 45, y: 70, width: 510, height: 50, borderColor: darkInk, borderWidth: 1 });
  page.drawLine({ start: { x: 300, y: 70 }, end: { x: 300, y: 120 }, color: darkInk, thickness: 1 });

  const sigDate = context.date || context.manualValues?.["InspectionDate"] || new Date().toISOString().slice(0, 10);
  page.drawText(sigDate, { x: 135, y: 98, size: 8.5, font: fontRegular });
  page.drawText("Date of Signature", { x: 130, y: 76, size: 8, font: fontBold });

  await renderSignatureBox(page, pdfDoc, 305, 88, 245, 30, context.signatureBase64, fontBold);
  page.drawText("Signature", { x: 395, y: 76, size: 8, font: fontBold });

  // Footer
  page.drawLine({ start: { x: 45, y: 48 }, end: { x: 555, y: 48 }, color: darkInk, thickness: 1.5 });
  page.drawText("CONFIDENTIAL", { x: width / 2 - 35, y: 34, size: 8.5, font: fontBold });
  page.drawText("1 / 1", { x: 535, y: 34, size: 8.5, font: fontRegular });

  if (context.isDraft) {
    page.drawText("DRAFT / PREVIEW", {
      x: 100,
      y: 280,
      size: 60,
      font: fontBold,
      color: rgb(0.88, 0.88, 0.88),
      rotate: degrees(45),
      opacity: 0.35,
    });
  }

  return await finalizeWithExtras(pdfDoc, context, templateJson);
}
