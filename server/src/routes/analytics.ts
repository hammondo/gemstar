// routes/analytics.ts — Status, analytics, signals, services, trends, audit

import { Router } from 'express';
import { getAllServices, settings } from '../bodyspace/config.js';
import {
    getLatestSignals,
    getLatestTrendsBrief,
    queryAuditLogs,
    updateTrendsBrief,
} from '../bodyspace/db.js';
import { clearMetaCache, getMetaAnalytics } from '../bodyspace/services/meta-analytics.js';
import { getCampaignsByStatus } from '../bodyspace/db.js';

const analyticsRouter = Router();

analyticsRouter.get('/status', (_req, res) => {
    const pending = getCampaignsByStatus('pending_review');
    const approved = getCampaignsByStatus('approved');
    const scheduled = getCampaignsByStatus('scheduled');

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

analyticsRouter.get('/signals', (_req, res) => {
    res.json({ ok: true, signals: getLatestSignals() });
});

analyticsRouter.get('/services', (_req, res) => {
    const services = getAllServices().map(({ id, name, category }) => ({ id, name, category }));
    res.json({ ok: true, services });
});

analyticsRouter.get('/trends/latest', (_req, res) => {
    res.json({ ok: true, brief: getLatestTrendsBrief() });
});

analyticsRouter.patch('/trends/:id', (req, res) => {
    const id = req.params.id;
    const { competitorSummary, trendSignals, seasonalFactors, recommendedFocus, opportunities } =
        req.body as Record<string, string>;
    const brief = updateTrendsBrief(id, {
        competitorSummary,
        trendSignals,
        seasonalFactors,
        recommendedFocus,
        opportunities,
    });
    res.json({ ok: true, brief });
});

analyticsRouter.get('/audit', (req, res) => {
    try {
        const { agentName, status, trigger, search, limit, offset } = req.query as Record<
            string,
            string | undefined
        >;
        const result = queryAuditLogs({
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
