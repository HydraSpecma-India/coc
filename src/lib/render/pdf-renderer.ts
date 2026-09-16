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
  serialNumber?: string;
  quantity?: number;
  unitOfMeasure?: string;
  date?: string;
  manualValues?: Record<string, string>;
  signatureBase64?: string;
  isDraft?: boolean;
  templateId?: string;
  templateVersionId?: string;
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
  if (fn === "batchnumber") {
    return context.batchNumber || "";
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

export async function renderCOCPdf(context: RenderContext): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const templatePath = path.join(process.cwd(), "public", "templates", "hydraspecma-coc-template.pdf");

  let templateBytes: Buffer | null = null;
  let templateJson: any = null;

  // 1. Resolve template definition and background PDF from Supabase
  try {
    const sb = supabaseAdmin();
    let vId = context.templateVersionId;
    const tId = context.templateId || "00000000-0000-0000-0000-000000000001";

    if (vId) {
      const { data: ver } = await sb
        .from("coc_template_versions")
        .select("id, background_asset_id, template_json, version_number")
        .eq("id", vId)
        .maybeSingle();
      if (ver) {
        templateJson = ver.template_json;
        if (ver.background_asset_id) {
          const { data: asset } = await sb
            .from("coc_template_assets")
            .select("storage_path")
            .eq("id", ver.background_asset_id)
            .maybeSingle();
          if (asset?.storage_path) {
            const { data: fileBlob } = await sb.storage.from(Buckets.templateAssets).download(asset.storage_path);
            if (fileBlob) {
              templateBytes = Buffer.from(await fileBlob.arrayBuffer());
            }
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
        const { data: ver } = await sb
          .from("coc_template_versions")
          .select("id, background_asset_id, template_json, version_number")
          .eq("id", activeVerId)
          .maybeSingle();
        if (ver) {
          templateJson = ver.template_json;
          if (ver.background_asset_id && !templateBytes) {
            const { data: asset } = await sb
              .from("coc_template_assets")
              .select("storage_path")
              .eq("id", ver.background_asset_id)
              .maybeSingle();
            if (asset?.storage_path) {
              const { data: fileBlob } = await sb.storage.from(Buckets.templateAssets).download(asset.storage_path);
              if (fileBlob) {
                templateBytes = Buffer.from(await fileBlob.arrayBuffer());
              }
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

  // 2. Fallback to bundled official HydraSpecma template PDF
  if (!templateBytes && fs.existsSync(templatePath)) {
    try {
      templateBytes = fs.readFileSync(templatePath);
    } catch (e) {
      console.warn("Could not read local template PDF:", e);
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
            for (const el of pageElements) {
              if (el.hidden) continue;
              const pdfY = height - el.y - el.height;
              const isBold = Boolean(el.style?.bold);
              const font = isBold ? fontBold : fontRegular;
              const fontSize = el.style?.fontSize || 8.5;
              if (el.type === "field" && el.fieldName) {
                const val = resolveFieldValue(el.fieldName, context, el);
                if (val) {
                  const textX = el.x + (el.style?.padding || 2);
                  const textY = pdfY + Math.max(2, (el.height - fontSize * 0.85) / 2);
                  page.drawText(val, { x: textX, y: textY, size: fontSize, font, color: rgb(0, 0, 0) });
                }
              }
            }
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

      return await pdfDoc.save();
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

  return await pdfDoc.save();
}
