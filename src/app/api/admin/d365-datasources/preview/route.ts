import { z } from "zod";
import { route, json } from "@/lib/api/handler";
import { requireCapability } from "@/lib/auth/guards";
import { D365Service } from "@/lib/integrations/d365/service";
import { fetchRelatedData } from "@/lib/d365-data/server";
import { DataSourcesConfigSchema } from "@/lib/d365-data/types";

const schema = z.object({
  productionOrder: z.string().trim().max(60).optional(),
  company: z.string().trim().max(10).optional(),
  /** try the configuration that is open in the editor (not saved yet) */
  config: DataSourcesConfigSchema.optional(),
});

/** Reads one production order and all related tables so the admin can check the relations. */
export const POST = route(async (req) => {
  await requireCapability("manageFields");
  const body = schema.parse(await req.json());
  const po = body.productionOrder?.trim();
  if (!po) return json({ ok: false, error: "Enter a production order number" }, { status: 400 });

  const search = await D365Service.searchProductionOrders(po, body.company || "", "", 5, 0);
  const order = search.orders.find((o) => (o.ProductionOrder || "").toLowerCase() === po.toLowerCase()) || search.orders[0];
  if (!order) return json({ ok: false, error: `Production order "${po}" not found`, mode: search.mode }, { status: 404 });

  const company = body.company || order.dataAreaId || "";
  const cfg = body.config ? { ...body.config, enabled: true } : undefined;
  const related = await fetchRelatedData(order as unknown as Record<string, unknown>, company, cfg);
  return json({ ok: true, mode: search.mode, order, related });
});
