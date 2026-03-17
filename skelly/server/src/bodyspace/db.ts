// src/db.ts — SQLite database with Drizzle ORM

import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { resolve } from 'path';
import { settings } from './config.js';

// ─── Schema (raw SQL for simplicity — no migration framework needed) ──────

const SCHEMA = `
CREATE TABLE IF NOT EXISTS service_availability (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  service_name TEXT NOT NULL,
  available_slots INTEGER NOT NULL,
  total_slots INTEGER,
  signal TEXT NOT NULL CHECK(signal IN ('push','hold','pause')),
  push_threshold INTEGER NOT NULL,
  pause_threshold INTEGER NOT NULL,
  week_starting TEXT NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  raw_data TEXT
);

CREATE TABLE IF NOT EXISTS trends_briefs (
  id TEXT PRIMARY KEY,
  week_of TEXT NOT NULL,
  competitor_summary TEXT,
  trend_signals TEXT,
  seasonal_factors TEXT,
  recommended_focus TEXT,
  opportunities TEXT,
  sources TEXT,
  confidence TEXT CHECK(confidence IN ('high','medium','low')),
  raw_research TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  theme TEXT,
  description TEXT,
  target_services TEXT,
  duration_weeks INTEGER DEFAULT 4,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','pending_review','approved','rejected','scheduled','published','archived')),
  fresha_signals TEXT,
  trends_brief_id TEXT REFERENCES trends_briefs(id),
  owner_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at TEXT
);

CREATE TABLE IF NOT EXISTS social_posts (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK(platform IN ('instagram','facebook')),
  post_type TEXT NOT NULL DEFAULT 'feed' CHECK(post_type IN ('feed','story','reel')),
  content_pillar TEXT,
  copy TEXT NOT NULL,
  owner_edit TEXT,
  image_direction TEXT,
  image_url TEXT,
  image_status TEXT NOT NULL DEFAULT 'needed'
    CHECK(image_status IN ('needed','generating','draft','approved')),
    sanity_document_id TEXT,
    sanity_slug TEXT,
    sanity_sync_status TEXT NOT NULL DEFAULT 'pending'
        CHECK(sanity_sync_status IN ('pending','synced','skipped','failed')),
    sanity_synced_at TEXT,
    sanity_sync_error TEXT,
  hashtags TEXT,
  call_to_action TEXT,
  scheduled_for TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','pending_review','approved','rejected','scheduled','published')),
  postiz_post_id TEXT,
  rejection_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  published_at TEXT
);

CREATE TABLE IF NOT EXISTS approval_notifications (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  notification_type TEXT NOT NULL CHECK(notification_type IN ('email','sms','console')),
  sent_to TEXT,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  approval_url TEXT,
  acknowledged INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_posts_campaign ON social_posts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_availability_service ON service_availability(service_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
`;

// ─── DB singleton ─────────────────────────────────────────────────────────

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
    if (_db) return _db;

    const dbPath = resolve(settings.dataDir, 'bodyspace.db');
    mkdirSync(settings.dataDir, { recursive: true });

    _db = new Database(dbPath);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    _db.exec(SCHEMA);
    runMigrations(_db);

    return _db;
}

function runMigrations(db: Database.Database): void {
    // Safe additive migrations — swallow errors when column already exists
    const migrations = [
        'ALTER TABLE social_posts ADD COLUMN image_url TEXT',
        "ALTER TABLE social_posts ADD COLUMN image_status TEXT NOT NULL DEFAULT 'needed'",
        'ALTER TABLE social_posts ADD COLUMN sanity_document_id TEXT',
        'ALTER TABLE social_posts ADD COLUMN sanity_slug TEXT',
        "ALTER TABLE social_posts ADD COLUMN sanity_sync_status TEXT NOT NULL DEFAULT 'pending'",
        'ALTER TABLE social_posts ADD COLUMN sanity_synced_at TEXT',
        'ALTER TABLE social_posts ADD COLUMN sanity_sync_error TEXT',
    ];
    for (const sql of migrations) {
        try {
            db.exec(sql);
        } catch {
            // Column already exists — expected on existing databases
        }
    }

    // Reset any posts stuck in 'generating' from a previous crashed or interrupted run
    db.exec("UPDATE social_posts SET image_status = 'needed' WHERE image_status = 'generating'");
}

// ─── Typed helpers ────────────────────────────────────────────────────────

import { randomUUID } from 'crypto';
import type {
    Campaign,
    CampaignStatus,
    ImageStatus,
    PostStatus,
    SanitySyncStatus,
    ServiceAvailabilityData,
    SocialPost,
    TrendsBrief,
} from './types.js';

// Serialize/deserialize JSON columns
const j = (v: unknown) => JSON.stringify(v);
const p = <T>(v: string | null): T | undefined => (v ? (JSON.parse(v) as T) : undefined);

// ─── Service Availability ─────────────────────────────────────────────────

