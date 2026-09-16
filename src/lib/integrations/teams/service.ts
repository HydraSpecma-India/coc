import { getActiveConfig, DEFAULT_TEAMS_WEBHOOK_URL } from "@/lib/config";
import { logger } from "@/lib/logging/logger";

export { DEFAULT_TEAMS_WEBHOOK_URL };

export interface SendCocTeamsParams {
  cocId?: string | null;
  cocNumber: string;
  productionOrder: string;
  itemNumber: string;
  itemDescription: string;
  customerPO?: string | null;
  customerName?: string | null;
  customerPartNumber?: string | null;
  salesOrder?: string | null;
  serialNumber?: string | null;
  batchNumber?: string | null;
  quantity?: number | null;
  unitOfMeasure?: string | null;
  issuedBy?: string | null;
  issueDate?: string | null;
  pdfBytes?: Uint8Array | null;
  storagePath?: string | null;
}

export interface TeamsSendResult {
  ok: boolean;
  status: number;
  message: string;
}

export class TeamsService {
  /**
   * Tests the connection to the configured Power Automate / Teams webhook.
   */
  static async testConnection(webhookUrlOverride?: string): Promise<TeamsSendResult> {
    const config = await getActiveConfig();
    const url = webhookUrlOverride || config.teams.webhookUrl || DEFAULT_TEAMS_WEBHOOK_URL;

    if (!url || !url.startsWith("http")) {
      throw new Error("Invalid or empty Teams webhook URL configured.");
    }

    const testPayload = {
      test: true,
      title: "COC Platform - Teams Webhook Test",
      message: "This is a test notification from the HydraSpecma COC Platform.",
      text: "This is a test notification from the HydraSpecma COC Platform.",
      summary: "Connection test from COC Platform",
      timestamp: new Date().toISOString(),
      fileName: "test-notification.txt",
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testPayload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok && res.status !== 202 && res.status !== 200 && res.status !== 204) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Webhook responded with status ${res.status} ${res.statusText}: ${errText}`);
      }

      return {
        ok: true,
        status: res.status,
        message: `Successfully connected to Teams webhook! (Status: ${res.status} ${res.statusText})`,
      };
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === "AbortError") {
        throw new Error("Connection timed out after 15 seconds.");
      }
      throw err;
    }
  }

  /**
   * Sends the generated COC PDF and full certificate details to Microsoft Teams via the Power Automate webhook.
   */
  static async sendCocToTeams(params: SendCocTeamsParams): Promise<TeamsSendResult> {
    const config = await getActiveConfig();

    if (!config.teams.enabled) {
      logger.info("Teams webhook integration is disabled in settings, skipping notification.");
      return { ok: true, status: 200, message: "Teams webhook integration is disabled" };
    }

    const url = config.teams.webhookUrl || DEFAULT_TEAMS_WEBHOOK_URL;
    if (!url || !url.startsWith("http")) {
      throw new Error("No valid Teams webhook URL configured.");
    }

    const cocNum = params.cocNumber || "COC-CERTIFICATE";
    const fileName = `${cocNum}.pdf`;
    const issueDateStr = params.issueDate || new Date().toISOString().slice(0, 10);
    const issuedByStr = params.issuedBy || "Quality System";

    const baseUrl = (config.app.url || "").replace(/\/$/, "");
    const pdfUrl = params.cocId ? `${baseUrl}/api/coc/${params.cocId}/pdf` : "";
    const cocUrl = params.cocId ? `${baseUrl}/coc/${params.cocId}` : "";

    const cardActions: Array<Record<string, unknown>> = [];
    if (pdfUrl) {
      cardActions.push({
        type: "Action.OpenUrl",
        title: "📄 View / Download PDF",
        url: pdfUrl,
      });
    }
    if (cocUrl) {
      cardActions.push({
        type: "Action.OpenUrl",
        title: "🔍 Open COC Details",
        url: cocUrl,
      });
    }

    const linksMd = [
      pdfUrl ? `[📄 View / Download PDF](${pdfUrl})` : "",
      cocUrl ? `[🔍 Open COC Details](${cocUrl})` : "",
    ]
      .filter(Boolean)
      .join("  |  ");

    const markdownMessage = [
      `### 📋 Certificate of Conformity Issued`,
      `**COC Number:** ${cocNum}`,
      `**Production Order:** ${params.productionOrder}`,
      `**Item / Part No:** ${params.itemNumber}`,
      `**Description:** ${params.itemDescription}`,
      `**Serial Number:** ${params.serialNumber || "N/A"}`,
      `**Customer PO:** ${params.customerPO || "N/A"}`,
      `**Customer Part No:** ${params.customerPartNumber || "N/A"}`,
      `**Customer:** ${params.customerName || "N/A"}`,
      `**Quantity:** ${params.quantity ?? 1} ${params.unitOfMeasure || "Pcs"}`,
      `**Issued By:** ${issuedByStr}`,
      `**Date:** ${issueDateStr}`,
      linksMd ? `\n${linksMd}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const adaptiveCard: Record<string, unknown> = {
      type: "AdaptiveCard",
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      version: "1.4",
      body: [
        {
          type: "TextBlock",
          text: "📋 Certificate of Conformity Issued",
          weight: "Bolder",
          size: "Medium",
          color: "Good",
        },
        {
          type: "FactSet",
          facts: [
            { title: "COC Number:", value: cocNum },
            { title: "Production Order:", value: params.productionOrder },
            { title: "Part Number:", value: params.itemNumber },
            { title: "Description:", value: params.itemDescription },
            { title: "Serial Number:", value: params.serialNumber || "N/A" },
            { title: "Customer PO:", value: params.customerPO || "N/A" },
            { title: "Customer Part:", value: params.customerPartNumber || "N/A" },
            { title: "Quantity:", value: `${params.quantity ?? 1} ${params.unitOfMeasure || "Pcs"}` },
            { title: "Issued By:", value: issuedByStr },
            { title: "Date:", value: issueDateStr },
          ],
        },
      ],
    };
    if (cardActions.length > 0) {
      adaptiveCard.actions = cardActions;
    }

    const payload: Record<string, unknown> = {
      cocNumber: cocNum,
      productionOrder: params.productionOrder,
      itemNumber: params.itemNumber,
      itemDescription: params.itemDescription,
      customerPO: params.customerPO || "",
      customerName: params.customerName || "",
      customerPartNumber: params.customerPartNumber || "",
      salesOrder: params.salesOrder || "",
      serialNumber: params.serialNumber || "",
      batchNumber: params.batchNumber || "",
      quantity: params.quantity ?? 1,
      unitOfMeasure: params.unitOfMeasure || "Pcs",
      issuedBy: issuedByStr,
      issueDate: issueDateStr,
      storagePath: params.storagePath || "",

      title: `Certificate of Conformity: ${cocNum}`,
      summary: `COC ${cocNum} issued for Production Order ${params.productionOrder} (Item: ${params.itemNumber})`,
      message: markdownMessage,
      text: markdownMessage,
      adaptiveCard,
      adaptiveCardJson: JSON.stringify(adaptiveCard),

      fileName,
      contentType: "application/pdf",
      pdfUrl,
      downloadUrl: pdfUrl,
      cocUrl,
    };

    // Always include fileContent, content, and file object for SharePoint "Create file" in Power Automate.
    // Power Automate HTTP trigger supports payloads up to 100MB, allowing SharePoint to store the complete PDF.
    if (params.pdfBytes && params.pdfBytes.length > 0) {
      const base64Pdf = Buffer.from(params.pdfBytes).toString("base64");
      payload.fileContent = base64Pdf;
      payload.fileContentBase64 = base64Pdf;
      payload.content = base64Pdf;
      payload.file = {
        name: fileName,
        content: base64Pdf,
        contentBytes: base64Pdf,
        "$content-type": "application/pdf",
        "$content": base64Pdf,
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok && res.status !== 202 && res.status !== 200 && res.status !== 204) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Teams webhook error (${res.status} ${res.statusText}): ${errText}`);
      }

      logger.info("COC successfully sent to Teams channel", {
        cocNumber: cocNum,
        status: res.status,
      });

      return {
        ok: true,
        status: res.status,
        message: `Successfully posted ${cocNum} to Teams channel!`,
      };
    } catch (err: any) {
      clearTimeout(timeout);
      logger.error("Failed to send COC to Teams webhook", {
        cocNumber: cocNum,
        error: err.message,
      });
      throw err;
    }
  }
}
