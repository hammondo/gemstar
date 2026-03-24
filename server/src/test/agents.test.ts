import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers.js';

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

// Mock filesystem so fresha/import doesn't write real files
vi.mock('node:fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:fs')>();
    return { ...actual, mkdirSync: vi.fn(), writeFileSync: vi.fn() };
});

const app = makeApp();

describe('Agent trigger routes', () => {
    describe('POST /api/bodyspace/run/fresha', () => {
        it('triggers the Fresha watcher and returns ok', async () => {
            const res = await request(app).post('/api/bodyspace/run/fresha');
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ ok: true });
        });
    });

    describe('POST /api/bodyspace/run/campaign', () => {
        it('triggers the campaign planner and returns ok', async () => {
            const res = await request(app).post('/api/bodyspace/run/campaign').send({});
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ ok: true });
        });

        it('passes ownerBrief when provided', async () => {
            const res = await request(app)
                .post('/api/bodyspace/run/campaign')
                .send({ ownerBrief: 'Focus on recovery' });
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ ok: true });
        });
    });

    describe('POST /api/bodyspace/run/all', () => {
        it('triggers all agents and returns ok', async () => {
            const res = await request(app).post('/api/bodyspace/run/all').send({});
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ ok: true });
        });
    });

    describe('POST /api/bodyspace/run/image-generator', () => {
        it('starts image generation for a campaign', async () => {
            const res = await request(app)
                .post('/api/bodyspace/run/image-generator')
                .send({ campaignId: 'cmp-001' });
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.campaignId).toBe('cmp-001');
        });

        it('returns 400 when campaignId is missing', async () => {
            const res = await request(app)
                .post('/api/bodyspace/run/image-generator')
                .send({});
            expect(res.status).toBe(400);
            expect(res.body.ok).toBe(false);
        });
    });

    describe('POST /api/bodyspace/schedule', () => {
        it('runs the scheduler and returns ok', async () => {
            const res = await request(app).post('/api/bodyspace/schedule').send({});
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ ok: true });
        });
    });

    describe('POST /api/bodyspace/fresha/import', () => {
        it('returns 400 when csvContent is missing', async () => {
            const res = await request(app).post('/api/bodyspace/fresha/import').send({});
            expect(res.status).toBe(400);
            expect(res.body.ok).toBe(false);
        });

        it('imports CSV and returns signals', async () => {
            const res = await request(app)
                .post('/api/bodyspace/fresha/import')
                .send({ csvContent: 'Date,Service\n2025-06-01,Sauna', filename: 'test.csv' });
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.filename).toBeDefined();
        });
    });
});
