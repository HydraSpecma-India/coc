import { route, json } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { D365Service } from "@/lib/integrations/d365/service";
import { supabaseAdmin } from "@/lib/db/supabase-admin";

export const GET = route(async (req) => {
  await requireSession();
  const itemNumber = req.nextUrl.searchParams.get("itemNumber") || "";
  const company = req.nextUrl.searchParams.get("company") || "";
  const status = req.nextUrl.searchParams.get("status") || "Open";
  const result = await D365Service.getSalesOrdersByItem(itemNumber, company, status);

  const salesOrders = result.salesOrders || [];
  if (salesOrders.length > 0) {
    try {
      const sb = supabaseAdmin();
      const soNumbers = salesOrders.map((so) => so.SalesOrder).filter(Boolean);

      // Query active / non-cancelled COCs for these sales orders
      const { data: cocs } = await sb
        .from("coc_documents")
        .select("id, coc_number, production_order, serial_number, sales_order, quantity, status, created_at")
        .in("sales_order", soNumbers)
        .neq("status", "CANCELLED");

      const cocsBySO = new Map<string, Array<{
        id: string;
        coc_number: string;
        production_order: string;
        serial_number: string | null;
        quantity: number;
        status: string;
        created_at?: string;
      }>>();

      for (const coc of cocs || []) {
        const soKey = (coc.sales_order || "").trim().toUpperCase();
        if (!cocsBySO.has(soKey)) cocsBySO.set(soKey, []);
        cocsBySO.get(soKey)!.push({
          id: coc.id,
          coc_number: coc.coc_number || `COC-${coc.id.slice(0, 8)}`,
          production_order: coc.production_order,
          serial_number: coc.serial_number,
          quantity: Number(coc.quantity) || 1,
          status: coc.status,
          created_at: coc.created_at,
        });
      }

      for (const so of salesOrders) {
        const soKey = (so.SalesOrder || "").trim().toUpperCase();
        const assignedCocs = cocsBySO.get(soKey) || [];
        const assignedQty = assignedCocs.reduce((sum, c) => sum + (Number(c.quantity) || 1), 0);
        const soQty = Math.max(1, Number(so.Quantity) || 1);
        const remainingQty = Math.max(0, soQty - assignedQty);

        so.assignedQuantity = assignedQty;
        so.remainingSalesQty = remainingQty;
        so.isFullyAssigned = assignedQty >= soQty;
        so.assignedCocs = assignedCocs;
      }
    } catch (dbErr) {
      console.warn("Could not enrich sales orders with COC data", dbErr);
    }
  }

  return json({
    ok: !result.error,
    mode: result.mode,
    company: company || "HSIN",
    itemNumber,
    salesOrders,
    error: result.error,
  });
});

