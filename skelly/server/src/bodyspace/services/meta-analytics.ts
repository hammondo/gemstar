import { settings } from '../config.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IgAccountData {
    username: string;
    followersCount: number;
    mediaCount: number;
}

export interface IgPostData {
    id: string;
    caption: string;
    mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'REEL';
    timestamp: string;
    permalink: string;
    likeCount: number;
    commentsCount: number;
    views: number;
    reach: number;
    saved: number;
    shares: number;
    totalInteractions: number;
}

// Date-pivoted time series row: { date: "2025-03-01", page_impressions_unique: 123, ... }
export interface FbInsightRow {
    date: string;
    [metric: string]: number | string;
}

export interface FbPageData {
    name: string;
    fanCount: number;
    series: FbInsightRow[];    // 28-day daily series
    metrics: string[];         // which metrics are present in series
}

export interface FbPostData {
    id: string;
    message: string;
    createdTime: string;
}

export interface MetaAnalyticsData {
    configured: true;
    instagram?: {
        account: IgAccountData;
        recentPosts: IgPostData[];
    };
    facebook?: {
        page: FbPageData;
        recentPosts: FbPostData[];
    };
    fetchedAt: string;
}

export interface MetaNotConfigured {
    configured: false;
}

export type MetaAnalyticsResult = MetaAnalyticsData | MetaNotConfigured;

// ── In-memory cache (2-hour TTL) ──────────────────────────────────────────────

let cache: { data: MetaAnalyticsData; expiresAt: number } | null = null;

