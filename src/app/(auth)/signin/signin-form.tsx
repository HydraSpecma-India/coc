"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Loader2, Clock } from "lucide-react";

interface Props {
  callbackUrl: string;
  initialError?: string;
  reason?: string;
  hasEntra: boolean;
}

export function SignInForm({ callbackUrl, initialError, reason, hasEntra }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    if (!initialError) return null;
    if (initialError === "InvalidCredentials" || initialError === "CredentialsSignin") {
      return "Invalid work email or password. Please check your credentials.";
    } else if (initialError === "AccessDenied") {
      return "Your account does not have permission or has been deactivated.";
    } else if (initialError === "SSOUnavailable") {
      return "Microsoft 365 SSO is not currently active.";
    }
    return `Sign-in failed (${initialError}).`;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
        callbackUrl,
      });

      if (res?.error) {
        setError("Invalid email or password. Please check your credentials and try again.");
        setLoading(false);
        return;
      }

      // Successful sign-in: navigate safely to target page without container host leak
      if (callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")) {
        window.location.href = callbackUrl;
        return;
      }
      if (res?.url) {
        try {
          const parsed = new URL(res.url);
          if (parsed.port === "8080" || !parsed.hostname.includes(".")) {
            window.location.href = parsed.pathname + parsed.search;
            return;
          }
          window.location.href = res.url;
          return;
        } catch {
          // ignore
        }
      }
      window.location.href = "/";
    } catch (err) {
      setError((err as Error).message || "An unexpected error occurred during sign-in.");
      setLoading(false);
    }
  };

  const handleSso = async () => {
    if (ssoLoading) return;
    setSsoLoading(true);
    setError(null);
    try {
      await signIn("microsoft-entra-id", { callbackUrl });
    } catch {
      setError("Failed to initiate Microsoft 365 SSO.");
      setSsoLoading(false);
    }
  };

  return (
    <div>
      {reason === "inactivity" && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50/90 p-3.5 text-xs text-amber-900 flex items-start gap-2.5 animate-in fade-in shadow-xs">
          <div className="rounded-full bg-amber-100 p-1 text-amber-700 shrink-0 mt-0.5 border border-amber-200">
            <Clock className="h-4 w-4" />
          </div>
          <div>
            <p className="font-bold text-amber-950">Session Timed Out</p>
            <p className="mt-0.5 text-amber-800 leading-relaxed">
              Your session automatically expired after 30 minutes of inactivity. Please sign in to resume your work.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800 leading-relaxed">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-ink-700 mb-1">Work Email</label>
          <input
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError(null);
            }}
            disabled={loading || ssoLoading}
            className="h-10 w-full rounded-md border border-ink-300 bg-white px-3 text-sm text-ink-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-400 font-medium disabled:opacity-60 disabled:bg-ink-50"
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
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError(null);
            }}
            disabled={loading || ssoLoading}
            className="h-10 w-full rounded-md border border-ink-300 bg-white px-3 text-sm text-ink-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-400 font-medium disabled:opacity-60 disabled:bg-ink-50"
            placeholder="••••••••"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading || ssoLoading}
          className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-brand-500 text-sm font-bold text-ink-900 hover:bg-brand-600 transition-colors shadow-sm cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-ink-900" />
              <span>Signing in...</span>
            </>
          ) : (
            <span>Sign In</span>
          )}
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

      <button
        type="button"
        onClick={handleSso}
        disabled={loading || ssoLoading || !hasEntra}
        className="flex h-11 w-full items-center justify-center gap-2.5 rounded-md border border-ink-300 bg-white text-xs font-semibold text-ink-800 hover:bg-ink-50 transition-colors cursor-pointer shadow-xs disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {ssoLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-ink-600" />
            <span>Connecting to Microsoft 365...</span>
          </>
        ) : (
          <>
            <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden>
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            <span>Sign in with Microsoft 365 (SSO)</span>
          </>
        )}
      </button>
    </div>
  );
}
