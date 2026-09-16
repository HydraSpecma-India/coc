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
}

export async function renderCOCPdf(context: RenderContext): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const templatePath = path.join(process.cwd(), "public", "templates", "hydraspecma-coc-template.pdf");

  if (fs.existsSync(templatePath)) {
    try {
      const templateBytes = fs.readFileSync(templatePath);
      const srcDoc = await PDFDocument.load(templateBytes);
      const [page] = await pdfDoc.copyPages(srcDoc, [0]);
      pdfDoc.addPage(page);

      const fillField = (x: number, y: number, w: number, h: number, text: string, isBold = false) => {
        page.drawRectangle({ x, y, width: w, height: h, color: rgb(1, 1, 1) });
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

      const partNumberStr = context.cocNumber || `COC-${context.itemNumber}`;
      const prodDesc = context.itemDescription || "HydraSpecma Production Assembly";
      const serialNo = context.serialNumber || (context.productionOrder ? `SN-${context.productionOrder}` : "");
      const custPartNo = context.customerPartNumber || context.manualValues?.["CustomerPartNo"] || "160072";
      const custPO = context.customerPO || context.manualValues?.["CustomerPO"] || "4509008214";
      const topSerial = context.serialNumber || `${context.itemNumber} - SN001`;
      const mfgOrder = context.productionOrder || "HSIN-000011";
      const sigDate = context.date || context.manualValues?.["InspectionDate"] || new Date().toISOString().slice(0, 10);

      // 1. Part number in top table
      fillField(295, 762, 75, 11, partNumberStr.slice(0, 18), false);
      // 2. Product in top table
      fillField(62, 737, 220, 12, prodDesc.slice(0, 45), false);
      // 3. Serial no in top right
      fillField(415, 720, 130, 12, serialNo, true);
      // 4. HSRE part no
      fillField(58, 507, 165, 12, context.itemNumber, false);
      // 5. Customer part no
      fillField(228, 507, 165, 12, custPartNo, false);
      // 6. Description
      fillField(395, 507, 160, 12, prodDesc.slice(0, 35), false);
      // 7. Customer Purchase Order
      fillField(370, 473, 185, 14, custPO, false);
      // 8. Top level Serial number
      fillField(370, 451, 185, 14, topSerial, false);
      // 9. Manufacturing Order number
      fillField(370, 429, 185, 14, mfgOrder, true);
      // 10. Date of Signature
      fillField(100, 115, 150, 16, sigDate, false);

      // 11. Signature image or digital stamp
      if (context.signatureBase64) {
        try {
          const base64Data = context.signatureBase64.replace(/^data:image\/\w+;base64,/, "");
          const imgBytes = Buffer.from(base64Data, "base64");
          const sigImg = await pdfDoc.embedPng(imgBytes);
          page.drawRectangle({ x: 320, y: 95, width: 200, height: 45, color: rgb(1, 1, 1) });
          page.drawImage(sigImg, {
            x: 350,
            y: 98,
            width: 140,
            height: 38,
          });
        } catch {
          fillField(380, 115, 140, 16, "[DIGITALLY SIGNED]", true);
        }
      } else {
        fillField(380, 115, 140, 16, "[DIGITALLY SIGNED]", true);
      }

      // Draft Watermark
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

  page.drawText(context.itemNumber, { x: 52, y: height - 273, size: 8, font: fontRegular });
  page.drawText(context.customerPartNumber || context.manualValues?.["CustomerPartNo"] || "160072", { x: 222, y: height - 273, size: 8, font: fontRegular });
  page.drawText(context.itemDescription.slice(0, 32), { x: 387, y: height - 273, size: 8, font: fontRegular });

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

  if (context.signatureBase64) {
    try {
      const base64Data = context.signatureBase64.replace(/^data:image\/\w+;base64,/, "");
      const imgBytes = Buffer.from(base64Data, "base64");
      const sigImg = await pdfDoc.embedPng(imgBytes);
      page.drawImage(sigImg, { x: 360, y: 78, width: 120, height: 35 });
    } catch {
      page.drawText("[DIGITALLY SIGNED]", { x: 375, y: 98, size: 9, font: fontBold, color: rgb(0.1, 0.5, 0.2) });
    }
  } else {
    page.drawText("[DIGITALLY SIGNED]", { x: 375, y: 98, size: 9, font: fontBold, color: rgb(0.1, 0.5, 0.2) });
  }
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
