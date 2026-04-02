// routes/agents.ts — Agent trigger routes (run/*, fresha/import, image-generator)

import { Router } from 'express';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FreshaWatcherAgent } from '../bodyspace/agents/fresha-watcher/agent.js';
import { ImageGeneratorAgent } from '../bodyspace/agents/image-generator/agent.js';
import { MonitorAgent } from '../bodyspace/agents/monitor/agent.js';
import { settings } from '../bodyspace/config.js';
import { failAudit, finishAudit, startAudit } from '../bodyspace/audit.js';
import { BodyspaceOrchestrator } from '../bodyspace/orchestrator.js';
import { getAgentLogger } from '../bodyspace/utils/logger.js';
import { setupSSE } from './sse.js';

const log = getAgentLogger('AgentsRoute');
const agentsRouter = Router();
const orchestrator = new BodyspaceOrchestrator();

agentsRouter.post('/run/fresha', async (req, res) => {
    try {
        await orchestrator.runFreshaWatcher(req.session.user, 'api');
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

agentsRouter.post('/run/monitor', async (req, res) => {
    try {
        await orchestrator.runMonitor(req.session.user, 'api');
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

agentsRouter.get('/run/monitor/stream', (req, res) => {
    const { send, done, isClosed } = setupSSE(req, res);

    const auditId = startAudit('monitor', 'api', req.session.user);
    const agent = new MonitorAgent();
    agent
        .runStreaming((progress) => {
            if (!isClosed()) send('progress', progress);
        })
        .then((brief) => {
            finishAudit(auditId, { briefId: brief.id, confidence: brief.confidence });
            send('complete', { ok: true });
            done();
        })
        .catch((err) => {
            failAudit(auditId, err);
            send('error', { message: String(err) });
            done();
        });
});

agentsRouter.post('/run/campaign', async (req, res) => {
    try {
        const ownerBrief = typeof req.body?.ownerBrief === 'string' ? req.body.ownerBrief : undefined;
        await orchestrator.runCampaignPlanner(ownerBrief, req.session.user, 'api');
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

agentsRouter.post('/run/all', async (req, res) => {
    try {
        const ownerBrief = typeof req.body?.ownerBrief === 'string' ? req.body.ownerBrief : undefined;
        await orchestrator.runAll({ ownerBrief, user: req.session.user, trigger: 'api' });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

agentsRouter.post('/run/image-generator', async (req, res) => {
    try {
        const campaignId = typeof req.body?.campaignId === 'string' ? req.body.campaignId : undefined;
        if (!campaignId) {
            res.status(400).json({ ok: false, error: 'campaignId is required' });
            return;
        }
        const auditId = startAudit('image-generator', 'api', req.session.user, { campaignId });
        const agent = new ImageGeneratorAgent();
        void agent.run(campaignId).then(() => {
            finishAudit(auditId, { campaignId });
        }).catch((err) => {
            failAudit(auditId, err);
            log.error({ err }, '[Route] Image generator error');
        });
        res.json({ ok: true, message: 'Image generation started', campaignId });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

agentsRouter.post('/fresha/import', async (req, res) => {
    const { csvContent, filename } = req.body as {
        csvContent?: string;
        filename?: string;
    };

    if (!csvContent || typeof csvContent !== 'string') {
        res.status(400).json({ ok: false, error: 'csvContent is required' });
        return;
    }

    try {
        const exportsDir = resolve(settings.dataDir, 'fresha-exports');
        mkdirSync(exportsDir, { recursive: true });

        const safeName =
            filename && filename.endsWith('.csv')
                ? filename.replace(/[^a-zA-Z0-9_.-]/g, '_')
                : `appointments_${new Date().toISOString().slice(0, 10)}.csv`;

        const savePath = resolve(exportsDir, safeName);
        writeFileSync(savePath, csvContent, 'utf8');

        const auditId = startAudit('fresha-watcher', 'api', req.session.user, { filename: safeName });
        let signals;
        try {
            const watcher = new FreshaWatcherAgent();
            signals = await watcher.run();
            const pushCount = Object.values(signals).filter((v) => v.signal === 'push').length;
            finishAudit(auditId, { signalCount: Object.keys(signals).length, pushCount });
        } catch (err) {
            failAudit(auditId, err);
            throw err;
        }

        res.json({ ok: true, filename: safeName, signals });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

export default agentsRouter;
