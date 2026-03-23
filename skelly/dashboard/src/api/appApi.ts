import { fetchJson, patchJson, postForm, postJson, putJson, streamSSE, streamSSEPost, type SSECallbacks } from './http';
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
export type PostStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'scheduled' | 'published' | 'used';
export type PostSource = 'campaign' | 'library';
export type VariantTag = 'promotional' | 'educational' | 'seasonal' | 'community';
export type ImageStatus = 'needed' | 'generating' | 'draft' | 'approved';

export interface SocialPost {
    id: string;
    campaignId?: string;
    source: PostSource;
    serviceId?: string;
    variantTag?: VariantTag;
    platform: 'instagram' | 'facebook';
    postType: 'feed' | 'story' | 'reel';
    copy: string;
    ownerEdit?: string;
    status: PostStatus;
    imageUrl?: string;
    imageStatus?: ImageStatus;
    imageDirection?: string;
    hashtags: string[];
    callToAction?: string;
    contentPillar?: string;
    rejectionReason?: string;
    scheduledFor?: string;
    publishedAt?: string;
    createdAt: string;
}

export interface Campaign {
    id: string;
    title: string;
    description?: string;
    theme?: string;
    targetServices?: string[];
    ownerNotes?: string;
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
    timezone?: string;
    schedules?: {
        freshaWatcher: string;
        monitor: string;
        campaignPlanner: string;
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

export interface ServiceInfo {
    id: string;
    name: string;
    category: string;
}

export function getServices(): Promise<{ ok: boolean; services: ServiceInfo[] }> {
    return fetchJson('/api/bodyspace/services');
}

export function getLatestTrends(): Promise<{ brief: TrendsBrief | null }> {
    return fetchJson('/api/bodyspace/trends/latest');
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
): Promise<{ ok: boolean; brief: TrendsBrief }> {
    return patchJson(`/api/bodyspace/trends/${id}`, patch);
}

export function approveCampaign(id: string, notes?: string): Promise<{ ok: boolean }> {
    return postJson(`/api/bodyspace/campaigns/${id}/approve`, { notes });
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

// ── Image management ──────────────────────────────────────────────────────────

export function approvePostImage(postId: string): Promise<{ ok: boolean; post: SocialPost }> {
    return postJson(`/api/bodyspace/posts/${postId}/image/approve`);
}

export function regeneratePostImage(
    postId: string,
    campaignId: string,
    opts: { feedback?: string; referenceImageUrl?: string } = {},
): Promise<{ ok: boolean; post: SocialPost }> {
    return postJson(`/api/bodyspace/posts/${postId}/image/regenerate`, { campaignId, ...opts });
}

export function uploadPostImage(postId: string, file: File): Promise<{ ok: boolean; post: SocialPost }> {
    const form = new FormData();
    form.append('imageFile', file);
    return postForm(`/api/bodyspace/posts/${postId}/image/upload`, form);
}

export function regeneratePostImageWithFile(
    postId: string,
    campaignId: string,
    opts: { feedback?: string; file?: File } = {},
): Promise<{ ok: boolean; post: SocialPost }> {
    const form = new FormData();
    form.append('campaignId', campaignId);
    if (opts.feedback) form.append('feedback', opts.feedback);
    if (opts.file) form.append('referenceImageFile', opts.file);
    return postForm(`/api/bodyspace/posts/${postId}/image/regenerate`, form);
}

// ── Settings store ────────────────────────────────────────────────────────────

export function getMonitorSearchTerms(): Promise<{ ok: boolean; terms: string[] }> {
    return fetchJson('/api/bodyspace/settings/monitor-terms');
}

export function saveMonitorSearchTerms(terms: string[]): Promise<{ ok: boolean; terms: string[] }> {
    return putJson('/api/bodyspace/settings/monitor-terms', { terms });
}

export function getSelectedCampaignServices(): Promise<{ ok: boolean; services: string[] }> {
    return fetchJson('/api/bodyspace/settings/campaign-services');
}

export function saveSelectedCampaignServices(ids: string[]): Promise<{ ok: boolean; services: string[] }> {
    return putJson('/api/bodyspace/settings/campaign-services', { services: ids });
}

// ── Wizard ────────────────────────────────────────────────────────────────────

export function getMonitorPrompt(): Promise<{ ok: boolean; prompt: string }> {
    return fetchJson('/api/bodyspace/wizard/monitor-prompt');
}

export function streamMonitorWizard(terms: string[], callbacks: SSECallbacks<MonitorProgress>): () => void {
    return streamSSEPost('/api/bodyspace/wizard/monitor/stream', { terms }, callbacks);
}

export function suggestMonitorTerms(): Promise<{ ok: boolean; terms: string[] }> {
    return postJson('/api/bodyspace/wizard/suggest-terms');
}

export function getCampaignPrompt(): Promise<{ ok: boolean; prompt: string }> {
    return fetchJson('/api/bodyspace/wizard/campaign-prompt');
}

export function runCampaignWizard(opts: {
    ownerBrief?: string;
    selectedServices?: string[];
}): Promise<{ ok: boolean; campaign: Campaign }> {
    return postJson('/api/bodyspace/wizard/campaign', opts);
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

// ── Library ───────────────────────────────────────────────────────────────────

export function getLibraryPosts(filters?: {
    serviceId?: string;
    status?: PostStatus;
    variantTag?: VariantTag;
}): Promise<{ ok: boolean; posts: SocialPost[] }> {
    const params = new URLSearchParams();
    if (filters?.serviceId) params.set('serviceId', filters.serviceId);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.variantTag) params.set('variantTag', filters.variantTag);
    const qs = params.size ? `?${params.toString()}` : '';
    return fetchJson(`/api/bodyspace/library${qs}`);
}

export interface LibraryProgress {
    type: string;
    message: string;
}

export function streamGenerateLibraryPosts(
    serviceIds: string[],
    postsPerService: number,
    callbacks: SSECallbacks<LibraryProgress>,
): () => void {
    return streamSSEPost('/api/bodyspace/run/library/stream', { serviceIds, postsPerService }, callbacks);
}

export function streamGenerateLibraryImages(callbacks: SSECallbacks<LibraryProgress>): () => void {
    return streamSSEPost('/api/bodyspace/run/library/images/stream', {}, callbacks);
}

export function scheduleLibraryPost(postId: string, scheduledFor: string): Promise<{ ok: boolean; post: SocialPost }> {
    return patchJson(`/api/bodyspace/library/posts/${postId}/schedule`, { scheduledFor });
}

export function markLibraryPostUsed(postId: string): Promise<{ ok: boolean }> {
    return postJson(`/api/bodyspace/library/posts/${postId}/used`);
}

export function reviveLibraryPost(postId: string): Promise<{ ok: boolean; post: SocialPost }> {
    return postJson(`/api/bodyspace/library/posts/${postId}/revive`);
}
