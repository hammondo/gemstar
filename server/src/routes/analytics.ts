// routes/analytics.ts — Status, analytics, signals, services, trends, audit

import { Router } from 'express';
import { getAllServices, settings } from '../bodyspace/config.js';
import {
    getCampaignsByStatus,
    getLatestSignals,
    getLatestTrendsBrief,
    queryAuditLogs,
    updateTrendsBrief,
} from '../bodyspace/db.js';
import { clearMetaCache, getMetaAnalytics } from '../bodyspace/services/meta-analytics.js';

const analyticsRouter = Router();

analyticsRouter.get('/status', async (_req, res) => {
    try {
        const [pending, approved, scheduled] = await Promise.all([
            getCampaignsByStatus('pending_review'),
            getCampaignsByStatus('approved'),
            getCampaignsByStatus('scheduled'),
        ]);

        res.json({
            ok: true,
            timezone: settings.timezone,
            schedules: {
                freshaWatcher: settings.freshaWatcherCron,
                monitor: settings.monitorAgentCron,
                campaignPlanner: settings.campaignPlannerCron,
            },
            counts: {
                pendingReviewCampaigns: pending.length,
                approvedCampaigns: approved.length,
                scheduledCampaigns: scheduled.length,
                scheduledPosts: scheduled.reduce((count, campaign) => {
                    return count + campaign.posts.filter((post) => post.status === 'scheduled').length;
                }, 0),
            },
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

analyticsRouter.get('/analytics/meta', async (_req, res) => {
    try {
        const data = await getMetaAnalytics();
        res.json({ ok: true, ...data });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

analyticsRouter.post('/analytics/meta/refresh', (_req, res) => {
    clearMetaCache();
    res.json({ ok: true });
});

analyticsRouter.get('/signals', async (_req, res) => {
    try {
        const signals = await getLatestSignals();
        res.json({ ok: true, signals });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

analyticsRouter.get('/services', (_req, res) => {
    const services = getAllServices().map(({ id, name, category }) => ({ id, name, category }));
    res.json({ ok: true, services });
});

analyticsRouter.get('/trends/latest', async (_req, res) => {
    try {
        const brief = await getLatestTrendsBrief();
        res.json({ ok: true, brief });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

analyticsRouter.patch('/trends/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const { competitorSummary, trendSignals, seasonalFactors, recommendedFocus, opportunities } =
            req.body as Record<string, string>;
        const brief = await updateTrendsBrief(id, {
            competitorSummary,
            trendSignals,
            seasonalFactors,
            recommendedFocus,
            opportunities,
        });
        res.json({ ok: true, brief });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

analyticsRouter.get('/audit', async (req, res) => {
    try {
        const { agentName, status, trigger, search, limit, offset } = req.query as Record<
            string,
            string | undefined
        >;
        const result = await queryAuditLogs({
            agentName: agentName || undefined,
            status: status || undefined,
            trigger: trigger || undefined,
            search: search || undefined,
            limit: limit ? parseInt(limit, 10) : undefined,
            offset: offset ? parseInt(offset, 10) : undefined,
        });
        res.json({ ok: true, ...result });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

export default analyticsRouter;
