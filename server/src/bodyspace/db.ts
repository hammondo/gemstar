// src/db.ts — PostgreSQL database via node-postgres (pg)

import { randomUUID } from 'crypto';
import pg from 'pg';
import { settings } from './config.js';
import { CAMPAIGN_STATUSES } from './types.js';
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

const { Pool } = pg;

// ─── Schema ───────────────────────────────────────────────────────────────

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
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ
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
  sanity_synced_at TIMESTAMPTZ,
  sanity_sync_error TEXT,
  hashtags TEXT,
  call_to_action TEXT,
  scheduled_for TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','pending_review','approved','rejected','scheduled','published')),
  postiz_post_id TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS campaign_posts (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  post_id     TEXT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, post_id)
);

CREATE TABLE IF NOT EXISTS approval_notifications (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  notification_type TEXT NOT NULL CHECK(notification_type IN ('email','sms','console')),
  sent_to TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approval_url TEXT,
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS agent_audit_log (
  id TEXT PRIMARY KEY,
  agent_name TEXT NOT NULL,
  trigger TEXT NOT NULL,
  user_id TEXT,
  user_name TEXT,
  user_email TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'running',
  input TEXT,
  output TEXT,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_availability_service ON service_availability(service_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_posts_source ON social_posts(source);
CREATE INDEX IF NOT EXISTS idx_posts_service ON social_posts(service_id);
CREATE INDEX IF NOT EXISTS idx_campaign_posts_campaign ON campaign_posts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_posts_post ON campaign_posts(post_id);
CREATE INDEX IF NOT EXISTS idx_audit_started ON agent_audit_log(started_at);
CREATE INDEX IF NOT EXISTS idx_audit_agent ON agent_audit_log(agent_name);
`;

// ─── Pool singleton ───────────────────────────────────────────────────────

let _pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
    if (_pool) return _pool;
    _pool = new Pool({ connectionString: settings.databaseUrl });
    return _pool;
}

export async function initDb(): Promise<void> {
    const pool = getPool();
    await pool.query(SCHEMA);
    // Reset any posts stuck in 'generating' from a previous crashed run
    await pool.query("UPDATE social_posts SET image_status = 'needed' WHERE image_status = 'generating'");
}

// ─── Typed helpers ────────────────────────────────────────────────────────

const j = (v: unknown) => JSON.stringify(v);
const p = <T>(v: string | null | undefined): T | undefined => (v ? (JSON.parse(v) as T) : undefined);

// ─── Service Availability ─────────────────────────────────────────────────

export async function saveAvailabilitySignals(signals: Record<string, ServiceAvailabilityData>): Promise<void> {
    const pool = getPool();
    const rows = Object.values(signals);

    for (const row of rows) {
        await pool.query(
            `INSERT INTO service_availability
               (id, service_id, service_name, available_slots, total_slots, signal,
                push_threshold, pause_threshold, week_starting, recorded_at, raw_data)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_DATE,NOW(),$9)`,
            [
                randomUUID(),
                row.serviceId,
                row.serviceName,
                row.availableSlots,
                row.totalSlots ?? null,
                row.signal,
                row.pushThreshold,
                row.pauseThreshold,
                j(row),
            ]
        );
    }
}

export async function getLatestSignals(): Promise<Record<string, ServiceAvailabilityData>> {
    const pool = getPool();
    const { rows } = await pool.query(`
        SELECT * FROM service_availability sa
        WHERE recorded_at = (
          SELECT MAX(recorded_at) FROM service_availability
          WHERE service_id = sa.service_id
        )
        ORDER BY service_id
    `);

    return Object.fromEntries(
        (rows as Array<Record<string, unknown>>).map((r) => [
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

export async function saveTrendsBrief(data: Omit<TrendsBrief, 'id' | 'createdAt'>): Promise<TrendsBrief> {
    const pool = getPool();
    const id = randomUUID();
    await pool.query(
        `INSERT INTO trends_briefs
           (id, week_of, competitor_summary, trend_signals, seasonal_factors,
            recommended_focus, opportunities, sources, confidence, raw_research)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
            id,
            data.weekOf,
            data.competitorSummary,
            data.trendSignals,
            data.seasonalFactors,
            data.recommendedFocus,
            data.opportunities,
            j(data.sources),
            data.confidence,
            j(data),
        ]
    );
    return { ...data, id, createdAt: new Date().toISOString() };
}

