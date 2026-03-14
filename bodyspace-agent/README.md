# BodySpace Recovery Studio — Marketing Agent

Autonomous AI marketing agent for [BodySpace Recovery Studio](https://bodyspacerecoverystudio.com.au)
(Jandakot, Perth WA). Built with the Claude Agent SDK + TypeScript.

Plans campaigns, monitors competitors, schedules social posts — with full owner approval before anything publishes.

---

## Architecture

```
src/
  orchestrator.ts              Master scheduler — runs all agents on cron
  config.ts                    Config loader (env vars + YAML files)
  db.ts                        SQLite database (better-sqlite3)
  types.ts                     Shared TypeScript types

  agents/
    fresha-watcher/            Polls Fresha availability → PUSH/HOLD/PAUSE signals
    monitor/                   Weekly competitor + trend research (Claude + web search)
    campaign-planner/          Generates campaigns + post drafts (Claude)
    scheduler/                 Queues approved posts in Postiz → Instagram/Facebook

  mcp-servers/
    fresha/                    MCP: reads Fresha booking data
    postiz/                    MCP: schedules posts via Postiz API

  workflows/
    approval.ts                Human-in-the-loop: notify owner, process approvals

  dashboard/
    server.ts                  Express approval UI for the owner

config/
  brand-voice.yaml             BodySpace tone, audience, CTAs, hashtags
  services.yaml                All services with push/pause thresholds
  competitors.yaml             Competitor studios + seasonal trend calendar

data/
  bodyspace.db                 SQLite — campaigns, posts, availability, briefs
  pending-review/              Campaign JSON files awaiting owner review
  trends/                      Weekly trend brief JSON files
```

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Setup (creates .env, data dirs, initialises DB)
npm run setup

# 3. Add your API keys to .env
#    Required: ANTHROPIC_API_KEY
#    Optional: RESEND_API_KEY, OWNER_EMAIL, POSTIZ_API_KEY

# 4. Start the approval dashboard (separate terminal)
npm run start:dashboard
# → http://localhost:3001  (password: bodyspace2025 — change in .env)

# 5. Run all agents once to test
npx tsx src/orchestrator.ts --once

# 6. Start the scheduler (runs on cron)
npm run dev
```

---

## Agent Schedule

| Agent | Schedule | What it does |
|---|---|---|
| **Fresha Watcher** | Daily 8am AWST | Checks booking availability per service, sets PUSH/HOLD/PAUSE signals |
| **Monitor Agent** | Monday 9am AWST | Researches competitor activity + Perth wellness trends via web search |
| **Campaign Planner** | Monday 10am AWST | Generates 4-week campaign with 12 social posts, notifies owner |
| **Scheduler** | On approval | Queues approved posts in Postiz for publishing |

---

## Approval Workflow

```
Agent generates campaign
       ↓
Owner receives email notification
       ↓
Owner opens dashboard → reviews each post → edits copy if needed
       ↓
Owner approves/rejects individual posts
       ↓
Owner approves full campaign
       ↓
Scheduler queues posts in Postiz → Instagram + Facebook
```

**Nothing publishes without explicit owner approval.**

---

## Fresha Integration

Fresha has no public API. Two options:

**Option A — Fresha Data Connector (recommended)**
1. Fresha Dashboard → Reports → Data Connections
2. Enable PostgreSQL export
3. Set `FRESHA_DB_HOST`, `FRESHA_DB_NAME`, `FRESHA_DB_USER`, `FRESHA_DB_PASSWORD` in `.env`

**Option B — Google Sheets via Zapier (~30min setup)**
1. Zapier: "New Appointment in Fresha" → update Google Sheet
2. Sheet columns: `service_id | service_name | available_slots | updated_at`
3. Set `FRESHA_GSHEETS_ID` + `GOOGLE_SERVICE_ACCOUNT_JSON` in `.env`

If neither is configured, the agent uses mock data (useful for development).

---

## Social Media via Postiz

[Postiz](https://github.com/gitroomhq/postiz-app) is an open-source social scheduler.

**Self-hosted (recommended — ~$5/month VPS):**
```bash
git clone https://github.com/gitroomhq/postiz-app
docker-compose up -d
```
Then connect your Instagram Business and Facebook accounts in Postiz.

**Cloud:** https://app.postiz.com

Set `POSTIZ_API_URL` and `POSTIZ_API_KEY` in `.env`.

---

## Manual Controls

```bash
# Run individual agents
npm run agent:fresha      # Check Fresha availability now
npm run agent:monitor     # Run competitor research now
npm run agent:campaign    # Generate a campaign now

# Request a specific campaign focus
npx tsx src/orchestrator.ts --campaign "Focus on Mother's Day gift vouchers"

# Run all agents once (no cron)
npx tsx src/orchestrator.ts --once

# Start the MCP servers (for use with Claude Code or other MCP clients)
npm run mcp:fresha        # Start Fresha MCP server
npm run mcp:postiz        # Start Postiz MCP server
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Your Anthropic API key |
| `RESEND_API_KEY` | Recommended | Email notifications to owner |
| `OWNER_EMAIL` | Recommended | Where to send approval notifications |
| `POSTIZ_API_KEY` | For publishing | Postiz API key |
| `POSTIZ_API_URL` | For publishing | Postiz instance URL |
| `FRESHA_DB_HOST` | One of these | Fresha PostgreSQL data connector |
| `FRESHA_GSHEETS_ID` | One of these | Google Sheets availability fallback |
| `DASHBOARD_PASSWORD` | Optional | Dashboard login (default: bodyspace2025) |

See `.env.example` for the full list.