function isConfigured(): boolean {
    return !!(settings.metaAccessToken && (settings.metaPageId || settings.metaIgUserId));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function graph<T>(path: string, params: Record<string, string> = {}, token?: string): Promise<T> {
    const base = `https://graph.facebook.com/${settings.metaApiVersion}`;
    const qs = new URLSearchParams({ access_token: token ?? settings.metaAccessToken, ...params });
    const res = await fetch(`${base}${path}?${qs}`);
    const json = (await res.json()) as { error?: { message: string } } & T;
    if (!res.ok || json.error) {
        throw new Error(json.error?.message ?? `Graph API error on ${path}`);
    }
    return json;
}

function daysAgoUnix(days: number): number {
    return Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
}


// ── Instagram ─────────────────────────────────────────────────────────────────

async function fetchIgAccount(): Promise<IgAccountData> {
    const profile = await graph<{
        username: string;
        followers_count: number;
        media_count: number;
    }>(`/${settings.metaIgUserId}`, {
        fields: 'username,followers_count,media_count',
    });

    return {
        username: profile.username,
        followersCount: profile.followers_count,
        mediaCount: profile.media_count,
    };
}

type IgInsights = { views: number; reach: number; saved: number; shares: number; totalInteractions: number };

const EMPTY_INSIGHTS: IgInsights = { views: 0, reach: 0, saved: 0, shares: 0, totalInteractions: 0 };

async function fetchIgPostInsights(postId: string, mediaType: string): Promise<IgInsights> {
    // CAROUSEL_ALBUM doesn't support insights
    if (mediaType === 'CAROUSEL_ALBUM') return EMPTY_INSIGHTS;

    // v22.0+ supported metrics — views replaces impressions, saved not available for stories
    const isStory = mediaType === 'STORY';
    const metricList = isStory
        ? 'views,reach,shares,total_interactions'
        : 'views,reach,saved,shares,total_interactions';

    try {
        const res = await graph<{ data: Array<{ name: string; values?: Array<{ value: number }>; value?: number }> }>(
            `/${postId}/insights`,
            { metric: metricList }
        );

        const get = (name: string): number => {
            const entry = res.data.find((d) => d.name === name);
            if (!entry) return 0;
            if (typeof entry.value === 'number') return entry.value;
            return entry.values?.[0]?.value ?? 0;
        };

        return {
            views: get('views'),
            reach: get('reach'),
            saved: get('saved'),
            shares: get('shares'),
            totalInteractions: get('total_interactions'),
        };
    } catch (err) {
        console.warn(`IG post insights failed for ${postId}:`, (err as Error).message);
        return EMPTY_INSIGHTS;
    }
}

async function fetchIgRecentPosts(): Promise<IgPostData[]> {
    const media = await graph<{
        data: Array<{
            id: string;
            caption?: string;
            media_type: string;
            timestamp: string;
            permalink: string;
            like_count: number;
            comments_count: number;
        }>;
    }>(`/${settings.metaIgUserId}/media`, {
        fields: 'id,caption,media_type,timestamp,permalink,like_count,comments_count',
        limit: '12',
    });

    const posts = await Promise.all(
        media.data.map(async (m) => {
            const ins = await fetchIgPostInsights(m.id, m.media_type);
            return {
                id: m.id,
                caption: m.caption ?? '',
                mediaType: m.media_type as IgPostData['mediaType'],
                timestamp: m.timestamp,
                permalink: m.permalink,
                likeCount: m.like_count,
                commentsCount: m.comments_count,
                views: ins.views,
                reach: ins.reach,
                saved: ins.saved,
                shares: ins.shares,
                totalInteractions: ins.totalInteractions,
            };
        })
    );

    return posts.sort((a, b) => b.totalInteractions - a.totalInteractions);
}

// ── Facebook ──────────────────────────────────────────────────────────────────

const FB_INSIGHT_METRICS = [
    'page_follows',
    'page_daily_follows',
    'page_impressions_unique',
    'page_impressions_paid_unique',
    'page_impressions_viral_unique',
    'page_post_engagements',
    'page_posts_impressions_unique',
    'page_posts_impressions_paid_unique',
    'page_posts_impressions_organic_unique',
] as const;

async function fetchFbPage(): Promise<FbPageData> {
    const pageToken = settings.metaPageAccessToken || settings.metaAccessToken;

    const profile = await graph<{ name: string; fan_count: number }>(`/${settings.metaPageId}`, {
        fields: 'name,fan_count',
    }, pageToken);

    const series: FbInsightRow[] = [];
    const metrics: string[] = [];

    try {
        const since = String(daysAgoUnix(28));
        const until = String(Math.floor(Date.now() / 1000));

        const res = await graph<{
            data: Array<{ name: string; values: Array<{ value: number; end_time: string }> }>;
        }>(
            `/${settings.metaPageId}/insights`,
            { metric: FB_INSIGHT_METRICS.join(','), period: 'day', since, until },
            pageToken,
        );

        // Build a date → {metric: value} map
        const byDate = new Map<string, Record<string, number>>();

        for (const entry of res.data) {
            metrics.push(entry.name);
            for (const point of entry.values) {
                const date = point.end_time.slice(0, 10); // YYYY-MM-DD
                if (!byDate.has(date)) byDate.set(date, {});
                byDate.get(date)![entry.name] = point.value;
            }
        }

        // Sort by date and emit rows
        for (const date of [...byDate.keys()].sort()) {
            series.push({ date, ...byDate.get(date)! });
        }
    } catch (err) {
        console.warn('Facebook page insights unavailable:', (err as Error).message);
    }

    return {
        name: profile.name,
        fanCount: profile.fan_count,
        series,
        metrics,
    };
}

async function fetchFbRecentPosts(): Promise<FbPostData[]> {
    const posts = await graph<{
        data: Array<{ id: string; message?: string; created_time: string }>;
    }>(`/${settings.metaPageId}/posts`, {
        fields: 'id,message,created_time',
        limit: '12',
    });

    return posts.data.map((p) => ({
        id: p.id,
        message: p.message ?? '',
        createdTime: p.created_time,
    }));
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getMetaAnalytics(): Promise<MetaAnalyticsResult> {
    if (!isConfigured()) return { configured: false };

    if (cache && Date.now() < cache.expiresAt) {
        return cache.data;
    }

    const results = await Promise.allSettled([
        settings.metaIgUserId
            ? Promise.all([fetchIgAccount(), fetchIgRecentPosts()])
            : Promise.reject(new Error('No IG user ID')),
        settings.metaPageId
            ? Promise.all([fetchFbPage(), fetchFbRecentPosts()])
            : Promise.reject(new Error('No page ID')),
    ]);

    const data: MetaAnalyticsData = { configured: true, fetchedAt: new Date().toISOString() };

    if (results[0].status === 'fulfilled') {
        const [account, recentPosts] = results[0].value;
        data.instagram = { account, recentPosts };
    } else {
        console.warn('Instagram fetch failed:', results[0].reason);
    }
    if (results[1].status === 'fulfilled') {
        const [page, recentPosts] = results[1].value;
        data.facebook = { page, recentPosts };
    } else {
        console.warn('Facebook fetch failed:', results[1].reason);
    }

    cache = { data, expiresAt: Date.now() + 2 * 60 * 60 * 1000 };
    return data;
}

export function clearMetaCache(): void {
    cache = null;
}
