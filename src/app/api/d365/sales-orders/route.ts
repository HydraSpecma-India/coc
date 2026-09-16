import { route, json } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { D365Service } from "@/lib/integrations/d365/service";

export const GET = route(async (req) => {
  await requireSession();
  const itemNumber = req.nextUrl.searchParams.get("itemNumber") || "";
  const company = req.nextUrl.searchParams.get("company") || "";
  const result = await D365Service.getSalesOrdersByItem(itemNumber, company);
  return json({
    ok: !result.error,
    mode: result.mode,
    company: company || "HSIN",
    itemNumber,
    salesOrders: result.salesOrders,
    error: result.error,
  });
});
