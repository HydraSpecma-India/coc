import { route, json } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { D365Service } from "@/lib/integrations/d365/service";
import { supabaseAdmin } from "@/lib/db/supabase-admin";

export const GET = route(async (req) => {
  await requireSession();
  const q = req.nextUrl.searchParams.get("q") || "";
  const company = req.nextUrl.searchParams.get("company") || "";
  const status = req.nextUrl.searchParams.get("status") || "";
  const deliveryDate = req.nextUrl.searchParams.get("deliveryDate") || "";
  const fromDate = req.nextUrl.searchParams.get("fromDate") || "";
  const toDate = req.nextUrl.searchParams.get("toDate") || "";
  const year = req.nextUrl.searchParams.get("year") || "";
  const limitParam = Number(req.nextUrl.searchParams.get("limit") || "50");
  const limit = Math.min(Math.max(1, limitParam), 100);
  const skip = Math.max(0, Number(req.nextUrl.searchParams.get("skip") || "0"));
  const result = await D365Service.searchProductionOrders(
    q,
    company,
    status,
    limit,
    skip,
    deliveryDate,
    fromDate,
    toDate,
    year
  );

  const orders = result.orders || [];
  if (orders.length > 0) {
    try {
      const sb = supabaseAdmin();
      const poNumbers = orders.map((o) => o.ProductionOrder).filter(Boolean);

      // Query active / non-cancelled COCs for these production orders
      const { data: cocs } = await sb
        .from("coc_documents")
        .select("id, coc_number, production_order, serial_number, quantity, status, created_at")
        .in("production_order", poNumbers)
        .neq("status", "CANCELLED");

      const cocsByPO = new Map<string, Array<{
        id: string;
        coc_number: string;
        serial_number: string | null;
        quantity: number;
        status: string;
        created_at?: string;
      }>>();

      for (const coc of cocs || []) {
        const poKey = (coc.production_order || "").trim().toUpperCase();
        if (!cocsByPO.has(poKey)) cocsByPO.set(poKey, []);
        cocsByPO.get(poKey)!.push({
          id: coc.id,
          coc_number: coc.coc_number || "Pending inspection",
          serial_number: coc.serial_number,
          quantity: Number(coc.quantity) || 1,
          status: coc.status,
          created_at: coc.created_at,
        });
      }

      for (const order of orders) {
        const poKey = (order.ProductionOrder || "").trim().toUpperCase();
        const existingCocs = cocsByPO.get(poKey) || [];
        const certifiedQty = existingCocs.reduce((sum, c) => sum + (Number(c.quantity) || 1), 0);
        const orderQty = Math.max(1, Number(order.Quantity) || 1);
        const pendingQty = Math.max(0, orderQty - certifiedQty);

        order.certifiedQuantity = certifiedQty;
        order.pendingCocQuantity = pendingQty;
        order.isFullyCertified = certifiedQty >= orderQty;
        order.cocList = existingCocs;
      }
    } catch (dbErr) {
      console.warn("Could not enrich production orders with COC data", dbErr);
    }
  }

  return json({
    ok: !result.error,
    mode: result.mode,
    company: company || "HSIN",
    status,
    deliveryDate,
    fromDate,
    toDate,
    year,
    orders,
    total: result.total,
    hasMore: result.hasMore,
    limit,
    skip,
    nextSkip: result.nextSkip,
    error: result.error,
  });
});

