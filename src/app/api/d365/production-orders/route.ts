import { route, json } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { D365Service } from "@/lib/integrations/d365/service";

export const GET = route(async (req) => {
  await requireSession();
  const q = req.nextUrl.searchParams.get("q") || "";
  const company = req.nextUrl.searchParams.get("company") || "";
  const status = req.nextUrl.searchParams.get("status") || "";
  const result = await D365Service.searchProductionOrders(q, company, status);
  return json({ ok: !result.error, mode: result.mode, company: company || "HSIN", status, orders: result.orders, error: result.error });
});