export async function updateTrendsBrief(
    id: string,
    patch: {
        competitorSummary: string;
        trendSignals: string;
        seasonalFactors: string;
        recommendedFocus: string;
        opportunities: string;
    },
): Promise<TrendsBrief | null> {
    const pool = getPool();
    await pool.query(
        `UPDATE trends_briefs
         SET competitor_summary = $1, trend_signals = $2, seasonal_factors = $3,
             recommended_focus = $4, opportunities = $5
         WHERE id = $6`,
        [patch.competitorSummary, patch.trendSignals, patch.seasonalFactors, patch.recommendedFocus, patch.opportunities, id],
    );
    return getLatestTrendsBrief();
}

export async function getLatestTrendsBrief(): Promise<TrendsBrief | null> {
    const pool = getPool();
    const { rows } = await pool.query('SELECT * FROM trends_briefs ORDER BY created_at DESC LIMIT 1');
    const row = rows[0];
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
        createdAt: (row.created_at as Date).toISOString(),
    };
}

// ─── Campaigns ────────────────────────────────────────────────────────────

export async function saveCampaign(data: Omit<Campaign, 'id' | 'createdAt'>): Promise<Campaign> {
    const pool = getPool();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const id = randomUUID();
        const now = new Date().toISOString();

        await client.query(
            `INSERT INTO campaigns
               (id, name, theme, description, target_services, duration_weeks,
                status, fresha_signals, trends_brief_id, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
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
                now,
            ]
        );

        for (const post of data.posts) {
            await client.query(
                `INSERT INTO social_posts
                   (id, source, platform, post_type, content_pillar, copy,
                    image_direction, hashtags, call_to_action, scheduled_for, status)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
                [
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
                    post.status,
                ]
            );
            await client.query(
                'INSERT INTO campaign_posts (campaign_id, post_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
                [id, post.id]
            );
        }

        await client.query('COMMIT');
        return { ...data, id, createdAt: now };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

export async function getCampaignById(id: string): Promise<Campaign | null> {
    const pool = getPool();
    const { rows } = await pool.query('SELECT * FROM campaigns WHERE id = $1', [id]);
    const row = (rows as Array<Record<string, unknown>>)[0];
    if (!row) return null;

    const { rows: postRows } = await pool.query(
        `SELECT sp.* FROM social_posts sp
         JOIN campaign_posts cp ON cp.post_id = sp.id
         WHERE cp.campaign_id = $1
         ORDER BY sp.scheduled_for`,
        [id]
    );

    return rowToCampaign(row, postRows as Array<Record<string, unknown>>);
}

export async function getCampaignsByStatus(status: CampaignStatus): Promise<Campaign[]> {
    const pool = getPool();
    const { rows } = await pool.query(
        'SELECT * FROM campaigns WHERE status = $1 ORDER BY created_at DESC',
        [status]
    );

    return Promise.all(
        (rows as Array<Record<string, unknown>>).map(async (row) => {
            const { rows: postRows } = await pool.query(
                `SELECT sp.* FROM social_posts sp
                 JOIN campaign_posts cp ON cp.post_id = sp.id
                 WHERE cp.campaign_id = $1
                 ORDER BY sp.scheduled_for`,
                [row.id as string]
            );
            return rowToCampaign(row, postRows as Array<Record<string, unknown>>);
        })
    );
}

export async function getAllCampaigns(): Promise<Campaign[]> {
    const results = await Promise.all(CAMPAIGN_STATUSES.map((status) => getCampaignsByStatus(status)));
    return results.flat();
}

export async function updateCampaignStatus(id: string, status: CampaignStatus, extra: Partial<Campaign> = {}): Promise<void> {
    const pool = getPool();
    const now = new Date().toISOString();
    await pool.query(
        `UPDATE campaigns
         SET status = $1, updated_at = $2,
             approved_at = CASE WHEN $3 = 'approved' THEN $4::TIMESTAMPTZ ELSE approved_at END,
             owner_notes = COALESCE($5, owner_notes)
         WHERE id = $6`,
        [status, now, status, now, extra.ownerNotes ?? null, id]
    );
}

