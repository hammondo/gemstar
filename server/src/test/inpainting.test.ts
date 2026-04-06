import { beforeEach, describe, expect, it, vi } from 'vitest';
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

import { runSubjectInpainting } from '../bodyspace/services/subject-inpainting.js';

const app = makeApp();

describe('POST /api/bodyspace/inpainting/generate', () => {
    beforeEach(() => {
        vi.mocked(runSubjectInpainting).mockResolvedValue({
            requestId: 'mock-request-id',
            imageUrl: 'http://localhost:3000/api/bodyspace/inpainting/results/mock-request-id.webp',
        });
    });

    it('returns 400 when subjectImage is missing', async () => {
        const res = await request(app)
            .post('/api/bodyspace/inpainting/generate')
            .field('sceneDescription', 'A bright studio with plants');
        expect(res.status).toBe(400);
        expect(res.body.ok).toBe(false);
        expect(res.body.error).toMatch(/subjectImage/);
    });

    it('returns 400 when sceneDescription is missing', async () => {
        const res = await request(app)
            .post('/api/bodyspace/inpainting/generate')
            .attach('subjectImage', Buffer.from('fake-image-data'), {
                filename: 'subject.png',
                contentType: 'image/png',
            });
        expect(res.status).toBe(400);
        expect(res.body.ok).toBe(false);
        expect(res.body.error).toMatch(/sceneDescription/);
    });

    it('returns 400 when aspectRatio is invalid', async () => {
        const res = await request(app)
            .post('/api/bodyspace/inpainting/generate')
            .attach('subjectImage', Buffer.from('fake-image-data'), {
                filename: 'subject.png',
                contentType: 'image/png',
            })
            .field('sceneDescription', 'A bright studio with plants')
            .field('aspectRatio', 'bad-ratio');
        expect(res.status).toBe(400);
        expect(res.body.ok).toBe(false);
        expect(res.body.error).toMatch(/aspectRatio/);
    });

    it('returns 200 with result on success', async () => {
        const res = await request(app)
            .post('/api/bodyspace/inpainting/generate')
            .attach('subjectImage', Buffer.from('fake-image-data'), {
                filename: 'subject.png',
                contentType: 'image/png',
            })
            .field('sceneDescription', 'A bright studio with plants');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.requestId).toBe('mock-request-id');
        expect(res.body.imageUrl).toContain('mock-request-id');
    });

    it('defaults aspectRatio to 1:1 when not provided', async () => {
        const res = await request(app)
            .post('/api/bodyspace/inpainting/generate')
            .attach('subjectImage', Buffer.from('fake-image-data'), {
                filename: 'subject.png',
                contentType: 'image/png',
            })
            .field('sceneDescription', 'A serene spa environment');
        expect(res.status).toBe(200);
        expect(vi.mocked(runSubjectInpainting)).toHaveBeenCalledWith(
            expect.objectContaining({ aspectRatio: '1:1' }),
        );
    });

    it('accepts all valid aspect ratios', async () => {
        for (const ratio of ['1:1', '16:9', '9:16', '4:5']) {
            const res = await request(app)
                .post('/api/bodyspace/inpainting/generate')
                .attach('subjectImage', Buffer.from('fake-image-data'), {
                    filename: 'subject.png',
                    contentType: 'image/png',
                })
                .field('sceneDescription', 'A serene spa environment')
                .field('aspectRatio', ratio);
            expect(res.status).toBe(200);
        }
    });

    it('returns 500 when runSubjectInpainting throws', async () => {
        vi.mocked(runSubjectInpainting).mockRejectedValueOnce(new Error('Replicate API error'));
        const res = await request(app)
            .post('/api/bodyspace/inpainting/generate')
            .attach('subjectImage', Buffer.from('fake-image-data'), {
                filename: 'subject.png',
                contentType: 'image/png',
            })
            .field('sceneDescription', 'A bright studio with plants');
        expect(res.status).toBe(500);
        expect(res.body.ok).toBe(false);
        expect(res.body.error).toContain('Replicate API error');
    });

    it('returns 401 when not authenticated', async () => {
        const res = await request(makeApp({ authenticated: false }))
            .post('/api/bodyspace/inpainting/generate')
            .attach('subjectImage', Buffer.from('fake-image-data'), {
                filename: 'subject.png',
                contentType: 'image/png',
            })
            .field('sceneDescription', 'A bright studio with plants');
        expect(res.status).toBe(401);
    });
});
