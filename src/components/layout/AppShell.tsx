"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard, FilePlus2, History, FileText, ListTree, Database, FolderCog, Users, PenTool, ScrollText, Settings, LogOut, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { can, type Role } from "@/lib/auth/roles";
import { Toaster } from "@/components/ui/toast";
import { Badge } from "@/components/ui";
import { APP_VERSION } from "@/lib/version";

interface Props {
  user: { name?: string | null; email: string; role: Role; isDev?: boolean; capabilities?: string[] };
  d365Mode: string;
  storageMode: string;
  children: React.ReactNode;
}

const nav = (role: Role, capabilities?: string[]) => [
  {
    title: "Documents",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard, show: can(role, "dashboard:read", capabilities) },
      { href: "/coc/new", label: "New COC", icon: FilePlus2, show: can(role, "coc:create", capabilities) },
      { href: "/coc/history", label: "Completed COCs", icon: History, show: can(role, "coc:read", capabilities) },
    ],
  },
  {
    title: "Administration",
    items: [
      { href: "/admin/templates", label: "Templates", icon: FileText, show: can(role, "templates:read", capabilities) },
      { href: "/admin/fields", label: "Field Definitions", icon: ListTree, show: can(role, "fields:read", capabilities) },
      { href: "/admin/d365-mappings", label: "D365FO Field Mapping", icon: Database, show: can(role, "d365_mappings:read", capabilities) },
      { href: "/admin/sharepoint", label: "SharePoint Configuration", icon: FolderCog, show: can(role, "sharepoint:read", capabilities) },
      { href: "/admin/users", label: "Users & Roles", icon: Users, show: can(role, "users:read", capabilities) || can(role, "roles:read", capabilities) },
      { href: "/admin/signatures", label: "Signatures", icon: PenTool, show: can(role, "signatures:read", capabilities) },
      { href: "/admin/audit", label: "Audit Logs", icon: ScrollText, show: can(role, "audit:read", capabilities) },
      { href: "/admin/settings", label: "System Settings", icon: Settings, show: can(role, "settings:read", capabilities) },
    ],
  },
];

export function AppShell({ user, d365Mode, storageMode, children }: Props) {
  const pathname = usePathname();
  const isDesigner = pathname.includes("/designer/");
  const isCocNew = pathname.startsWith("/coc/new");
  const groups = nav(user.role, user.capabilities);

  return (
    <div className="flex h-screen overflow-hidden">
      {!isDesigner && (
        <aside className="flex w-64 shrink-0 flex-col border-r border-ink-200 bg-white">
          <Link href="/" prefetch={true} className="flex h-14 items-center gap-2.5 border-b border-ink-200 px-3 hover:bg-ink-50 transition-colors">
            <img
              src="/hydraspecma-logo.png"
              alt="HydraSpecma"
              className="h-8 w-auto object-contain shrink-0"
            />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-ink-900 tracking-tight">COC Platform</span>
                <span className="inline-flex items-center rounded bg-brand-50 px-1 py-0.5 text-[9px] font-bold text-brand-800 border border-brand-200">
                  {APP_VERSION}
                </span>
              </div>
              <div className="text-[11px] font-medium text-ink-500">HydraSpecma</div>
            </div>
          </Link>
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            {groups
              .filter((g) => g.items.some((i) => i.show))
              .map((g) => (
              <div key={g.title} className="mb-5">
                <div className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{g.title}</div>
                {g.items
                  .filter((i) => i.show)
                  .map((i) => {
                    const active = i.href === "/" ? pathname === "/" : pathname.startsWith(i.href);
                    return (
                      <Link
                        key={i.href}
                        href={i.href}
                        prefetch={true}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-ink-700 hover:bg-ink-100 transition-colors",
                          active && "bg-ink-900 text-white hover:bg-ink-900 font-medium",
                        )}
                      >
                        <i.icon className="h-4 w-4 shrink-0" />
                        {i.label}
                      </Link>
                    );
                  })}
              </div>
            ))}
          </nav>
          <div className="border-t border-ink-200 p-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-200 text-xs font-semibold text-ink-700">
                {(user.name || user.email).slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{user.name || user.email}</div>
                <div className="flex items-center gap-1 text-[11px] text-ink-500">
                  <ShieldCheck className="h-3 w-3" /> {user.role}
                </div>
              </div>
              <button onClick={() => signOut({ callbackUrl: "/signin" })} className="rounded p-1.5 text-ink-500 hover:bg-ink-100" title="Sign out">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {d365Mode === "mock" && <Badge tone="info">D365 Catalog</Badge>}
              {storageMode === "mock" && <Badge tone="neutral">HydraSpecma Storage</Badge>}
              {user.isDev && <Badge tone="neutral">Internal User</Badge>}
            </div>
          </div>
        </aside>
      )}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div
          className={cn(
            "flex-1",
            isDesigner || isCocNew ? "overflow-hidden flex flex-col" : "overflow-y-auto px-8 py-6"
          )}
        >
          {children}
        </div>
      </main>
      <Toaster />
    </div>
  );
}
