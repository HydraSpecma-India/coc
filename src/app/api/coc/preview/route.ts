import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guards";
import { renderCOCPdf } from "@/lib/render/pdf-renderer";

export async function POST(req: Request) {
  await requireSession();
  const body = await req.json();

  const rawCustomer = body.customerName || body.manualValues?.["CustomerName"] || "";
  const resolvedCustomerName =
    (rawCustomer && !rawCustomer.toLowerCase().includes("hydraspecma"))
      ? rawCustomer
      : (body.company === "HGCN" ? "VESTAS WIND TECHNOLOGY CHINA CO LTD" : "VESTAS WIND TECHNOLOGYS INDIA PVT LTD");

  const pdfBytes = await renderCOCPdf({
    cocNumber: "PREVIEW-DRAFT",
    productionOrder: body.productionOrder || "PO-PREVIEW",
    itemNumber: body.itemNumber || "ITEM-PREVIEW",
    itemDescription: body.itemDescription || "Product Specification Description",
    customerName: resolvedCustomerName,
    customerPO: body.customerPO || body.manualValues?.["CustomerPO"] || "4509008214",
    customerPartNumber: body.customerPartNumber || body.manualValues?.["CustomerPartNo"] || "160072",
    salesOrder: body.salesOrder,
    batchNumber: body.batchNumber,
    deliveryDate: body.deliveryDate || body.manualValues?.["DeliveryDate"] || "",
    serialNumber: body.serialNumber || body.manualValues?.["SerialNumber"] || "",
    quantity: body.quantity || 1,
    unitOfMeasure: body.unitOfMeasure || "Pcs",
    manualValues: body.manualValues ? { ...body.manualValues, CustomerName: resolvedCustomerName } : undefined,
    signatureBase64: body.signatureBase64,
    isDraft: true,
    templateId: body.templateId,
    templateVersionId: body.templateVersionId,
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="preview.pdf"',
    },
  });
}
