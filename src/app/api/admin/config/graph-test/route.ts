import { NextResponse } from "next/server";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getActiveConfig } from "@/lib/config";

export interface GraphUser {
  id: string;
  displayName: string;
  mail: string | null;
  userPrincipalName: string;
  jobTitle: string | null;
  department: string | null;
}

export interface GraphTestResult {
  ok: boolean;
  users?: GraphUser[];
  managerSample?: { displayName: string; mail: string | null } | null;
  totalCount?: number;
  error?: string;
  permissionsLink?: string;
}

export async function POST(_req: Request): Promise<NextResponse<GraphTestResult>> {
  const session = await requireSession();
  requireRole(session, ["Admin"]);

  const config = await getActiveConfig();
  const { tenantId, clientId, clientSecret } = config.d365;

  if (!tenantId || !clientId || !clientSecret) {
    return NextResponse.json({
      ok: false,
      error: "D365 credentials (Tenant ID, Client ID, Client Secret) must be configured first.",
      permissionsLink: `https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/${clientId ?? ""}`,
    }, { status: 400 });
  }

  // Step 1: Acquire Microsoft Graph token using client_credentials
  let accessToken: string;
  try {
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({ error_description: tokenRes.statusText }));
      return NextResponse.json({
        ok: false,
        error: `Failed to get Graph token (${tokenRes.status}): ${err.error_description ?? err.error ?? tokenRes.statusText}`,
        permissionsLink: `https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/${clientId}`,
      }, { status: 400 });
    }

    const tokenData = await tokenRes.json();
    accessToken = tokenData.access_token as string;
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: `Token request failed: ${(e as Error).message}`,
    }, { status: 500 });
  }

  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };

  // Step 2: Fetch up to 5 users
  try {
    const usersRes = await fetch(
      "https://graph.microsoft.com/v1.0/users?$select=id,displayName,mail,userPrincipalName,jobTitle,department&$top=5&$orderby=displayName",
      { headers }
    );

    if (!usersRes.ok) {
      const err = await usersRes.json().catch(() => ({}));
      const errCode = (err as { error?: { code?: string } })?.error?.code ?? usersRes.status;
      const errMsg = (err as { error?: { message?: string } })?.error?.message ?? usersRes.statusText;
      return NextResponse.json({
        ok: false,
        error: `Graph API returned ${errCode}: ${errMsg}. The app registration likely needs "User.Read.All" or "Directory.Read.All" permission (Application type) granted in Azure Portal.`,
        permissionsLink: `https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/${clientId}`,
      }, { status: 400 });
    }

    const usersData = await usersRes.json() as { value?: GraphUser[] };
    const users: GraphUser[] = usersData.value ?? [];

    // Step 3: Manager lookup for first user (best-effort)
    let managerSample: { displayName: string; mail: string | null } | null = null;
    if (users.length > 0) {
      try {
        const mgrRes = await fetch(
          `https://graph.microsoft.com/v1.0/users/${users[0].id}/manager?$select=displayName,mail`,
          { headers }
        );
        if (mgrRes.ok) {
          const mgr = await mgrRes.json() as { displayName?: string; mail?: string };
          managerSample = { displayName: mgr.displayName ?? "", mail: mgr.mail ?? null };
        }
      } catch {
        // best-effort
      }
    }

    // Step 4: Try to get total user count
    let totalCount: number | undefined;
    try {
      const countRes = await fetch("https://graph.microsoft.com/v1.0/users/$count", {
        headers: { ...headers, ConsistencyLevel: "eventual" },
      });
      if (countRes.ok) {
        totalCount = parseInt(await countRes.text(), 10);
      }
    } catch {
      // optional
    }

    return NextResponse.json({ ok: true, users, managerSample, totalCount });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: `Graph query failed: ${(e as Error).message}`,
    }, { status: 500 });
  }
}
