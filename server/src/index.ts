import connectPgSimple from 'connect-pg-simple';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import session from 'express-session';
import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { finishAudit, startAudit } from './bodyspace/audit.js';
import { settings } from './bodyspace/config.js';
import { getPool, initDb } from './bodyspace/db.js';
import apiRouter from './routes/index.js';

const PgSession = connectPgSimple(session);

dotenv.config();

const app = express();
const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5174')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use(express.json());
app.use(
    cors({
        origin: allowedOrigins,
        credentials: true,
    })
);
app.use(
    session({
        store: new PgSession({
            pool: getPool(),
            tableName: 'sessions',
            createTableIfMissing: true,
        }),
        secret: settings.dashboardSessionSecret,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: 'lax',
            // Set COOKIE_SECURE=true only when running behind HTTPS (e.g. behind a reverse proxy)
            secure: process.env.COOKIE_SECURE === 'true',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        },
    })
);

app.use('/api', apiRouter);

// Serve dashboard SPA in production
const __dirname = dirname(fileURLToPath(import.meta.url));
const dashboardDist = resolve(process.env.DASHBOARD_DIST_PATH ?? join(__dirname, '../../dashboard/dist'));
if (existsSync(dashboardDist)) {
    app.use(express.static(dashboardDist));
    app.get('*path', (_req, res) => res.sendFile(join(dashboardDist, 'index.html')));
} else {
    app.get('/', (_req, res) => {
        res.json({ message: 'Skelly API running', bodyspaceApi: '/api/bodyspace' });
    });
}

await initDb();

const startupId = await startAudit('server', 'system');

const server = app.listen(port, async () => {
    console.log(`Skelly API listening on http://localhost:${port}`);
    await finishAudit(startupId, { port });
    // startBodyspaceScheduler();
});

server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use. Kill the existing process and try again.`);
    } else {
        console.error('Server error:', err);
    }
    process.exit(1);
});

async function shutdown(signal: string) {
    const id = await startAudit('server', 'system', null, { signal });
    server.close(async () => {
        await finishAudit(id, { signal });
        process.exit(0);
    });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