// ─── Posts ────────────────────────────────────────────────────────────────

export async function getPostById(postId: string): Promise<SocialPost | null> {
    const pool = getPool();
    const { rows } = await pool.query('SELECT * FROM social_posts WHERE id = $1', [postId]);
    const row = rows[0];
    if (!row) return null;
    const post = rowToPost(row);
    return { ...post, campaigns: await getPostCampaigns(postId) };
}

export async function getPostCampaigns(postId: string): Promise<CampaignRef[]> {
    const pool = getPool();
    const { rows } = await pool.query(
        `SELECT c.id, c.name
         FROM campaign_posts cp
         JOIN campaigns c ON c.id = cp.campaign_id
         WHERE cp.post_id = $1
         ORDER BY c.created_at`,
        [postId]
    );
    return rows as CampaignRef[];
}

export async function addPostToCampaign(campaignId: string, postId: string): Promise<void> {
    const pool = getPool();
    await pool.query(
        'INSERT INTO campaign_posts (campaign_id, post_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [campaignId, postId]
    );
}

export async function updatePostCopy(postId: string, copy: string, scheduledFor?: string | null): Promise<void> {
    const pool = getPool();
    await pool.query(
        `UPDATE social_posts SET owner_edit = $1, scheduled_for = COALESCE($2::TIMESTAMPTZ, scheduled_for) WHERE id = $3`,
        [copy, scheduledFor ?? null, postId]
    );
}

export async function updatePostStatus(
    postId: string,
    status: PostStatus,
    extra: { ownerEdit?: string; rejectionReason?: string; postizPostId?: string } = {}
): Promise<void> {
    const pool = getPool();
    await pool.query(
        `UPDATE social_posts
         SET status = $1,
             owner_edit = COALESCE($2, owner_edit),
             rejection_reason = COALESCE($3, rejection_reason),
             postiz_post_id = COALESCE($4, postiz_post_id)
         WHERE id = $5`,
        [status, extra.ownerEdit ?? null, extra.rejectionReason ?? null, extra.postizPostId ?? null, postId]
    );
}

export async function updatePostImage(postId: string, imageUrl: string, imageStatus: ImageStatus): Promise<void> {
    const pool = getPool();
    await pool.query(
        `UPDATE social_posts SET image_url = $1, image_status = $2 WHERE id = $3`,
        [imageUrl || null, imageStatus, postId]
    );
}

export async function schedulePost(postId: string, scheduledFor: string): Promise<void> {
    const pool = getPool();
    await pool.query(`UPDATE social_posts SET scheduled_for = $1 WHERE id = $2`, [scheduledFor, postId]);
}

export async function updatePostSanitySync(
    postId: string,
    data: {
        status: SanitySyncStatus;
        documentId?: string;
        slug?: string;
        syncedAt?: string;
        error?: string;
    }
): Promise<void> {
    const pool = getPool();
    await pool.query(
        `UPDATE social_posts
         SET sanity_sync_status = $1,
             sanity_document_id = COALESCE($2, sanity_document_id),
             sanity_slug = COALESCE($3, sanity_slug),
             sanity_synced_at = COALESCE($4::TIMESTAMPTZ, sanity_synced_at),
             sanity_sync_error = $5
         WHERE id = $6`,
        [data.status, data.documentId ?? null, data.slug ?? null, data.syncedAt ?? null, data.error ?? null, postId]
    );
}

export async function clonePost(postId: string): Promise<SocialPost | null> {
    const pool = getPool();
    const now = new Date().toISOString();
    const newId = randomUUID();

    const { rowCount } = await pool.query(
        `INSERT INTO social_posts
             (id, source, service_id, variant_tag, platform, post_type, content_pillar,
              copy, image_direction, image_url, image_status, hashtags, call_to_action,
              status, created_at)
         SELECT
             $1, source, service_id, variant_tag, platform, post_type, content_pillar,
             copy, image_direction, image_url,
             CASE WHEN image_url IS NOT NULL AND image_url != '' THEN 'draft' ELSE 'needed' END,
             hashtags, call_to_action,
             'draft', $2
         FROM social_posts
         WHERE id = $3`,
        [newId, now, postId]
    );

    if (!rowCount) return null;
    return getPostById(newId);
}

