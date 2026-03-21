import { fetchJson, patchJson, postForm, postJson, streamSSE, type SSECallbacks } from './http';
export type { SSECallbacks };

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface AuthUser {
    id: string;
    name: string;
    email: string;
}

export function getMe(): Promise<{ ok: boolean; user: AuthUser }> {
    return fetchJson('/api/auth/me');
}

export function logout(): Promise<{ ok: boolean }> {
    return postJson('/api/auth/logout');
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type CampaignStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'scheduled' | 'published';
export type PostStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'scheduled' | 'published';
export type ImageStatus = 'needed' | 'generating' | 'draft' | 'approved';

export interface SocialPost {
    id: string;
    campaignId: string;
    platform: 'instagram' | 'facebook';
    postType: 'feed' | 'story' | 'reel';
    copy: string;
    status: PostStatus;
    imageUrl?: string;
    imageStatus?: ImageStatus;
    scheduledFor?: string;
    createdAt: string;
}

export interface Campaign {
    id: string;
    title: string;
    status: CampaignStatus;
    posts: SocialPost[];
    createdAt: string;
}

export interface AvailabilitySignal {
    serviceId: string;
    serviceName: string;
    availableSlots: number;
    signal: 'push' | 'hold' | 'pause';
    pushThreshold: number;
    pauseThreshold: number;
    recordedAt: string;
}

export interface BodyspaceStatus {
    counts: {
        totalCampaigns: number;
        approvedCampaigns: number;
        pendingReviewCampaigns: number;
        publishedPosts: number;
        pendingReviewPosts: number;
    };
}

export interface TrendsBrief {
    id: string;
    weekOf: string;
    competitorSummary: string;
    trendSignals: string;
    seasonalFactors: string;
    recommendedFocus: string;
    opportunities: string;
    sources: string[];
    confidence: 'high' | 'medium' | 'low';
    createdAt: string;
}

// ── API calls ─────────────────────────────────────────────────────────────────

// ── Meta analytics ────────────────────────────────────────────────────────────

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

export interface FbInsightRow {
    date: string;
    [metric: string]: number | string;
}

export interface FbPageData {
    name: string;
    fanCount: number;
    series: FbInsightRow[];
    metrics: string[];
}

export interface FbPostData {
    id: string;
    message: string;
    createdTime: string;
}

export type MetaAnalyticsResult =
    | { configured: false }
    | {
          configured: true;
          fetchedAt: string;
          instagram?: { account: IgAccountData; recentPosts: IgPostData[] };
          facebook?: { page: FbPageData; recentPosts: FbPostData[] };
      };

export function getMetaAnalytics(): Promise<MetaAnalyticsResult> {
    return fetchJson('/api/bodyspace/analytics/meta');
}

export function refreshMetaCache(): Promise<{ ok: boolean }> {
    return postJson('/api/bodyspace/analytics/meta/refresh');
}

export function getHealth(): Promise<{ status: string; service: string; timestamp: string }> {
    return fetchJson('/api/health');
}

export function getBodyspaceStatus(): Promise<BodyspaceStatus> {
    return fetchJson('/api/bodyspace/status');
}

export function getCampaigns(status?: CampaignStatus): Promise<{ campaigns: Campaign[] }> {
    const qs = status ? `?status=${status}` : '';
    return fetchJson(`/api/bodyspace/campaigns${qs}`);
}

export function getCampaign(id: string): Promise<{ campaign: Campaign }> {
    return fetchJson(`/api/bodyspace/campaigns/${id}`);
}

export function getPost(id: string): Promise<{ post: SocialPost }> {
    return fetchJson(`/api/bodyspace/posts/${id}`);
}

export function updatePost(id: string, copy: string, scheduledFor?: string | null): Promise<{ post: SocialPost }> {
    return patchJson(`/api/bodyspace/posts/${id}`, { copy, scheduledFor });
}

export function getSignals(): Promise<{ signals: Record<string, AvailabilitySignal> }> {
    return fetchJson('/api/bodyspace/signals');
}

export function getLatestTrends(): Promise<{ brief: TrendsBrief | null }> {
    return fetchJson('/api/bodyspace/trends/latest');
}

export function approveCampaign(id: string): Promise<{ ok: boolean }> {
    return postJson(`/api/bodyspace/campaigns/${id}/approve`);
}

export function rejectCampaign(id: string, reason?: string): Promise<{ ok: boolean }> {
    return postJson(`/api/bodyspace/campaigns/${id}/reject`, { reason });
}

export function approvePost(id: string, copy?: string): Promise<{ ok: boolean }> {
    return postJson(`/api/bodyspace/posts/${id}/approve`, { copy });
}

export function rejectPost(id: string, reason?: string): Promise<{ ok: boolean }> {
    return postJson(`/api/bodyspace/posts/${id}/reject`, { reason });
}

// ── Agent triggers ────────────────────────────────────────────────────────────

export interface MonitorProgress {
    type: string;
    message: string;
}

export function runFreshaWatcher(): Promise<{ ok: boolean }> {
    return postJson('/api/bodyspace/run/fresha');
}

export function streamMonitor(callbacks: SSECallbacks<MonitorProgress>): () => void {
    return streamSSE('/api/bodyspace/run/monitor/stream', callbacks);
}

export function runCampaignPlanner(ownerBrief?: string): Promise<{ ok: boolean }> {
    return postJson('/api/bodyspace/run/campaign', { ownerBrief });
}

export function runAll(ownerBrief?: string): Promise<{ ok: boolean }> {
    return postJson('/api/bodyspace/run/all', { ownerBrief });
}

export function scheduleCampaigns(): Promise<{ ok: boolean }> {
    return postJson('/api/bodyspace/schedule');
}

export function importFreshaCsv(csvContent: string, filename: string): Promise<{ ok: boolean; signals?: unknown }> {
    const form = new FormData();
    form.append('csvContent', csvContent);
    form.append('filename', filename);
    return postForm('/api/bodyspace/fresha/import', form);
}
