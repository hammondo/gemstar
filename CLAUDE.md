# Bodyspace — Claude Code Guide

## Project Overview

Full-stack TypeScript monorepo for Bodyspace Recovery Studio. Automates marketing opportunity detection, campaign content generation (copy + images), owner approval workflows, and publishing to social channels (Instagram/Facebook via Postiz) and website blog (Sanity CMS).

## Monorepo Structure

```
bodyspace/
├── server/      # Express.js backend — port 3000
├── dashboard/   # React 19 + Vite SPA — port 5174
├── website/     # Next.js 14 + Sanity CMS — port 8080
├── doc/         # Roadmap, deployment docs, feature specs
└── Dockerfile   # Builds server + dashboard for Railway.app
```

## Key Commands

```bash
# Run all three dev servers in parallel
npm run dev

# Individual services
npm run dev:server     # port 3000
npm run dev:dashboard  # port 5174
npm run dev:website    # port 8080

# Build
npm run build          # all three
npm run build:server
npm run build:dashboard
npm run build:website

# Tests (Vitest, server only)
npm --prefix server run test
npm --prefix server run test:watch

# Type check
npm --prefix server run lint

# Format
npm run format
npm run format:check

# DB init
npm --prefix server run setup

# Regenerate OpenAPI spec + dashboard types
npm --prefix server run regen:client
```

---

## server/ — Express.js Backend

- **Stack:** Express.js 5 (ES modules, TypeScript), port 3000
- **Database:** SQLite (`better-sqlite3`) — raw SQL, no migrations framework
- **AI:** Anthropic Claude API (agents), Replicate FLUX Schnell (images)
- **Auth:** Microsoft Azure MSAL + express-session (SQLite-backed)
- **Deployment:** Docker → Railway.app

### Structure

```
server/
├── src/
│   ├── index.ts              # Entry point, port 3000
│   ├── routes/               # API route handlers
│   ├── middleware/
│   └── bodyspace/
│       ├── db.ts             # SQLite schema + all query functions
│       ├── types.ts          # Shared TypeScript types
│       ├── config.ts         # Env-var config loading
│       ├── orchestrator.ts   # Agent coordination
│       ├── agents/           # fresha-watcher, monitor, campaign-planner, image-generator, library-generator, scheduler
│       ├── services/         # meta-analytics, sanity-blog-publisher
│       └── workflows/        # approval.ts
├── config/                   # YAML brand config (brand-voice, competitors, services)
└── vitest.config.ts
```

### API Routes

All under `/api`. Protected routes require Microsoft auth session.

- `GET  /api/health`
- `GET  /api/auth/login` → Microsoft OAuth
- `GET  /api/auth/callback`
- `GET  /api/auth/me`
- `POST /api/auth/logout`
- `GET  /api/` → Swagger UI

**Bodyspace routes** (`/api/bodyspace/...`): campaigns, posts, library, signals, trends, settings, agents. Long-running operations use **Server-Sent Events** with `: ping` keep-alives every 25s.

### Database

SQLite at `data/bodyspace.db`. Run `npm --prefix server run setup` to initialise.

Key tables: `service_availability`, `trends_briefs`, `campaigns`, `posts`, `sessions`

### OpenAPI / Type Generation

Zod schemas → OpenAPI spec → TypeScript types for dashboard API client.

- Spec generated at server startup or via `npm run regen:client`
- Dashboard reads `dashboard/src/api/schema.d.ts` (generated) via `openapi-fetch`

### Environment Variables

Copy `server/.env.example` to `server/.env`.

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Claude API |
| `REPLICATE_API_TOKEN` | Image generation |
| `POSTIZ_API_KEY` / `POSTIZ_API_URL` | Social scheduling |
| `RESEND_API_KEY` | Email notifications |
| `MS_CLIENT_ID/SECRET/TENANT_ID` | Azure auth |
| `META_ACCESS_TOKEN` / `META_PAGE_ACCESS_TOKEN` | Facebook/Instagram |
| `SANITY_PROJECT_ID/DATASET/API_TOKEN` | Blog CMS |
| `DASHBOARD_SESSION_SECRET` | Session security |
| `MOCK_ANTHROPIC=true` | Bypass Claude calls in dev |
| `MOCK_IMAGE_GENERATION=true` | Bypass Replicate in dev |
| `DATA_DIR` | Override SQLite + data path (default: `./data`) |
| `CONFIG_DIR` | Override YAML config path (default: `./config`) |

### Development Notes

- ES modules (`"type": "module"`), imports use `.js` extensions even for `.ts` source
- tsconfig targets `ES2022` with `NodeNext` module resolution
- Images served from `data/images/` via `/images/*` static route
- Agent cron schedules configured via env vars (AWST = UTC+8 timezone)
- Playwright used for Fresha login automation (`PLAYWRIGHT_HEADED=1` for debug)

---

## dashboard/ — React + Vite SPA

- **Stack:** React 19, Vite 8, Tailwind CSS v4, TypeScript
- **Port:** 5174 (dev)
- **API client:** `openapi-fetch` with generated types from server's OpenAPI spec

Copy `dashboard/.env.example` to `dashboard/.env`.

---

## website/ — Next.js + Sanity CMS

- **Stack:** Next.js 14 App Router, Sanity v3, Tailwind CSS v4
- **Port:** 8080 (dev) — `npm run dev:website`
- **Deployment:** Vercel (Next.js) + Sanity CDN (Studio at `https://bodyspace.sanity.studio`)

### Key Commands

```bash
npm run dev:website   # Next.js — http://localhost:8080
npm --prefix website run sanity  # Sanity Studio — http://localhost:3333
```

### Structure

```
website/
├── src/app/              # Next.js App Router pages
├── src/components/       # Nav, Footer
├── src/lib/
│   ├── sanity.ts         # Sanity client + urlFor() helper
│   └── queries.ts        # All GROQ queries (single source of truth)
└── sanity/schemas/       # Sanity content schemas
```

### Environment Variables

Copy `website/.env.local.example` to `website/.env.local`.

```
NEXT_PUBLIC_SANITY_PROJECT_ID=...
NEXT_PUBLIC_SANITY_DATASET=production
SANITY_STUDIO_PROJECT_ID=...
SANITY_STUDIO_DATASET=production
```

### Architecture Notes

- **ISR:** Pages use `export const revalidate = 60` — revalidated every 60s after Sanity publishes
- **Images:** All from `cdn.sanity.io` via `urlFor()` helper
- **GROQ queries:** All in `src/lib/queries.ts` — not inline in page components
- **Singletons:** `siteSettings` and `homePage` are singleton documents — no create/delete actions
- **Sanity v3:** Do not use `__experimental_actions` (removed in v3)
