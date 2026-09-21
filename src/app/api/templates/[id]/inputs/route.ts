import { route, json } from "@/lib/api/handler";
import { requireCapability, requireSession } from "@/lib/auth/guards";
import { Errors } from "@/lib/errors";
import { audit } from "@/lib/audit/audit";
import { TemplateInputConfigSchema, validateInputConfig } from "@/lib/coc-inputs/types";
import { getTemplateInputConfig, saveTemplateInputConfig } from "@/lib/db/repositories/template-inputs";

type P = { id: string };

/** Any signed-in user may read the configuration (needed by the New COC wizard). */
export const GET = route<P>(async (_req, { params }) => {
  await requireSession();
  const config = await getTemplateInputConfig(params.id);
  return json({ ok: true, config });
});

/** Admins (manageTemplates) define which manual fields appear on pages 2+. */
export const PUT = route<P>(async (req, { params }) => {
  const session = await requireCapability("manageTemplates");
  const body = await req.json();
  const config = TemplateInputConfigSchema.parse(body?.config ?? body);
  const problem = validateInputConfig(config);
  if (problem) throw Errors.validation(problem);
  const saved = await saveTemplateInputConfig(params.id, config, session.user);
  await audit({
    entityType: "template",
    entityId: params.id,
    action: "EDITED",
    user: session.user,
    details: {
      change: "data-entry fields",
      sections: saved.sections.length,
      fields: saved.sections.reduce((n, s) => n + s.fields.length, 0),
    },
  });
  return json({ ok: true, config: saved });
});
