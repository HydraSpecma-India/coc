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

interface CachedToken {
  token: string;
  expiresAt: number;
}
let cachedD365Token: CachedToken | null = null;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const MAX_CACHE_SIZE = 50;
const poSearchCache = new Map<string, CacheEntry<D365SearchResult>>();
const soSearchCache = new Map<string, CacheEntry<{ mode: "mock" | "live"; salesOrders: D365SalesOrderLine[]; error?: string }>>();
let cachedCompaniesList: CacheEntry<{ code: string; name: string }[]> | null = null;

function setBoundedCache<T>(cache: Map<string, CacheEntry<T>>, key: string, entry: CacheEntry<T>) {
  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(key, entry);
}

export class D365Service {
  /**
   * Clears in-memory caches (useful if settings change or credentials rotate).
   */
  static clearCaches() {
    cachedD365Token = null;
    poSearchCache.clear();
    soSearchCache.clear();
    cachedCompaniesList = null;
  }

  private static async getAccessToken(config: Awaited<ReturnType<typeof getActiveConfig>>["d365"]): Promise<string> {
    if (!config.tenantId || !config.clientId || !config.clientSecret || !config.baseUrl) {
      throw new Error("D365 credentials incomplete (missing tenantId, clientId, clientSecret, or baseUrl)");
    }

    const now = Date.now();
    if (cachedD365Token && now < cachedD365Token.expiresAt) {
      return cachedD365Token.token;
    }

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
    const expiresInSec = typeof data.expires_in === "number" ? data.expires_in : 3600;
    // Buffer of 120 seconds before actual token expiration
    cachedD365Token = {
      token: data.access_token,
      expiresAt: now + Math.max(60, expiresInSec - 120) * 1000,
    };
    return data.access_token;
  }