export function saveAvailabilitySignals(signals: Record<string, ServiceAvailabilityData>): void {
    const db = getDb();
    const insert = db.prepare(`
    INSERT INTO service_availability
      (id, service_id, service_name, available_slots, total_slots, signal,
       push_threshold, pause_threshold, week_starting, recorded_at, raw_data)
    VALUES (?,?,?,?,?,?,?,?,datetime('now','start of day'),datetime('now'),?)
  `);

    const insertMany = db.transaction((rows: ServiceAvailabilityData[]) => {
        for (const row of rows) {
            insert.run(
                randomUUID(),
                row.serviceId,
                row.serviceName,
                row.availableSlots,
                row.totalSlots ?? null,
                row.signal,
                row.pushThreshold,
                row.pauseThreshold,
                j(row)
            );
        }
    });

    insertMany(Object.values(signals));
}

export function getLatestSignals(): Record<string, ServiceAvailabilityData> {
    const db = getDb();
    const rows = db
        .prepare(
            `
    SELECT * FROM service_availability sa
    WHERE recorded_at = (
      SELECT MAX(recorded_at) FROM service_availability
      WHERE service_id = sa.service_id
    )
    ORDER BY service_id
  `
        )
        .all() as Array<Record<string, unknown>>;

    return Object.fromEntries(
        rows.map((r) => [
            r.service_id as string,
            {
                serviceId: r.service_id,
                serviceName: r.service_name,
                availableSlots: r.available_slots,
                signal: r.signal,
                pushThreshold: r.push_threshold,
                pauseThreshold: r.pause_threshold,
                recordedAt: r.recorded_at,
            } as ServiceAvailabilityData,
        ])
    );
}

// ─── Trends Briefs ────────────────────────────────────────────────────────

export function saveTrendsBrief(data: Omit<TrendsBrief, 'id' | 'createdAt'>): TrendsBrief {
    const db = getDb();
    const id = randomUUID();
    db.prepare(
        `
    INSERT INTO trends_briefs
      (id, week_of, competitor_summary, trend_signals, seasonal_factors,
       recommended_focus, opportunities, sources, confidence, raw_research)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `
    ).run(
        id,
        data.weekOf,
        data.competitorSummary,
        data.trendSignals,
        data.seasonalFactors,
        data.recommendedFocus,
        data.opportunities,
        j(data.sources),
        data.confidence,
        j(data)
    );

    return { ...data, id, createdAt: new Date().toISOString() };
}

export function getLatestTrendsBrief(): TrendsBrief | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM trends_briefs ORDER BY created_at DESC LIMIT 1').get() as
        | Record<string, unknown>
        | undefined;

    if (!row) return null;
    return {
        id: row.id as string,
        weekOf: row.week_of as string,
        competitorSummary: row.competitor_summary as string,
        trendSignals: row.trend_signals as string,
        seasonalFactors: row.seasonal_factors as string,
        recommendedFocus: row.recommended_focus as string,
        opportunities: row.opportunities as string,
        sources: p<string[]>(row.sources as string) ?? [],
        confidence: row.confidence as TrendsBrief['confidence'],
        createdAt: row.created_at as string,
    };
}

// ─── Campaigns ────────────────────────────────────────────────────────────

export function saveCampaign(data: Omit<Campaign, 'id' | 'createdAt'>): Campaign {
    const db = getDb();
    const id = randomUUID();
    const now = new Date().toISOString();

    db.prepare(
        `
    INSERT INTO campaigns
      (id, name, theme, description, target_services, duration_weeks,
       status, fresha_signals, trends_brief_id, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `
    ).run(
        id,
        data.name,
        data.theme,
        data.description,
        j(data.targetServices),
        data.durationWeeks,
        data.status,
        j(data.freshaSignals),
        data.trendsBriefId ?? null,
        now,
        now
    );

    // Insert posts
    const insertPost = db.prepare(`
    INSERT INTO social_posts
      (id, campaign_id, platform, post_type, content_pillar, copy,
       image_direction, hashtags, call_to_action, scheduled_for, status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `);

    const insertPosts = db.transaction((posts: SocialPost[]) => {
        for (const post of posts) {
            insertPost.run(
                post.id,
                id,
                post.platform,
                post.postType,
                post.contentPillar,
                post.copy,
                post.imageDirection,
                j(post.hashtags),
                post.callToAction,
                post.scheduledFor ?? null,
                post.status
            );
        }
    });

    insertPosts(data.posts);

    return { ...data, id, createdAt: now };
}

export function getCampaignById(id: string): Campaign | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return null;

    const posts = db
        .prepare('SELECT * FROM social_posts WHERE campaign_id = ? ORDER BY scheduled_for')
        .all(id) as Array<Record<string, unknown>>;

    return rowToCampaign(row, posts);
}

