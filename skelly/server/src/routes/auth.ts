import { ConfidentialClientApplication } from '@azure/msal-node';
import { Router } from 'express';
import { settings } from '../bodyspace/config.js';

let _msalClient: ConfidentialClientApplication | null = null;

function getMsalClient(): ConfidentialClientApplication {
    if (!settings.msClientId) throw new Error('MS_CLIENT_ID is not configured');
    if (!_msalClient) {
        _msalClient = new ConfidentialClientApplication({
            auth: {
                clientId: settings.msClientId,
                clientSecret: settings.msClientSecret,
                authority: `https://login.microsoftonline.com/${settings.msTenantId}`,
            },
        });
    }
    return _msalClient;
}

const authRouter = Router();

authRouter.get('/login', async (_req, res) => {
    try {
        const authUrl = await getMsalClient().getAuthCodeUrl({
            scopes: ['openid', 'profile', 'email'],
            redirectUri: settings.msRedirectUri,
        });
        res.redirect(authUrl);
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

authRouter.get('/callback', async (req, res) => {
    const { code } = req.query;
    if (typeof code !== 'string') {
        res.status(400).send('Missing authorization code');
        return;
    }
    try {
        const result = await getMsalClient().acquireTokenByCode({
            code,
            scopes: ['openid', 'profile', 'email'],
            redirectUri: settings.msRedirectUri,
        });
        req.session.user = {
            id: result.account?.homeAccountId ?? '',
            name: result.account?.name ?? '',
            email: result.account?.username ?? '',
        };
        res.redirect(settings.dashboardBaseUrl);
    } catch (err) {
        res.status(500).send(`Authentication failed: ${String(err)}`);
    }
});

authRouter.get('/me', (req, res) => {
    if (!req.session.user) {
        res.status(401).json({ ok: false, error: 'Not authenticated' });
        return;
    }
    res.json({ ok: true, user: req.session.user });
});

authRouter.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ ok: true });
    });
});

export default authRouter;
