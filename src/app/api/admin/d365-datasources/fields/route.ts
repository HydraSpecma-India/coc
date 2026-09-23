import { route, json } from "@/lib/api/handler";
import { requireCapability } from "@/lib/auth/guards";
import { D365Service } from "@/lib/integrations/d365/service";

/** Property names of a D365FO entity (read from one sample row). */
export const GET = route(async (req) => {
  await requireCapability("manageFields");
  const entity = (req.nextUrl.searchParams.get("entity") || "").trim();
  const company = (req.nextUrl.searchParams.get("company") || "").trim();
  if (!entity) return json({ ok: false, fields: [], error: "Enter an entity name first" });
  const res = await D365Service.entityFields(entity, company);
  return json({ ok: !res.error, mode: res.mode, fields: res.fields, sample: res.sample ?? null, error: res.error ?? null });
});
