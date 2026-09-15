import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guards";
import { renderCOCPdf } from "@/lib/render/pdf-renderer";

export async function POST(req: Request) {
  await requireSession();
  const body = await req.json();

  const pdfBytes = await renderCOCPdf({
    cocNumber: "PREVIEW-DRAFT",
    productionOrder: body.productionOrder || "PO-PREVIEW",
    itemNumber: body.itemNumber || "ITEM-PREVIEW",
    itemDescription: body.itemDescription || "Product Specification Description",
    customerName: body.customerName,
    customerPO: body.customerPO,
    salesOrder: body.salesOrder,
    batchNumber: body.batchNumber,
    serialNumber: body.serialNumber,
    quantity: body.quantity || 1,
    unitOfMeasure: body.unitOfMeasure || "Pcs",
    manualValues: body.manualValues,
    signatureBase64: body.signatureBase64,
    isDraft: true,
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="preview.pdf"',
    },
  });
}
