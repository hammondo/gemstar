import { postForm, streamSSE, streamSSEPost, type SSECallbacks } from './http';
import { client } from './client';
import type { components } from './schema.d.ts';
export type { SSECallbacks };

// ── Generated types ────────────────────────────────────────────────────────

export type Campaign = components['schemas']['Campaign'];
export type SocialPost = components['schemas']['SocialPost'];
export type TrendsBrief = components['schemas']['TrendsBrief'];
export type ServiceAvailability = components['schemas']['ServiceAvailability'];
export type AuthUser = components['schemas']['AuthUser'];
export type ServiceInfo = components['schemas']['ServiceInfo'];
export type BlogSync = components['schemas']['BlogSync'];
export type CampaignStatus = components['schemas']['CampaignStatus'];
export type PostStatus = components['schemas']['PostStatus'];
export type ImageStatus = components['schemas']['ImageStatus'];

// ── Helpers ────────────────────────────────────────────────────────────────

function unwrap<T>(result: { data?: T; error?: unknown }): T {
    if (result.error !== undefined) {
        const err = result.error as { error?: string } | undefined;
        throw new Error(err?.error ?? 'Request failed');
    }
    return result.data!;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

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

export async function logout() {
    return unwrap(await client.POST('/api/auth/logout'));
}

// ── Status ────────────────────────────────────────────────────────────────────

export type BodyspaceStatus = NonNullable<
    Awaited<ReturnType<typeof getBodyspaceStatus>>
>;

export async function getBodyspaceStatus() {
    return unwrap(await client.GET('/api/bodyspace/status'));
}

// ── Campaigns ─────────────────────────────────────────────────────────────────

export async function getCampaigns(status?: CampaignStatus) {
    return unwrap(await client.GET('/api/bodyspace/campaigns', { params: { query: { status } } }));
}

export async function getCampaign(id: string) {
    return unwrap(await client.GET('/api/bodyspace/campaigns/{id}', { params: { path: { id } } }));
}

export async function approveCampaign(id: string, notes?: string) {
    return unwrap(await client.POST('/api/bodyspace/campaigns/{id}/approve', {
        params: { path: { id } },
        body: { notes },
    }));
}

export async function rejectCampaign(id: string, reason?: string) {
    return unwrap(await client.POST('/api/bodyspace/campaigns/{id}/reject', {
        params: { path: { id } },
        body: { reason },
    }));
}

// ── Posts ─────────────────────────────────────────────────────────────────────

export async function getPost(id: string) {
    return unwrap(await client.GET('/api/bodyspace/posts/{id}', { params: { path: { id } } }));
}

export async function updatePost(id: string, copy: string, scheduledFor?: string | null) {
    return unwrap(await client.PATCH('/api/bodyspace/posts/{id}', {
        params: { path: { id } },
        body: { copy, scheduledFor },
    }));
}

export async function approvePost(id: string, copy?: string) {
    return unwrap(await client.POST('/api/bodyspace/posts/{id}/approve', {
        params: { path: { id } },
        body: { copy },
    }));
}

export async function rejectPost(id: string, reason?: string) {
    return unwrap(await client.POST('/api/bodyspace/posts/{id}/reject', {
        params: { path: { id } },
        body: { reason },
    }));
}

// ── Image management ──────────────────────────────────────────────────────────

export async function approvePostImage(postId: string) {
    return unwrap(await client.POST('/api/bodyspace/posts/{id}/image/approve', {
        params: { path: { id: postId } },
    }));
}

export async function uploadPostImage(postId: string, file: File) {
    const form = new FormData();
    form.append('imageFile', file);
    return postForm<{ ok: boolean; post: SocialPost }>(`/api/bodyspace/posts/${postId}/image/upload`, form);
}

export async function regeneratePostImage(
    postId: string,
    campaignId: string,
    opts: { feedback?: string; referenceImageUrl?: string } = {},
) {
    const form = new FormData();
    form.append('campaignId', campaignId);
    if (opts.feedback) form.append('feedback', opts.feedback);
    if (opts.referenceImageUrl) form.append('referenceImageUrl', opts.referenceImageUrl);
    return postForm<{ ok: boolean; post: SocialPost }>(`/api/bodyspace/posts/${postId}/image/regenerate`, form);
}

export async function regeneratePostImageWithFile(
    postId: string,
    campaignId: string,
    opts: { feedback?: string; file?: File } = {},
) {
    const form = new FormData();
    form.append('campaignId', campaignId);
    if (opts.feedback) form.append('feedback', opts.feedback);
    if (opts.file) form.append('referenceImageFile', opts.file);
    return postForm<{ ok: boolean; post: SocialPost }>(`/api/bodyspace/posts/${postId}/image/regenerate`, form);
}

// ── Trends ────────────────────────────────────────────────────────────────────

export async function getLatestTrends() {
    return unwrap(await client.GET('/api/bodyspace/trends/latest'));
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
) {
    return unwrap(await client.PATCH('/api/bodyspace/trends/{id}', {
        params: { path: { id } },
        body: patch,
    }));
}

// ── Signals ───────────────────────────────────────────────────────────────────

export async function getSignals() {
    return unwrap(await client.GET('/api/bodyspace/signals'));
}

// ── Services ──────────────────────────────────────────────────────────────────

export async function getServices() {
    return unwrap(await client.GET('/api/bodyspace/services'));
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export type MetaAnalyticsResult = NonNullable<
    Awaited<ReturnType<typeof getMetaAnalytics>>
>;

export async function getMetaAnalytics() {
    return unwrap(await client.GET('/api/bodyspace/analytics/meta'));
}

export async function refreshMetaCache() {
    return unwrap(await client.POST('/api/bodyspace/analytics/meta/refresh'));
}

// ── Health ────────────────────────────────────────────────────────────────────

export async function getHealth() {
    return unwrap(await client.GET('/api/health'));
}

// ── Settings ──────────────────────────────────────────────────────────────────

export async function getMonitorSearchTerms() {
    return unwrap(await client.GET('/api/bodyspace/settings/monitor-terms'));
}

export async function saveMonitorSearchTerms(terms: string[]) {
    return unwrap(await client.PUT('/api/bodyspace/settings/monitor-terms', { body: { terms } }));
}

export async function getSelectedCampaignServices() {
    return unwrap(await client.GET('/api/bodyspace/settings/campaign-services'));
}

export async function saveSelectedCampaignServices(ids: string[]) {
    return unwrap(await client.PUT('/api/bodyspace/settings/campaign-services', { body: { services: ids } }));
}

// ── Wizard ────────────────────────────────────────────────────────────────────

export async function getMonitorPrompt() {
    return unwrap(await client.GET('/api/bodyspace/wizard/monitor-prompt'));
}

export async function getCampaignPrompt() {
    return unwrap(await client.GET('/api/bodyspace/wizard/campaign-prompt'));
}

export async function runCampaignWizard(opts: { ownerBrief?: string; selectedServices?: string[] }) {
    return unwrap(await client.POST('/api/bodyspace/wizard/campaign', { body: opts }));
}

export async function suggestMonitorTerms() {
    return unwrap(await client.POST('/api/bodyspace/wizard/suggest-terms'));
}

export interface MonitorProgress {
    type: string;
    message: string;
}

export function streamMonitorWizard(terms: string[], callbacks: SSECallbacks<MonitorProgress>): () => void {
    return streamSSEPost('/api/bodyspace/wizard/monitor/stream', { terms }, callbacks);
}

// ── Agent triggers ────────────────────────────────────────────────────────────

export async function runFreshaWatcher() {
    return unwrap(await client.POST('/api/bodyspace/run/fresha'));
}

export function streamMonitor(callbacks: SSECallbacks<MonitorProgress>): () => void {
    return streamSSE('/api/bodyspace/run/monitor/stream', callbacks);
}

export async function runCampaignPlanner(ownerBrief?: string) {
    return unwrap(await client.POST('/api/bodyspace/run/campaign', { body: { ownerBrief } }));
}

export async function runAll(ownerBrief?: string) {
    return unwrap(await client.POST('/api/bodyspace/run/all', { body: { ownerBrief } }));
}

export async function scheduleCampaigns() {
    return unwrap(await client.POST('/api/bodyspace/schedule'));
}

export async function importFreshaCsv(csvContent: string, filename: string) {
    return unwrap(await client.POST('/api/bodyspace/fresha/import', { body: { csvContent, filename } }));
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
