import { route, json } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { uploadAsset } from "@/lib/db/repositories/assets";
import { createTemplate, publishVersion } from "@/lib/db/repositories/templates";
import { parseTemplate, type TemplateJson, type TemplateElement } from "@/lib/template/schema";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { PDFDocument } from "pdf-lib";
import { Errors } from "@/lib/errors";
import { audit } from "@/lib/audit/audit";

export const POST = route(async (req) => {
  const session = await requireSession();

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const name = (formData.get("name") as string | null)?.trim() || "Uploaded PDF Template";
  const description = (formData.get("description") as string | null)?.trim() || "Created from uploaded PDF";
  const revision = (formData.get("revision") as string | null)?.trim() || "Rev 01";
  const publishParam = formData.get("publish");
  const shouldPublish = publishParam === null || publishParam === "true" || publishParam === "1";
  const applicableCompaniesRaw = (formData.get("applicableCompanies") as string | null)?.trim();
  const applicableItemsRaw = (formData.get("applicableItems") as string | null)?.trim();
  const applicableCompanies = applicableCompaniesRaw
    ? applicableCompaniesRaw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
    : ["ALL"];
  const applicableItems = applicableItemsRaw
    ? applicableItemsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : ["*"];

  if (!file) {
    throw Errors.validation("A PDF file is required.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);

  // Validate PDF and inspect pages
  let pageCount = 1;
  let widthPt = 595.56;
  let heightPt = 842.04;

  try {
    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    pageCount = pdfDoc.getPageCount();
    if (pageCount > 0) {
      const p1 = pdfDoc.getPage(0).getSize();
      widthPt = p1.width;
      heightPt = p1.height;
    }
  } catch {
    throw Errors.validation("Failed to parse PDF. Please ensure the file is a valid, unencrypted PDF.");
  }

  // Upload asset to storage and DB
  const asset = await uploadAsset({
    kind: "background",
    fileName: file.name,
    mimeType: "application/pdf",
    bytes,
    userId: session.user.id,
  });

  // Construct Template JSON
  const style = { fontFamily: "Helvetica", fontSize: 10, valign: "middle" as const, padding: 1 };
  const field = (id: string, fieldName: string, x: number, y: number, width: number, height: number, extra: Partial<TemplateElement> = {}): TemplateElement =>
    ({ id, type: "field", fieldName, x, y, width, height, style, binding: {}, ...extra }) as TemplateElement;

  const pages: TemplateJson["pages"] = [];

  // Page 1: Certificate with standard HydraSpecma fields
  pages.push({
    id: "page-1",
    name: "Certificate",
    background: { assetId: asset.id, pageIndex: 0, opacity: 1 },
    elements: [
      field("p1-serial", "TopLevelSerialNumber", 416, 110, 135, 13, { name: "Serial no." }),
      field("p1-customer-po", "CustomerPO", 374, 358, 176, 15, { name: "Customer Purchase order" }),
      field("p1-top-serial", "TopLevelSerialNumber", 430, 379, 120, 14, { name: "Top level Serial number", binding: { required: true } }),
      field("p1-prod-order", "ProductionOrder", 374, 399, 176, 14, { name: "Manufacturing Order number", binding: { readOnly: true } }),
      field("p1-date", "COCDate", 70, 705, 220, 22, { name: "Date of Signature", binding: { format: "yyyy-MM-dd" } }),
      { id: "p1-signature", type: "signature", fieldName: "Signature", x: 320, y: 700, width: 220, height: 30, name: "Signature", binding: { required: true } } as TemplateElement,
    ],
  });

  // Additional appendix pages if multi-page PDF
  for (let p = 2; p <= pageCount; p++) {
    pages.push({
      id: `page-${p}`,
      name: `Page ${p}`,
      background: { assetId: asset.id, pageIndex: p - 1, opacity: 1 },
      elements: [
        field(`p${p}-serial`, "TopLevelSerialNumber", 430, 110, 120, 13, { name: "Serial no." }),
      ],
    });
  }

  const templateJson = parseTemplate({
    schemaVersion: 1,
    templateName: name,
    templateType: "COC",
    version: 1,
    revision,
    page: { size: "A4", orientation: "portrait", width: widthPt, height: heightPt },
    settings: { defaultFont: "Helvetica", signatureRequired: true, allowDateOverride: false, fileNamePattern: "{COCNumber}.pdf" },
    fonts: [],
    pages,
  });

  // Create template in database
  const created = await createTemplate({
    name,
    description,
    templateType: "COC",
    applicableCompanies,
    applicableItems,
    userId: session.user.id,
    templateJson,
  });

  const sb = supabaseAdmin();
  await sb
    .from("coc_template_versions")
    .update({ background_asset_id: asset.id, revision })
    .eq("id", created.version.id);

  let finalVersion = created.version;
  let activeVersionId: string | null = null;

  if (shouldPublish) {
    finalVersion = await publishVersion(created.template.id, created.version.id, session.user.id);
    activeVersionId = finalVersion.id;
  }

  await audit({
    entityType: "template",
    entityId: created.template.id,
    action: "CREATED",
    user: session.user,
    details: { source: "uploaded_pdf", fileName: file.name, pageCount },
  });

  return json({
    ok: true,
    template: {
      ...created.template,
      active_version_id: activeVersionId,
      active_version_number: finalVersion.version_number,
    },
    version: finalVersion,
    asset,
  }, { status: 201 });
});
