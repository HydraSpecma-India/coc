import { redirect } from "next/navigation";
import { auth, hasEntraProvider, signIn } from "@/lib/auth/auth";

export const metadata = { title: "Sign in - COC Platform" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  const { callbackUrl = "/", error } = await searchParams;
  if (session?.user?.email && session.user.id) redirect(callbackUrl);

  let errorMessage: string | null = null;
  if (error) {
    if (error === "InvalidCredentials" || error === "CredentialsSignin") {
      errorMessage = "Invalid email or password. Please check your credentials and try again.";
    } else if (error === "AccessDenied") {
      errorMessage = "Your account does not have permission to access the platform or has been deactivated.";
    } else if (error === "SSOUnavailable") {
      errorMessage = "Microsoft 365 SSO is not currently active. Please sign in with your email and password.";
    } else {
      errorMessage = `Sign-in failed (${error}). Please try again.`;
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-100 p-6">
      <div className="w-full max-w-md rounded-xl border border-ink-200 bg-white p-8 shadow-sm">
        {/* Brand Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-400 text-xl font-black text-ink-900 shadow-sm">
            H
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-ink-900">COC Platform</h1>
            <p className="text-xs text-ink-500 font-medium">Certificate of Conformity • HydraSpecma India</p>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800 leading-relaxed">
            {errorMessage}
          </div>
        )}

        {/* Primary Email & Password Login Form */}
        <form
          action={async (fd: FormData) => {
            "use server";
            const email = String(fd.get("email") || "").trim();
            const password = String(fd.get("password") || "");

            try {
              await signIn("credentials", {
                email,
                password,
                redirectTo: callbackUrl,
              });
            } catch (err: unknown) {
              if (
                (err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT") ||
                (err as Error)?.message?.includes("NEXT_REDIRECT")
              ) {
                throw err;
              }
              redirect(`/signin?error=InvalidCredentials`);
            }
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-ink-700 mb-1">Work Email</label>
            <input
              name="email"
              type="email"
              autoComplete="email"
              className="h-10 w-full rounded-md border border-ink-300 bg-white px-3 text-sm text-ink-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-400 font-medium"
              placeholder="name@hydraspecma.com"
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-ink-700">Password</label>
            </div>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              className="h-10 w-full rounded-md border border-ink-300 bg-white px-3 text-sm text-ink-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-400 font-medium"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            className="mt-2 flex h-11 w-full items-center justify-center rounded-md bg-brand-500 text-sm font-bold text-ink-900 hover:bg-brand-600 transition-colors shadow-sm cursor-pointer"
          >
            Sign In
          </button>
        </form>

        {/* Live Microsoft 365 SSO Section */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-ink-200" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-ink-400 font-medium">Or continue with</span>
          </div>
        </div>

        <form
          action={async () => {
            "use server";
            if (hasEntraProvider()) {
              await signIn("microsoft-entra-id", { redirectTo: callbackUrl });
            } else {
              redirect(`/signin?error=SSOUnavailable`);
            }
          }}
        >
          <button
            type="submit"
            className="flex h-11 w-full items-center justify-center gap-2.5 rounded-md border border-ink-300 bg-white text-xs font-semibold text-ink-800 hover:bg-ink-50 transition-colors cursor-pointer shadow-xs"
          >
            <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden>
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            Sign in with Microsoft 365 (SSO)
          </button>
        </form>

        <div className="mt-6 text-center text-[11px] text-ink-400">
          Authorized HydraSpecma personnel only &bull; ISO 9001:2015 Compliant
        </div>
      </div>
    </div>
  );
}
