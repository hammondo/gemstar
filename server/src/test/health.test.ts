import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers.js';

const app = makeApp();

describe('GET /api/health', () => {
    it('returns 200 with service status', async () => {
        const res = await request(app).get('/api/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
        expect(res.body.service).toBe('skelly-api');
        expect(typeof res.body.timestamp).toBe('string');
    });
});
