import { readFile } from "node:fs/promises";
import path from "node:path";
import { route, json } from "@/lib/api/handler";
import { requireCapability } from "@/lib/auth/guards";
import { uploadAsset } from "@/lib/db/repositories/assets";
import { createTemplate } from "@/lib/db/repositories/templates";
import { buildHydraSpecmaSeed } from "@/lib/template/seed-hydraspecma";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { audit } from "@/lib/audit/audit";
import { Errors } from "@/lib/errors";

/**
 * Creates the sample "HydraSpecma COC 1070.0049" template from the bundled
 * reference PDF (reference/COC-1070.0049-Rev02.pdf). Idempotent per name.
 */
export const POST = route(async () => {
  const session = await requireCapability("manageTemplates");
  const filePath = path.join(process.cwd(), "reference", "COC-1070.0049-Rev02.pdf");
  let bytes: Buffer;
  try {
    bytes = await readFile(filePath);
  } catch {
    throw Errors.notFound("Reference COC PDF (reference/COC-1070.0049-Rev02.pdf)");
  }

  const asset = await uploadAsset({
    kind: "background",
    fileName: "COC-1070.0049-Rev02.pdf",
    mimeType: "application/pdf",
    bytes,
    userId: session.user.id,
  });

  const json_ = buildHydraSpecmaSeed(asset.id, asset.page_count ?? 1);
  const created = await createTemplate({
    name: json_.templateName,
    description: "Seeded from the HydraSpecma COC-1070.0049 Rev.02 reference document (7 pages).",
    templateType: "COC",
    userId: session.user.id,
    templateJson: json_,
  });
  await supabaseAdmin().from("coc_template_versions").update({ background_asset_id: asset.id, revision: "Rev 02" }).eq("id", created.version.id);
  await audit({ entityType: "template", entityId: created.template.id, action: "CREATED", user: session.user, details: { seed: "hydraspecma-coc-1070.0049" } });
  return json(created, { status: 201 });
});
