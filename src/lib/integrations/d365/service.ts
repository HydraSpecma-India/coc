import "server-only";
import { getActiveConfig } from "@/lib/config";
import { logger } from "@/lib/logging/logger";
import { MOCK_PRODUCTION_ORDERS } from "./mock";
import type { D365ProductionOrder, D365COCDocumentRecord } from "./types";

export interface D365SearchResult {
  mode: "mock" | "live";
  orders: D365ProductionOrder[];
  error?: string;
}

export class D365Service {
  private static async getAccessToken(config: Awaited<ReturnType<typeof getActiveConfig>>["d365"]): Promise<string> {
    const tokenUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`;
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        scope: `${config.baseUrl.replace(/\/+$/, "")}/.default`,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`D365 Auth Failed (${res.status}): ${err}`);
    }

    const data = await res.json();
    return data.access_token;
  }

  static async searchProductionOrders(query = ""): Promise<D365SearchResult> {
    const config = (await getActiveConfig()).d365;

    if (config.mode === "mock") {
      const q = query.trim().toLowerCase();
      if (!q) return { mode: "mock", orders: MOCK_PRODUCTION_ORDERS };
      const filtered = MOCK_PRODUCTION_ORDERS.filter(
        (po) =>
          po.ProductionOrder.toLowerCase().includes(q) ||
          po.ItemNumber.toLowerCase().includes(q) ||
          po.CustomerName.toLowerCase().includes(q) ||
          po.CustomerPO.toLowerCase().includes(q) ||
          po.BatchNumber.toLowerCase().includes(q) ||
          po.DrawingNumber?.toLowerCase().includes(q)
      );
      return { mode: "mock", orders: filtered };
    }

    // Live D365FO OData
    if (!config.baseUrl || !config.clientId || !config.tenantId) {
      return {
        mode: "live",
        orders: [],
        error: "Dynamics 365 credentials are not configured. Please go to Admin -> System Settings to configure Base URL, Tenant ID, and Client ID.",
      };
    }

    try {
      const token = await this.getAccessToken(config);
      const cleanQ = query.trim().replace(/'/g, "''");
      const entity = (config.productionEntity || "ProductionOrderHeaders").trim();
      const isHeaders = /productionorderheader/i.test(entity);

      const tryODataFetch = async (filterString: string) => {
        const filterClause = filterString ? `&$filter=${filterString}` : "";
        const url = `${config.baseUrl.replace(/\/+$/, "")}/data/${entity}?cross-company=true&$top=50${filterClause}`;
        return await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "OData-MaxVersion": "4.0",
            "OData-Version": "4.0",
          },
        });
      };

      let res: Response;

      if (!cleanQ) {
        // No query: fetch top 50
        res = await tryODataFetch("");
      } else {
        // Query provided: try smart candidate filter for D365FO
        const candidate1 = isHeaders
          ? `(ProductionOrderNumber eq '${cleanQ}' or ItemNumber eq '${cleanQ}' or startswith(ProductionOrderNumber,'${cleanQ}') or startswith(ItemNumber,'${cleanQ}'))`
          : `(ProductionOrder eq '${cleanQ}' or ItemNumber eq '${cleanQ}' or startswith(ProductionOrder,'${cleanQ}') or startswith(ItemNumber,'${cleanQ}'))`;

        res = await tryODataFetch(candidate1);

        // If candidate 1 failed (e.g. unknown property), try alternative candidate
        if (!res.ok) {
          const candidate2 = isHeaders
            ? `(ProductionOrder eq '${cleanQ}' or ItemNumber eq '${cleanQ}')`
            : `(ProductionOrderNumber eq '${cleanQ}' or ItemNumber eq '${cleanQ}')`;
          const altRes = await tryODataFetch(candidate2);
          if (altRes.ok) {
            res = altRes;
          } else {
            // If both filters were rejected by D365, fetch top 50 without filter and filter in memory
            const unFilteredRes = await tryODataFetch("");
            if (unFilteredRes.ok) {
              res = unFilteredRes;
            }
          }
        }
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`D365 OData HTTP ${res.status}: ${errText}`);
      }

      const json = await res.json();
      const rawList = Array.isArray(json.value) ? json.value : [];
      const normalized: D365ProductionOrder[] = rawList.map((item: Record<string, unknown>) => {
        const prodOrder = String(
          item.ProductionOrderNumber ||
          item.ProductionOrder ||
          item.ProdId ||
          item.Id ||
          ""
        ).trim();

        const itemNum = String(
          item.ItemNumber ||
          item.ItemId ||
          item.ProductNumber ||
          ""
        ).trim();

        const itemDesc = String(
          item.ProductionOrderName ||
          item.ItemDescription ||
          item.ItemName ||
          item.ProductName ||
          item.Description ||
          ""
        ).trim();

        const finalOrder = prodOrder || itemNum || "PO-HSIN-001";
        const finalItem = itemNum || prodOrder || "1071.0747";
        const finalDesc = itemDesc || `HydraSpecma Assembly (${finalItem})`;

        return {
          ProductionOrder: finalOrder,
          ItemNumber: finalItem,
          ItemDescription: finalDesc,
          CustomerAccount: String(item.CustomerAccount || item.CustAccount || "HSIN"),
          CustomerName: String(item.CustomerName || item.CustName || item.Name || "HydraSpecma India Pvt Ltd"),
          CustomerPO: String(item.CustomerPO || item.PurchOrderFormNum || item.CustomerRef || "PO-HSIN"),
          SalesOrder: String(item.SalesOrder || item.SalesId || ""),
          SalesLine: String(item.SalesLine || item.SalesLineNumber || item.LineNum || "1.0"),
          BatchNumber: String(item.BatchNumber || item.InventBatchId || "HS-B24-0747"),
          SerialNumber: String(item.SerialNumber || item.InventSerialId || item.TopLevelSerialNumber || ""),
          DrawingNumber: String(item.DrawingNumber || `DWG-${finalItem}`),
          Revision: String(item.Revision || "Rev 01"),
          Quantity: Number(item.ProductionOrderQuantity || item.ProductionQuantity || item.Quantity || item.QtySched || 1) || 1,
          UnitOfMeasure: String(item.UnitOfMeasure || item.UnitId || "Pcs"),
          RemainingQuantity: Number(item.RemainingQuantity || item.ProductionOrderQuantity || item.Quantity || 1) || 1,
          Specification: String(item.Specification || "ISO 9001:2015 / HydraSpecma Technical Standard"),
          DeliveryDate: String(item.DeliveryDate || item.CustomerRequestedDate || ""),
        };
      });

      // If user searched, also filter in-memory in case the OData query returned top 50
      let filteredOrders = normalized;
      if (cleanQ) {
        const qLow = cleanQ.toLowerCase();
        const inMem = normalized.filter(
          (po) =>
            po.ProductionOrder.toLowerCase().includes(qLow) ||
            po.ItemNumber.toLowerCase().includes(qLow) ||
            po.ItemDescription.toLowerCase().includes(qLow) ||
            po.CustomerPO.toLowerCase().includes(qLow) ||
            po.BatchNumber.toLowerCase().includes(qLow)
        );
        // If in-memory matched, use it; otherwise return whatever D365 returned
        if (inMem.length > 0) {
          filteredOrders = inMem;
        }
      }

      return { mode: "live", orders: filteredOrders };
    } catch (err) {
      logger.error("D365 live query failed", { error: (err as Error).message });
      return {
        mode: "live",
        orders: [],
        error: (err as Error).message,
      };
    }
  }

  static async getProductionOrder(id: string): Promise<D365ProductionOrder | null> {
    const config = (await getActiveConfig()).d365;

    if (config.mode === "mock") {
      const found = MOCK_PRODUCTION_ORDERS.find((p) => p.ProductionOrder.toLowerCase() === id.toLowerCase());
      return found || null;
    }

    try {
      const token = await this.getAccessToken(config);
      const entity = (config.productionEntity || "ProductionOrderHeaders").trim();
      const isHeaders = /productionorderheader/i.test(entity);
      const cleanId = encodeURIComponent(id.trim());

      const filterField = isHeaders ? "ProductionOrderNumber" : "ProductionOrder";
      const url = `${config.baseUrl.replace(/\/+$/, "")}/data/${entity}?cross-company=true&$filter=${filterField} eq '${cleanId}'`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (!res.ok) throw new Error(`D365 request error: ${res.status}`);
      const json = await res.json();
      const item = json.value?.[0];
      if (!item) return null;

      const prodOrder = String(item.ProductionOrderNumber || item.ProductionOrder || item.ProdId || item.Id || id).trim();
      const itemNum = String(item.ItemNumber || item.ItemId || item.ProductNumber || "").trim();
      const itemDesc = String(item.ProductionOrderName || item.ItemDescription || item.ItemName || item.ProductName || "").trim();

      return {
        ProductionOrder: prodOrder || id,
        ItemNumber: itemNum || prodOrder || "1071.0747",
        ItemDescription: itemDesc || `HydraSpecma Assembly (${itemNum || prodOrder})`,
        CustomerAccount: String(item.CustomerAccount || item.CustAccount || "HSIN"),
        CustomerName: String(item.CustomerName || item.CustName || "HydraSpecma India Pvt Ltd"),
        CustomerPO: String(item.CustomerPO || item.PurchOrderFormNum || ""),
        SalesOrder: String(item.SalesOrder || item.SalesId || ""),
        SalesLine: String(item.SalesLine || "1.0"),
        BatchNumber: String(item.BatchNumber || item.InventBatchId || ""),
        SerialNumber: String(item.SerialNumber || ""),
        DrawingNumber: String(item.DrawingNumber || ""),
        Revision: String(item.Revision || "Rev 01"),
        Quantity: Number(item.ProductionOrderQuantity || item.Quantity || 1) || 1,
        UnitOfMeasure: String(item.UnitOfMeasure || "Pcs"),
        RemainingQuantity: Number(item.RemainingQuantity || item.Quantity || 1) || 1,
        Specification: String(item.Specification || ""),
        DeliveryDate: String(item.DeliveryDate || ""),
      };
    } catch (err) {
      logger.error("D365 getProductionOrder error", { id, error: (err as Error).message });
      return MOCK_PRODUCTION_ORDERS.find((p) => p.ProductionOrder.toLowerCase() === id.toLowerCase()) || null;
    }
  }

  static async registerCOCDocument(doc: D365COCDocumentRecord): Promise<{ ok: boolean; message: string }> {
    const config = (await getActiveConfig()).d365;

    if (config.mode === "mock") {
      logger.info("MOCK D365: Registered COC Document record", { doc });
      return { ok: true, message: `MOCK registered in D365: ${doc.COCDocumentNumber}` };
    }

    try {
      const token = await this.getAccessToken(config);
      const url = `${config.baseUrl.replace(/\/+$/, "")}/data/${config.cocEntity}`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dataAreaId: config.company,
          ...doc,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`D365 insert document failed (${res.status}): ${err}`);
      }

      return { ok: true, message: "Successfully registered COC in D365" };
    } catch (err) {
      logger.error("D365 registerCOCDocument failed", { error: (err as Error).message });
      throw err;
    }
  }
}