export function getCampaignsByStatus(status: CampaignStatus): Campaign[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM campaigns WHERE status = ? ORDER BY created_at DESC').all(status) as Array<
        Record<string, unknown>
    >;

    return rows.map((row) => {
        const posts = db
            .prepare('SELECT * FROM social_posts WHERE campaign_id = ? ORDER BY scheduled_for')
            .all(row.id as string) as Array<Record<string, unknown>>;
        return rowToCampaign(row, posts);
    });
}

export function updateCampaignStatus(id: string, status: CampaignStatus, extra: Partial<Campaign> = {}): void {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(
        `
    UPDATE campaigns SET status = ?, updated_at = ?,
      approved_at = CASE WHEN ? = 'approved' THEN ? ELSE approved_at END,
      owner_notes = COALESCE(?, owner_notes)
    WHERE id = ?
  `
    ).run(status, now, status, now, extra.ownerNotes ?? null, id);
}

export function updatePostStatus(
    postId: string,
    status: PostStatus,
    extra: { ownerEdit?: string; rejectionReason?: string; postizPostId?: string } = {}
): void {
    const db = getDb();
    db.prepare(
        `
    UPDATE social_posts
    SET status = ?,
        owner_edit = COALESCE(?, owner_edit),
        rejection_reason = COALESCE(?, rejection_reason),
        postiz_post_id = COALESCE(?, postiz_post_id)
    WHERE id = ?
  `
    ).run(status, extra.ownerEdit ?? null, extra.rejectionReason ?? null, extra.postizPostId ?? null, postId);
}

export function updatePostImage(postId: string, imageUrl: string, imageStatus: ImageStatus): void {
    const db = getDb();
    db.prepare(`UPDATE social_posts SET image_url = ?, image_status = ? WHERE id = ?`).run(
        imageUrl || null,
        imageStatus,
        postId
    );
}

export function updatePostSanitySync(
    postId: string,
    data: {
        status: SanitySyncStatus;
        documentId?: string;
        slug?: string;
        syncedAt?: string;
        error?: string;
    }
): void {
    const db = getDb();
    db.prepare(
        `
    UPDATE social_posts
    SET sanity_sync_status = ?,
        sanity_document_id = COALESCE(?, sanity_document_id),
        sanity_slug = COALESCE(?, sanity_slug),
        sanity_synced_at = COALESCE(?, sanity_synced_at),
        sanity_sync_error = ?
    WHERE id = ?
  `
    ).run(data.status, data.documentId ?? null, data.slug ?? null, data.syncedAt ?? null, data.error ?? null, postId);
}

// ─── Row mappers ──────────────────────────────────────────────────────────

function rowToCampaign(row: Record<string, unknown>, postRows: Array<Record<string, unknown>>): Campaign {
    return {
        id: row.id as string,
        name: row.name as string,
        theme: (row.theme as string) ?? '',
        description: (row.description as string) ?? '',
        targetServices: p<string[]>(row.target_services as string) ?? [],
        durationWeeks: (row.duration_weeks as number) ?? 4,
        status: row.status as CampaignStatus,
        freshaSignals: p(row.fresha_signals as string) ?? {},
        trendsBriefId: row.trends_brief_id as string | undefined,
        ownerNotes: row.owner_notes as string | undefined,
        createdAt: row.created_at as string,
        approvedAt: row.approved_at as string | undefined,
        posts: postRows.map(rowToPost),
    };
}

function rowToPost(row: Record<string, unknown>): SocialPost {
    return {
        id: row.id as string,
        campaignId: row.campaign_id as string,
        platform: row.platform as SocialPost['platform'],
        postType: row.post_type as SocialPost['postType'],
        contentPillar: row.content_pillar as SocialPost['contentPillar'],
        copy: row.copy as string,
        ownerEdit: row.owner_edit as string | undefined,
        imageDirection: (row.image_direction as string) ?? '',
        imageUrl: (row.image_url as string | null) ?? undefined,
        imageStatus: ((row.image_status as string | null) ?? 'needed') as SocialPost['imageStatus'],
        sanityDocumentId: (row.sanity_document_id as string | null) ?? undefined,
        sanitySlug: (row.sanity_slug as string | null) ?? undefined,
        sanitySyncStatus: ((row.sanity_sync_status as string | null) ?? 'pending') as SocialPost['sanitySyncStatus'],
        sanitySyncedAt: (row.sanity_synced_at as string | null) ?? undefined,
        sanitySyncError: (row.sanity_sync_error as string | null) ?? undefined,
        hashtags: p<string[]>(row.hashtags as string) ?? [],
        callToAction: (row.call_to_action as string) ?? '',
        scheduledFor: row.scheduled_for as string | undefined,
        status: row.status as PostStatus,
        postizPostId: row.postiz_post_id as string | undefined,
        rejectionReason: row.rejection_reason as string | undefined,
        createdAt: row.created_at as string,
        publishedAt: row.published_at as string | undefined,
    };
}
