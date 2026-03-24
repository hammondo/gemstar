import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers.js';
import { CAMPAIGN } from './fixtures.js';

vi.mock('../bodyspace/db.js', () => ({
    getCampaignsByStatus: vi.fn().mockReturnValue([]),
    getLatestSignals: vi.fn().mockReturnValue({}),
    getLatestTrendsBrief: vi.fn().mockReturnValue(null),
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

vi.mock('../bodyspace/settings-store.js', () => ({
    getMonitorSearchTerms: vi.fn().mockReturnValue([]),
    saveMonitorSearchTerms: vi.fn(),
    getSelectedCampaignServices: vi.fn().mockReturnValue([]),
    saveSelectedCampaignServices: vi.fn(),
    DEFAULT_MONITOR_TERMS: [],
}));

const app = makeApp();

describe('Wizard routes', () => {
    describe('GET /api/bodyspace/wizard/monitor-prompt', () => {
        it('returns the monitor prompt', async () => {
            const res = await request(app).get('/api/bodyspace/wizard/monitor-prompt');
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(typeof res.body.prompt).toBe('string');
            expect(res.body.prompt.length).toBeGreaterThan(0);
        });
    });

    describe('GET /api/bodyspace/wizard/campaign-prompt', () => {
        it('returns the campaign planner prompt', async () => {
            const res = await request(app).get('/api/bodyspace/wizard/campaign-prompt');
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(typeof res.body.prompt).toBe('string');
        });
    });

    describe('POST /api/bodyspace/wizard/campaign', () => {
        it('runs wizard and returns new campaign', async () => {
            const res = await request(app)
                .post('/api/bodyspace/wizard/campaign')
                .send({ ownerBrief: 'Focus on sauna this month' });
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.campaign).toBeDefined();
            expect(res.body.campaign.id).toBe(CAMPAIGN.id);
        });

        it('works with no body', async () => {
            const res = await request(app).post('/api/bodyspace/wizard/campaign').send({});
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
        });
    });

    describe('POST /api/bodyspace/wizard/suggest-terms', () => {
        it('returns AI-suggested search terms (mock mode)', async () => {
            // settings.mockAnthropic = true (set in setup.ts config mock)
            // The route checks mockAnthropic and returns hardcoded terms
            const res = await request(app).post('/api/bodyspace/wizard/suggest-terms');
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(Array.isArray(res.body.terms)).toBe(true);
        });
    });
});
