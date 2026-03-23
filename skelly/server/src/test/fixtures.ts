import type { Campaign, ServiceAvailabilityData, SocialPost, TrendsBrief } from '../bodyspace/types.js';

export const TEST_USER = { id: 'user-001', name: 'Test User', email: 'test@example.com' };

export const POST: SocialPost = {
    id: 'post-001',
    campaignId: 'cmp-001',
    platform: 'instagram',
    postType: 'feed',
    contentPillar: 'education',
    copy: 'Test post copy',
    imageDirection: 'A serene wellness studio',
    hashtags: ['#wellness', '#perth'],
    callToAction: 'Book now',
    status: 'pending_review',
    imageStatus: 'needed',
    createdAt: '2025-06-01T00:00:00.000Z',
};

export const POST_WITH_IMAGE: SocialPost = {
    ...POST,
    id: 'post-002',
    imageUrl: 'http://localhost:3000/api/bodyspace/images/post-002/upload.jpg',
    imageStatus: 'draft',
};

export const CAMPAIGN: Campaign = {
    id: 'cmp-001',
    name: 'Autumn Wellness',
    theme: 'Recovery & Renewal',
    description: 'A test campaign',
    targetServices: ['svc-sauna'],
    durationWeeks: 4,
    status: 'pending_review',
    freshaSignals: { 'svc-sauna': { signal: 'push', slots: 12 } },
    createdAt: '2025-06-01T00:00:00.000Z',
    posts: [POST],
};

export const TRENDS: TrendsBrief = {
    id: 'brief-001',
    weekOf: '2025-06-02',
    competitorSummary: 'No major competitor activity',
    trendSignals: 'Wellness trending up in Perth',
    seasonalFactors: 'Autumn — ideal for indoor recovery',
    recommendedFocus: 'Infrared sauna and lymphatic drainage',
    opportunities: 'Growing FIFO lifestyle market',
    sources: ['https://example.com/trends'],
    confidence: 'high',
    createdAt: '2025-06-01T00:00:00.000Z',
};

export const SIGNALS: Record<string, ServiceAvailabilityData> = {
    'svc-sauna': {
        serviceId: 'svc-sauna',
        serviceName: 'Infrared Sauna',
        availableSlots: 10,
        signal: 'push',
        pushThreshold: 8,
        pauseThreshold: 1,
        recordedAt: '2025-06-01T08:00:00.000Z',
    },
};
