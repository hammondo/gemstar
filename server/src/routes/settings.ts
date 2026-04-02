// routes/settings.ts — User-configurable settings (monitor terms, campaign services)

import { Router } from 'express';
import {
    getMonitorSearchTerms,
    getSelectedCampaignServices,
    saveMonitorSearchTerms,
    saveSelectedCampaignServices,
} from '../bodyspace/settings-store.js';

const settingsRouter = Router();

settingsRouter.get('/settings/monitor-terms', (_req, res) => {
    res.json({ ok: true, terms: getMonitorSearchTerms() });
});

settingsRouter.put('/settings/monitor-terms', (req, res) => {
    const { terms } = req.body as { terms?: unknown };
    if (!Array.isArray(terms) || !terms.every((t) => typeof t === 'string')) {
        res.status(400).json({ ok: false, error: 'terms must be an array of strings' });
        return;
    }
    const saved = saveMonitorSearchTerms(terms as string[]);
    res.json({ ok: true, terms: saved });
});

settingsRouter.get('/settings/campaign-services', (_req, res) => {
    res.json({ ok: true, services: getSelectedCampaignServices() });
});

settingsRouter.put('/settings/campaign-services', (req, res) => {
    const { services: ids } = req.body as { services: unknown };
    if (!Array.isArray(ids) || !ids.every((s) => typeof s === 'string')) {
        res.status(400).json({ ok: false, error: 'services must be an array of strings' });
        return;
    }
    const saved = saveSelectedCampaignServices(ids as string[]);
    res.json({ ok: true, services: saved });
});

export default settingsRouter;
