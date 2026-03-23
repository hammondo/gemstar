import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers.js';

vi.mock('../bodyspace/settings-store.js', () => ({
    getMonitorSearchTerms: vi.fn(),
    saveMonitorSearchTerms: vi.fn(),
    getSelectedCampaignServices: vi.fn(),
    saveSelectedCampaignServices: vi.fn(),
    DEFAULT_MONITOR_TERMS: [],
}));

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

import {
    getMonitorSearchTerms,
    getSelectedCampaignServices,
    saveMonitorSearchTerms,
    saveSelectedCampaignServices,
} from '../bodyspace/settings-store.js';

const app = makeApp();
const TERMS = ['term one', 'term two'];
const SERVICE_IDS = ['svc-sauna', 'svc-massage'];

beforeEach(() => {
    vi.mocked(getMonitorSearchTerms).mockReturnValue(TERMS);
    vi.mocked(saveMonitorSearchTerms).mockImplementation((t) => t);
    vi.mocked(getSelectedCampaignServices).mockReturnValue(SERVICE_IDS);
    vi.mocked(saveSelectedCampaignServices).mockImplementation((ids) => ids);
});

describe('Settings routes', () => {
    describe('GET /api/bodyspace/settings/monitor-terms', () => {
        it('returns current monitor search terms', async () => {
            const res = await request(app).get('/api/bodyspace/settings/monitor-terms');
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ ok: true, terms: TERMS });
        });
    });

    describe('PUT /api/bodyspace/settings/monitor-terms', () => {
        it('saves and returns updated terms', async () => {
            const newTerms = ['new term'];
            const res = await request(app)
                .put('/api/bodyspace/settings/monitor-terms')
                .send({ terms: newTerms });
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ ok: true, terms: newTerms });
            expect(vi.mocked(saveMonitorSearchTerms)).toHaveBeenCalledWith(newTerms);
        });

        it('returns 400 when terms is not an array of strings', async () => {
            const res = await request(app)
                .put('/api/bodyspace/settings/monitor-terms')
                .send({ terms: 'not-an-array' });
            expect(res.status).toBe(400);
            expect(res.body.ok).toBe(false);
        });
    });

    describe('GET /api/bodyspace/settings/campaign-services', () => {
        it('returns selected campaign service IDs', async () => {
            const res = await request(app).get('/api/bodyspace/settings/campaign-services');
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ ok: true, services: SERVICE_IDS });
        });
    });

    describe('PUT /api/bodyspace/settings/campaign-services', () => {
        it('saves and returns updated service IDs', async () => {
            const newIds = ['svc-sauna'];
            const res = await request(app)
                .put('/api/bodyspace/settings/campaign-services')
                .send({ services: newIds });
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ ok: true, services: newIds });
        });

        it('returns 400 when services is not an array of strings', async () => {
            const res = await request(app)
                .put('/api/bodyspace/settings/campaign-services')
                .send({ services: 123 });
            expect(res.status).toBe(400);
            expect(res.body.ok).toBe(false);
        });
    });
});
