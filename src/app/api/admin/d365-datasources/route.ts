import { route, json } from "@/lib/api/handler";
import { requireCapability } from "@/lib/auth/guards";
import { audit } from "@/lib/audit/audit";
import { Errors } from "@/lib/errors";
import { getDataSources, saveDataSources } from "@/lib/d365-data/server";
import { DataSourcesConfigSchema, validateDataSources } from "@/lib/d365-data/types";

export const GET = route(async () => {
  await requireCapability("manageFields");
  return json({ ok: true, config: await getDataSources() });
});

export const PUT = route(async (req) => {
  const session = await requireCapability("manageFields");
  const body = await req.json();
  const cfg = DataSourcesConfigSchema.parse(body?.config ?? body);
  const problem = validateDataSources(cfg);
  if (problem) throw Errors.validation(problem);
  await saveDataSources(cfg, session.user.id);
  await audit({
    entityType: "settings",
    entityId: "d365.datasources",
    action: "SETTINGS_CHANGED",
    user: session.user,
    details: { enabled: cfg.enabled, tables: cfg.entities.map((e) => `${e.alias}=${e.entity}`), links: cfg.links.length },
  });
  return json({ ok: true, config: cfg });
});