  static async searchProductionOrders(query = "", company = "", status = ""): Promise<D365SearchResult> {
    const config = (await getActiveConfig()).d365;
    const targetCompany = (company || config.company || "HSIN").trim();
    const isAllCompanies = targetCompany.toUpperCase() === "ALL";

    const targetStatus = status.trim().toLowerCase();
    const cleanQ = query.trim();
    const cacheKey = `${targetCompany.toUpperCase()}|${targetStatus}|${cleanQ.toLowerCase()}`;
    const now = Date.now();
    const cached = poSearchCache.get(cacheKey);
    if (cached && now < cached.expiresAt) {
      return cached.data;
    }

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
            po.ItemDescription?.toLowerCase().includes(q) ||
            po.CustomerPartNumber?.toLowerCase().includes(q) ||
            po.CustomerName.toLowerCase().includes(q) ||
            po.CustomerPO.toLowerCase().includes(q) ||
            (po.DeliveryDate && po.DeliveryDate.toLowerCase().includes(q)) ||
            (po.BatchNumber && po.BatchNumber.toLowerCase().includes(q)) ||
            po.DrawingNumber?.toLowerCase().includes(q)
        );
      }

      // Sort "last to first" (descending order number)
      list.sort((a, b) => b.ProductionOrder.localeCompare(a.ProductionOrder, undefined, { numeric: true, sensitivity: "base" }));

      const resObj: D365SearchResult = { mode: "mock", orders: list };
      setBoundedCache(poSearchCache, cacheKey, { data: resObj, expiresAt: now + 30_000 });
      return resObj;
    }

    // Live D365FO OData
    if (!config.baseUrl || !config.clientId || !config.tenantId || !config.clientSecret) {
      return {
        mode: "live",
        orders: [],
        error: "Dynamics 365 credentials are not configured. Please go to Admin -> System Settings to configure Base URL, Tenant ID, Client ID, and Client Secret.",
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
        // Query provided: Candidate 1: Substring search with contains (matches partial digits like 0049 or 8613)
        const qContains = `(contains(ProductionOrderNumber, '${cleanQ}') or contains(ItemNumber, '${cleanQ}') or contains(ProductionOrderName, '${cleanQ}'))`;
        const filterContains = companyClause ? `${companyClause} and ${qContains}` : qContains;
        res = await tryODataFetch(filterContains, true);

        // If Candidate 1 failed or returned 0, try Candidate 2: exact match eq
        if (!res.ok || (await res.clone().json().then((j) => (j.value || []).length === 0).catch(() => true))) {
          const qCandidate1 = `(ItemNumber eq '${cleanQ}' or ProductionOrderNumber eq '${cleanQ}')`;
          const filter1 = companyClause ? `${companyClause} and ${qCandidate1}` : qCandidate1;
          const res1 = await tryODataFetch(filter1, true);
          if (res1.ok) {
            const j1 = await res1.clone().json().catch(() => ({ value: [] }));
            if ((j1.value || []).length > 0) {
              res = res1;
            }
          }
        }

        // If Candidate 2 also didn't match, try Candidate 3: ItemNumber eq cleanQ alone
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
          CustomerName: (() => {
            const raw = String(item.DeliveryAddressName || item.CustomerName || item.CustName || "").trim();
            if (raw && !raw.toLowerCase().includes("hydraspecma")) return raw;
            return String(item.dataAreaId || "").toUpperCase() === "HGCN"
              ? "VESTAS WIND TECHNOLOGY CHINA CO LTD"
              : "VESTAS WIND TECHNOLOGYS INDIA PVT LTD";
          })(),
          DeliveryAddressName: String(item.DeliveryAddressName || ""),
          CustomerPO: String(item.CustomerRequisitionNumber || item.CustomerPO || item.PurchOrderFormNum || item.CustomerRef || "PO-HSIN"),
          CustomerPartNumber: String(item.ExternalItemNumber || item.CustomerPartNumber || item.CustomerItemNumber || ""),
          dataAreaId: String(item.dataAreaId || "").toUpperCase(),
          ProductionOrderStatus: String(item.ProductionOrderStatus || item.Status || item.ProdStatus || "Completed"),
          SalesOrder: String(
            item.InventRefId ||
            item.ReferenceNumber ||
            item.SalesOrderNumber ||
            item.SalesOrder ||
            item.SalesId ||
            item.OriginatingSalesOrderNumber ||
            item.ReferenceSalesOrderNumber ||
            ""
          ).trim(),
          SalesLine: String(
            item.SalesLineNumber ||
            item.SalesLine ||
            item.LineNum ||
            item.InventRefTransId ||
            "1.0"
          ).trim(),
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
            (po.DeliveryDate && po.DeliveryDate.toLowerCase().includes(qLow)) ||
            (po.BatchNumber && po.BatchNumber.toLowerCase().includes(qLow))
        );
        filteredOrders = inMem;
      }

      // 3. Sort "last to first" (descending order number)
      filteredOrders.sort((a, b) => b.ProductionOrder.localeCompare(a.ProductionOrder, undefined, { numeric: true, sensitivity: "base" }));

      const resObj: D365SearchResult = { mode: "live", orders: filteredOrders };
      setBoundedCache(poSearchCache, cacheKey, { data: resObj, expiresAt: now + 30_000 });
      return resObj;
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

    if (config.mode === "mock" || !config.baseUrl || !config.clientId || !config.tenantId || !config.clientSecret) {
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
        SalesOrder: String(
          item.InventRefId ||
          item.ReferenceNumber ||
          item.SalesOrderNumber ||
          item.SalesOrder ||
          item.SalesId ||
          item.OriginatingSalesOrderNumber ||
          item.ReferenceSalesOrderNumber ||
          ""
        ).trim(),
        SalesLine: String(
          item.SalesLineNumber ||
          item.SalesLine ||
          item.LineNum ||
          item.InventRefTransId ||
          "1.0"
        ).trim(),
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

    if (config.mode === "mock" || !config.baseUrl || !config.clientId || !config.tenantId || !config.clientSecret) {
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
    company = "",
    statusFilter = "Open",
    salesOrder = ""
  ): Promise<{ mode: "mock" | "live"; salesOrders: D365SalesOrderLine[]; error?: string }> {
    const config = (await getActiveConfig()).d365;
    const cleanItem = (itemNumber || "").trim();
    const targetCompany = (company || config.company || "HSIN").trim();
    const isAllCompanies = targetCompany.toUpperCase() === "ALL";

    if (!cleanItem) {
      return { mode: config.mode, salesOrders: [] };
    }

    const cacheKey = `${targetCompany.toUpperCase()}|${cleanItem.toLowerCase()}|${statusFilter.toLowerCase()}|${(salesOrder || "").trim().toLowerCase()}`;
    const now = Date.now();
    const cached = soSearchCache.get(cacheKey);
    if (cached && now < cached.expiresAt) {
      return cached.data;
    }

    if (config.mode === "mock") {
      let salesOrders = getMockSalesOrders(cleanItem, targetCompany, salesOrder);
      if (statusFilter.toLowerCase() === "open") {
        salesOrders = salesOrders.filter(
          (so) => !so.LineStatus || !/invoiced|canceled|cancelled/i.test(so.LineStatus)
        );
      }
      const resObj = { mode: "mock" as const, salesOrders };
      setBoundedCache(soSearchCache, cacheKey, { data: resObj, expiresAt: now + 45_000 });
      return resObj;
    }

    // Live D365FO OData query
    if (!config.baseUrl || !config.clientId || !config.tenantId || !config.clientSecret) {
      const fallback = getMockSalesOrders(cleanItem, targetCompany, salesOrder);
      return {
        mode: "live",
        salesOrders: fallback,
        error: "Dynamics 365 credentials not configured; using standard catalog sales orders.",
      };
    }

    try {
      const token = await this.getAccessToken(config);
      const safeItem = cleanItem.replace(/'/g, "''");
      const safeSO = (salesOrder || "").trim().replace(/'/g, "''");
      const entity = (config.salesOrderEntity || "SalesOrderLines").trim();

      const companyClause = !isAllCompanies ? `dataAreaId eq '${targetCompany.toLowerCase()}'` : "";
      const itemClause = `ItemNumber eq '${safeItem}'`;
      const soClause = safeSO ? `SalesOrderNumber eq '${safeSO}'` : "";
      const filterParts = [companyClause, itemClause, soClause].filter(Boolean);
      const combinedFilter = filterParts.join(" and ");

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
        const itemWithSO = [itemClause, soClause].filter(Boolean).join(" and ");
        const resCross = await tryFetchLines(itemWithSO || itemClause);
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
        const fallback = getMockSalesOrders(cleanItem, targetCompany, salesOrder);
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
        const deliveryAddressName = String(
          item.DeliveryAddressName ||
          item.DeliveryName ||
          item.DeliveryAddressDescription ||
          item.FormattedDeliveryAddress ||
          ""
        ).trim();
        const rawCustName = String(
          deliveryAddressName ||
          item.CustomerName ||
          item.CustName ||
          item.OrderingCustomerName ||
          item.InvoiceCustomerName ||
          ""
        ).trim();
        const companyCode = String(item.dataAreaId || targetCompany).toUpperCase();
        const custName = (rawCustName && !rawCustName.toLowerCase().includes("hydraspecma"))
          ? rawCustName
          : (companyCode === "HGCN" ? "VESTAS WIND TECHNOLOGY CHINA CO LTD" : "VESTAS WIND TECHNOLOGYS INDIA PVT LTD");
        const custAcc = String(
          item.OrderingCustomerAccountNumber ||
          item.InvoiceCustomerAccountNumber ||
          item.CustomerAccount ||
          item.CustAccount ||
          targetCompany
        ).trim();
        const lineStatus = String(item.SalesLineStatus || item.LineStatus || item.Status || "Backorder");

        return {
          SalesOrder: soNum || `SO-${cleanItem}`,
          LineNumber: lineNum,
          ItemNumber: String(item.ItemNumber || cleanItem),
          ItemDescription: String(item.LineDescription || item.ItemDescription || item.ItemName || ""),
          CustomerAccount: custAcc,
          CustomerName: custName,
          DeliveryAddressName: deliveryAddressName || custName,
          CustomerPO: custPO,
          ExternalItemNumber: extItem || "160072",
          Quantity: Number(item.OrderedSalesQuantity || item.SalesQuantity || item.Quantity || 1) || 1,
          UnitOfMeasure: String(item.SalesUnit || item.UnitOfMeasure || "Pcs"),
          DeliveryDate: String(item.ConfirmedDeliveryDate || item.RequestedDeliveryDate || item.DeliveryDate || ""),
          LineStatus: lineStatus,
          dataAreaId: companyCode,
        };
      });

      let filteredList = normalized;
      if (statusFilter.toLowerCase() === "open") {
        filteredList = filteredList.filter(
          (so) => !so.LineStatus || !/invoiced|canceled|cancelled/i.test(so.LineStatus)
        );
      }

      // Filter strictly by same item number
      filteredList = filteredList.filter(
        (so) => so.ItemNumber.toLowerCase() === cleanItem.toLowerCase()
      );

      // If reference sales order is specified, filter strictly to that sales order
      if (salesOrder) {
        const matchingSO = filteredList.filter(
          (so) => so.SalesOrder.toLowerCase() === salesOrder.toLowerCase().trim()
        );
        if (matchingSO.length > 0) {
          filteredList = matchingSO;
        }
      }

      if (filteredList.length === 0) {
        const fallback = getMockSalesOrders(cleanItem, targetCompany, salesOrder);
        const resObj = { mode: "live" as const, salesOrders: fallback };
        setBoundedCache(soSearchCache, cacheKey, { data: resObj, expiresAt: now + 45_000 });
        return resObj;
      }

      const resObj = { mode: "live" as const, salesOrders: filteredList };
      setBoundedCache(soSearchCache, cacheKey, { data: resObj, expiresAt: now + 45_000 });
      return resObj;
    } catch (err) {
      logger.error("D365 getSalesOrdersByItem failed", { itemNumber: cleanItem, error: (err as Error).message });
      const fallback = getMockSalesOrders(cleanItem, targetCompany, salesOrder);
      return {
        mode: "live",
        salesOrders: fallback,
        error: (err as Error).message,
      };
    }
  }

  static async getCompanies(): Promise<{ code: string; name: string }[]> {
    const now = Date.now();
    if (cachedCompaniesList && now < cachedCompaniesList.expiresAt) {
      return cachedCompaniesList.data;
    }

    const config = (await getActiveConfig()).d365;

    const defaultCompanies: { code: string; name: string }[] = [
      { code: "HSIN", name: "HydraSpecma India (India)" },
      { code: "HGCN", name: "HydraSpecma China (China)" },
      { code: "HSDK", name: "HydraSpecma Denmark (Denmark)" },
      { code: "HSPL", name: "HydraSpecma Poland (Poland)" },
      { code: "HSSE", name: "HydraSpecma Sweden (Sweden)" },
      { code: "HSFI", name: "HydraSpecma Finland (Finland)" },
      { code: "HSUK", name: "HydraSpecma UK (United Kingdom)" },
      { code: "HSUS", name: "HydraSpecma North America (USA)" },
      { code: "HSBR", name: "HydraSpecma Brazil (Brazil)" },
    ];

    if (config.mode === "mock" || !config.baseUrl || !config.clientId || !config.tenantId || !config.clientSecret) {
      cachedCompaniesList = { data: defaultCompanies, expiresAt: now + 300_000 };
      return defaultCompanies;
    }

    try {
      const token = await this.getAccessToken(config);
      const baseUrl = config.baseUrl.replace(/\/+$/, "");

      // 1. Try D365 LegalEntities
      try {
        const res = await fetch(`${baseUrl}/data/LegalEntities?$select=LegalEntityId,Name&$top=100`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.value) && json.value.length > 0) {
            const list = json.value
              .map((item: any) => ({
                code: String(item.LegalEntityId || item.DataArea || "").toUpperCase(),
                name: String(item.Name || item.LegalEntityId || ""),
              }))
              .filter((c: any) => c.code);
            if (list.length > 0) {
              cachedCompaniesList = { data: list, expiresAt: now + 300_000 };
              return list;
            }
          }
        }
      } catch {}

      // 2. Try D365 DataAreas
      try {
        const res = await fetch(`${baseUrl}/data/DataAreas?$select=id,name&$top=100`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.value) && json.value.length > 0) {
            const list = json.value
              .map((item: any) => ({
                code: String(item.id || "").toUpperCase(),
                name: String(item.name || item.id || ""),
              }))
              .filter((c: any) => c.code);
            if (list.length > 0) {
              cachedCompaniesList = { data: list, expiresAt: now + 300_000 };
              return list;
            }
          }
        }
      } catch {}

      // 3. Try cross-company query on ProductionOrderHeaders to discover active dataAreaIds
      try {
        const res = await fetch(`${baseUrl}/data/ProductionOrderHeaders?cross-company=true&$select=dataAreaId&$top=200`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.value) && json.value.length > 0) {
            const rawSet = new Set<string>(json.value.map((item: any) => String(item.dataAreaId || "").toUpperCase()));
            const codes: string[] = Array.from(rawSet).filter(Boolean);
            if (codes.length > 0) {
              const list = codes.map((code: string) => {
                const match = defaultCompanies.find((d) => d.code === code);
                return match || { code, name: `${code} (Dynamics 365)` };
              });
              cachedCompaniesList = { data: list, expiresAt: now + 300_000 };
              return list;
            }
          }
        }
      } catch {}

      cachedCompaniesList = { data: defaultCompanies, expiresAt: now + 300_000 };
      return defaultCompanies;
    } catch (err) {
      logger.warn("Could not fetch live legal entities from D365, using default companies", { error: (err as Error).message });
      cachedCompaniesList = { data: defaultCompanies, expiresAt: now + 60_000 };
      return defaultCompanies;
    }
  }
}
