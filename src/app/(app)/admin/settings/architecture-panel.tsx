"use client";

import { useState, useRef } from "react";
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
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ShieldCheck,
  Server,
  Database,
  Cloud,
  CheckCircle2,
  FileCode,
  LayoutGrid,
  Image as ImageIcon,
  Copy,
  Check,
  Move,
  Sparkles,
} from "lucide-react";
import { toast } from "@/components/ui/toast";

export function ArchitecturePanel() {
  const [viewMode, setViewMode] = useState<"diagram" | "interactive" | "mermaid">("diagram");
  const [zoom, setZoom] = useState(100);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [fullscreenZoom, setFullscreenZoom] = useState(100);
  const [copied, setCopied] = useState(false);

  const mermaidCode = `flowchart TB
    subgraph Client["Client Tier (Browser)"]
        UI["Next.js 14 Web UI\n(Responsive Desktop / Tablet)"]
        Designer["Canvas Template Designer\n(Interactive WYSIWYG)"]
    end

    subgraph AppTier["Application Tier (Azure App Service / Node.js)"]
        NextServer["Next.js App Router Server"]
        AuthModule["Auth.js (NextAuth v5)\nEntra ID OIDC + Credentials"]
        PDFEngine["PDF Assembly Engine\n(pdf-lib / Canvas)"]
        CacheLayer["In-Memory LRU & TTL Caches\n(Tokens, DB Settings, Fields, Skeletons)"]
        Guard["Role & Capability Guard\n(RBAC Enforcement)"]
    end

    subgraph DataTier["Data & Storage Tier (Supabase)"]
        DB[("Supabase PostgreSQL\n(11 Core Tables, RLS, Foreign Keys)")]
        Bucket[("Supabase Storage\n(Background PDFs, Asset Badges)")]
    end

    subgraph External["Microsoft Cloud Ecosystem"]
        Entra["Microsoft Entra ID\n(SSO, Token Exchange)"]
        D365["Dynamics 365 F&O\n(OData REST APIs)"]
        SharePoint["SharePoint Online\n(Microsoft Graph REST API)"]
        Teams["Microsoft Teams\n(Power Automate Webhook)"]
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

  const handleZoomIn = () => setZoom((z) => Math.min(z + 25, 200));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 25, 50));
  const handleResetZoom = () => setZoom(100);

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader
          title="System Architecture & Cloud Topology"
          description="Vector reference architecture illustrating Client Browser Tier, Azure App Service Tier, Supabase Data Tier, and Microsoft Cloud Ecosystem integrations."
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
                  <ImageIcon className="h-3.5 w-3.5" /> Vector Blueprint
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

              <div className="flex items-center gap-1.5">
                <a
                  href="/architecture-diagram.svg"
                  download="coc-architecture-diagram.svg"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md border border-ink-200 bg-white text-ink-800 hover:bg-ink-50 transition-colors shadow-2xs"
                  title="Download vector SVG (crystal-clear infinite resolution)"
                >
                  <Download className="h-3.5 w-3.5 text-brand-700" />
                  Vector SVG
                </a>
                <a
                  href="/architecture-diagram.png"
                  download="coc-architecture-diagram.png"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md border border-ink-200 bg-white text-ink-800 hover:bg-ink-50 transition-colors shadow-2xs"
                  title="Download PNG image"
                >
                  <Download className="h-3.5 w-3.5 text-brand-700" />
                  PNG
                </a>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFullscreenZoom(100);
                  setFullscreenOpen(true);
                }}
                className="text-xs gap-1.5"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                Fullscreen
              </Button>
            </div>
          }
        />

        <CardBody className="space-y-6">
          {/* VIEW MODE 1: Vector Blueprint Diagram */}
          {viewMode === "diagram" && (
            <div className="space-y-3">
              {/* Controls Toolbar */}
              <div className="flex items-center justify-between bg-slate-900 text-slate-300 px-3.5 py-2 rounded-t-xl border border-slate-800 text-xs flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                    High-Definition Vector Canvas (100% Scalable, Zero Blur)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-0.5 border border-slate-700">
                    <button
                      onClick={handleZoomOut}
                      className="p-1 rounded hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                      title="Zoom Out"
                    >
                      <ZoomOut className="h-3.5 w-3.5" />
                    </button>
                    <span className="font-mono px-2 text-[11px] font-bold text-brand-400 min-w-[45px] text-center">
                      {zoom}%
                    </span>
                    <button
                      onClick={handleZoomIn}
                      className="p-1 rounded hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                      title="Zoom In"
                    >
                      <ZoomIn className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetZoom}
                    className="text-[11px] h-7 px-2 text-slate-400 hover:text-white hover:bg-slate-800 gap-1"
                  >
                    <RotateCcw className="h-3 w-3" /> Reset
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setFullscreenZoom(100);
                      setFullscreenOpen(true);
                    }}
                    className="text-[11px] h-7 px-2 border-slate-700 text-slate-200 hover:bg-slate-800 gap-1"
                  >
                    <Maximize2 className="h-3 w-3" /> Enlarge
                  </Button>
                </div>
              </div>

              {/* Vector Diagram Scrollable Canvas */}
              <div className="relative rounded-b-xl border-x border-b border-slate-800 bg-[#111318] p-4 shadow-xl overflow-auto max-h-[750px] cursor-grab active:cursor-grabbing">
                <div
                  style={{
                    width: `${(1380 * zoom) / 100}px`,
                    minWidth: "100%",
                    transition: "width 0.15s ease-out",
                  }}
                  className="mx-auto"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/architecture-diagram.svg"
                    alt="System Architecture Diagram (Vector Crisp)"
                    className="w-full h-auto object-contain select-none pointer-events-none drop-shadow-xl"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between text-[11px] text-ink-500 px-1 pt-1 gap-2">
                <span className="flex items-center gap-1.5">
                  <Move className="h-3 w-3 text-brand-600" />
                  <strong>Navigation:</strong> Use the zoom controls above (+ / -) and scroll horizontally or vertically to inspect any node in crisp detail.
                </span>
                <span className="font-mono text-ink-400">Resolution: Vector Scalable &bull; Clean Typography &bull; ISO 9001 Reference</span>
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
                        <p className="text-[11px] text-ink-500">Desktop &amp; Tablet Browsers</p>
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
                        <strong>Auth.js &amp; RBAC Guard:</strong> NextAuth v5 managing Entra ID SSO + Credentials with role capability evaluation.
                      </div>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-brand-700 mt-0.5 shrink-0" />
                      <div>
                        <strong>In-Memory LRU &amp; TTL Caches:</strong> High-performance caching for D365 bearer tokens, field mappings, and app settings.
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
                        <h4 className="text-sm font-bold text-ink-900">3. Data &amp; Storage Tier</h4>
                        <p className="text-[11px] text-ink-500">Supabase Managed Infrastructure</p>
                      </div>
                    </div>
                    <Badge tone="success">PostgreSQL &amp; S3</Badge>
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
                    <Badge tone="neutral">M365 &amp; Azure</Badge>
                  </div>
                  <ul className="space-y-2 text-xs text-ink-700">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-purple-700 mt-0.5 shrink-0" />
                      <div>
                        <strong>Dynamics 365 F&amp;O:</strong> OData v4 REST API querying Production Orders &amp; Sales Line allocations.
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
              Interface &amp; Protocols Matrix
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
                    <td className="px-3 py-2 font-medium text-ink-900">Dynamics 365 F&amp;O</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-brand-800">OData v4 REST API</td>
                    <td className="px-3 py-2">Bearer Token (OAuth 2.0 Client Credentials)</td>
                    <td className="px-3 py-2 font-mono text-[11px]">TCP 443 / TLS 1.3</td>
                    <td className="px-3 py-2 text-ink-600">Production orders, sales lines &amp; customer parts</td>
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
                    <td className="px-3 py-2 text-ink-600">Template background PDFs, inspector stamps &amp; assets</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Fullscreen Enlarge Modal with Wide Container and Dedicated Zoom Controls */}
      <Dialog
        open={fullscreenOpen}
        onClose={() => setFullscreenOpen(false)}
        title="High-Definition Architecture Topology Blueprint"
        width="max-w-7xl w-11/12"
      >
        <div className="space-y-3">
          {/* Modal Toolbar */}
          <div className="flex items-center justify-between bg-slate-900 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-800 text-xs">
            <span className="font-semibold text-slate-200">
              Vector Blueprint Canvas (Crisp 100% Native Resolution)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setFullscreenZoom((z) => Math.max(z - 25, 50))}
                className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
                title="Zoom Out"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="font-mono text-[11px] font-bold text-brand-400 min-w-[40px] text-center">
                {fullscreenZoom}%
              </span>
              <button
                onClick={() => setFullscreenZoom((z) => Math.min(z + 25, 200))}
                className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
                title="Zoom In"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFullscreenZoom(100)}
                className="text-[11px] h-6 px-1.5 text-slate-400 hover:text-white"
              >
                Reset
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#111318] p-4 shadow-2xl overflow-auto max-h-[75vh]">
            <div
              style={{
                width: `${(1380 * fullscreenZoom) / 100}px`,
                minWidth: "100%",
                transition: "width 0.15s ease-out",
              }}
              className="mx-auto"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/architecture-diagram.svg"
                alt="High-Definition Vector Architecture Diagram"
                className="w-full h-auto object-contain select-none pointer-events-none drop-shadow-xl"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 flex-wrap gap-2">
            <span className="text-xs text-ink-500 font-mono">
              Four-Tier Architecture &bull; Next.js 14 &bull; Azure App Service &bull; Supabase &bull; Microsoft Graph
            </span>
            <div className="flex items-center gap-2">
              <a
                href="/architecture-diagram.svg"
                download="coc-architecture-diagram.svg"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-brand-500 hover:bg-brand-600 text-ink-900 shadow-2xs"
              >
                <Download className="h-3.5 w-3.5" />
                Download Vector SVG
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
