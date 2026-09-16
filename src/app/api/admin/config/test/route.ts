import { NextResponse } from "next/server";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getActiveConfig } from "@/lib/config";

export async function POST(req: Request) {
  const session = await requireSession();
  requireRole(session, ["Admin"]);

  const { target } = await req.json();
  const config = await getActiveConfig();

  if (target === "d365") {
    if (config.d365.mode === "mock") {
      return NextResponse.json({
        ok: true,
        message: "D365 is running in Standard Catalog mode. Standard production orders are available and fully functional.",
      });
    }

    if (!config.d365.baseUrl || !config.d365.clientId || !config.d365.clientSecret || !config.d365.tenantId) {
      return NextResponse.json({
        ok: false,
        error: "Missing live credentials: Base URL, Tenant ID, Client ID, and Client Secret are all required for live mode.",
      }, { status: 400 });
    }

    try {
      // Test OAuth token acquisition from Microsoft login
      const tokenUrl = `https://login.microsoftonline.com/${config.d365.tenantId}/oauth2/v2.0/token`;
      const res = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: config.d365.clientId,
          client_secret: config.d365.clientSecret,
          scope: `${config.d365.baseUrl.replace(/\/+$/, "")}/.default`,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        return NextResponse.json({
          ok: false,
          error: `Entra ID rejected credentials (${res.status}): ${errText}`,
        }, { status: 400 });
      }

      return NextResponse.json({
        ok: true,
        message: "Successfully authenticated with D365FO Azure AD endpoint!",
      });
    } catch (e) {
      return NextResponse.json({
        ok: false,
        error: `Connection failed: ${(e as Error).message}`,
      }, { status: 500 });
    }
  }

  if (target === "sharepoint") {
    if (config.sharepoint.mode === "mock") {
      return NextResponse.json({
        ok: true,
        message: "Storage is configured for HydraSpecma Cloud Storage. Generated certificates will be safely stored in secure cloud storage (coc-generated bucket).",
      });
    }

    if (!config.sharepoint.tenantId || !config.sharepoint.clientId || !config.sharepoint.clientSecret) {
      return NextResponse.json({
        ok: false,
        error: "Missing Microsoft Graph credentials: Azure Tenant ID, Client ID, and Client Secret are required.",
      }, { status: 400 });
    }

    try {
      const tokenUrl = `https://login.microsoftonline.com/${config.sharepoint.tenantId}/oauth2/v2.0/token`;
      const res = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: config.sharepoint.clientId,
          client_secret: config.sharepoint.clientSecret,
          scope: "https://graph.microsoft.com/.default",
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        return NextResponse.json({
          ok: false,
          error: `Graph OAuth failed (${res.status}): ${err}`,
        }, { status: 400 });
      }

      return NextResponse.json({
        ok: true,
        message: "Successfully authenticated with Microsoft Graph API!",
      });
    } catch (e) {
      return NextResponse.json({
        ok: false,
        error: `SharePoint connection error: ${(e as Error).message}`,
      }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: false, error: "Invalid target" }, { status: 400 });
}
