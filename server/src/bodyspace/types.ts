// src/types.ts — Shared types used across all agents and workflows

export type AvailabilitySignal = 'push' | 'hold' | 'pause';
export const CAMPAIGN_STATUSES = ['draft', 'pending_review', 'approved', 'rejected', 'scheduled', 'published'] as const;
export type CampaignStatus = typeof CAMPAIGN_STATUSES[number];
export type PostStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'scheduled' | 'published' | 'used';
export type ImageStatus = 'needed' | 'generating' | 'draft' | 'approved';
export type SanitySyncStatus = 'pending' | 'synced' | 'skipped' | 'failed';
export type Platform = 'instagram' | 'facebook';
export type PostType = 'feed' | 'story' | 'reel';
export type ContentPillar = 'education' | 'promotion' | 'community' | 'social_proof' | 'seasonal';
export type PostSource = 'campaign' | 'library';
export type VariantTag = 'promotional' | 'educational' | 'seasonal' | 'community';

// ─── Fresha Availability ──────────────────────────────────────────────────

export interface ServiceAvailabilityData {
    serviceId: string;
    serviceName: string;
    availableSlots: number;
    totalSlots?: number;
    bookedSlots?: number;
    signal: AvailabilitySignal;
    pushThreshold: number;
    pauseThreshold: number;
    recordedAt: string;
}

export type AvailabilitySignals = Record<string, ServiceAvailabilityData>;

// ─── Trends Brief ─────────────────────────────────────────────────────────

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

// ─── Campaign & Posts ─────────────────────────────────────────────────────

export interface SocialPost {
    id: string;
    campaignId?: string;  // undefined for library posts
    source: PostSource;
    serviceId?: string;   // set on library posts; campaign posts derive this from campaign.targetServices
    variantTag?: VariantTag;
    platform: Platform;
    postType: PostType;
    contentPillar: ContentPillar;
    copy: string;
    ownerEdit?: string;
    imageDirection: string;
    hashtags: string[];
    callToAction: string;
    scheduledFor?: string; // ISO 8601 with AWST offset
    status: PostStatus;
    imageUrl?: string; // publicly accessible URL served by this API
    imageStatus?: ImageStatus;
    sanityDocumentId?: string;
    sanitySlug?: string;
    sanitySyncStatus?: SanitySyncStatus;
    sanitySyncedAt?: string;
    sanitySyncError?: string;
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
    freshaSignals: Record<string, { signal: AvailabilitySignal; slots: number }>;
    trendsBriefId?: string;
    ownerNotes?: string;
    createdAt: string;
    approvedAt?: string;
    posts: SocialPost[];
}

// ─── Claude API response shapes ───────────────────────────────────────────

export interface GeneratedPost {
    week: number;
    day: string;
    scheduledDate: string;
    platform: Platform;
    postType: PostType;
    contentPillar: ContentPillar;
    copy: string;
    imageDirection: string;
    hashtags: string[];
    callToAction: string;
    serviceFocus?: string;
}

export interface GeneratedCampaign {
    campaignName: string;
    campaignTheme: string;
    campaignDescription: string;
    targetServices: string[];
    durationWeeks: number;
    posts: GeneratedPost[];
}

export interface GeneratedLibraryPost {
    serviceId: string;
    platform: Platform;
    postType: PostType;
    contentPillar: ContentPillar;
    variantTag: VariantTag;
    copy: string;
    imageDirection: string;
    hashtags: string[];
    callToAction: string;
}

export interface GeneratedTrendsBrief {
    weekOf: string;
    competitorSummary: string;
    trendSignals: string;
    seasonalFactors: string;
    recommendedFocus: string;
    opportunities: string;
    sources: string[];
    confidence: 'high' | 'medium' | 'low';
}

// ─── Config shapes ────────────────────────────────────────────────────────

export interface ServiceConfig {
    id: string;
    name: string;
    category: string;
    url: string;
    pushThreshold: number;
    pauseThreshold: number;
    keyBenefits: string[];
    targetAudience: string[];
    contentNote?: string;
}

// ─── Shared agent callback ────────────────────────────────────────────────

export type ProgressCallback = (p: { type: string; message: string }) => void;

// ─── Brand voice config ───────────────────────────────────────────────────

export interface BrandVoiceConfig {
    studio: {
        name: string;
        tagline: string;
        location: string;
        bookingUrl: string;
        giftCardUrl: string;
        website: string;
        instagram: string;
    };
    brandVoice: {
        tone: string[];
        avoid: string[];
        languageStyle: string[];
    };
    audience: {
        primary: string[];
        secondary: string[];
        painPoints: string[];
    };
    contentPillars: Array<{ name: string; description: string; frequency: string }>;
    callsToAction: Record<string, string>;
    hashtagSets: Record<string, string[] | number>;
}
