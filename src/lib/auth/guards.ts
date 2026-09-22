import "server-only";
import { auth } from "@/lib/auth/auth";
import { can, canPermission, type Capability, type PermissionAction } from "@/lib/auth/roles";
import { getCapabilitiesForRole } from "@/lib/db/repositories/roles";
import { Errors } from "@/lib/errors";
import type { Session } from "next-auth";

export type AppSession = Session & { user: Session["user"] & { id: string } };

/** Returns the session or throws 401. Use in every route handler / server action. */
export async function requireSession(): Promise<AppSession> {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) throw Errors.unauthorized();
  return session as AppSession;
}

/** Throws 403 unless the session role has the capability or permission. */
export async function requireCapability(capability: Capability | string): Promise<AppSession> {
  const session = await requireSession();
  const caps = session.user.capabilities || (await getCapabilitiesForRole(session.user.role));
  if (!can(session.user.role, capability, caps)) {
    throw Errors.forbidden(capability.replace(/([A-Z])/g, " $1").toLowerCase());
  }
  return session;
}

/** Throws 403 unless the session role has the specific D365FO CRUD permission on a resource. */
export async function requirePermission(resource: string, action: PermissionAction): Promise<AppSession> {
  const session = await requireSession();
  const caps = session.user.capabilities || (await getCapabilitiesForRole(session.user.role));
  if (!canPermission(session.user.role, resource, action, caps)) {
    throw Errors.forbidden(`${action.toUpperCase()} permission required for ${resource}`);
  }
  return session;
}

/** Throws 403 unless the signed-in user has the Admin role (used for destructive template actions). */
export async function requireAdmin(): Promise<AppSession> {
  const session = await requireSession();
  if (String(session.user.role || "").toLowerCase() !== "admin") {
    throw Errors.forbidden("Only administrators can deactivate or delete templates");
  }
  return session;
}

/** Throws 403 unless the session has one of the required roles. */
export function requireRole(session: Session, roles: readonly string[]): void {
  const role = (session?.user as { role?: string })?.role;
  if (!role) {
    throw Errors.forbidden(`Requires role: ${roles.join(" or ")}`);
  }
  if (role.toLowerCase() === "admin") return;
  if (roles.map((r) => r.toLowerCase()).includes(role.toLowerCase())) return;

  throw Errors.forbidden(`Requires role: ${roles.join(" or ")}`);
}

/** Non-throwing capability check for a session already loaded. */
export async function sessionCan(session: AppSession, capability: Capability | string): Promise<boolean> {
  const caps = session.user.capabilities || (await getCapabilitiesForRole(session.user.role));
  return can(session.user.role, capability, caps);
}

/** True when the user may work with documents of this company (allowed companies on the user). */
export function companyAllowed(session: AppSession, company?: string | null): boolean {
  const allowed = (session.user.allowedCompanies || ["ALL"]).map((c) => String(c).toUpperCase());
  return allowed.length === 0 || allowed.includes("ALL") || allowed.includes(String(company || "").toUpperCase());
}
