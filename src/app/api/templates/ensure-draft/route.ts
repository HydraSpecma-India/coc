import { z } from "zod";
import { route, json } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { createVersion, createTemplate } from "@/lib/db/repositories/templates";
import { buildHydraSpecmaSeed } from "@/lib/template/seed-hydraspecma";
import { uploadAsset } from "@/lib/db/repositories/assets";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Errors } from "@/lib/errors";

const EnsureDraftSchema = z.object({
  templateId: z.string().min(1),
});

export const POST = route(async (req) => {
  const session = await requireSession();
  const { templateId } = EnsureDraftSchema.parse(await req.json());
  const sb = supabaseAdmin();

  let targetTemplateId = templateId;

  // If dummy fallback ID, find or create real template
  const isFallback =
    templateId === "00000000-0000-0000-0000-000000000001" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(templateId);

  if (isFallback) {
    const { data: existing } = await sb
      .from("coc_templates")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      targetTemplateId = existing.id;
    } else {
      // Seed default template
      const filePath = path.join(process.cwd(), "public", "templates", "hydraspecma-coc-template.pdf");
      let bytes: Buffer;
      try {
        bytes = await readFile(filePath);
      } catch {
        const refPath = path.join(process.cwd(), "reference", "COC-1070.0049-Rev02.pdf");
        bytes = await readFile(refPath);
      }

      const asset = await uploadAsset({
        kind: "background",
        fileName: "hydraspecma-coc-template.pdf",
        mimeType: "application/pdf",
        bytes,
        userId: session.user.id,
      });

      const seedJson = buildHydraSpecmaSeed(asset.id, asset.page_count ?? 1);
      const created = await createTemplate({
        name: "Standard HydraSpecma A4 Certificate",
        description: "Official HydraSpecma Certificate of Conformity layout",
        templateType: "COC",
        userId: session.user.id,
        templateJson: seedJson,
      });

      await sb
        .from("coc_template_versions")
        .update({ background_asset_id: asset.id, revision: "Rev 02" })
        .eq("id", created.version.id);

      return json({
        ok: true,
        templateId: created.template.id,
        versionId: created.version.id,
      });
    }
  }

  // Check existing versions for this template
  const { data: versions, error } = await sb
    .from("coc_template_versions")
    .select("id, status, version_number")
    .eq("template_id", targetTemplateId)
    .order("version_number", { ascending: false });

  if (error || !versions || versions.length === 0) {
    throw Errors.notFound("Template versions");
  }

  // If a draft version already exists, use it
  const existingDraft = versions.find((v) => v.status === "draft");
  if (existingDraft) {
    return json({
      ok: true,
      templateId: targetTemplateId,
      versionId: existingDraft.id,
    });
  }

  // All versions are published or deprecated: create a new draft version
  const newVersion = await createVersion(
    targetTemplateId,
    undefined,
    session.user.id,
    "Draft for customization"
  );

  return json({
    ok: true,
    templateId: targetTemplateId,
    versionId: newVersion.id,
  });
});
