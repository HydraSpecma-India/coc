import NextAuth, { type NextAuthConfig } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Credentials from "next-auth/providers/credentials";
import { adminEmails, devBypassEnabled, env } from "@/lib/env";
import { isRole, type Role } from "@/lib/auth/roles";
import { upsertUserOnSignIn } from "@/lib/db/repositories/users";
import { logger } from "@/lib/logging/logger";

declare module "next-auth" {
  interface Session {
    user: {
      id: string; // users.id (Supabase)
      email: string;
      name?: string | null;
      role: Role;
      isDev?: boolean;
    };
  }
}

/**
 * Role resolution order:
 *  1. Entra App Role claim ("roles") when present
 *  2. users.role from Supabase
 *  3. ADMIN_EMAILS bootstrap
 *  4. Viewer
 */
function roleFromClaims(claims: unknown): Role | undefined {
  const roles = (claims as { roles?: unknown })?.roles;
  if (Array.isArray(roles)) {
    for (const r of roles) if (isRole(r)) return r;
  }
  return undefined;
}

const providers: NextAuthConfig["providers"] = [];

if (env().AUTH_MICROSOFT_ENTRA_ID_ID) {
  providers.push(
    MicrosoftEntraID({
      clientId: env().AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: env().AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: env().AUTH_MICROSOFT_ENTRA_ID_ISSUER,
      authorization: { params: { scope: "openid profile email User.Read" } },
    }),
  );
}

if (devBypassEnabled()) {
  // Development-only sign-in. Not registered when NODE_ENV=production.
  providers.push(
    Credentials({
      id: "dev",
      name: "Local development user",
      credentials: {
        email: { label: "Email", type: "email" },
        name: { label: "Name", type: "text" },
        role: { label: "Role", type: "text" },
      },
      async authorize(c) {
        const email = String(c?.email || "dev.admin@local.test").toLowerCase();
        const role = isRole(c?.role) ? c.role : "Admin";
        return { id: `dev:${email}`, email, name: String(c?.name || "Dev User"), role, isDev: true } as never;
      },
    }),
  );
}

export const authConfig: NextAuthConfig = {
  providers,
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/signin" },
  trustHost: true,
  callbacks: {
    async jwt({ token, user, account, profile, trigger }) {
      // First sign-in: persist the user and resolve the role.
      if (user && (account || trigger === "signIn")) {
        const email = (user.email || token.email || "").toLowerCase();
        const claimRole = roleFromClaims(profile);
        const isDev = (user as { isDev?: boolean }).isDev === true;
        const devRole = (user as { role?: Role }).role;
        try {
          const dbUser = await upsertUserOnSignIn({
            entraObjectId: (profile as { oid?: string })?.oid ?? (isDev ? user.id : undefined),
            email,
            displayName: user.name ?? undefined,
            roleHint: isDev ? devRole : claimRole,
            bootstrapAdmin: adminEmails().includes(email),
          });
          token.uid = dbUser.id;
          token.role = dbUser.role;
          token.active = dbUser.active;
        } catch (err) {
          // Supabase not reachable: allow sign-in with a minimal, non-persisted identity
          logger.error("user upsert failed during sign-in", { email, error: (err as Error).message });
          token.uid = user.id;
          token.role = isDev ? devRole : claimRole ?? (adminEmails().includes(email) ? "Admin" : "Viewer");
          token.active = true;
        }
        token.isDev = isDev;
        token.email = email;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = String(token.uid ?? "");
      session.user.email = String(token.email ?? "");
      session.user.role = isRole(token.role) ? token.role : "Viewer";
      session.user.isDev = token.isDev === true;
      if (token.active === false) {
        // Deactivated users get a Viewer session with no id → every guard fails.
        session.user.role = "Viewer";
        session.user.id = "";
      }
      return session;
    },
  },
  logger: {
    error: (e) => logger.error("auth error", { error: e.message }),
    warn: (code) => logger.warn("auth warning", { code }),
    debug: () => {},
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

export const hasSignInProvider = () => providers.length > 0;
export const hasEntraProvider = () => Boolean(env().AUTH_MICROSOFT_ENTRA_ID_ID);
