# COC Platform — HydraSpecma India

Enterprise document-generation platform. First document type: **Certificate of Conformity (COC)** for production orders, with a reusable drag-and-drop **A4 template designer**, configuration-driven fields (D365FO / manual / system / static / signature / image / custom), server-side PDF generation, SharePoint storage and D365 F&O write-back.

| | |
|---|---|
| Frontend | Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 |
| Designer | Konva / react-konva (PDF-point coordinates, multi-page) |
| Backend | Next.js Route Handlers (server-only integrations) |
| Database | Supabase PostgreSQL + Storage (tables prefixed `coc_`) |
| Auth | Auth.js v5 + Microsoft Entra ID, role-based (Admin / Quality / Production / Viewer) |
| ERP | D365 F&O OData (client credentials) |
| Documents | SharePoint via Microsoft Graph |
| PDF | pdf-lib (background PDF pages embedded as vectors) |
| Hosting | Vercel |

## Documentation

| Doc | Content |
|---|---|
| [docs/01-ARCHITECTURE.md](docs/01-ARCHITECTURE.md) | System design, folder structure, auth, field architecture, rendering strategy, PDF library decision, D365/SharePoint design, state machine, phases |
| [docs/02-DATABASE.md](docs/02-DATABASE.md) | Schema (`supabase/migrations/0001_init.sql`) |
| [docs/03-TEMPLATE-SCHEMA.md](docs/03-TEMPLATE-SCHEMA.md) | Template JSON contract (`src/lib/template/schema.ts`) |
| [docs/04-API.md](docs/04-API.md) | REST endpoints per phase |
| [docs/05-SHAREPOINT-SETUP.md](docs/05-SHAREPOINT-SETUP.md) | Site, library, app registration, Graph permissions, IDs, upload |
| [docs/06-D365FO-SETUP.md](docs/06-D365FO-SETUP.md) | Entra app, service user, custom entities, GET/POST/PATCH tests, number sequence |

## Quick start (development)

```bash
npm install
cp .env.example .env.local        # fill in Supabase URL + service role key
# apply the schema once: paste supabase/migrations/0001_init.sql into the Supabase SQL editor (or `supabase db push`)
npm run dev                        # http://localhost:3000
```

Minimum `.env.local` to run Phase 1 **without** an Entra tenant:

```
AUTH_SECRET=<openssl rand -base64 32>
AUTH_DEV_BYPASS=true               # enables "Local development user" sign-in (ignored in production builds)
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key>
D365_MODE=mock
STORAGE_MODE=mock
```

Then: **Admin → Templates → "Create sample HydraSpecma COC"** loads the bundled 7-page reference PDF (`reference/COC-1070.0049-Rev02.pdf`) as background with the standard fields already placed.

## Production (Vercel)

1. Import the repo in Vercel. Build command `next build`, Node 22.
2. Add the variables from `.env.example` under *Environment Variables* — **never** commit real values. `AUTH_DEV_BYPASS` must be absent/false.
3. Entra app registration for sign-in: redirect URI `https://<your-domain>/api/auth/callback/microsoft-entra-id`; optional App Roles `Admin`, `Quality`, `Production`, `Viewer`.
4. First admin: put your email in `ADMIN_EMAILS` (bootstrap), then manage roles in *Admin → Users*.

## Security model

* No secret ever reaches the browser: no `NEXT_PUBLIC_` secrets, Supabase is called only with the service-role key on the server, RLS is enabled on every table with **no** anon policies.
* Authentication is checked in `src/proxy.ts`; **authorization is enforced in every route handler** with `requireCapability()` (`src/lib/auth/roles.ts` is the single capability matrix).
* Published template versions are immutable (DB trigger) — changes require a new version.
* Errors are mapped to `{ error: { code, message, requestId } }`; stack traces stay in server logs.

## Project layout

See *Folder structure* in `docs/01-ARCHITECTURE.md`. Key modules:

```
src/lib/template/schema.ts      zod template JSON schema (single source of truth)
src/lib/template/defaults.ts    element factories
src/lib/template/seed-hydraspecma.ts   sample template built on the reference PDF
src/components/designer/        Konva designer: store (undo/redo), canvas, palette, properties, pages
src/lib/db/repositories/        Supabase data access (server-only)
src/lib/auth/                   Auth.js config, roles, guards
src/lib/api/handler.ts          route wrapper: request id, logging, error mapping
```

## Phase status

| Phase | Status |
|---|---|
| 1 – setup, auth, Supabase, template model, designer (text/image/line/rect/table/checkbox), backgrounds, versions | ✅ |
| 2 – field definitions CRUD, D365 mapping admin, custom fields | ⏳ |
| 3 – COC wizard, D365 retrieval (mock + live), resolver, preview | ⏳ |
| 4 – PDF generation, signature, SharePoint upload, retries | ⏳ |
| 5 – D365 POST/PATCH, history, audit viewer | ⏳ |
| 6 – Power Automate API, notifications | ⏳ |

## Scripts

```bash
npm run dev      # development server
npm run build    # production build (also type-checks)
npm run lint     # eslint
```
