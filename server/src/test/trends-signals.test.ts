import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SIGNALS, TRENDS } from './fixtures.js';
import { makeApp } from './helpers.js';

vi.mock('../bodyspace/db.js', () => ({
    getCampaignsByStatus: vi.fn().mockReturnValue([]),
    getLatestSignals: vi.fn(),
    getLatestTrendsBrief: vi.fn(),
    updateTrendsBrief: vi.fn(),
    getCampaignById: vi.fn(),
    getPostById: vi.fn(),
    updatePostCopy: vi.fn(),
    updatePostImage: vi.fn(),
    updatePostSanitySync: vi.fn(),
    updatePostStatus: vi.fn(),
    updateCampaignStatus: vi.fn(),
    saveCampaign: vi.fn(),
    saveTrendsBrief: vi.fn(),
    saveAvailabilitySignals: vi.fn(),
}));

import { getLatestSignals, getLatestTrendsBrief, updateTrendsBrief } from '../bodyspace/db.js';
import { getMetaAnalytics } from '../bodyspace/services/meta-analytics.js';

const app = makeApp();

beforeEach(() => {
    vi.mocked(getLatestSignals).mockResolvedValue(SIGNALS);
    vi.mocked(getLatestTrendsBrief).mockResolvedValue(TRENDS);
    vi.mocked(updateTrendsBrief).mockResolvedValue(TRENDS);
});

describe('Status & system routes', () => {
    describe('GET /api/bodyspace/status', () => {
        it('returns campaign counts and schedule info', async () => {
            const res = await request(app).get('/api/bodyspace/status');
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.counts).toBeDefined();
            expect(typeof res.body.counts.pendingReviewCampaigns).toBe('number');
        });
    });

    describe('GET /api/bodyspace/services', () => {
        it('returns the configured services list', async () => {
            const res = await request(app).get('/api/bodyspace/services');
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(Array.isArray(res.body.services)).toBe(true);
            expect(res.body.services[0]).toMatchObject({ id: expect.any(String), name: expect.any(String) });
        });
    });
});

describe('Signals routes', () => {
    describe('GET /api/bodyspace/signals', () => {
        it('returns the latest availability signals', async () => {
            const res = await request(app).get('/api/bodyspace/signals');
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ ok: true, signals: SIGNALS });
        });
    });
});

describe('Trends routes', () => {
    describe('GET /api/bodyspace/trends/latest', () => {
        it('returns the latest trends brief', async () => {
            const res = await request(app).get('/api/bodyspace/trends/latest');
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ ok: true, brief: TRENDS });
        });

        it('returns null brief when none exists', async () => {
            vi.mocked(getLatestTrendsBrief).mockResolvedValueOnce(null);
            const res = await request(app).get('/api/bodyspace/trends/latest');
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ ok: true, brief: null });
        });
    });

    describe('PATCH /api/bodyspace/trends/:id', () => {
        it('updates and returns the trends brief', async () => {
            const patch = {
                competitorSummary: 'Updated summary',
                trendSignals: 'Updated signals',
                seasonalFactors: 'Updated factors',
                recommendedFocus: 'Updated focus',
                opportunities: 'Updated opportunities',
            };
            const res = await request(app).patch(`/api/bodyspace/trends/${TRENDS.id}`).send(patch);
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.brief).toBeDefined();
        });
    });
});

describe('Analytics routes', () => {
    describe('GET /api/bodyspace/analytics/meta', () => {
        it('returns unconfigured state by default', async () => {
            const res = await request(app).get('/api/bodyspace/analytics/meta');
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.configured).toBe(false);
        });

        it('returns analytics data when configured', async () => {
            vi.mocked(getMetaAnalytics).mockResolvedValueOnce({
                configured: true,
                fetchedAt: '2025-06-01T00:00:00.000Z',
            });
            const res = await request(app).get('/api/bodyspace/analytics/meta');
            expect(res.status).toBe(200);
            expect(res.body.configured).toBe(true);
        });
    });

    describe('POST /api/bodyspace/analytics/meta/refresh', () => {
        it('clears cache and returns ok', async () => {
            const res = await request(app).post('/api/bodyspace/analytics/meta/refresh');
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ ok: true });
        });
    });
});
