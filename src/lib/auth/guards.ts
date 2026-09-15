import "server-only";
import { auth } from "@/lib/auth/auth";
import { can, type Capability } from "@/lib/auth/roles";
import { Errors } from "@/lib/errors";
import type { Session } from "next-auth";

export type AppSession = Session & { user: Session["user"] & { id: string } };

/** Returns the session or throws 401. Use in every route handler / server action. */
export async function requireSession(): Promise<AppSession> {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) throw Errors.unauthorized();
  return session as AppSession;
}

/** Throws 403 unless the session role has the capability. Authorization lives here, never in the UI. */
export async function requireCapability(capability: Capability): Promise<AppSession> {
  const session = await requireSession();
  if (!can(session.user.role, capability)) throw Errors.forbidden(capability.replace(/([A-Z])/g, " $1").toLowerCase());
  return session;
}

/** Throws 403 unless the session has one of the required roles. */
export function requireRole(session: Session, roles: readonly string[]): void {
  const role = (session?.user as { role?: string })?.role;
  if (!role || !roles.includes(role)) {
    throw Errors.forbidden(`Requires role: ${roles.join(" or ")}`);
  }
}