// ─── All Posts (unified library) ─────────────────────────────────────────

export async function getAllPosts(
    filters: {
        serviceId?: string;
        status?: PostStatus;
        variantTag?: VariantTag;
        campaignId?: string;
        source?: PostSource;
    } = {}
): Promise<SocialPost[]> {
    const pool = getPool();

    let query: string;
    const params: unknown[] = [];
    let idx = 1;

    if (filters.campaignId) {
        const conditions = [`cp.campaign_id = $${idx++}`];
        params.push(filters.campaignId);
        if (filters.status) { conditions.push(`sp.status = $${idx++}`); params.push(filters.status); }
        if (filters.serviceId) { conditions.push(`sp.service_id = $${idx++}`); params.push(filters.serviceId); }
        if (filters.variantTag) { conditions.push(`sp.variant_tag = $${idx++}`); params.push(filters.variantTag); }
        if (filters.source) { conditions.push(`sp.source = $${idx++}`); params.push(filters.source); }
        query = `SELECT sp.* FROM social_posts sp JOIN campaign_posts cp ON cp.post_id = sp.id WHERE ${conditions.join(' AND ')} ORDER BY sp.scheduled_for`;
    } else {
        const conditions: string[] = [];
        if (filters.status) { conditions.push(`status = $${idx++}`); params.push(filters.status); }
        if (filters.serviceId) { conditions.push(`service_id = $${idx++}`); params.push(filters.serviceId); }
        if (filters.variantTag) { conditions.push(`variant_tag = $${idx++}`); params.push(filters.variantTag); }
        if (filters.source) { conditions.push(`source = $${idx++}`); params.push(filters.source); }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        query = `SELECT * FROM social_posts ${where} ORDER BY created_at DESC`;
    }

    const { rows } = await pool.query(query, params);
    if (rows.length === 0) return [];

    // Batch-load campaign associations
    const typedRows = rows as Array<Record<string, unknown>>;
    const postIds = typedRows.map((r) => r.id as string);
    const placeholders = postIds.map((_, i) => `$${i + 1}`).join(',');
    const { rows: campaignRefs } = await pool.query(
        `SELECT cp.post_id, c.id as campaign_id, c.name as campaign_name
         FROM campaign_posts cp
         JOIN campaigns c ON c.id = cp.campaign_id
         WHERE cp.post_id IN (${placeholders})
         ORDER BY c.created_at`,
        postIds
    );

    const campaignMap = new Map<string, CampaignRef[]>();
    for (const ref of campaignRefs as Array<{ post_id: string; campaign_id: string; campaign_name: string }>) {
        const arr = campaignMap.get(ref.post_id) ?? [];
        arr.push({ id: ref.campaign_id, name: ref.campaign_name });
        campaignMap.set(ref.post_id, arr);
    }

    return typedRows.map((row) => {
        const post = rowToPost(row);
        return { ...post, campaigns: campaignMap.get(post.id) ?? [] };
    });
}

// ─── Library Posts ────────────────────────────────────────────────────────

