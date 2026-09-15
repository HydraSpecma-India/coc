import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { env } from "@/lib/env";
import { AppShell } from "@/components/layout/AppShell";
import { SessionProvider } from "next-auth/react";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.email) redirect("/signin");
  const e = env();
  return (
    <SessionProvider session={session}>
      <AppShell user={session.user} d365Mode={e.D365_MODE} storageMode={e.STORAGE_MODE}>
        {children}
      </AppShell>
    </SessionProvider>
  );
}
