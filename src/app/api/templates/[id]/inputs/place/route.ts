import { z } from "zod";
import { route, json } from "@/lib/api/handler";
import { requireCapability } from "@/lib/auth/guards";
import { Errors } from "@/lib/errors";
import { audit } from "@/lib/audit/audit";
import { getTemplate, getVersion, createVersion, saveDraft, publishVersion } from "@/lib/db/repositories/templates";
import { getTemplateInputConfig } from "@/lib/db/repositories/template-inputs";
import { AUTO_PREFIX, buildPlacementElements, countPlacements } from "@/lib/coc-inputs/placement";

type P = { id: string };

/**
 * "Place on template": writes the data-entry placements (and serial / date stamps) as designer
 * elements into a draft version of the template, so every value is stamped on the original pages.
 * Re-running replaces the previously generated elements; manual designer elements are kept.
 */
export const POST = route<P>(async (req, { params }) => {
  const session = await requireCapability("manageTemplates");
  const body = z.object({ publish: z.boolean().default(false) }).parse(await req.json().catch(() => ({})));

  const template = await getTemplate(params.id);
  if (!template) throw Errors.notFound("Template");
  const config = await getTemplateInputConfig(params.id);
  if (!countPlacements(config)) {
    throw Errors.validation("No positions are defined. Load the preset or place the fields manually in the designer.");
  }

  // Use the newest draft, otherwise create a new draft from the active version
  const draftSummary = template.versions.filter((v) => v.status === "draft").sort((a, b) => b.version_number - a.version_number)[0];
  const draft = draftSummary
    ? await getVersion(params.id, draftSummary.id)
    : await createVersion(params.id, undefined, session.user.id, "Data-entry fields placed on template");
  if (!draft) throw Errors.notFound("Template version");

  const tj = structuredClone(draft.template_json) as { pages: Array<{ id: string; name?: string; background: unknown; elements: Array<{ id: string }> }> };
  const byPage = buildPlacementElements(config);
  const maxPage = Math.max(...byPage.keys());
  const bgTemplate = tj.pages[tj.pages.length - 1]?.background as { assetId: string; pageIndex: number; opacity: number } | null;

  // Make sure the template has enough pages (backgrounds follow the uploaded PDF page order)
  for (let p = tj.pages.length + 1; p <= maxPage; p++) {
    tj.pages.push({
      id: `page-${p}`,
      name: `Page ${p}`,
      background: bgTemplate ? { ...bgTemplate, pageIndex: p - 1 } : null,
      elements: [],
    });
  }

  let placed = 0;
  tj.pages.forEach((page, idx) => {
    type El = { id: string; fieldName?: string; x?: number; y?: number; width?: number; height?: number };
    const generated = (byPage.get(idx + 1) ?? []) as unknown as El[];
    const genFields = new Set(generated.map((e) => (e.fieldName || "").toLowerCase()));
    const overlaps = (a: El, b: El) =>
      (a.x ?? 0) < (b.x ?? 0) + (b.width ?? 0) && (b.x ?? 0) < (a.x ?? 0) + (a.width ?? 0) &&
      (a.y ?? 0) < (b.y ?? 0) + (b.height ?? 0) && (b.y ?? 0) < (a.y ?? 0) + (a.height ?? 0);
    const kept = ((page.elements ?? []) as El[]).filter((e) => {
      if (String(e.id).startsWith(AUTO_PREFIX)) return false; // replaced on every run
      // Seeded serial-number stamps are superseded by the measured positions of the preset
      if (/^p\d+-serial/.test(String(e.id)) && genFields.has((e.fieldName || "").toLowerCase())) return false;
      return true;
    });
    // Don't duplicate a value the admin already placed by hand in the same box
    const add = generated.filter(
      (g) => !kept.some((k) => (k.fieldName || "").toLowerCase() === (g.fieldName || "").toLowerCase() && overlaps(k, g)),
    );
    placed += add.length;
    page.elements = [...kept, ...add];
  });

  const saved = await saveDraft(params.id, draft.id, tj, { changeNote: "Data-entry fields placed on template" });
  let published = false;
  if (body.publish) {
    await publishVersion(params.id, saved.id, session.user.id);
    published = true;
  }

  await audit({
    entityType: "template_version",
    entityId: saved.id,
    action: published ? "PUBLISHED" : "EDITED",
    user: session.user,
    details: { templateId: params.id, change: "data-entry fields placed on template", elements: placed },
  });

  return json({ ok: true, versionId: saved.id, versionNumber: saved.version_number, placed, published });
});
