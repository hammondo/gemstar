// routes/wizard.ts — Wizard endpoints for interactive campaign + monitor setup

import Anthropic from '@anthropic-ai/sdk';
import { Router } from 'express';
import { CampaignPlannerAgent } from '../bodyspace/agents/campaign-planner/agent.js';
import { ImageGeneratorAgent } from '../bodyspace/agents/image-generator/agent.js';
import { MonitorAgent } from '../bodyspace/agents/monitor/agent.js';
import { settings } from '../bodyspace/config.js';
import { ApprovalWorkflow } from '../bodyspace/workflows/approval.js';
import { getAgentLogger } from '../bodyspace/utils/logger.js';
import { setupSSE } from './sse.js';

const log = getAgentLogger('WizardRoute');
const wizardRouter = Router();

wizardRouter.get('/wizard/monitor-prompt', (_req, res) => {
    const agent = new MonitorAgent();
    res.json({ ok: true, prompt: agent.buildPrompt() });
});

wizardRouter.post('/wizard/monitor/stream', (req, res) => {
    const { send, done, isClosed } = setupSSE(req, res);

    const rawTerms = req.body?.terms;
    const customTerms =
        Array.isArray(rawTerms) && rawTerms.every((t) => typeof t === 'string')
            ? (rawTerms as string[])
            : undefined;

    const agent = new MonitorAgent();
    agent
        .runStreaming((progress) => {
            if (!isClosed()) send('progress', progress);
        }, customTerms)
        .then(() => {
            send('complete', { ok: true });
            done();
        })
        .catch((err) => {
            send('error', { message: String(err) });
            done();
        });
});

wizardRouter.get('/wizard/campaign-prompt', async (_req, res) => {
    try {
        const planner = new CampaignPlannerAgent();
        const prompt = await planner.buildPromptForWizard();
        res.json({ ok: true, prompt });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

wizardRouter.post('/wizard/campaign', async (req, res) => {
    try {
        const ownerBrief = typeof req.body?.ownerBrief === 'string' ? req.body.ownerBrief : undefined;
        const selectedServices = Array.isArray(req.body?.selectedServices)
            ? (req.body.selectedServices as string[])
            : undefined;

        const planner = new CampaignPlannerAgent();
        const campaign = await planner.run({ ownerBrief, selectedServices });

        const approval = new ApprovalWorkflow();
        await approval.notifyOwner(campaign);

        const imageGen = new ImageGeneratorAgent();
        void imageGen.run(campaign.id).catch((err) => {
            log.error({ err }, '[Wizard] Image generation failed');
        });

        res.json({ ok: true, campaign });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

wizardRouter.post('/wizard/suggest-terms', async (_req, res) => {
    try {
        if (settings.mockAnthropic) {
            const mockTerms = [
                '"Perth wellness studio" competitor promotions — look for new service launches or discount offers',
                '"infrared sauna Perth" — check for new competitors or trending content',
                '"lymphatic drainage Perth" — track awareness and demand growth',
                '"recovery massage Cockburn" OR "Jandakot massage" — local competitor activity',
                '"Perth autumn wellness" — seasonal lifestyle content and booking trends',
            ];
            res.json({ ok: true, terms: mockTerms });
            return;
        }

        if (!settings.anthropicApiKey) {
            res.status(500).json({ ok: false, error: 'ANTHROPIC_API_KEY is not configured' });
            return;
        }

        const client = new Anthropic({ apiKey: settings.anthropicApiKey });
        const monthName = new Date().toLocaleString('en-AU', { month: 'long', timeZone: 'Australia/Perth' });

        const message = await client.messages.create({
            model: settings.fastModel,
            max_tokens: 600,
            messages: [
                {
                    role: 'user',
                    content: `Suggest 3-5 specific web search queries for BodySpace Recovery Studio market research. BodySpace is a wellness studio in Jandakot (Cockburn area), Perth, Western Australia offering massage, infrared sauna, NormaTec recovery boots, BodyROLL lymphatic machine, Reiki, and other wellness services.

The current month is ${monthName}. Focus on:
- Competitor activity in Perth/Cockburn/southern suburbs
- Wellness trends relevant to Perth/Australia right now
- Perth seasonal factors for ${monthName}

Return ONLY a JSON array of strings. Each string should be a full search instruction in this format: "query here" — what to look for. No preamble, no markdown, just the JSON array.`,
                },
            ],
        });

        let text = '';
        for (const block of message.content) {
            if (block.type === 'text') text += block.text;
        }

        let terms: string[];
        try {
            let clean = text.trim();
            if (clean.startsWith('```')) {
                const parts = clean.split('```');
                clean = parts[1] ?? '';
                if (clean.startsWith('json')) clean = clean.slice(4);
            }
            const parsed = JSON.parse(clean) as unknown;
            if (!Array.isArray(parsed) || !parsed.every((t) => typeof t === 'string')) {
                throw new Error('Not an array of strings');
            }
            terms = parsed as string[];
        } catch {
            res.status(500).json({ ok: false, error: 'Failed to parse AI response as JSON array' });
            return;
        }

        res.json({ ok: true, terms });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

export default wizardRouter;
