import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import session from 'express-session';
import { settings } from './bodyspace/config.js';
import apiRouter from './routes/index.js';

dotenv.config();

const app = express();
const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
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
            secure: settings.nodeEnv === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        },
    })
);

app.use('/api', apiRouter);

app.get('/', (_req, res) => {
    res.json({ message: 'Skelly API running', bodyspaceApi: '/api/bodyspace' });
});

app.listen(port, () => {
    console.log(`Skelly API listening on http://localhost:${port}`);
    // startBodyspaceScheduler();
});
