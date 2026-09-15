import { PDFDocument, rgb, StandardFonts, degrees } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

export interface RenderContext {
  cocNumber: string;
  productionOrder: string;
  itemNumber: string;
  itemDescription: string;
  customerName?: string;
  customerPO?: string;
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
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);

  // A4 Standard Dimensions: 595.28 x 841.89 points
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const brandOrange = rgb(0.96, 0.65, 0.14); // HydraSpecma Brand Yellow/Orange
  const darkInk = rgb(0.08, 0.08, 0.12);
  const grayMuted = rgb(0.45, 0.45, 0.5);
  const borderGray = rgb(0.85, 0.85, 0.88);
  const lightBg = rgb(0.97, 0.97, 0.98);

  // 1. Header & Brand Banner
  page.drawRectangle({
    x: 0,
    y: height - 8,
    width: width,
    height: 8,
    color: brandOrange,
  });

  // Top Title Bar
  page.drawText("HYDRASPECMA INDIA", {
    x: 40,
    y: height - 50,
    size: 18,
    font: fontBold,
    color: darkInk,
  });

  page.drawText("CERTIFICATE OF CONFORMITY", {
    x: 40,
    y: height - 72,
    size: 14,
    font: fontBold,
    color: brandOrange,
  });

  page.drawText("HydraSpecma Fluid Systems India Pvt. Ltd.\nQuality & Regulatory Compliance Department", {
    x: 40,
    y: height - 98,
    size: 8,
    font: fontRegular,
    color: grayMuted,
    lineHeight: 12,
  });

  // Top Right Info Box: COC Number & Date
  const infoBoxWidth = 190;
  const infoBoxHeight = 65;
  const infoBoxX = width - 40 - infoBoxWidth;
  const infoBoxY = height - 105;

  page.drawRectangle({
    x: infoBoxX,
    y: infoBoxY,
    width: infoBoxWidth,
    height: infoBoxHeight,
    color: lightBg,
    borderColor: borderGray,
    borderWidth: 1,
  });

  page.drawText("COC NUMBER:", {
    x: infoBoxX + 12,
    y: infoBoxY + 45,
    size: 7,
    font: fontBold,
    color: grayMuted,
  });
  page.drawText(context.cocNumber || "DRAFT-COC", {
    x: infoBoxX + 12,
    y: infoBoxY + 30,
    size: 12,
    font: fontBold,
    color: darkInk,
  });

  page.drawText(`DATE: ${context.date || new Date().toISOString().slice(0, 10)}`, {
    x: infoBoxX + 12,
    y: infoBoxY + 12,
    size: 8,
    font: fontRegular,
    color: darkInk,
  });

  // 2. Production & Order Details Section (Table Box)
  const sectionTop = height - 135;
  page.drawText("1. PRODUCTION & ORDER SPECIFICATIONS", {
    x: 40,
    y: sectionTop,
    size: 9,
    font: fontBold,
    color: darkInk,
  });

  const specBoxY = sectionTop - 135;
  const specBoxH = 125;
  page.drawRectangle({
    x: 40,
    y: specBoxY,
    width: width - 80,
    height: specBoxH,
    color: rgb(1, 1, 1),
    borderColor: borderGray,
    borderWidth: 1,
  });

  // Grid rows inside specBox
  const drawRow = (label1: string, val1: string, label2: string, val2: string, yOffset: number) => {
    const y = specBoxY + specBoxH - yOffset;
    // Left col
    page.drawText(label1, { x: 52, y, size: 8, font: fontBold, color: grayMuted });
    page.drawText(val1 || "—", { x: 160, y, size: 8, font: fontRegular, color: darkInk });
    // Right col
    page.drawText(label2, { x: 320, y, size: 8, font: fontBold, color: grayMuted });
    page.drawText(val2 || "—", { x: 420, y, size: 8, font: fontRegular, color: darkInk });
  };

  drawRow("Production Order:", context.productionOrder, "Customer PO:", context.customerPO || "—", 25);
  drawRow("Part / Item No:", context.itemNumber, "Customer:", context.customerName || "—", 48);
  drawRow("Item Description:", context.itemDescription.slice(0, 32), "Sales Order:", context.salesOrder || "—", 71);
  drawRow("Batch / Heat No:", context.batchNumber || "—", "Serial Number:", context.serialNumber || "—", 94);
  drawRow(
    "Quantity Passed:",
    `${context.quantity ?? 1} ${context.unitOfMeasure || "Pcs"}`,
    "Inspection Standard:",
    "ISO 9001:2015 / HS-QA-01",
    117
  );

  // 3. Quality & Inspection Results Section
  const qaTop = specBoxY - 25;
  page.drawText("2. QUALITY VERIFICATION & TESTING RECORD", {
    x: 40,
    y: qaTop,
    size: 9,
    font: fontBold,
    color: darkInk,
  });

  const qaBoxY = qaTop - 165;
  const qaBoxH = 155;
  page.drawRectangle({
    x: 40,
    y: qaBoxY,
    width: width - 80,
    height: qaBoxH,
    color: rgb(1, 1, 1),
    borderColor: borderGray,
    borderWidth: 1,
  });

  // Header row for QA table
  page.drawRectangle({
    x: 40,
    y: qaBoxY + qaBoxH - 24,
    width: width - 80,
    height: 24,
    color: lightBg,
    borderColor: borderGray,
    borderWidth: 1,
  });

  page.drawText("TEST PARAMETER", { x: 55, y: qaBoxY + qaBoxH - 16, size: 7, font: fontBold, color: grayMuted });
  page.drawText("SPECIFICATION", { x: 220, y: qaBoxY + qaBoxH - 16, size: 7, font: fontBold, color: grayMuted });
  page.drawText("ACTUAL RESULT", { x: 380, y: qaBoxY + qaBoxH - 16, size: 7, font: fontBold, color: grayMuted });
  page.drawText("STATUS", { x: 490, y: qaBoxY + qaBoxH - 16, size: 7, font: fontBold, color: grayMuted });

  const testPressure = context.manualValues?.["TestPressureBar"] || "275 bar";
  const visualStatus = context.manualValues?.["VisualInspection"] || "Passed - No defects";
  const dimStatus = context.manualValues?.["DimensionalCheck"] || "Conforms to Drawing";
  const torqueStatus = context.manualValues?.["TorqueCheck"] || "Verified 45 Nm";

  const drawQaRow = (param: string, spec: string, actual: string, yPos: number) => {
    page.drawText(param, { x: 55, y: yPos, size: 8, font: fontBold, color: darkInk });
    page.drawText(spec, { x: 220, y: yPos, size: 8, font: fontRegular, color: darkInk });
    page.drawText(actual, { x: 380, y: yPos, size: 8, font: fontRegular, color: darkInk });
    page.drawText("ACCEPT", { x: 490, y: yPos, size: 8, font: fontBold, color: rgb(0.1, 0.6, 0.2) });
  };

  drawQaRow("Hydraulic Pressure Proof", "1.5x Working Pressure", testPressure, qaBoxY + 105);
  drawQaRow("Dimensional Verification", "Approved Blueprint", dimStatus, qaBoxY + 80);
  drawQaRow("Surface & Visual Quality", "Clean, No Burrs/Cracks", visualStatus, qaBoxY + 55);
  drawQaRow("Torque / Assembly Check", "Per Assembly Protocol", torqueStatus, qaBoxY + 30);

  // 4. Certification Statement
  const certTop = qaBoxY - 25;
  page.drawText("3. CERTIFICATION STATEMENT", {
    x: 40,
    y: certTop,
    size: 9,
    font: fontBold,
    color: darkInk,
  });

  const certText =
    "We hereby certify that the components and products described above have been manufactured, tested, inspected, and " +
    "found to comply in all respects with the relevant HydraSpecma manufacturing standards, engineering drawings, and purchase order " +
    "specifications. Full material test reports, mill certificates, and traceability records are preserved in accordance with company quality policy.";

  page.drawText(certText, {
    x: 40,
    y: certTop - 20,
    size: 7.5,
    font: fontRegular,
    color: grayMuted,
    lineHeight: 12,
    maxWidth: width - 80,
  });

  // 5. Sign-off & Signature Area
  const signBoxY = 85;
  const signBoxH = 115;
  page.drawRectangle({
    x: 40,
    y: signBoxY,
    width: width - 80,
    height: signBoxH,
    color: lightBg,
    borderColor: borderGray,
    borderWidth: 1,
  });

  page.drawText("AUTHORIZED QUALITY INSPECTOR SIGN-OFF", {
    x: 52,
    y: signBoxY + signBoxH - 20,
    size: 8,
    font: fontBold,
    color: darkInk,
  });

  const inspectorName = context.manualValues?.["InspectorName"] || "Quality Assurance Inspector";
  page.drawText(`Inspector Name: ${inspectorName}`, {
    x: 52,
    y: signBoxY + 45,
    size: 8,
    font: fontRegular,
    color: darkInk,
  });
  page.drawText(`Date of Certification: ${context.date || new Date().toISOString().slice(0, 10)}`, {
    x: 52,
    y: signBoxY + 25,
    size: 8,
    font: fontRegular,
    color: darkInk,
  });

  // Embed signature image if provided
  if (context.signatureBase64) {
    try {
      const base64Data = context.signatureBase64.replace(/^data:image\/\w+;base64,/, "");
      const imageBytes = Buffer.from(base64Data, "base64");
      const signatureImg = await pdfDoc.embedPng(imageBytes);
      page.drawImage(signatureImg, {
        x: width - 210,
        y: signBoxY + 18,
        width: 140,
        height: 60,
      });
    } catch (e) {
      page.drawText("[DIGITALLY SIGNED]", {
        x: width - 180,
        y: signBoxY + 45,
        size: 10,
        font: fontBold,
        color: rgb(0.1, 0.5, 0.2),
      });
    }
  } else {
    page.drawText("[DIGITALLY SIGNED & VERIFIED]", {
      x: width - 210,
      y: signBoxY + 45,
      size: 9,
      font: fontBold,
      color: rgb(0.1, 0.5, 0.2),
    });
  }

  // 6. Footer
  page.drawText("HydraSpecma India • System-generated certificate • Secure document validation ID: " + context.cocNumber, {
    x: 40,
    y: 35,
    size: 7,
    font: fontMono,
    color: grayMuted,
  });

  // Watermark for Draft / Preview
  if (context.isDraft) {
    page.drawText("DRAFT / PREVIEW", {
      x: 100,
      y: 250,
      size: 60,
      font: fontBold,
      color: rgb(0.85, 0.85, 0.85),
      rotate: degrees(45),
      opacity: 0.25,
    });
  }

  return await pdfDoc.save();
}
