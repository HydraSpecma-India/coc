import "server-only";
import { getActiveConfig } from "@/lib/config";
import { logger } from "@/lib/logging/logger";
import { MOCK_PRODUCTION_ORDERS } from "./mock";
import type { D365ProductionOrder, D365COCDocumentRecord } from "./types";

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

  static async searchProductionOrders(query = ""): Promise<D365ProductionOrder[]> {
    const config = (await getActiveConfig()).d365;

    if (config.mode === "mock") {
      const q = query.trim().toLowerCase();
      if (!q) return MOCK_PRODUCTION_ORDERS;
      return MOCK_PRODUCTION_ORDERS.filter(
        (po) =>
          po.ProductionOrder.toLowerCase().includes(q) ||
          po.ItemNumber.toLowerCase().includes(q) ||
          po.CustomerName.toLowerCase().includes(q) ||
          po.CustomerPO.toLowerCase().includes(q) ||
          po.BatchNumber.toLowerCase().includes(q)
      );
    }

    // Live D365FO OData
    try {
      const token = await this.getAccessToken(config);
      const filterClause = query
        ? `&$filter=contains(ProductionOrder,'${encodeURIComponent(query)}') or contains(ItemNumber,'${encodeURIComponent(query)}')`
        : "";
      const url = `${config.baseUrl.replace(/\/+$/, "")}/data/${config.productionEntity}?cross-company=true&$top=25${filterClause}`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "OData-MaxVersion": "4.0",
          "OData-Version": "4.0",
        },
      });

      if (!res.ok) {
        throw new Error(`D365 OData request failed (${res.status}): ${await res.text()}`);
      }

      const json = await res.json();
      return json.value as D365ProductionOrder[];
    } catch (err) {
      logger.error("D365 live query failed, falling back to mock", { error: (err as Error).message });
      return MOCK_PRODUCTION_ORDERS;
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
      const url = `${config.baseUrl.replace(/\/+$/, "")}/data/${config.productionEntity}?$filter=ProductionOrder eq '${encodeURIComponent(id)}' and dataAreaId eq '${config.company}'`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (!res.ok) throw new Error(`D365 request error: ${res.status}`);
      const json = await res.json();
      return (json.value?.[0] as D365ProductionOrder) || null;
    } catch (err) {
      logger.error("D365 getProductionOrder error", { id, error: (err as Error).message });
      // Fallback
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
