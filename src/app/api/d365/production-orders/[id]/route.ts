import { route, json } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { D365Service } from "@/lib/integrations/d365/service";

export const GET = route(async (_req, { params }) => {
  await requireSession();
  const { id } = await params;
  const order = await D365Service.getProductionOrder(id);
  if (!order) {
    return json({ ok: false, error: "Production order not found" }, { status: 404 });
  }
  return json({ ok: true, order });
});
