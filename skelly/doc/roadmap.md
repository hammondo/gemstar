# Roadmap

## Product goal
Ship a reliable marketing autopilot for BodySpace that can:
1. detect opportunities,
2. generate campaign drafts (copy + image),
3. support owner approval,
4. publish approved content to social channels and website.

## Success metrics for launch
1. 95%+ of pipeline runs complete without manual intervention.
2. Campaign draft generated in under 5 minutes.
3. 100% of published posts have explicit owner approval.
4. 90%+ of approved posts successfully sync to website on first attempt.
5. Zero production incidents causing missed scheduled posts for 14 consecutive days.

## Current status snapshot
1. Trend ingestion and campaign planning are in place.
2. Image generation and approval flow are implemented server-side.
3. Website blog sync is implemented with sync state tracking.
4. Dashboard image controls are in progress and need completion.

## Milestones

### Milestone 1 - Internal Alpha (end-to-end happy path)
Goal: Validate full pipeline with a single owner and low volume.

Scope:
1. Owner provides campaign direction and services to target.
2. Agent generates campaign posts for approval.
3. Image generation runs for each post and supports regenerate + feedback.
4. Owner can approve/reject post copy and image.

Exit criteria:
1. Full campaign from brief to approved posts works in one session.
2. No blocking errors in server logs for 5 consecutive test runs.
3. Dashboard clearly shows status for each post and image.

### Milestone 2 - Scheduling Reliability
Goal: Ensure approved posts are scheduled safely and deterministically.

Scope:
1. Only posts with approved copy + approved image can be scheduled.
2. Retry strategy and clear error surfacing for Postiz failures.
3. Cron and manual triggers both produce consistent outcomes.

Exit criteria:
1. 20 scheduled test posts processed without duplicate publishes.
2. Failed schedule attempts are visible and actionable.
3. Recovery from transient API failure validated in test.

### Milestone 3 - CMS Publishing Workflow
Goal: Keep website content in sync with approved social content.

Scope:
1. Approved post syncs to Sanity as draft blog document.
2. Sync status, slug, document id, and sync errors are persisted.
3. Manual re-sync endpoint and UI affordance for retry.

Exit criteria:
1. 10 approved posts create/update Sanity docs idempotently.
2. Asset upload + hero image references valid in Sanity Studio.
3. Failed sync can be retried to success without data cleanup.

### Milestone 4 - Owner UX Completion
Goal: Make the dashboard usable without developer assistance.

Scope:
1. Finish post image panel in review UI:
	generate/regenerate, feedback, preview, approve image.
2. Improve campaign review ergonomics:
	statuses, notices, and clear action progress states.
3. Basic validation on required inputs and action guards.

Exit criteria:
1. Non-technical owner can process one full campaign alone.
2. No ambiguous statuses during long-running actions.
3. UI passes quick smoke checks on desktop and mobile widths.

### Milestone 5 - Production Readiness
Goal: Harden operations, quality, and security before go-live.

Scope:
1. Environment and secret management cleanup (.env template and checks).
2. Structured logging and basic alerting for failed pipeline stages.
3. Backup/restore plan for SQLite data.
4. Basic test coverage for critical routes and workflow paths.

Exit criteria:
1. Launch checklist completed and reviewed.
2. Restore drill performed successfully.
3. Critical path tests run in CI for every merge.

### Milestone 6 - Controlled Go-Live
Goal: Launch with guardrails and measure early performance.

Scope:
1. Start with limited channel set and capped campaign frequency.
2. Daily review of sync failures, scheduling failures, and quality flags.
3. Weekly tuning of prompts, approval criteria, and publishing rules.

Exit criteria:
1. 2 weeks with stable daily operation.
2. Agreed KPI thresholds met.
3. Decision made to scale volume or keep constraints.

## Suggested timeline
1. Week 1: Milestone 1 + Milestone 4 completion.
2. Week 2: Milestone 2 + Milestone 3 hardening.
3. Week 3: Milestone 5 readiness checks.
4. Week 4: Milestone 6 controlled go-live.

## Key launch risks and mitigations
1. External API instability (Replicate/Postiz/Sanity):
	add retries, timeouts, and clear manual retry actions.
2. Approval bottlenecks:
	batch review UX and notification reminders for pending approvals.
3. Prompt quality drift:
	keep monthly prompt reviews with side-by-side result sampling.
4. Single database risk (SQLite):
	daily backup and restoration test cadence.

## Immediate next actions
1. Finish the dashboard post image panel and confirm end-to-end owner flow.
2. Run a 20-post scheduling reliability test and document outcomes.
3. Add a launch checklist doc with owners per milestone item.