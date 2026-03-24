import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers.js';
import { CAMPAIGN } from './fixtures.js';

vi.mock('../bodyspace/db.js', () => ({
    getCampaignById: vi.fn(),
    getCampaignsByStatus: vi.fn(),
    updateCampaignStatus: vi.fn(),
    getLatestSignals: vi.fn().mockReturnValue({}),
    getLatestTrendsBrief: vi.fn().mockReturnValue(null),
    updateTrendsBrief: vi.fn(),
    getPostById: vi.fn(),
    updatePostCopy: vi.fn(),
    updatePostImage: vi.fn(),
    updatePostSanitySync: vi.fn(),
    updatePostStatus: vi.fn(),
    saveCampaign: vi.fn(),
    saveTrendsBrief: vi.fn(),
    saveAvailabilitySignals: vi.fn(),
}));

import { getCampaignById, getCampaignsByStatus } from '../bodyspace/db.js';

const app = makeApp();

beforeEach(() => {
    vi.mocked(getCampaignsByStatus).mockReturnValue([CAMPAIGN]);
    vi.mocked(getCampaignById).mockReturnValue(CAMPAIGN);
});

describe('Campaign routes', () => {
    describe('GET /api/bodyspace/campaigns', () => {
        it('returns all campaigns', async () => {
            const res = await request(app).get('/api/bodyspace/campaigns');
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(Array.isArray(res.body.campaigns)).toBe(true);
        });

        it('filters by status when query param provided', async () => {
            const res = await request(app).get('/api/bodyspace/campaigns?status=pending_review');
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(vi.mocked(getCampaignsByStatus)).toHaveBeenCalledWith('pending_review');
        });

        it('returns 401 when not authenticated', async () => {
            const res = await request(makeApp({ authenticated: false })).get('/api/bodyspace/campaigns');
            expect(res.status).toBe(401);
        });
    });

    describe('GET /api/bodyspace/campaigns/:id', () => {
        it('returns the campaign', async () => {
            const res = await request(app).get(`/api/bodyspace/campaigns/${CAMPAIGN.id}`);
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ ok: true, campaign: CAMPAIGN });
        });

        it('returns 404 when campaign not found', async () => {
            vi.mocked(getCampaignById).mockReturnValueOnce(null);
            const res = await request(app).get('/api/bodyspace/campaigns/nonexistent');
            expect(res.status).toBe(404);
            expect(res.body.ok).toBe(false);
        });
    });

    describe('POST /api/bodyspace/campaigns/:id/approve', () => {
        it('approves the campaign and returns it', async () => {
            const res = await request(app)
                .post(`/api/bodyspace/campaigns/${CAMPAIGN.id}/approve`)
                .send({ notes: 'Looks great' });
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.campaign).toBeDefined();
        });
    });

    describe('POST /api/bodyspace/campaigns/:id/reject', () => {
        it('rejects the campaign and returns it', async () => {
            const res = await request(app)
                .post(`/api/bodyspace/campaigns/${CAMPAIGN.id}/reject`)
                .send({ reason: 'Needs revision' });
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.campaign).toBeDefined();
        });
    });
});
