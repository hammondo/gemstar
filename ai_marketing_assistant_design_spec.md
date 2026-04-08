# AI-Driven Marketing Assistant — Product Design Specification

## 1) Product Vision

A **dashboard-based AI marketing assistant** that helps service-based
businesses: - Understand market opportunities - Prioritise services for
upcoming campaigns - Generate campaign strategies - Create channel-ready
posts (image/video + copy) - Persist drafts and performance history -
Continuously improve recommendations from results

This is **not full autopilot**. The human remains in control, while AI
acts as a strategic and creative co-pilot.

------------------------------------------------------------------------

## 2) Core User Story

**As a business owner with multiple services,** I want to **prioritise
which services matter most this campaign**, so the assistant can **focus
research, strategy, and content generation on my highest-value offers**.

### Primary flow

1.  User logs into dashboard
2.  Dashboard loads current services from backend
3.  User drag-sorts service priorities
4.  User saves campaign priorities
5.  AI runs market research against priority-weighted services
6.  AI suggests campaign strategy
7.  AI generates post concepts
8.  User edits drafts
9.  User schedules or exports posts
10. Performance data feeds future recommendations

------------------------------------------------------------------------

## 3) Dashboard Information Architecture

## A. Services & Prioritisation

Purpose: establish campaign focus.

### Features

- Current services list
- Drag-and-drop ordering
- Optional weighting slider (1–10)
- Campaign objective per service
- Budget allocation %
- Save priority set as template

### Example UI

- Service Name
- Priority Rank
- Weight
- Target Persona
- Campaign Goal
- Expected ROI

------------------------------------------------------------------------

## B. Market Insights

AI-powered research tailored to selected priorities.

### Inputs

- Industry
- Competitors
- Geography
- Audience
- Service priorities
- Historical campaign performance

### Outputs

- Trending topics
- Competitor gaps
- Audience pain points
- High-intent keywords
- Suggested positioning angles
- Seasonal opportunities

------------------------------------------------------------------------

## C. Campaign Strategy Builder

Turns research into executable strategy.

### AI Suggestions

- Campaign theme
- Messaging pillars
- Funnel stages
- Channel recommendations
- CTA suggestions
- Weekly posting cadence
- Budget split recommendations

------------------------------------------------------------------------

## D. Content Studio

Generate individual assets.

### Supported generation

- Social captions
- Carousel concepts
- Blog outlines
- Email nurture sequences
- Image prompts
- Video prompts
- Reference-photo/video-based creative generation

### Asset types

- Static image
- Animated short-form video
- Story/Reel
- LinkedIn post
- X thread
- Facebook post
- Landing page hero copy

------------------------------------------------------------------------

## E. Scheduler / Export

- Publish calendar
- Channel selection
- Draft queue
- Approval workflow
- Export to social scheduler
- Webhook integrations

------------------------------------------------------------------------

## F. Performance Feedback Loop

Closes the learning loop.

### Metrics

- CTR
- Saves
- Shares
- Lead conversions
- Cost per lead
- ROAS
- Service-level attribution

AI uses this to improve future: - service prioritisation - creative
angles - channel mix - posting times

------------------------------------------------------------------------

## 4) Detailed User Flow — Service Prioritisation

### Screen 1: Dashboard Landing

System calls: `GET /api/services`

User sees: - all services - prior ranking - current campaign status

### Screen 2: Prioritise

User actions: - drag reorder services - assign weights - choose campaign
objective - optionally exclude services

### Screen 3: Save

System calls: `POST /api/priorities`

Payload:

``` json
{
  "campaignId": "cmp_001",
  "services": [
    { "id": "svc_1", "rank": 1, "weight": 10 },
    { "id": "svc_2", "rank": 2, "weight": 7 }
  ]
}
```

### Screen 4: AI Strategy

System calls: `POST /api/campaign-suggestions`

Returns: - recommended theme - best channels - 5–10 post ideas - media
suggestions - video/image prompt suggestions

------------------------------------------------------------------------

## 5) React Front-End Architecture

## Component Tree

- `DashboardPage`
  - `ServicePriorityPanel`
  - `MarketInsightsPanel`
  - `CampaignStrategyPanel`
  - `ContentStudioPanel`
  - `SchedulerPanel`
  - `PerformancePanel`

## Key Components

### `ServicePriorityPanel`

Responsibilities: - fetch services - drag/drop ranking - save weights -
persist unsaved changes

Recommended libraries: - React - TypeScript - dnd-kit - TanStack Query -
Zustand

### `ContentStudioPanel`

- displays generated content
- image/video previews
- prompt refinement
- version history
- regenerate variants

------------------------------------------------------------------------

## 6) Backend Architecture (Node + REST)

## Stack

- Node.js
- Express
- PostgreSQL
- Prisma ORM
- Redis (job queue/cache)
- BullMQ for AI jobs
- S3-compatible storage for assets

## Suggested Services

### API Service

REST endpoints + auth

### AI Orchestration Service

Handles: - research workflows - prompt generation - creative
generation - retries - provider fallback

### Media Service

Stores: - uploaded references - generated videos - generated images -
thumbnails

------------------------------------------------------------------------

## 7) REST API Design

## Services

### `GET /api/services`

Returns current services.

### `POST /api/services`

Create new service.

### `PATCH /api/services/:id`

Update service metadata.

------------------------------------------------------------------------

## Priorities

### `GET /api/priorities/:campaignId`

Fetch current campaign priorities.

### `POST /api/priorities`

Save priorities.

------------------------------------------------------------------------

## AI Strategy

### `POST /api/market-research`

Returns research summary.

### `POST /api/campaign-suggestions`

Returns strategy recommendations.

### `POST /api/content/generate`

Generates posts + prompts.

### `POST /api/content/video`

Generates prompt-to-video using references.

### `POST /api/content/image`

Generates image assets.

------------------------------------------------------------------------

## 8) Database Schema (High Level)

## Tables

### users

- id
- name
- email

### services

- id
- user_id
- name
- description
- category
- margin_score

### campaigns

- id
- user_id
- goal
- budget
- date_range

### campaign_priorities

- id
- campaign_id
- service_id
- rank
- weight

### content_assets

- id
- campaign_id
- type
- prompt
- reference_asset_url
- output_url

------------------------------------------------------------------------

## 9) AI Workflow Design

### Research pipeline

1.  ingest priorities
2.  gather market signals
3.  competitor scan
4.  trend extraction
5.  audience clustering
6.  insight ranking

### Strategy pipeline

1.  select top services
2.  align with audience pains
3.  map channels
4.  generate messaging
5.  propose campaign timeline

### Creative pipeline

1.  create post ideas
2.  generate image prompts
3.  generate video prompts
4.  use reference media if supplied
5.  generate variants
6.  score predicted engagement

------------------------------------------------------------------------

## 10) Recommended AI Integrations

### Text / Strategy

- OpenAI
- Anthropic
- Gemini

### Image

- image generation APIs
- reference-image support

### Video

Use providers supporting: - prompt → video - image → video - video →
video - reference consistency

Examples: - Runway - Veo - Luma - Leonardo

------------------------------------------------------------------------

## 11) MVP Roadmap

## Phase 1

- services CRUD
- priority ranking
- campaign suggestions
- post generation

## Phase 2

- image/video generation
- scheduler integrations
- analytics ingestion

## Phase 3

- autonomous optimisation
- multi-campaign memory
- budget recommendations
- A/B test automation

------------------------------------------------------------------------

## 12) Success Metrics

- time saved per campaign
- campaign launch speed
- content approval rate
- conversion lift
- service-priority prediction accuracy
- user retention
