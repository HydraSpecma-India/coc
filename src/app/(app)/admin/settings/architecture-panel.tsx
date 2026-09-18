"use client";

import { useState } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  Badge,
  Button,
  Dialog,
} from "@/components/ui";
import {
  Layers,
  Download,
  Maximize2,
  ExternalLink,
  ShieldCheck,
  Server,
  Database,
  Cloud,
  CheckCircle2,
  Cpu,
  Share2,
  Send,
  KeyRound,
  FileCode,
  LayoutGrid,
  Image as ImageIcon,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "@/components/ui/toast";

export function ArchitecturePanel() {
  const [viewMode, setViewMode] = useState<"diagram" | "interactive" | "mermaid">("diagram");
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const mermaidCode = `flowchart TB
    subgraph Client["Client Tier (Browser)"]
        UI["Next.js 14 Web UI\\n(Responsive Desktop / Tablet)"]
        Designer["Canvas Template Designer\\n(Interactive WYSIWYG)"]
    end

    subgraph AppTier["Application Tier (Azure App Service / Node.js)"]
        NextServer["Next.js App Router Server"]
        AuthModule["Auth.js (NextAuth v5)\\nEntra ID OIDC + Credentials"]
        PDFEngine["PDF Assembly Engine\\n(pdf-lib / Canvas)"]
        CacheLayer["In-Memory LRU & TTL Caches\\n(Tokens, DB Settings, Fields, Skeletons)"]
        Guard["Role & Capability Guard\\n(RBAC Enforcement)"]
    end

    subgraph DataTier["Data & Storage Tier (Supabase)"]
        DB[("Supabase PostgreSQL\\n(11 Core Tables, RLS, Foreign Keys)")]
        Bucket[("Supabase Storage\\n(Background PDFs, Asset Badges)")]
    end

    subgraph External["Microsoft Cloud Ecosystem"]
        Entra["Microsoft Entra ID\\n(SSO, Token Exchange)"]
        D365["Dynamics 365 F&O\\n(OData REST APIs)"]
        SharePoint["SharePoint Online\\n(Microsoft Graph REST API)"]
        Teams["Microsoft Teams\\n(Power Automate Webhook)"]
    end

    UI -->|HTTPS / Next.js Server Actions| NextServer
    Designer -->|Template JSON / Asset Upload| NextServer
    NextServer --> Guard
    Guard --> AuthModule
    AuthModule <-->|OAuth 2.0 / OpenID Connect| Entra
    NextServer --> CacheLayer
    NextServer <-->|SQL Client (Parameterized)| DB
    NextServer <-->|S3 REST / Signed URLs| Bucket
    NextServer --> PDFEngine
    NextServer <-->|OData v4 / Bearer Token| D365
    NextServer <-->|Graph API v1.0 / Bearer Token| SharePoint
    NextServer -->|Adaptive Card Payload| Teams`;

  const copyMermaid = () => {
    navigator.clipboard.writeText(mermaidCode);
    setCopied(true);
    toast.success("Mermaid diagram definition copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader
          title="System Architecture & Cloud Topology"
          description="Enterprise reference architecture illustrating Client Browser Tier, Azure App Service Tier, Supabase Data Tier, and Microsoft Cloud Ecosystem integrations."
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center rounded-lg border border-ink-200 bg-ink-50 p-0.5 text-xs font-semibold">
                <button
                  onClick={() => setViewMode("diagram")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                    viewMode === "diagram"
                      ? "bg-white text-ink-900 shadow-xs font-bold"
                      : "text-ink-600 hover:text-ink-900"
                  }`}
                >
                  <ImageIcon className="h-3.5 w-3.5" /> Blueprint Diagram
                </button>
                <button
                  onClick={() => setViewMode("interactive")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                    viewMode === "interactive"
                      ? "bg-white text-ink-900 shadow-xs font-bold"
                      : "text-ink-600 hover:text-ink-900"
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" /> Tier Breakdown
                </button>
                <button
                  onClick={() => setViewMode("mermaid")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                    viewMode === "mermaid"
                      ? "bg-white text-ink-900 shadow-xs font-bold"
                      : "text-ink-600 hover:text-ink-900"
                  }`}
                >
                  <FileCode className="h-3.5 w-3.5" /> Source Spec
                </button>
              </div>

              <a
                href="/architecture-diagram.png"
                download="coc-platform-architecture.png"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-ink-200 bg-white text-ink-800 hover:bg-ink-50 transition-colors shadow-2xs"
              >
                <Download className="h-3.5 w-3.5 text-brand-700" />
                Download PNG
              </a>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setFullscreenOpen(true)}
                className="text-xs gap-1.5"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                Fullscreen
              </Button>
            </div>
          }
        />

        <CardBody className="space-y-6">
          {/* VIEW MODE 1: Blueprint Diagram */}
          {viewMode === "diagram" && (
            <div className="space-y-4">
              <div className="relative rounded-xl border border-ink-800 bg-[#121417] p-4 shadow-lg overflow-hidden flex flex-col items-center justify-center">
                {/* Visual Blueprint Grid Overlay */}
                <div
                  className="absolute inset-0 opacity-[0.04] pointer-events-none"
                  style={{
                    backgroundImage:
                      "linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)",
                    backgroundSize: "24px 24px",
                  }}
                />

                <div className="w-full flex items-center justify-between mb-3 px-2 text-xs text-slate-400 border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="font-mono font-semibold text-slate-300">
                      HydraSpecma COC Platform &bull; Cloud Topology Reference
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-[11px]">
                    <span className="text-slate-400">Resolution: 1920x1080</span>
                    <button
                      onClick={() => setFullscreenOpen(true)}
                      className="text-brand-400 hover:text-brand-300 font-bold underline inline-flex items-center gap-1"
                    >
                      Click to Enlarge <Maximize2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* Diagram Image */}
                <div
                  onClick={() => setFullscreenOpen(true)}
                  className="cursor-zoom-in w-full flex items-center justify-center rounded-lg border border-slate-800/80 bg-slate-950/80 p-2 sm:p-4 hover:border-brand-500/50 transition-all group"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/architecture-diagram.png"
                    alt="System Architecture Diagram"
                    className="w-full max-h-[640px] object-contain rounded drop-shadow-md group-hover:scale-[1.008] transition-transform duration-200"
                  />
                </div>

                <div className="w-full flex flex-wrap items-center justify-between mt-3 px-2 text-[11px] text-slate-400 gap-2">
                  <span>Architecture Model: Four-Tier Scalable Azure App Service + Supabase + Microsoft Graph Cloud Ecosystem</span>
                  <span className="font-mono text-slate-500">ISO 9001 &bull; SOC 2 Type II Compliant Topology</span>
                </div>
              </div>
            </div>
          )}

          {/* VIEW MODE 2: Interactive Tier Breakdown */}
          {viewMode === "interactive" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Tier 1 */}
                <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-sky-100 text-sky-800">
                        <Layers className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-ink-900">1. Client Tier (Browser)</h4>
                        <p className="text-[11px] text-ink-500">Desktop & Tablet Browsers</p>
                      </div>
                    </div>
                    <Badge tone="info">Frontend</Badge>
                  </div>
                  <ul className="space-y-2 text-xs text-ink-700">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-sky-600 mt-0.5 shrink-0" />
                      <div>
                        <strong>Next.js 14 Web UI:</strong> Server components with instant client hydration and &lt;16ms pre-fetched transitions.
                      </div>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-sky-600 mt-0.5 shrink-0" />
                      <div>
                        <strong>Canvas Template Designer:</strong> Interactive WYSIWYG editor using Konva.js with millimeter snapping and background overlays.
                      </div>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-sky-600 mt-0.5 shrink-0" />
                      <div>
                        <strong>Protocols:</strong> HTTPS / TLS 1.3, Next.js Server Actions, REST APIs.
                      </div>
                    </li>
                  </ul>
                </div>

                {/* Tier 2 */}
                <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-brand-100 text-brand-900">
                        <Server className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-ink-900">2. Application Tier</h4>
                        <p className="text-[11px] text-ink-500">Azure App Service / Node.js 20</p>
                      </div>
                    </div>
                    <Badge tone="brand">Node.js Engine</Badge>
                  </div>
                  <ul className="space-y-2 text-xs text-ink-700">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-brand-700 mt-0.5 shrink-0" />
                      <div>
                        <strong>Next.js App Router Server:</strong> Serverless-ready Node.js runtime executing API routes, session guards, and background jobs.
                      </div>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-brand-700 mt-0.5 shrink-0" />
                      <div>
                        <strong>Auth.js & RBAC Guard:</strong> NextAuth v5 managing Entra ID SSO + Credentials with role capability evaluation.
                      </div>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-brand-700 mt-0.5 shrink-0" />
                      <div>
                        <strong>In-Memory LRU & TTL Caches:</strong> High-performance caching for D365 bearer tokens, field mappings, and app settings.
                      </div>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-brand-700 mt-0.5 shrink-0" />
                      <div>
                        <strong>PDF Assembly Engine:</strong> Multi-layer vector rendering using `pdf-lib` and `@pdf-lib/fontkit` with digital signatures.
                      </div>
                    </li>
                  </ul>
                </div>

                {/* Tier 3 */}
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-emerald-100 text-emerald-800">
                        <Database className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-ink-900">3. Data & Storage Tier</h4>
                        <p className="text-[11px] text-ink-500">Supabase Managed Infrastructure</p>
                      </div>
                    </div>
                    <Badge tone="success">PostgreSQL & S3</Badge>
                  </div>
                  <ul className="space-y-2 text-xs text-ink-700">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700 mt-0.5 shrink-0" />
                      <div>
                        <strong>Supabase PostgreSQL:</strong> 11 relational tables with Row-Level Security, audit triggers, and sub-50ms indexed queries.
                      </div>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700 mt-0.5 shrink-0" />
                      <div>
                        <strong>Supabase Storage:</strong> S3-compatible buckets for template backgrounds, inspector signature PNGs, and rendered PDFs.
                      </div>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700 mt-0.5 shrink-0" />
                      <div>
                        <strong>Transport:</strong> Parameterized SQL client + S3 REST with 24-hour signed URLs.
                      </div>
                    </li>
                  </ul>
                </div>

                {/* Tier 4 */}
                <div className="rounded-xl border border-purple-200 bg-purple-50/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-purple-100 text-purple-800">
                        <Cloud className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-ink-900">4. Microsoft Cloud Ecosystem</h4>
                        <p className="text-[11px] text-ink-500">Connected Enterprise Services</p>
                      </div>
                    </div>
                    <Badge tone="neutral">M365 & Azure</Badge>
                  </div>
                  <ul className="space-y-2 text-xs text-ink-700">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-purple-700 mt-0.5 shrink-0" />
                      <div>
                        <strong>Dynamics 365 F&O:</strong> OData v4 REST API querying Production Orders & Sales Line allocations.
                      </div>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-purple-700 mt-0.5 shrink-0" />
                      <div>
                        <strong>SharePoint Online:</strong> Microsoft Graph API v1.0 automatically uploading issued certificates to document libraries.
                      </div>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-purple-700 mt-0.5 shrink-0" />
                      <div>
                        <strong>Microsoft Teams:</strong> Power Automate Incoming Webhook delivering rich Adaptive Card alerts upon COC generation.
                      </div>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-purple-700 mt-0.5 shrink-0" />
                      <div>
                        <strong>Microsoft Entra ID:</strong> Enterprise Single Sign-On via OAuth 2.0 / OIDC.
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* VIEW MODE 3: Mermaid Source Spec */}
          {viewMode === "mermaid" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-700">Mermaid.js Flowchart Source:</span>
                <Button variant="outline" size="sm" onClick={copyMermaid} className="gap-1.5 text-xs">
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied!" : "Copy Mermaid"}
                </Button>
              </div>
              <pre className="rounded-lg border border-ink-200 bg-slate-900 text-slate-100 p-4 font-mono text-xs overflow-x-auto leading-relaxed shadow-inner">
                {mermaidCode}
              </pre>
            </div>
          )}

          {/* Protocols & Connections Matrix */}
          <div className="pt-4 border-t border-ink-200 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink-600 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-brand-600" />
              Interface & Protocols Matrix
            </h4>
            <div className="overflow-x-auto rounded-lg border border-ink-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-ink-50/80 border-b border-ink-200 font-semibold text-ink-800">
                  <tr>
                    <th className="px-3 py-2.5">Component / System</th>
                    <th className="px-3 py-2.5">Protocol / Interface</th>
                    <th className="px-3 py-2.5">Authentication</th>
                    <th className="px-3 py-2.5">Port / Encryption</th>
                    <th className="px-3 py-2.5">Responsibility</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 bg-white">
                  <tr>
                    <td className="px-3 py-2 font-medium text-ink-900">Dynamics 365 F&O</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-brand-800">OData v4 REST API</td>
                    <td className="px-3 py-2">Bearer Token (OAuth 2.0 Client Credentials)</td>
                    <td className="px-3 py-2 font-mono text-[11px]">TCP 443 / TLS 1.3</td>
                    <td className="px-3 py-2 text-ink-600">Production orders, sales lines & customer parts</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-medium text-ink-900">SharePoint Online</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-brand-800">Microsoft Graph REST v1.0</td>
                    <td className="px-3 py-2">Bearer Token (App-Only Graph Token)</td>
                    <td className="px-3 py-2 font-mono text-[11px]">TCP 443 / TLS 1.3</td>
                    <td className="px-3 py-2 text-ink-600">Official COC PDF archival and document management</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-medium text-ink-900">Microsoft Teams</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-brand-800">Adaptive Card Webhook</td>
                    <td className="px-3 py-2">Signed Webhook Secret / HTTPS URL</td>
                    <td className="px-3 py-2 font-mono text-[11px]">TCP 443 / TLS 1.3</td>
                    <td className="px-3 py-2 text-ink-600">Instant notification of generated certificates to channels</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-medium text-ink-900">Microsoft Entra ID</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-brand-800">OpenID Connect / OAuth 2.0</td>
                    <td className="px-3 py-2">Auth Code + PKCE / Secret</td>
                    <td className="px-3 py-2 font-mono text-[11px]">TCP 443 / TLS 1.3</td>
                    <td className="px-3 py-2 text-ink-600">Enterprise Single Sign-On and user identity</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-medium text-ink-900">Supabase Database</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-brand-800">PostgreSQL Wire Protocol</td>
                    <td className="px-3 py-2">Service Role / Anon JWT</td>
                    <td className="px-3 py-2 font-mono text-[11px]">TCP 5432 / TLS 1.3</td>
                    <td className="px-3 py-2 text-ink-600">System settings, field mappings, users, audit logs</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-medium text-ink-900">Supabase Storage</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-brand-800">S3-Compatible REST</td>
                    <td className="px-3 py-2">HMAC Signed URLs / Service Token</td>
                    <td className="px-3 py-2 font-mono text-[11px]">TCP 443 / TLS 1.3</td>
                    <td className="px-3 py-2 text-ink-600">Template background PDFs, inspector stamps & assets</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Fullscreen Enlarge Modal */}
      <Dialog
        open={fullscreenOpen}
        onClose={() => setFullscreenOpen(false)}
        title="High-Resolution Architecture Blueprint"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-[#121417] p-2 sm:p-4 shadow-xl overflow-hidden flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/architecture-diagram.png"
              alt="High-Resolution System Architecture"
              className="w-full max-h-[80vh] object-contain rounded"
            />
          </div>
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-ink-500 font-mono">
              Four-Tier Architecture &bull; Next.js 14 &bull; Azure App Service &bull; Supabase &bull; Microsoft Graph
            </span>
            <div className="flex gap-2">
              <a
                href="/architecture-diagram.png"
                download="coc-platform-architecture.png"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-brand-500 hover:bg-brand-600 text-ink-900 shadow-2xs"
              >
                <Download className="h-3.5 w-3.5" />
                Download Original
              </a>
              <Button variant="outline" size="sm" onClick={() => setFullscreenOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
