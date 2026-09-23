import { route, json } from "@/lib/api/handler";
import { requireCapability } from "@/lib/auth/guards";
import { audit } from "@/lib/audit/audit";
import { Errors } from "@/lib/errors";
import { D365Service } from "@/lib/integrations/d365/service";
import { getCocProducts, saveCocProducts } from "@/lib/coc-products/server";
import { COC_PRODUCTS_KEY, CocProductsConfigSchema, validateCocProducts } from "@/lib/coc-products/types";

export const GET = route(async () => {
  await requireCapability("manageSettings");
  return json({ ok: true, config: await getCocProducts() });
});

export const PUT = route(async (req) => {
  const session = await requireCapability("manageSettings");
  const body = await req.json();
  const cfg = CocProductsConfigSchema.parse(body?.config ?? body);
  const problem = validateCocProducts(cfg);
  if (problem) throw Errors.validation(problem);

  await saveCocProducts(cfg, session.user.id);
  // the production order search caches results per filter – drop them so the change is visible at once
  D365Service.clearCaches();

  await audit({
    entityType: "settings",
    entityId: COC_PRODUCTS_KEY,
    action: "SETTINGS_CHANGED",
    user: session.user,
    details: {
      enabled: cfg.enabled,
      allowSearchAll: cfg.allowSearchAll,
      companies: cfg.companies.map((c) => `${c.company}:${c.items.length}`),
    },
  });
  return json({ ok: true, config: cfg });
});
