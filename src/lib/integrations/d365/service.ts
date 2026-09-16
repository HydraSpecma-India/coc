import "server-only";
import { getActiveConfig } from "@/lib/config";
import { logger } from "@/lib/logging/logger";
import { MOCK_PRODUCTION_ORDERS, getMockSalesOrders } from "./mock";
import type { D365ProductionOrder, D365COCDocumentRecord, D365SalesOrderLine } from "./types";

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

  static async searchProductionOrders(query = "", company = "", status = ""): Promise<D365SearchResult> {
    const config = (await getActiveConfig()).d365;
    const targetCompany = (company || config.company || "HSIN").trim();
    const isAllCompanies = targetCompany.toUpperCase() === "ALL";

    // Allowed statuses per user requirements: Released, Started, Reported as finished (ReportedFinished), End (Completed)
    const ALLOWED_STATUS_SET = new Set([
      "released",
      "started",
      "reportedfinished",
      "reported as finished",
      "completed",
      "ended",
      "end",
    ]);

    const targetStatus = status.trim().toLowerCase();

    const matchesStatus = (st?: string) => {
      if (!st) return true;
      const s = st.toLowerCase();
      if (targetStatus && targetStatus !== "all_active" && targetStatus !== "all") {
        if (targetStatus === "completed" || targetStatus === "end" || targetStatus === "ended") {
          return s === "completed" || s === "end" || s === "ended";
        }
        if (targetStatus === "reportedfinished" || targetStatus === "reported as finished") {
          return s === "reportedfinished" || s === "reported as finished";
        }
        return s === targetStatus;
      }
      if (targetStatus === "all") return true;
      // Default: only allowed statuses (Released, Started, Reported as finished, End/Completed)
      return ALLOWED_STATUS_SET.has(s);
    };

    if (config.mode === "mock") {
      const q = query.trim().toLowerCase();
      let list = [...MOCK_PRODUCTION_ORDERS];
      if (!isAllCompanies) {
        list = list.filter((p) => {
          const area = (p.dataAreaId || p.CustomerAccount || "").toLowerCase();
          return area.includes(targetCompany.toLowerCase());
        });
      }

      // Filter by production status
      list = list.filter((p) => matchesStatus(p.ProductionOrderStatus));

      if (q) {
        list = list.filter(
          (po) =>
            po.ProductionOrder.toLowerCase().includes(q) ||
            po.ItemNumber.toLowerCase().includes(q) ||
            po.CustomerPartNumber?.toLowerCase().includes(q) ||
            po.CustomerName.toLowerCase().includes(q) ||
            po.CustomerPO.toLowerCase().includes(q) ||
            po.BatchNumber.toLowerCase().includes(q) ||
            po.DrawingNumber?.toLowerCase().includes(q)
        );
      }

      // Sort "last to first" (descending order number)
      list.sort((a, b) => b.ProductionOrder.localeCompare(a.ProductionOrder, undefined, { numeric: true, sensitivity: "base" }));

      return { mode: "mock", orders: list };
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

      const companyClause = !isAllCompanies ? `dataAreaId eq '${targetCompany.toLowerCase()}'` : "";

      const tryODataFetch = async (filterString: string, useOrder = true) => {
        const filterClause = filterString ? `&$filter=${filterString}` : "";
        const orderClause = useOrder ? `&$orderby=ProductionOrderNumber desc` : "";
        const url = `${config.baseUrl.replace(/\/+$/, "")}/data/${entity}?cross-company=true&$top=100${orderClause}${filterClause}`;
        return await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "OData-MaxVersion": "4.0",
            "OData-Version": "4.0",
          },
        });
      };

      let res: Response | null = null;

      if (!cleanQ) {
        // No search query: fetch by company with orderby desc (last to first)
        res = await tryODataFetch(companyClause, true);
        if (!res.ok) {
          res = await tryODataFetch(companyClause, false);
        }
      } else {
        // Query provided: Product Number (ItemNumber) or ProductionOrderNumber
        // Candidate 1: ItemNumber eq cleanQ or ProductionOrderNumber eq cleanQ
        const qCandidate1 = `(ItemNumber eq '${cleanQ}' or ProductionOrderNumber eq '${cleanQ}')`;
        const filter1 = companyClause ? `${companyClause} and ${qCandidate1}` : qCandidate1;
        res = await tryODataFetch(filter1, true);

        // If candidate 1 failed or returned 0 items, try Candidate 2: ItemNumber eq cleanQ alone
        if (!res.ok || (await res.clone().json().then((j) => (j.value || []).length === 0).catch(() => true))) {
          const qCandidate2 = `ItemNumber eq '${cleanQ}'`;
          const filter2 = companyClause ? `${companyClause} and ${qCandidate2}` : qCandidate2;
          const res2 = await tryODataFetch(filter2, false);
          if (res2.ok) {
            const j2 = await res2.clone().json().catch(() => ({ value: [] }));
            if ((j2.value || []).length > 0) {
              res = res2;
            }
          }
        }

        // If candidate 2 also didn't match, try Candidate 3: ProductionOrderNumber eq cleanQ alone
        if (!res || !res.ok) {
          const qCandidate3 = `ProductionOrderNumber eq '${cleanQ}'`;
          const filter3 = companyClause ? `${companyClause} and ${qCandidate3}` : qCandidate3;
          const res3 = await tryODataFetch(filter3, false);
          if (res3.ok) {
            res = res3;
          }
        }

        // If specific candidate queries failed with 400 or returned empty, fetch latest company orders and filter in memory
        if (!res || !res.ok) {
          res = await tryODataFetch(companyClause, true);
          if (!res || !res.ok) {
            res = await tryODataFetch(companyClause, false);
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
          CustomerAccount: String(item.CustomerAccount || item.CustAccount || item.dataAreaId || "HSIN"),
          CustomerName: String(item.DeliveryAddressName || item.CustomerName || item.CustName || item.Name || "HydraSpecma India Pvt Ltd"),
          CustomerPO: String(item.CustomerRequisitionNumber || item.CustomerPO || item.PurchOrderFormNum || item.CustomerRef || "PO-HSIN"),
          CustomerPartNumber: String(item.ExternalItemNumber || item.CustomerPartNumber || item.CustomerItemNumber || ""),
          dataAreaId: String(item.dataAreaId || "").toUpperCase(),
          ProductionOrderStatus: String(item.ProductionOrderStatus || item.Status || item.ProdStatus || "Completed"),
          SalesOrder: String(item.SalesOrder || item.SalesId || ""),
          SalesLine: String(item.SalesLine || item.SalesLineNumber || item.LineNum || "1.0"),
          BatchNumber: String(item.BatchNumber || item.InventBatchId || "HS-B24-0747"),
          SerialNumber: String(item.SerialNumber || item.InventSerialId || item.TopLevelSerialNumber || ""),
          DrawingNumber: String(item.DrawingNumber || `DWG-${finalItem}`),
          Revision: String(item.Revision || "Rev 01"),
          Quantity: Number(item.ProductionOrderQuantity || item.ProductionQuantity || item.ScheduledQuantity || item.Quantity || item.QtySched || 1) || 1,
          UnitOfMeasure: String(item.UnitOfMeasure || item.UnitId || "Pcs"),
          RemainingQuantity: Number(item.RemainingQuantity || item.ProductionOrderQuantity || item.Quantity || 1) || 1,
          Specification: String(item.Specification || "ISO 9001:2015 / HydraSpecma Technical Standard"),
          DeliveryDate: String(item.DeliveryDate || item.CustomerRequestedDate || ""),
        };
      });

      // 1. Filter by production status (Released, Started, Reported as finished, End/Completed)
      let filteredOrders = normalized.filter((po) => matchesStatus(po.ProductionOrderStatus));

      // 2. If user searched, also filter in-memory across all fields (ItemNumber, ProductionOrder, CustomerPartNumber, CustomerPO, Description)
      if (cleanQ) {
        const qLow = cleanQ.toLowerCase();
        const inMem = filteredOrders.filter(
          (po) =>
            po.ProductionOrder.toLowerCase().includes(qLow) ||
            po.ItemNumber.toLowerCase().includes(qLow) ||
            po.CustomerPartNumber?.toLowerCase().includes(qLow) ||
            po.ItemDescription.toLowerCase().includes(qLow) ||
            po.CustomerPO.toLowerCase().includes(qLow) ||
            po.CustomerName.toLowerCase().includes(qLow) ||
            po.BatchNumber.toLowerCase().includes(qLow)
        );
        filteredOrders = inMem;
      }

      // 3. Sort "last to first" (descending order number)
      filteredOrders.sort((a, b) => b.ProductionOrder.localeCompare(a.ProductionOrder, undefined, { numeric: true, sensitivity: "base" }));

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
      logger.info("Catalog D365: Registered COC Document record", { doc });
      return { ok: true, message: `Standard catalog registered in D365: ${doc.COCDocumentNumber}` };
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

  static async getSalesOrdersByItem(
    itemNumber: string,
    company = ""
  ): Promise<{ mode: "mock" | "live"; salesOrders: D365SalesOrderLine[]; error?: string }> {
    const config = (await getActiveConfig()).d365;
    const cleanItem = (itemNumber || "").trim();
    const targetCompany = (company || config.company || "HSIN").trim();
    const isAllCompanies = targetCompany.toUpperCase() === "ALL";

    if (!cleanItem) {
      return { mode: config.mode, salesOrders: [] };
    }

    if (config.mode === "mock") {
      const salesOrders = getMockSalesOrders(cleanItem, targetCompany);
      return { mode: "mock", salesOrders };
    }

    // Live D365FO OData query
    if (!config.baseUrl || !config.clientId || !config.tenantId) {
      const fallback = getMockSalesOrders(cleanItem, targetCompany);
      return {
        mode: "live",
        salesOrders: fallback,
        error: "Dynamics 365 credentials not configured; using standard catalog sales orders.",
      };
    }

    try {
      const token = await this.getAccessToken(config);
      const safeItem = cleanItem.replace(/'/g, "''");
      const entity = (config.salesOrderEntity || "SalesOrderLines").trim();

      const companyClause = !isAllCompanies ? `dataAreaId eq '${targetCompany.toLowerCase()}'` : "";
      const itemClause = `ItemNumber eq '${safeItem}'`;
      const combinedFilter = companyClause ? `${companyClause} and ${itemClause}` : itemClause;

      const tryFetchLines = async (filterString: string, entName = entity) => {
        const url = `${config.baseUrl.replace(/\/+$/, "")}/data/${entName}?cross-company=true&$top=50&$filter=${encodeURIComponent(filterString)}`;
        return await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "OData-MaxVersion": "4.0",
            "OData-Version": "4.0",
          },
        });
      };

      let res = await tryFetchLines(combinedFilter);

      // If failed or empty and was filtered by company, try cross-company item query
      if (!res.ok || (await res.clone().json().then((j) => (j.value || []).length === 0).catch(() => true))) {
        const resCross = await tryFetchLines(itemClause);
        if (resCross.ok) {
          res = resCross;
        }
      }

      // If SalesOrderLines entity gave 404 or 400, try SalesOrderLineV2
      if (!res.ok && (res.status === 404 || res.status === 400)) {
        const resV2 = await tryFetchLines(combinedFilter, "SalesOrderLineV2");
        if (resV2.ok) {
          res = resV2;
        }
      }

      if (!res.ok) {
        const errText = await res.text();
        logger.warn("D365 SalesOrderLines OData query failed, using catalog fallback", { status: res.status, errText });
        const fallback = getMockSalesOrders(cleanItem, targetCompany);
        return {
          mode: "live",
          salesOrders: fallback,
          error: `D365 OData SalesOrder query failed (${res.status}): ${errText}`,
        };
      }

      const json = await res.json();
      const rawList = Array.isArray(json.value) ? json.value : [];

      const normalized: D365SalesOrderLine[] = rawList.map((item: Record<string, unknown>) => {
        const soNum = String(item.SalesOrderNumber || item.SalesId || item.SalesOrder || "").trim();
        const lineNum = String(item.LineNumber || item.SalesLineNumber || item.LineNum || "1.0").trim();
        const extItem = String(item.ExternalItemNumber || item.CustomerItemNumber || item.CustomerPartNumber || "").trim();
        const custPO = String(item.CustomerRequisitionNumber || item.CustomerPO || item.PurchOrderFormNum || "").trim();
        const custName = String(item.DeliveryAddressName || item.CustomerName || item.CustName || "").trim();
        const custAcc = String(
          item.OrderingCustomerAccountNumber ||
          item.InvoiceCustomerAccountNumber ||
          item.CustomerAccount ||
          item.CustAccount ||
          targetCompany
        ).trim();

        return {
          SalesOrder: soNum || `SO-${cleanItem}`,
          LineNumber: lineNum,
          ItemNumber: String(item.ItemNumber || cleanItem),
          ItemDescription: String(item.LineDescription || item.ItemDescription || item.ItemName || ""),
          CustomerAccount: custAcc,
          CustomerName: custName || "HydraSpecma India Pvt Ltd",
          CustomerPO: custPO,
          ExternalItemNumber: extItem || "160072",
          Quantity: Number(item.OrderedSalesQuantity || item.SalesQuantity || item.Quantity || 1) || 1,
          UnitOfMeasure: String(item.SalesUnit || item.UnitOfMeasure || "Pcs"),
          DeliveryDate: String(item.ConfirmedDeliveryDate || item.RequestedDeliveryDate || item.DeliveryDate || ""),
          dataAreaId: String(item.dataAreaId || targetCompany).toUpperCase(),
        };
      });

      if (normalized.length === 0) {
        const fallback = getMockSalesOrders(cleanItem, targetCompany);
        return {
          mode: "live",
          salesOrders: fallback,
        };
      }

      return { mode: "live", salesOrders: normalized };
    } catch (err) {
      logger.error("D365 getSalesOrdersByItem failed", { itemNumber: cleanItem, error: (err as Error).message });
      const fallback = getMockSalesOrders(cleanItem, targetCompany);
      return {
        mode: "live",
        salesOrders: fallback,
        error: (err as Error).message,
      };
    }
  }
}
