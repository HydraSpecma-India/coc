import { redirect } from "next/navigation";
import { auth, hasEntraProvider, signIn } from "@/lib/auth/auth";
import { devBypassEnabled } from "@/lib/env";
import { ROLES } from "@/lib/auth/roles";

export const metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  const session = await auth();
  const { callbackUrl = "/", error } = await searchParams;
  if (session?.user?.email) redirect(callbackUrl);
  const entra = hasEntraProvider();
  const dev = devBypassEnabled();

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-100 p-6">
      <div className="w-full max-w-md rounded-xl border border-ink-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-400 text-lg font-bold text-ink-900">H</div>
          <div>
            <h1 className="text-lg font-semibold">COC Platform</h1>
            <p className="text-sm text-ink-500">Certificate of Conformity · HydraSpecma India</p>
          </div>
        </div>

        {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">Sign-in failed ({error}). Please try again or contact IT.</div>}

        {entra ? (
          <form
            action={async () => {
              "use server";
              await signIn("microsoft-entra-id", { redirectTo: callbackUrl });
            }}
          >
            <button className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-ink-900 text-sm font-medium text-white hover:bg-ink-800">
              <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>
              Sign in with Microsoft
            </button>
          </form>
        ) : (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Microsoft Entra ID sign-in is not configured. Set <code>AUTH_MICROSOFT_ENTRA_ID_*</code> (see <code>.env.example</code>).
          </div>
        )}

        {dev && (
          <form
            className="mt-6 border-t border-ink-200 pt-5"
            action={async (fd: FormData) => {
              "use server";
              await signIn("dev", {
                email: String(fd.get("email") || ""),
                name: String(fd.get("name") || ""),
                role: String(fd.get("role") || "Admin"),
                redirectTo: callbackUrl,
              });
            }}
          >
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-600">Development sign-in (AUTH_DEV_BYPASS)</div>
            <div className="grid gap-2">
              <input name="name" defaultValue="Dev Admin" className="h-9 rounded-md border border-ink-300 px-2.5 text-sm" placeholder="Name" />
              <input name="email" defaultValue="dev.admin@local.test" className="h-9 rounded-md border border-ink-300 px-2.5 text-sm" placeholder="Email" />
              <select name="role" className="h-9 rounded-md border border-ink-300 px-2.5 text-sm" defaultValue="Admin">
                {ROLES.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
              <button className="h-9 rounded-md border border-ink-300 bg-white text-sm font-medium hover:bg-ink-50">Continue as local user</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
