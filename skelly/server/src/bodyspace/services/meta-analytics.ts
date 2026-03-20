import { settings } from '../config.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IgAccountData {
    username: string;
    followersCount: number;
    mediaCount: number;
    reach7d: number;
    impressions7d: number;
    profileViews7d: number;
}

export interface IgPostData {
    id: string;
    caption: string;
    mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'REEL';
    timestamp: string;
    permalink: string;
    likeCount: number;
    commentsCount: number;
    impressions: number;
    reach: number;
    saved: number;
    videoViews?: number;
    engagementRate: number; // (likes + comments + saved) / reach
}

export interface FbPageData {
    name: string;
    fanCount: number;
    reach7d: number;
    impressions7d: number;
    engagedUsers7d: number;
}

export interface FbPostData {
    id: string;
    message: string;
    createdTime: string;
    impressions: number;
    reach: number;
    engagements: number;
    clicks: number;
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

// ── Graph API helper ──────────────────────────────────────────────────────────

async function graph<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const base = `https://graph.facebook.com/${settings.metaApiVersion}`;
    const qs = new URLSearchParams({ access_token: settings.metaAccessToken, ...params });
    const res = await fetch(`${base}${path}?${qs}`);
    const json = (await res.json()) as { error?: { message: string } } & T;
    if (!res.ok || json.error) {
        throw new Error(json.error?.message ?? `Graph API error on ${path}`);
    }
    return json;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function daysAgoUnix(days: number): number {
    return Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
}

function sumInsightValues(data: Array<{ value: number }>): number {
    return data.reduce((acc, d) => acc + (d.value ?? 0), 0);
}

// ── Instagram ─────────────────────────────────────────────────────────────────

async function fetchIgAccount(): Promise<IgAccountData> {
    const since = String(daysAgoUnix(7));
    const until = String(Math.floor(Date.now() / 1000));

    const [profile, insights] = await Promise.all([
        graph<{ username: string; followers_count: number; media_count: number }>(
            `/${settings.metaIgUserId}`,
            { fields: 'username,followers_count,media_count' },
        ),
        graph<{ data: Array<{ name: string; values: Array<{ value: number }> }> }>(
            `/${settings.metaIgUserId}/insights`,
            { metric: 'impressions,reach,profile_views', period: 'day', since, until },
        ),
    ]);

    const metric = (name: string) =>
        sumInsightValues(insights.data.find((d) => d.name === name)?.values ?? []);

    return {
        username: profile.username,
        followersCount: profile.followers_count,
        mediaCount: profile.media_count,
        impressions7d: metric('impressions'),
        reach7d: metric('reach'),
        profileViews7d: metric('profile_views'),
    };
}

async function fetchIgPostInsights(
    postId: string,
    mediaType: string,
): Promise<{ impressions: number; reach: number; saved: number; videoViews?: number }> {
    const isStory = mediaType === 'STORY';
    const isVideo = mediaType === 'VIDEO' || mediaType === 'REEL';

    const metricList = isStory
        ? 'impressions,reach'
        : isVideo
          ? 'impressions,reach,saved,video_views'
          : 'impressions,reach,saved';

    try {
        const res = await graph<{ data: Array<{ name: string; values?: Array<{ value: number }>; value?: number }> }>(
            `/${postId}/insights`,
            { metric: metricList },
        );

        const get = (name: string): number => {
            const entry = res.data.find((d) => d.name === name);
            // Insights return either a flat `value` or a `values` array
            if (!entry) return 0;
            if (typeof entry.value === 'number') return entry.value;
            return entry.values?.[0]?.value ?? 0;
        };

        return {
            impressions: get('impressions'),
            reach: get('reach'),
            saved: get('saved'),
            videoViews: isVideo ? get('video_views') : undefined,
        };
    } catch {
        return { impressions: 0, reach: 0, saved: 0 };
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
            const engagementRate =
                ins.reach > 0
                    ? ((m.like_count + m.comments_count + ins.saved) / ins.reach) * 100
                    : 0;
            return {
                id: m.id,
                caption: m.caption ?? '',
                mediaType: m.media_type as IgPostData['mediaType'],
                timestamp: m.timestamp,
                permalink: m.permalink,
                likeCount: m.like_count,
                commentsCount: m.comments_count,
                impressions: ins.impressions,
                reach: ins.reach,
                saved: ins.saved,
                videoViews: ins.videoViews,
                engagementRate: Math.round(engagementRate * 10) / 10,
            };
        }),
    );

    return posts.sort((a, b) => b.engagementRate - a.engagementRate);
}

// ── Facebook ──────────────────────────────────────────────────────────────────

async function fetchFbPage(): Promise<FbPageData> {
    const since = String(daysAgoUnix(7));
    const until = String(Math.floor(Date.now() / 1000));

    const [profile, insights] = await Promise.all([
        graph<{ name: string; fan_count: number }>(`/${settings.metaPageId}`, {
            fields: 'name,fan_count',
        }),
        graph<{ data: Array<{ name: string; values: Array<{ value: number }> }> }>(
            `/${settings.metaPageId}/insights`,
            {
                metric: 'page_impressions,page_reach,page_engaged_users',
                period: 'day',
                since,
                until,
            },
        ),
    ]);

    const metric = (name: string) =>
        sumInsightValues(insights.data.find((d) => d.name === name)?.values ?? []);

    return {
        name: profile.name,
        fanCount: profile.fan_count,
        impressions7d: metric('page_impressions'),
        reach7d: metric('page_reach'),
        engagedUsers7d: metric('page_engaged_users'),
    };
}

async function fetchFbRecentPosts(): Promise<FbPostData[]> {
    const posts = await graph<{
        data: Array<{ id: string; message?: string; created_time: string }>;
    }>(`/${settings.metaPageId}/posts`, {
        fields: 'id,message,created_time',
        limit: '12',
    });

    const withInsights = await Promise.all(
        posts.data.map(async (p) => {
            try {
                const ins = await graph<{
                    data: Array<{ name: string; values: Array<{ value: number }> }>;
                }>(`/${p.id}/insights`, {
                    metric: 'post_impressions,post_reach,post_engagements,post_clicks',
                });

                const get = (name: string): number =>
                    ins.data.find((d) => d.name === name)?.values?.[0]?.value ?? 0;

                return {
                    id: p.id,
                    message: p.message ?? '',
                    createdTime: p.created_time,
                    impressions: get('post_impressions'),
                    reach: get('post_reach'),
                    engagements: get('post_engagements'),
                    clicks: get('post_clicks'),
                };
            } catch {
                return {
                    id: p.id,
                    message: p.message ?? '',
                    createdTime: p.created_time,
                    impressions: 0,
                    reach: 0,
                    engagements: 0,
                    clicks: 0,
                };
            }
        }),
    );

    return withInsights.sort((a, b) => b.engagements - a.engagements);
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
    }
    if (results[1].status === 'fulfilled') {
        const [page, recentPosts] = results[1].value;
        data.facebook = { page, recentPosts };
    }

    cache = { data, expiresAt: Date.now() + 2 * 60 * 60 * 1000 };
    return data;
}

export function clearMetaCache(): void {
    cache = null;
}
