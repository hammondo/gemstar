import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers.js';
import { TEST_USER } from './fixtures.js';

describe('Auth routes', () => {
    describe('GET /api/auth/me', () => {
        it('returns the session user when authenticated', async () => {
            const res = await request(makeApp()).get('/api/auth/me');
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ ok: true, user: TEST_USER });
        });

        it('returns 401 when no session', async () => {
            const res = await request(makeApp({ authenticated: false })).get('/api/auth/me');
            expect(res.status).toBe(401);
            expect(res.body.ok).toBe(false);
        });
    });

    describe('POST /api/auth/logout', () => {
        it('destroys session and returns ok', async () => {
            const res = await request(makeApp()).post('/api/auth/logout');
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ ok: true });
        });
    });
});
