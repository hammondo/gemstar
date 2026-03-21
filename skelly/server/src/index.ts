import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import session from 'express-session';
import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { settings } from './bodyspace/config.js';
import apiRouter from './routes/index.js';

dotenv.config();

const app = express();
const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:3000,http://localhost:5174')
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

const server = app.listen(port, () => {
    console.log(`Skelly API listening on http://localhost:${port}`);
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