export async function saveLibraryPosts(posts: GeneratedLibraryPost[]): Promise<SocialPost[]> {
    const pool = getPool();
    const client = await pool.connect();
    const now = new Date().toISOString();
    const saved: SocialPost[] = [];

    try {
        await client.query('BEGIN');
        for (const post of posts) {
            const id = randomUUID();
            await client.query(
                `INSERT INTO social_posts
                     (id, source, service_id, variant_tag, platform, post_type, content_pillar,
                      copy, image_direction, hashtags, call_to_action, status, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
                [
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
                ]
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
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }

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
        createdAt: toIso(row.created_at),
        approvedAt: row.approved_at ? toIso(row.approved_at) : undefined,
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
        sanitySyncedAt: row.sanity_synced_at ? toIso(row.sanity_synced_at) : undefined,
        sanitySyncError: (row.sanity_sync_error as string | null) ?? undefined,
        hashtags: p<string[]>(row.hashtags as string) ?? [],
        callToAction: (row.call_to_action as string) ?? '',
        scheduledFor: row.scheduled_for ? toIso(row.scheduled_for) : undefined,
        status: row.status as PostStatus,
        postizPostId: row.postiz_post_id as string | undefined,
        rejectionReason: row.rejection_reason as string | undefined,
        createdAt: toIso(row.created_at),
        publishedAt: row.published_at ? toIso(row.published_at) : undefined,
        campaigns: [],
    };
}

/** pg returns Date objects for TIMESTAMPTZ columns — normalise to ISO string */
function toIso(v: unknown): string {
    if (v instanceof Date) return v.toISOString();
    return v as string;
}

// ─── Audit Log ────────────────────────────────────────────────────────────

export interface AuditLogEntry {
    id: string;
    agentName: string;
    trigger: string;
    userId: string | null;
    userName: string | null;
    userEmail: string | null;
    startedAt: string;
    completedAt: string | null;
    durationMs: number | null;
    status: string;
    input: unknown;
    output: unknown;
    error: string | null;
}

export async function insertAuditEntry(entry: {
    id: string;
    agentName: string;
    trigger: string;
    userId: string | null;
    userName: string | null;
    userEmail: string | null;
    startedAt: string;
    input: unknown;
}): Promise<void> {
    const pool = getPool();
    await pool.query(
        `INSERT INTO agent_audit_log
             (id, agent_name, trigger, user_id, user_name, user_email, started_at, status, input)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'running',$8)`,
        [
            entry.id,
            entry.agentName,
            entry.trigger,
            entry.userId,
            entry.userName,
            entry.userEmail,
            entry.startedAt,
            entry.input != null ? j(entry.input) : null,
        ]
    );
}

export async function completeAuditEntry(id: string, durationMs: number, output: unknown): Promise<void> {
    const pool = getPool();
    const completedAt = new Date().toISOString();
    await pool.query(
        `UPDATE agent_audit_log
         SET status = 'success', completed_at = $1, duration_ms = $2, output = $3
         WHERE id = $4`,
        [completedAt, durationMs, output != null ? j(output) : null, id]
    );
}

export async function failAuditEntry(id: string, durationMs: number, error: string): Promise<void> {
    const pool = getPool();
    const completedAt = new Date().toISOString();
    await pool.query(
        `UPDATE agent_audit_log
         SET status = 'error', completed_at = $1, duration_ms = $2, error = $3
         WHERE id = $4`,
        [completedAt, durationMs, error, id]
    );
}

export async function queryAuditLogs(filters: {
    agentName?: string;
    status?: string;
    trigger?: string;
    search?: string;
    limit?: number;
    offset?: number;
}): Promise<{ entries: AuditLogEntry[]; total: number }> {
    const pool = getPool();
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filters.agentName) {
        conditions.push(`agent_name = $${idx++}`);
        params.push(filters.agentName);
    }
    if (filters.status) {
        conditions.push(`status = $${idx++}`);
        params.push(filters.status);
    }
    if (filters.trigger) {
        conditions.push(`trigger = $${idx++}`);
        params.push(filters.trigger);
    }
    if (filters.search) {
        const like = `%${filters.search}%`;
        conditions.push(`(user_name ILIKE $${idx} OR user_email ILIKE $${idx + 1} OR agent_name ILIKE $${idx + 2} OR error ILIKE $${idx + 3})`);
        params.push(like, like, like, like);
        idx += 4;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const { rows: countRows } = await pool.query(
        `SELECT COUNT(*) AS n FROM agent_audit_log ${where}`,
        params
    );
    const total = parseInt(countRows[0].n as string, 10);

    const { rows } = await pool.query(
        `SELECT * FROM agent_audit_log ${where} ORDER BY started_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
    );

    const entries: AuditLogEntry[] = (rows as Array<Record<string, unknown>>).map((row) => ({
        id: row.id as string,
        agentName: row.agent_name as string,
        trigger: row.trigger as string,
        userId: (row.user_id as string | null) ?? null,
        userName: (row.user_name as string | null) ?? null,
        userEmail: (row.user_email as string | null) ?? null,
        startedAt: toIso(row.started_at),
        completedAt: row.completed_at ? toIso(row.completed_at) : null,
        durationMs: (row.duration_ms as number | null) ?? null,
        status: row.status as string,
        input: p(row.input as string | null),
        output: p(row.output as string | null),
        error: (row.error as string | null) ?? null,
    }));

    return { entries, total };
}
