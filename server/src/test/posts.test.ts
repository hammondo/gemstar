import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers.js';
import { CAMPAIGN, POST, POST_WITH_IMAGE } from './fixtures.js';

vi.mock('../bodyspace/db.js', () => ({
    getAllCampaigns: vi.fn(),
    getCampaignById: vi.fn(),
    getCampaignsByStatus: vi.fn().mockReturnValue([]),
    getPostById: vi.fn(),
    updatePostCopy: vi.fn(),
    updatePostImage: vi.fn(),
    updatePostSanitySync: vi.fn(),
    updatePostStatus: vi.fn(),
    updateCampaignStatus: vi.fn(),
    getLatestSignals: vi.fn().mockReturnValue({}),
    getLatestTrendsBrief: vi.fn().mockReturnValue(null),
    updateTrendsBrief: vi.fn(),
    saveCampaign: vi.fn(),
    saveTrendsBrief: vi.fn(),
    saveAvailabilitySignals: vi.fn(),
}));

import { getAllCampaigns, getCampaignsByStatus, getPostById } from '../bodyspace/db.js';

const app = makeApp();

beforeEach(() => {
    vi.mocked(getPostById).mockReturnValue(POST);
    vi.mocked(getAllCampaigns).mockReturnValue([CAMPAIGN]);
    vi.mocked(getCampaignsByStatus).mockReturnValue([CAMPAIGN]);
});

describe('Post routes', () => {
    describe('GET /api/bodyspace/posts/:id', () => {
        it('returns the post', async () => {
            const res = await request(app).get(`/api/bodyspace/posts/${POST.id}`);
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ ok: true, post: POST });
        });

        it('returns 404 when post not found', async () => {
            vi.mocked(getPostById).mockReturnValueOnce(null);
            const res = await request(app).get('/api/bodyspace/posts/nonexistent');
            expect(res.status).toBe(404);
            expect(res.body.ok).toBe(false);
        });
    });

    describe('PATCH /api/bodyspace/posts/:id', () => {
        it('updates post copy and returns the post', async () => {
            const res = await request(app)
                .patch(`/api/bodyspace/posts/${POST.id}`)
                .send({ copy: 'Updated copy' });
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.post).toBeDefined();
        });

        it('returns 400 when copy is missing', async () => {
            const res = await request(app)
                .patch(`/api/bodyspace/posts/${POST.id}`)
                .send({});
            expect(res.status).toBe(400);
            expect(res.body.ok).toBe(false);
        });
    });

    describe('POST /api/bodyspace/posts/:id/approve', () => {
        it('approves the post', async () => {
            const res = await request(app)
                .post(`/api/bodyspace/posts/${POST.id}/approve`)
                .send({});
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.blogSync).toBeDefined();
        });

        it('accepts optional copy override', async () => {
            const res = await request(app)
                .post(`/api/bodyspace/posts/${POST.id}/approve`)
                .send({ copy: 'Final approved copy' });
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
        });
    });

    describe('POST /api/bodyspace/posts/:id/reject', () => {
        it('rejects the post', async () => {
            const res = await request(app)
                .post(`/api/bodyspace/posts/${POST.id}/reject`)
                .send({ reason: 'Tone is off' });
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
        });
    });

    describe('POST /api/bodyspace/posts/:id/image', () => {
        it('sets the image URL', async () => {
            const res = await request(app)
                .post(`/api/bodyspace/posts/${POST.id}/image`)
                .send({ imageUrl: 'https://example.com/photo.jpg' });
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.imageStatus).toBe('draft');
        });

        it('returns 400 when imageUrl is missing', async () => {
            const res = await request(app)
                .post(`/api/bodyspace/posts/${POST.id}/image`)
                .send({});
            expect(res.status).toBe(400);
            expect(res.body.ok).toBe(false);
        });
    });

    describe('POST /api/bodyspace/posts/:id/image/approve', () => {
        it('approves the image draft', async () => {
            const campaignWithImage = { ...CAMPAIGN, posts: [POST_WITH_IMAGE] };
            vi.mocked(getAllCampaigns).mockReturnValue([campaignWithImage]);
            vi.mocked(getCampaignsByStatus).mockReturnValue([campaignWithImage]);
            vi.mocked(getPostById).mockReturnValue(POST_WITH_IMAGE);
            const res = await request(app).post(`/api/bodyspace/posts/${POST_WITH_IMAGE.id}/image/approve`);
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.post).toBeDefined();
        });

        it('returns 400 when post has no image', async () => {
            // POST fixture has no imageUrl
            const res = await request(app).post(`/api/bodyspace/posts/${POST.id}/image/approve`);
            expect(res.status).toBe(400);
            expect(res.body.ok).toBe(false);
        });
    });

    describe('POST /api/bodyspace/posts/:id/image/regenerate', () => {
        it('returns 400 when campaignId is missing', async () => {
            const res = await request(app)
                .post(`/api/bodyspace/posts/${POST.id}/image/regenerate`)
                .send({});
            expect(res.status).toBe(400);
            expect(res.body.ok).toBe(false);
        });
    });

    describe('POST /api/bodyspace/posts/:id/blog/sync', () => {
        it('triggers a manual blog sync', async () => {
            const res = await request(app).post(`/api/bodyspace/posts/${POST.id}/blog/sync`);
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.blogSync).toBeDefined();
        });
    });
});
