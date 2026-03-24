# Skelly — AI Marketing Autopilot for BodySpace Recovery Studio

## Project Overview

Full-stack TypeScript app that automates detection of marketing opportunities, generates campaign content (copy + images), manages owner approval workflows, and publishes to social channels (Instagram/Facebook via Postiz) and website blog (Sanity CMS).

## Architecture

- **Backend:** Express.js (ES modules, TypeScript), port 3000
- **Frontend:** React 19 + Vite SPA, port 5173 in dev
- **Database:** SQLite (`better-sqlite3`) — raw SQL, no ORM/migrations framework
- **AI:** Anthropic Claude API (agents), Replicate FLUX Schnell (images)
- **Auth:** Microsoft Azure MSAL + express-session (SQLite-backed)
- **Deployment:** Docker → Railway.app (backend), Vercel (website, separate repo)

## Monorepo Structure

```
skelly/
├── server/          # Express backend
│   ├── src/
│   │   ├── index.ts              # Entry point, port 3000
│   │   ├── routes/               # API route handlers
│   │   ├── middleware/
│   │   ├── bodyspace/
│   │   │   ├── db.ts             # SQLite schema + all query functions
│   │   │   ├── types.ts          # Shared TypeScript types
│   │   │   ├── config.ts         # Env-var config loading
│   │   │   ├── orchestrator.ts   # Agent coordination
│   │   │   ├── agents/           # fresha-watcher, monitor, campaign-planner, image-generator, library-generator, scheduler
│   │   │   ├── services/         # meta-analytics, sanity-blog-publisher
│   │   │   └── workflows/        # approval.ts
│   │   └── scripts/              # setup.ts (DB init), dump-openapi.ts
│   ├── config/                   # YAML brand config (brand-voice, competitors, services)
│   └── vitest.config.ts
├── dashboard/       # React + Vite frontend
│   └── src/
│       ├── pages/                # One file per route
│       ├── components/           # Reusable UI
│       └── api/                  # openapi-fetch typed client + schema.d.ts
├── data/            # Gitignored runtime data
│   ├── bodyspace.db              # SQLite DB
│   ├── images/                   # Generated post images
│   └── *.json                    # Persisted settings files
└── doc/             # Documentation (roadmap, deployment, features)
```

## Key Commands

```bash
# Development (runs server + dashboard in parallel)
npm run dev

# Individual services
npm run dev:server    # port 3000
npm run dev:dashboard # port 5173

# Build
npm run build         # tsc (server) + vite (dashboard)

# Tests (Vitest, server only)
npm --prefix server run test
npm --prefix server run test:watch

# Type check (no emit)
npm --prefix server run lint

# Format
npm run format
npm run format:check

# DB init
npm --prefix server run setup

# Regenerate OpenAPI spec + dashboard types
npm --prefix server run dump:openapi
```

## API Structure

All routes under `/api`. Protected routes require Microsoft auth session.

- `GET  /api/health`
- `GET  /api/auth/login` → Microsoft OAuth
- `GET  /api/auth/callback`
- `GET  /api/auth/me`
- `POST /api/auth/logout`
- `GET  /api/` → Swagger UI / OpenAPI spec

**Bodyspace routes** (`/api/bodyspace/...`):
- Campaigns: CRUD + `/review` (SSE)
- Posts: read/update copy/image, approve, reject, schedule, sanity-sync
- Library: list, generate (SSE), schedule, revive
- Signals: availability per service
- Trends: latest brief, refresh (SSE)
- Settings: brand voice + services config
- Agents: manual triggers for all agents (SSE)

Long-running operations use **Server-Sent Events** with `: ping` keep-alives every 25s.

## Database

SQLite at `data/bodyspace.db`. Schema defined in `server/src/bodyspace/db.ts` as raw SQL — no migration framework. Run `npm --prefix server run setup` to initialize.

Key tables: `service_availability`, `trends_briefs`, `campaigns`, `posts`, `sessions`

Some settings persisted as JSON files in `data/` via `settings-store.ts`.

## OpenAPI / Type Generation

Zod schemas → OpenAPI spec → TypeScript types for dashboard API client.

- Spec generated at server startup or via `npm run dump:openapi`
- Dashboard reads `dashboard/src/api/schema.d.ts` (generated) via `openapi-fetch`
- When adding new endpoints: update Zod schemas in route files, re-run dump, types auto-update

## Environment Variables

Copy `server/.env.example` to `server/.env`. Critical vars:

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

## Development Notes

- Backend is ES modules (`"type": "module"` in server package.json), imports use `.js` extensions even for `.ts` source files
- Server tsconfig targets `ES2022` with `NodeNext` module resolution
- Dashboard uses Tailwind CSS v4 (PostCSS plugin, not config file)
- Images served from `data/images/` via `/images/*` static route; `API_BASE_URL` controls public URLs sent to Postiz
- Agent cron schedules configured via env vars (AWST = UTC+8 timezone)
- Playwright used for Fresha login automation (headless by default, `PLAYWRIGHT_HEADED=1` for debug)

## Current Development Status

Feature branch `feature/post-library` is active. Core agents (Milestones 1–3) are complete. Dashboard UX refinement and production hardening remain.
