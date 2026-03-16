import { fetchJson, postJson, streamSSE, type SSECallbacks } from './http';

export type CampaignStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'scheduled' | 'published';

export type PostStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'scheduled' | 'published';
export type ImageStatus = 'needed' | 'generating' | 'draft' | 'approved';
export type SanitySyncStatus = 'pending' | 'synced' | 'skipped' | 'failed';

export interface SocialPost {
    id: string;
    campaignId: string;
    platform: 'instagram' | 'facebook';
    postType: 'feed' | 'story' | 'reel';
    contentPillar: 'education' | 'promotion' | 'community' | 'social_proof' | 'seasonal';
    copy: string;
    ownerEdit?: string;
    imageDirection: string;
    hashtags: string[];
    callToAction: string;
    scheduledFor?: string;
    status: PostStatus;
    imageUrl?: string;
    imageStatus?: ImageStatus;
    sanityDocumentId?: string;
    sanitySlug?: string;
    sanitySyncStatus?: SanitySyncStatus;
    postizPostId?: string;
    rejectionReason?: string;
    createdAt: string;
    publishedAt?: string;
}

export interface Campaign {
    id: string;
    name: string;
    theme: string;
    description: string;
    targetServices: string[];
    durationWeeks: number;
    status: CampaignStatus;
    ownerNotes?: string;
    createdAt: string;
    approvedAt?: string;
    posts: SocialPost[];
}

export interface BodyspaceStatus {
    ok: boolean;
    timezone: string;
    schedules: {
        freshaWatcher: string;
        monitor: string;
        campaignPlanner: string;
    };
    counts: {
        pendingReviewCampaigns: number;
        approvedCampaigns: number;
        scheduledCampaigns: number;
        scheduledPosts: number;
    };
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

export function getHealth(): Promise<{
    status: string;
    service: string;
    timestamp: string;
}> {
    return fetchJson('/api/health');
}

export function getBodyspaceStatus(): Promise<BodyspaceStatus> {
    return fetchJson('/api/bodyspace/status');
}

export function getCampaigns(status?: CampaignStatus): Promise<{ ok: boolean; campaigns: Campaign[] }> {
    const query = status ? `?status=${status}` : '';
    return fetchJson(`/api/bodyspace/campaigns${query}`);
}

export function getCampaign(id: string): Promise<{ ok: boolean; campaign: Campaign }> {
    return fetchJson(`/api/bodyspace/campaigns/${id}`);
}

export function getSignals(): Promise<{
    ok: boolean;
    signals: Record<string, AvailabilitySignal>;
}> {
    return fetchJson('/api/bodyspace/signals');
}

export function getLatestTrends(): Promise<{
    ok: boolean;
    brief: TrendsBrief | null;
}> {
    return fetchJson('/api/bodyspace/trends/latest');
}

export function runFreshaWatcher(): Promise<{ ok: boolean }> {
    return postJson('/api/bodyspace/run/fresha');
}

export function runMonitor(): Promise<{ ok: boolean }> {
    return postJson('/api/bodyspace/run/monitor');
}

export interface MonitorProgressEvent {
    type: 'status' | 'text' | 'done' | 'error';
    message: string;
}

export function runMonitorStream(callbacks: SSECallbacks<MonitorProgressEvent>): () => void {
    return streamSSE('/api/bodyspace/run/monitor/stream', callbacks);
}

export function runCampaign(ownerBrief?: string): Promise<{ ok: boolean }> {
    return postJson('/api/bodyspace/run/campaign', { ownerBrief });
}

export function runAll(ownerBrief?: string): Promise<{ ok: boolean }> {
    return postJson('/api/bodyspace/run/all', { ownerBrief });
}

export function approvePost(postId: string, copy?: string): Promise<{ ok: boolean; campaignId: string | null }> {
    return postJson(`/api/bodyspace/posts/${postId}/approve`, { copy });
}

export function rejectPost(postId: string, reason?: string): Promise<{ ok: boolean; campaignId: string | null }> {
    return postJson(`/api/bodyspace/posts/${postId}/reject`, { reason });
}

export function approveCampaign(campaignId: string, notes?: string): Promise<{ ok: boolean; campaign: Campaign }> {
    return postJson(`/api/bodyspace/campaigns/${campaignId}/approve`, { notes });
}

export function rejectCampaign(campaignId: string, reason?: string): Promise<{ ok: boolean; campaign: Campaign }> {
    return postJson(`/api/bodyspace/campaigns/${campaignId}/reject`, { reason });
}

export function scheduleCampaign(campaignId?: string): Promise<{ ok: boolean }> {
    return postJson('/api/bodyspace/schedule', { campaignId });
}

export function importFreshaCsv(
    csvContent: string,
    filename: string
): Promise<{
    ok: boolean;
    filename: string;
    signals: Record<string, AvailabilitySignal>;
}> {
    return postJson('/api/bodyspace/fresha/import', { csvContent, filename });
}

export function approvePostImage(
    postId: string
): Promise<{ ok: boolean; postId: string; imageStatus: ImageStatus }> {
    return postJson(`/api/bodyspace/posts/${postId}/image/approve`);
}

export function regeneratePostImage(
    postId: string,
    campaignId: string,
    feedback?: string
): Promise<{ ok: boolean; postId: string; imageUrl: string; imageStatus: ImageStatus; feedbackApplied: boolean }> {
    return postJson(`/api/bodyspace/posts/${postId}/image/regenerate`, { campaignId, feedback });
}
