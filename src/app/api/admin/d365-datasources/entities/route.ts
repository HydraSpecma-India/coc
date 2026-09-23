import { route, json } from "@/lib/api/handler";
import { requireCapability } from "@/lib/auth/guards";
import { D365Service } from "@/lib/integrations/d365/service";

/** Every OData table (entity set) this D365FO exposes, so a table can be picked from a list. */
export const GET = route(async () => {
  await requireCapability("manageFields");
  const res = await D365Service.listEntities();
  return json({ ok: !res.error, entities: res.entities, error: res.error ?? null });
});
