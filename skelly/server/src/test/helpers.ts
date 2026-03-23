import express from 'express';
import session from 'express-session';
import apiRouter from '../routes/index.js';
import { TEST_USER } from './fixtures.js';

// Augment express-session so `req.session.user` is typed across the test suite
declare module 'express-session' {
    interface SessionData {
        user?: { id: string; name: string; email: string };
    }
}

/**
 * Creates a minimal Express app wired to the full API router.
 * By default the session is pre-populated with TEST_USER so that
 * `requireAuth` passes on all `/api/bodyspace/*` routes.
 * Pass `{ authenticated: false }` to test unauthenticated behaviour.
 */
export function makeApp({ authenticated = true }: { authenticated?: boolean } = {}) {
    const app = express();
    app.use(express.json());
    app.use(
        session({
            secret: 'test-secret',
            resave: false,
            saveUninitialized: true,
        }),
    );
    if (authenticated) {
        app.use((req, _res, next) => {
            req.session.user = TEST_USER;
            next();
        });
    }
    app.use('/api', apiRouter);
    return app;
}
