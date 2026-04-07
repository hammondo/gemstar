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
  source TEXT NOT NULL DEFAULT 'campaign' CHECK(source IN ('campaign','library')),
  service_id TEXT,
  variant_tag TEXT CHECK(variant_tag IN ('promotional','educational','seasonal','community')),
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

CREATE TABLE IF NOT EXISTS campaign_posts (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  post_id     TEXT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  added_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (campaign_id, post_id)
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

CREATE INDEX IF NOT EXISTS idx_availability_service ON service_availability(service_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_posts_source ON social_posts(source);
CREATE INDEX IF NOT EXISTS idx_posts_service ON social_posts(service_id);
CREATE INDEX IF NOT EXISTS idx_campaign_posts_campaign ON campaign_posts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_posts_post ON campaign_posts(post_id);
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
    const additiveMigrations = [
        'ALTER TABLE social_posts ADD COLUMN image_url TEXT',
        "ALTER TABLE social_posts ADD COLUMN image_status TEXT NOT NULL DEFAULT 'needed'",
        'ALTER TABLE social_posts ADD COLUMN sanity_document_id TEXT',
        'ALTER TABLE social_posts ADD COLUMN sanity_slug TEXT',
        "ALTER TABLE social_posts ADD COLUMN sanity_sync_status TEXT NOT NULL DEFAULT 'pending'",
        'ALTER TABLE social_posts ADD COLUMN sanity_synced_at TEXT',
        'ALTER TABLE social_posts ADD COLUMN sanity_sync_error TEXT',
    ];
    for (const sql of additiveMigrations) {
        try {
            db.exec(sql);
        } catch {
            // Column already exists — expected on existing databases
        }
    }

    // Migration: add source column + make campaign_id nullable (old schema → new schema with source)
    const columnsBeforeSource = db.prepare('PRAGMA table_info(social_posts)').all() as Array<{ name: string }>;
    const hasSource = columnsBeforeSource.some((c) => c.name === 'source');
    if (!hasSource) {
        db.exec(`
            BEGIN TRANSACTION;
            CREATE TABLE social_posts_new (
                id TEXT PRIMARY KEY,
                campaign_id TEXT REFERENCES campaigns(id) ON DELETE CASCADE,
                source TEXT NOT NULL DEFAULT 'campaign' CHECK(source IN ('campaign','library')),
                service_id TEXT,
                variant_tag TEXT CHECK(variant_tag IN ('promotional','educational','seasonal','community')),
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
                    CHECK(status IN ('draft','pending_review','approved','rejected','scheduled','published','used')),
                postiz_post_id TEXT,
                rejection_reason TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                published_at TEXT
            );
            INSERT INTO social_posts_new
                (id, campaign_id, source, service_id, variant_tag, platform, post_type, content_pillar,
                 copy, owner_edit, image_direction, image_url, image_status, sanity_document_id,
                 sanity_slug, sanity_sync_status, sanity_synced_at, sanity_sync_error,
                 hashtags, call_to_action, scheduled_for, status, postiz_post_id,
                 rejection_reason, created_at, published_at)
            SELECT id, campaign_id, 'campaign', NULL, NULL, platform, post_type, content_pillar,
                 copy, owner_edit, image_direction, image_url, image_status, sanity_document_id,
                 sanity_slug, sanity_sync_status, sanity_synced_at, sanity_sync_error,
                 hashtags, call_to_action, scheduled_for, status, postiz_post_id,
                 rejection_reason, created_at, published_at
            FROM social_posts;
            DROP TABLE social_posts;
            ALTER TABLE social_posts_new RENAME TO social_posts;
            CREATE INDEX IF NOT EXISTS idx_posts_source ON social_posts(source);
            CREATE INDEX IF NOT EXISTS idx_posts_service ON social_posts(service_id);
            COMMIT;
        `);
    }

    // Migration: add 'used' status if missing (intermediate step for DBs that went through old migration path)
    const schemaV1 = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='social_posts'").get() as { sql: string } | undefined)?.sql ?? '';
    const hasCampaignIdCol = (db.prepare('PRAGMA table_info(social_posts)').all() as Array<{ name: string }>).some((c) => c.name === 'campaign_id');
    if (hasCampaignIdCol && !schemaV1.includes("'used'")) {
        db.exec(`
            BEGIN TRANSACTION;
            CREATE TABLE social_posts_new (
                id TEXT PRIMARY KEY,
                campaign_id TEXT REFERENCES campaigns(id) ON DELETE CASCADE,
                source TEXT NOT NULL DEFAULT 'campaign' CHECK(source IN ('campaign','library')),
                service_id TEXT,
                variant_tag TEXT CHECK(variant_tag IN ('promotional','educational','seasonal','community')),
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
                    CHECK(status IN ('draft','pending_review','approved','rejected','scheduled','published','used')),
                postiz_post_id TEXT,
                rejection_reason TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                published_at TEXT
            );
            INSERT INTO social_posts_new SELECT
                id, campaign_id, source, service_id, variant_tag, platform, post_type, content_pillar,
                copy, owner_edit, image_direction, image_url, image_status, sanity_document_id,
                sanity_slug, sanity_sync_status, sanity_synced_at, sanity_sync_error,
                hashtags, call_to_action, scheduled_for, status, postiz_post_id,
                rejection_reason, created_at, published_at
            FROM social_posts;
            DROP TABLE social_posts;
            ALTER TABLE social_posts_new RENAME TO social_posts;
            CREATE INDEX IF NOT EXISTS idx_posts_source ON social_posts(source);
            CREATE INDEX IF NOT EXISTS idx_posts_service ON social_posts(service_id);
            COMMIT;
        `);
    }

    // Migration: many-to-many campaign↔post refactor
    // - Create campaign_posts junction table
    // - Populate from campaign_id column
    // - Drop campaign_id, remove 'used' from status, convert 'used' rows → 'published'
    const columnsNow = db.prepare('PRAGMA table_info(social_posts)').all() as Array<{ name: string }>;
    const stillHasCampaignId = columnsNow.some((c) => c.name === 'campaign_id');
    if (stillHasCampaignId) {
        db.exec(`
            BEGIN TRANSACTION;

            -- Create junction table if not yet done
            CREATE TABLE IF NOT EXISTS campaign_posts (
                campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
                post_id     TEXT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
                added_at    TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (campaign_id, post_id)
            );

            -- Populate junction from existing campaign_id values
            INSERT OR IGNORE INTO campaign_posts (campaign_id, post_id)
            SELECT campaign_id, id FROM social_posts WHERE campaign_id IS NOT NULL;

            -- Promote 'used' → 'published' before dropping that status
            UPDATE social_posts SET status = 'published', published_at = COALESCE(published_at, datetime('now'))
            WHERE status = 'used';

            -- Rebuild social_posts without campaign_id and without 'used' in CHECK
            CREATE TABLE social_posts_new (
                id TEXT PRIMARY KEY,
                source TEXT NOT NULL DEFAULT 'campaign' CHECK(source IN ('campaign','library')),
                service_id TEXT,
                variant_tag TEXT CHECK(variant_tag IN ('promotional','educational','seasonal','community')),
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
            INSERT INTO social_posts_new
                (id, source, service_id, variant_tag, platform, post_type, content_pillar,
                 copy, owner_edit, image_direction, image_url, image_status, sanity_document_id,
                 sanity_slug, sanity_sync_status, sanity_synced_at, sanity_sync_error,
                 hashtags, call_to_action, scheduled_for, status, postiz_post_id,
                 rejection_reason, created_at, published_at)
            SELECT id, source, service_id, variant_tag, platform, post_type, content_pillar,
                 copy, owner_edit, image_direction, image_url, image_status, sanity_document_id,
                 sanity_slug, sanity_sync_status, sanity_synced_at, sanity_sync_error,
                 hashtags, call_to_action, scheduled_for, status, postiz_post_id,
                 rejection_reason, created_at, published_at
            FROM social_posts;

            -- Update FK references in campaign_posts to point to new table (safe: same IDs)
            -- Drop old table and rename
            DROP TABLE social_posts;
            ALTER TABLE social_posts_new RENAME TO social_posts;

            CREATE INDEX IF NOT EXISTS idx_posts_source ON social_posts(source);
            CREATE INDEX IF NOT EXISTS idx_posts_service ON social_posts(service_id);
            CREATE INDEX IF NOT EXISTS idx_campaign_posts_campaign ON campaign_posts(campaign_id);
            CREATE INDEX IF NOT EXISTS idx_campaign_posts_post ON campaign_posts(post_id);

            COMMIT;
        `);
    }

    // Reset any posts stuck in 'generating' from a previous crashed or interrupted run
    db.exec("UPDATE social_posts SET image_status = 'needed' WHERE image_status = 'generating'");
}

// ─── Typed helpers ────────────────────────────────────────────────────────

import { randomUUID } from 'crypto';
import type {
    Campaign,
    CampaignRef,
    CampaignStatus,
    GeneratedLibraryPost,
    ImageStatus,
    PostSource,
    PostStatus,
    SanitySyncStatus,
    ServiceAvailabilityData,
    SocialPost,
    TrendsBrief,
    VariantTag,
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

export function updateTrendsBrief(
    id: string,
    patch: {
        competitorSummary: string;
        trendSignals: string;
        seasonalFactors: string;
        recommendedFocus: string;
        opportunities: string;
    },
): TrendsBrief | null {
    const db = getDb();
    db.prepare(
        `UPDATE trends_briefs
         SET competitor_summary = ?, trend_signals = ?, seasonal_factors = ?,
             recommended_focus = ?, opportunities = ?
         WHERE id = ?`,
    ).run(
        patch.competitorSummary,
        patch.trendSignals,
        patch.seasonalFactors,
        patch.recommendedFocus,
        patch.opportunities,
        id,
    );
    return getLatestTrendsBrief();
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

    const insertPost = db.prepare(`
    INSERT INTO social_posts
      (id, source, platform, post_type, content_pillar, copy,
       image_direction, hashtags, call_to_action, scheduled_for, status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `);

    const insertJunction = db.prepare(`
    INSERT OR IGNORE INTO campaign_posts (campaign_id, post_id) VALUES (?, ?)
  `);

    const insertPosts = db.transaction((posts: SocialPost[]) => {
        for (const post of posts) {
            insertPost.run(
                post.id,
                'campaign',
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
            insertJunction.run(id, post.id);
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
        .prepare(`
            SELECT sp.* FROM social_posts sp
            JOIN campaign_posts cp ON cp.post_id = sp.id
            WHERE cp.campaign_id = ?
            ORDER BY sp.scheduled_for
        `)
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
            .prepare(`
                SELECT sp.* FROM social_posts sp
                JOIN campaign_posts cp ON cp.post_id = sp.id
                WHERE cp.campaign_id = ?
                ORDER BY sp.scheduled_for
            `)
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

// ─── Posts ────────────────────────────────────────────────────────────────

export function getPostById(postId: string): SocialPost | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM social_posts WHERE id = ?').get(postId) as
        | Record<string, unknown>
        | undefined;
    if (!row) return null;
    const post = rowToPost(row);
    return { ...post, campaigns: getPostCampaigns(postId) };
}

export function getPostCampaigns(postId: string): CampaignRef[] {
    const db = getDb();
    return db.prepare(`
        SELECT c.id, c.name
        FROM campaign_posts cp
        JOIN campaigns c ON c.id = cp.campaign_id
        WHERE cp.post_id = ?
        ORDER BY c.created_at
    `).all(postId) as CampaignRef[];
}

export function addPostToCampaign(campaignId: string, postId: string): void {
    const db = getDb();
    db.prepare('INSERT OR IGNORE INTO campaign_posts (campaign_id, post_id) VALUES (?, ?)').run(campaignId, postId);
}

export function updatePostCopy(postId: string, copy: string, scheduledFor?: string | null): void {
    const db = getDb();
    db.prepare(
        `UPDATE social_posts SET owner_edit = ?, scheduled_for = COALESCE(?, scheduled_for) WHERE id = ?`
    ).run(copy, scheduledFor ?? null, postId);
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

export function schedulePost(postId: string, scheduledFor: string): void {
    const db = getDb();
    db.prepare(`UPDATE social_posts SET scheduled_for = ? WHERE id = ?`).run(scheduledFor, postId);
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

export function clonePost(postId: string): SocialPost | null {
    const db = getDb();
    const now = new Date().toISOString();
    const newId = randomUUID();

    const inserted = db.prepare(`
        INSERT INTO social_posts
            (id, source, service_id, variant_tag, platform, post_type, content_pillar,
             copy, image_direction, image_url, image_status, hashtags, call_to_action,
             status, created_at)
        SELECT
            ?, source, service_id, variant_tag, platform, post_type, content_pillar,
            copy, image_direction, image_url,
            CASE WHEN image_url IS NOT NULL AND image_url != '' THEN 'draft' ELSE 'needed' END,
            hashtags, call_to_action,
            'draft', ?
        FROM social_posts
        WHERE id = ?
    `).run(newId, now, postId);

    if (!inserted.changes) return null;
    return getPostById(newId);
}

// ─── All Posts (unified library) ─────────────────────────────────────────

export function getAllPosts(
    filters: {
        serviceId?: string;
        status?: PostStatus;
        variantTag?: VariantTag;
        campaignId?: string;
        source?: PostSource;
    } = {}
): SocialPost[] {
    const db = getDb();

    let query: string;
    const params: unknown[] = [];

    if (filters.campaignId) {
        // Filter by campaign via junction table
        const conditions = ['cp.campaign_id = ?'];
        params.push(filters.campaignId);
        if (filters.status) { conditions.push('sp.status = ?'); params.push(filters.status); }
        if (filters.serviceId) { conditions.push('sp.service_id = ?'); params.push(filters.serviceId); }
        if (filters.variantTag) { conditions.push('sp.variant_tag = ?'); params.push(filters.variantTag); }
        if (filters.source) { conditions.push('sp.source = ?'); params.push(filters.source); }
        query = `SELECT sp.* FROM social_posts sp JOIN campaign_posts cp ON cp.post_id = sp.id WHERE ${conditions.join(' AND ')} ORDER BY sp.scheduled_for`;
    } else {
        const conditions: string[] = [];
        if (filters.status) { conditions.push('status = ?'); params.push(filters.status); }
        if (filters.serviceId) { conditions.push('service_id = ?'); params.push(filters.serviceId); }
        if (filters.variantTag) { conditions.push('variant_tag = ?'); params.push(filters.variantTag); }
        if (filters.source) { conditions.push('source = ?'); params.push(filters.source); }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        query = `SELECT * FROM social_posts ${where} ORDER BY created_at DESC`;
    }

    const rows = db.prepare(query).all(...params) as Array<Record<string, unknown>>;
    if (rows.length === 0) return [];

    // Batch-load campaign associations
    const postIds = rows.map((r) => r.id as string);
    const placeholders = postIds.map(() => '?').join(',');
    const campaignRefs = db.prepare(`
        SELECT cp.post_id, c.id as campaign_id, c.name as campaign_name
        FROM campaign_posts cp
        JOIN campaigns c ON c.id = cp.campaign_id
        WHERE cp.post_id IN (${placeholders})
        ORDER BY c.created_at
    `).all(...postIds) as Array<{ post_id: string; campaign_id: string; campaign_name: string }>;

    const campaignMap = new Map<string, CampaignRef[]>();
    for (const ref of campaignRefs) {
        const arr = campaignMap.get(ref.post_id) ?? [];
        arr.push({ id: ref.campaign_id, name: ref.campaign_name });
        campaignMap.set(ref.post_id, arr);
    }

    return rows.map((row) => {
        const post = rowToPost(row);
        return { ...post, campaigns: campaignMap.get(post.id) ?? [] };
    });
}

// ─── Library Posts (standalone generation, saved with source='library') ──

export function saveLibraryPosts(posts: GeneratedLibraryPost[]): SocialPost[] {
    const db = getDb();
    const now = new Date().toISOString();

    const insert = db.prepare(`
        INSERT INTO social_posts
            (id, source, service_id, variant_tag, platform, post_type, content_pillar,
             copy, image_direction, hashtags, call_to_action, status, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);

    const saved: SocialPost[] = [];

    const insertAll = db.transaction((rows: GeneratedLibraryPost[]) => {
        for (const post of rows) {
            const id = randomUUID();
            insert.run(
                id,
                'library',
                post.serviceId,
                post.variantTag,
                post.platform,
                post.postType,
                post.contentPillar,
                post.copy,
                post.imageDirection,
                j(post.hashtags),
                post.callToAction,
                'pending_review',
                now,
            );
            saved.push({
                id,
                source: 'library',
                serviceId: post.serviceId,
                variantTag: post.variantTag,
                platform: post.platform,
                postType: post.postType,
                contentPillar: post.contentPillar,
                copy: post.copy,
                imageDirection: post.imageDirection,
                hashtags: post.hashtags,
                callToAction: post.callToAction,
                status: 'pending_review',
                imageStatus: 'needed',
                sanitySyncStatus: 'pending',
                campaigns: [],
                createdAt: now,
            });
        }
    });

    insertAll(posts);
    return saved;
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
        source: ((row.source as string | null) ?? 'campaign') as PostSource,
        serviceId: (row.service_id as string | null) ?? undefined,
        variantTag: (row.variant_tag as VariantTag | null) ?? undefined,
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
        campaigns: [],
    };
}
