import Anthropic from '@anthropic-ai/sdk';
import express, { Router } from 'express';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CampaignPlannerAgent } from '../bodyspace/agents/campaign-planner/agent.js';
import { FreshaWatcherAgent } from '../bodyspace/agents/fresha-watcher/agent.js';
import { ImageGeneratorAgent } from '../bodyspace/agents/image-generator/agent.js';
import { LibraryGeneratorAgent } from '../bodyspace/agents/library-generator/agent.js';
import { MonitorAgent } from '../bodyspace/agents/monitor/agent.js';
import { SchedulerAgent } from '../bodyspace/agents/scheduler/agent.js';
import { getAllServices, settings } from '../bodyspace/config.js';
import {
    addPostToCampaign,
    clonePost,
    getAllCampaigns,
    getAllPosts,
    getCampaignById,
    getCampaignsByStatus,
    getLatestSignals,
    getLatestTrendsBrief,
    getPostById,
    getPostCampaigns,
    schedulePost,
    updatePostCopy,
    updatePostImage,
    updatePostSanitySync,
    updateTrendsBrief,
} from '../bodyspace/db.js';
import orchestrator from '../bodyspace/orchestrator.js';
import { clearMetaCache, getMetaAnalytics } from '../bodyspace/services/meta-analytics.js';
import { SanityBlogPublisher } from '../bodyspace/services/sanity-blog-publisher.js';
import { runSubjectInpainting } from '../bodyspace/services/subject-inpainting.js';
import {
    getMonitorSearchTerms,
    getSelectedCampaignServices,
    saveMonitorSearchTerms,
    saveSelectedCampaignServices,
} from '../bodyspace/settings-store.js';
import type { CampaignStatus } from '../bodyspace/types.js';
import { ApprovalWorkflow } from '../bodyspace/workflows/approval.js';

import { IncomingMessage, ServerResponse } from 'node:http';
import agentsRouter from './agents.js';
import analyticsRouter from './analytics.js';
import campaignsRouter, { upload } from './campaigns.js';
import libraryRouter from './library.js';
import settingsRouter from './settings.js';
import wizardRouter from './wizard.js';

// ── SSE helper ────────────────────────────────────────────────────────────────
function setupSSE(req: IncomingMessage, res: ServerResponse) {
    req.setTimeout(0);
    res.socket?.setTimeout(0);
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
    });

    let closed = false;
    const keepalive = setInterval(() => {
        if (!closed) res.write(': ping\n\n');
    }, 25_000);

    req.on('close', () => {
        closed = true;
        clearInterval(keepalive);
    });

    const send = (event: string, data: unknown) => {
        if (!closed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const done = () => {
        clearInterval(keepalive);
        if (!closed) res.end();
    };

    return { send, done, isClosed: () => closed };
}

const bodyspaceRouter = Router();

bodyspaceRouter.use(analyticsRouter);
bodyspaceRouter.use(campaignsRouter);
bodyspaceRouter.use(agentsRouter);
bodyspaceRouter.use(libraryRouter);
bodyspaceRouter.use(settingsRouter);
bodyspaceRouter.use(wizardRouter);

async function trySyncApprovedPostToBlog(postId: string): Promise<{
    attempted: boolean;
    synced: boolean;
    reason?: string;
    documentId?: string;
    slug?: string;
}> {
    const post = await getPostById(postId);
    if (!post) {
        await updatePostSanitySync(postId, { status: 'failed', error: 'Post not found' });
        return { attempted: false, synced: false, reason: 'Post not found' };
    }

    // Use the first associated campaign for context (optional — used for title fallback)
    const campaign = post.campaigns[0] ? await getCampaignById(post.campaigns[0].id) : null;

    try {
        const publisher = new SanityBlogPublisher();
        const result = await publisher.syncApprovedPost(campaign, post);

        if (result.synced) {
            await updatePostSanitySync(postId, {
                status: 'synced',
                documentId: result.documentId,
                slug: result.slug,
                syncedAt: new Date().toISOString(),
                error: '',
            });
        } else {
            await updatePostSanitySync(postId, {
                status: 'skipped',
                error: result.reason ?? 'Sanity sync skipped',
            });
        }

        return { attempted: true, ...result };
    } catch (err) {
        const reason = String(err);
        await updatePostSanitySync(postId, { status: 'failed', error: reason });
        return { attempted: true, synced: false, reason };
    }
}

bodyspaceRouter.get('/status', async (_req, res) => {
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

bodyspaceRouter.get('/analytics/meta', async (_req, res) => {
    try {
        const data = await getMetaAnalytics();
        res.json({ ok: true, ...data });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

bodyspaceRouter.post('/analytics/meta/refresh', (_req, res) => {
    clearMetaCache();
    res.json({ ok: true });
});

bodyspaceRouter.get('/signals', async (_req, res) => {
    try {
        res.json({ ok: true, signals: await getLatestSignals() });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

bodyspaceRouter.get('/services', (_req, res) => {
    const services = getAllServices().map(({ id, name, category }) => ({ id, name, category }));
    res.json({ ok: true, services });
});

bodyspaceRouter.get('/trends/latest', async (_req, res) => {
    try {
        res.json({ ok: true, brief: await getLatestTrendsBrief() });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

bodyspaceRouter.patch('/trends/:id', async (req, res) => {
    try {
        const id = req.params.id as string;
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

bodyspaceRouter.get('/campaigns', async (req, res) => {
    try {
        const status = req.query.status as CampaignStatus | undefined;
        const campaigns = status ? await getCampaignsByStatus(status) : await getAllCampaigns();
        res.json({ ok: true, campaigns });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

bodyspaceRouter.get('/campaigns/:id', async (req, res) => {
    try {
        const campaign = await getCampaignById(req.params.id);
        if (!campaign) {
            res.status(404).json({ ok: false, error: 'Campaign not found' });
            return;
        }
        res.json({ ok: true, campaign });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

bodyspaceRouter.post('/run/fresha', async (_req, res) => {
    try {
        await orchestrator.runFreshaWatcher();
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

bodyspaceRouter.post('/run/monitor', async (_req, res) => {
    try {
        await orchestrator.runMonitor();
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

bodyspaceRouter.get('/run/monitor/stream', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
    });

    const send = (event: string, data: unknown) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    let closed = false;
    req.on('close', () => {
        closed = true;
    });

    const agent = new MonitorAgent();
    agent
        .runStreaming((progress) => {
            if (closed) return;
            send('progress', progress);
        })
        .then(() => {
            if (!closed) {
                send('complete', { ok: true });
                res.end();
            }
        })
        .catch((err) => {
            if (!closed) {
                send('error', { message: String(err) });
                res.end();
            }
        });
});

bodyspaceRouter.post('/run/campaign', async (req, res) => {
    try {
        const ownerBrief = typeof req.body?.ownerBrief === 'string' ? req.body.ownerBrief : undefined;
        await orchestrator.runCampaignPlanner(ownerBrief);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

bodyspaceRouter.post('/run/all', async (req, res) => {
    try {
        const ownerBrief = typeof req.body?.ownerBrief === 'string' ? req.body.ownerBrief : undefined;
        await orchestrator.runAll({ ownerBrief });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

bodyspaceRouter.post('/fresha/import', async (req, res) => {
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

        const watcher = new FreshaWatcherAgent();
        const signals = await watcher.run();

        res.json({ ok: true, filename: safeName, signals });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

bodyspaceRouter.get('/posts/:id', async (req, res) => {
    try {
        const post = await getPostById(req.params.id);
        if (!post) {
            res.status(404).json({ ok: false, error: 'Post not found' });
            return;
        }
        res.json({ ok: true, post });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

bodyspaceRouter.patch('/posts/:id', async (req, res) => {
    try {
        const postId = req.params.id;
        const { copy, scheduledFor } = req.body as { copy?: string; scheduledFor?: string | null };
        if (typeof copy !== 'string') {
            res.status(400).json({ ok: false, error: 'copy is required' });
            return;
        }
        await updatePostCopy(postId, copy.trim(), scheduledFor);
        const post = await getPostById(postId);
        res.json({ ok: true, post });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

bodyspaceRouter.post('/posts/:id/approve', async (req, res) => {
    try {
        const postId = req.params.id;
        const copy = typeof req.body?.copy === 'string' ? req.body.copy : undefined;
        const approval = new ApprovalWorkflow();
        await approval.approvePost(postId, copy?.trim() || undefined);

        const blogSync = await trySyncApprovedPostToBlog(postId);
        const campaigns = await getPostCampaigns(postId);
        res.json({ ok: true, campaigns, blogSync });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

bodyspaceRouter.post('/posts/:id/reject', async (req, res) => {
    try {
        const postId = req.params.id;
        const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
        const approval = new ApprovalWorkflow();
        await approval.rejectPost(postId, reason);

        const campaigns = await getPostCampaigns(postId);
        res.json({ ok: true, campaigns });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

bodyspaceRouter.post('/campaigns/:id/approve', async (req, res) => {
    try {
        const campaignId = req.params.id;
        const notes = typeof req.body?.notes === 'string' ? req.body.notes : undefined;
        const approval = new ApprovalWorkflow();
        const campaign = await approval.approveCampaign(campaignId, notes);

        const scheduler = new SchedulerAgent();
        await scheduler.run(campaignId);

        res.json({ ok: true, campaign });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

bodyspaceRouter.post('/campaigns/:id/reject', async (req, res) => {
    try {
        const campaignId = req.params.id;
        const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
        const approval = new ApprovalWorkflow();
        const campaign = await approval.rejectCampaign(campaignId, reason);

        res.json({ ok: true, campaign });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

bodyspaceRouter.post('/schedule', async (req, res) => {
    try {
        const campaignId = typeof req.body?.campaignId === 'string' ? req.body.campaignId : undefined;
        const scheduler = new SchedulerAgent();
        await scheduler.run(campaignId);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

// ── Image management ────────────────────────────────────────────────────────

bodyspaceRouter.post('/posts/:id/image', async (req, res) => {
    try {
        const postId = req.params.id;
        const imageUrl = typeof req.body?.imageUrl === 'string' ? req.body.imageUrl.trim() : undefined;
        if (!imageUrl) {
            res.status(400).json({ ok: false, error: 'imageUrl is required' });
            return;
        }
        await updatePostImage(postId, imageUrl, 'draft');
        res.json({ ok: true, postId, imageUrl, imageStatus: 'draft' });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

bodyspaceRouter.post('/posts/:id/image/upload', upload.single('imageFile'), async (req, res) => {
    try {
        const postId = req.params.id as string;
        const file = req.file;
        if (!file) {
            res.status(400).json({ ok: false, error: 'imageFile is required' });
            return;
        }
        const ext = file.mimetype.split('/')[1] ?? 'jpg';
        const uploadDir = resolve(settings.dataDir, 'images', postId);
        mkdirSync(uploadDir, { recursive: true });
        const filename = `upload.${ext}`;
        const dest = resolve(uploadDir, filename);
        const buffer = readFileSync(file.path);
        writeFileSync(dest, buffer);
        unlinkSync(file.path);
        const imageUrl = `${settings.apiBaseUrl}/api/bodyspace/images/${postId}/${filename}`;
        await updatePostImage(postId, imageUrl, 'draft');
        const post = await getPostById(postId);
        res.json({ ok: true, post });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

bodyspaceRouter.post('/posts/:id/image/approve', async (req, res) => {
    try {
        const postId = req.params.id;
        const post = await getPostById(postId);
        if (!post) {
            res.status(404).json({ ok: false, error: 'Post not found' });
            return;
        }
        if (!post.imageUrl) {
            res.status(400).json({ ok: false, error: 'No image to approve — generate or set one first' });
            return;
        }
        await updatePostImage(postId, post.imageUrl, 'approved');

        const blogSync = await trySyncApprovedPostToBlog(postId);
        const updatedPost = await getPostById(postId);
        res.json({ ok: true, post: updatedPost, blogSync });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

bodyspaceRouter.post('/posts/:id/blog/sync', async (req, res) => {
    try {
        const postId = req.params.id;
        const result = await trySyncApprovedPostToBlog(postId);
        res.json({ ok: true, postId, blogSync: result });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

bodyspaceRouter.post('/posts/:id/image/regenerate', upload.single('referenceImageFile'), async (req, res) => {
    try {
        const postId = req.params.id as string;
        let campaignId = typeof req.body?.campaignId === 'string' ? req.body.campaignId : undefined;
        if (!campaignId) {
            const campaigns = await getPostCampaigns(postId);
            campaignId = campaigns[0]?.id;
        }
        const feedback = typeof req.body?.feedback === 'string' ? req.body.feedback.trim() : undefined;
        let referenceImageUrl =
            typeof req.body?.referenceImageUrl === 'string' ? req.body.referenceImageUrl.trim() : undefined;
        const file = req.file;
        if (file) {
            const buffer = readFileSync(file.path);
            referenceImageUrl = `data:${file.mimetype};base64,${buffer.toString('base64')}`;
            unlinkSync(file.path);
        }
        const agent = new ImageGeneratorAgent();
        const imageUrl = await agent.regenerate(postId, campaignId, feedback, referenceImageUrl);
        const post = await getPostById(postId);
        res.json({
            ok: true,
            post,
            postId,
            imageUrl,
            imageStatus: 'draft',
            feedbackApplied: Boolean(feedback),
            referenceApplied: Boolean(referenceImageUrl),
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

// ── Settings store ────────────────────────────────────────────────────────────

bodyspaceRouter.get('/settings/monitor-terms', (_req, res) => {
    res.json({ ok: true, terms: getMonitorSearchTerms() });
});

bodyspaceRouter.put('/settings/monitor-terms', (req, res) => {
    const { terms } = req.body as { terms?: unknown };
    if (!Array.isArray(terms) || !terms.every((t) => typeof t === 'string')) {
        res.status(400).json({ ok: false, error: 'terms must be an array of strings' });
        return;
    }
    const saved = saveMonitorSearchTerms(terms as string[]);
    res.json({ ok: true, terms: saved });
});

bodyspaceRouter.get('/settings/campaign-services', (_req, res) => {
    res.json({ ok: true, services: getSelectedCampaignServices() });
});

bodyspaceRouter.put('/settings/campaign-services', (req, res) => {
    const { services: ids } = req.body as { services: unknown };
    if (!Array.isArray(ids) || !ids.every((s) => typeof s === 'string')) {
        res.status(400).json({ ok: false, error: 'services must be an array of strings' });
        return;
    }
    const saved = saveSelectedCampaignServices(ids as string[]);
    res.json({ ok: true, services: saved });
});

// ── Wizard ──────────────────────────────────────────────────────────────────

bodyspaceRouter.get('/wizard/monitor-prompt', (_req, res) => {
    const agent = new MonitorAgent();
    res.json({ ok: true, prompt: agent.buildPrompt() });
});

bodyspaceRouter.post('/wizard/monitor/stream', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
    });

    const send = (event: string, data: unknown) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const rawTerms = req.body?.terms;
    const customTerms =
        Array.isArray(rawTerms) && rawTerms.every((t) => typeof t === 'string') ? (rawTerms as string[]) : undefined;
    let closed = false;
    req.on('close', () => {
        closed = true;
    });

    const agent = new MonitorAgent();
    agent
        .runStreaming((progress) => {
            if (closed) return;
            send('progress', progress);
        }, customTerms)
        .then(() => {
            if (!closed) {
                send('complete', { ok: true });
                res.end();
            }
        })
        .catch((err) => {
            if (!closed) {
                send('error', { message: String(err) });
                res.end();
            }
        });
});

bodyspaceRouter.get('/wizard/campaign-prompt', async (_req, res) => {
    try {
        const planner = new CampaignPlannerAgent();
        const prompt = await planner.buildPromptForWizard();
        res.json({ ok: true, prompt });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

bodyspaceRouter.post('/wizard/campaign', async (req, res) => {
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
            console.error('[Wizard] Image generation failed:', err);
        });

        res.json({ ok: true, campaign });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

bodyspaceRouter.post('/wizard/suggest-terms', async (_req, res) => {
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
            model: 'claude-haiku-4-5-20251001',
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

// ── Library (universal post browser) ──────────────────────────────────────

bodyspaceRouter.get('/library', async (req, res) => {
    try {
        const { serviceId, status, variantTag, campaignId, source } = req.query as Record<string, string | undefined>;
        const posts = await getAllPosts({ serviceId, status, variantTag, campaignId, source } as Parameters<
            typeof getAllPosts
        >[0]);
        res.json({ ok: true, posts });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

bodyspaceRouter.post('/run/library', async (req, res) => {
    try {
        const { serviceIds, postsPerService } = req.body as {
            serviceIds?: unknown;
            postsPerService?: unknown;
        };
        if (!Array.isArray(serviceIds) || !serviceIds.every((s) => typeof s === 'string')) {
            res.status(400).json({ ok: false, error: 'serviceIds must be an array of strings' });
            return;
        }
        const count = typeof postsPerService === 'number' ? postsPerService : 6;

        const agent = new LibraryGeneratorAgent();
        const posts = await agent.run(serviceIds as string[], count);

        const imageGen = new ImageGeneratorAgent();
        void imageGen.runForPosts(posts).catch((err) => {
            console.error('[Library] Image generation failed:', err);
        });

        res.json({ ok: true, posts });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

bodyspaceRouter.get('/run/library/stream', async (req, res) => {
    const { send, done, isClosed } = setupSSE(req, res);

    const serviceIdsRaw = req.query.serviceIds;
    const serviceIds = Array.isArray(serviceIdsRaw)
        ? (serviceIdsRaw as string[])
        : typeof serviceIdsRaw === 'string'
          ? serviceIdsRaw.split(',')
          : [];

    if (serviceIds.length === 0) {
        send('error', { message: 'serviceIds query parameter is required' });
        done();
        return;
    }

    const postsPerService = parseInt((req.query.postsPerService as string) || '6', 10);
    const count = isNaN(postsPerService) ? 6 : postsPerService;

    const progress = (p: { type: string; message: string }) => {
        if (!isClosed()) send('progress', p);
    };

    try {
        const agent = new LibraryGeneratorAgent();
        const posts = await agent.run(serviceIds, count, progress);

        progress({ type: 'status', message: 'Post copy ready — generating images…' });

        const imageGen = new ImageGeneratorAgent();
        await imageGen.runForPosts(posts, progress);

        send('complete', { ok: true });
        done();
    } catch (err) {
        send('error', { message: String(err) });
        done();
    }
});

bodyspaceRouter.get('/run/library/images/stream', async (req, res) => {
    const { send, done, isClosed } = setupSSE(req, res);

    const progress = (p: { type: string; message: string }) => {
        if (!isClosed()) send('progress', p);
    };

    try {
        const allPosts = await getAllPosts();
        const needed = allPosts.filter((p) => p.imageStatus === 'needed' || p.imageStatus === 'generating');

        if (needed.length === 0) {
            send('complete', { ok: true });
            done();
            return;
        }

        progress({
            type: 'status',
            message: `Found ${needed.length} post${needed.length !== 1 ? 's' : ''} needing images…`,
        });

        const imageGen = new ImageGeneratorAgent();
        await imageGen.runForPosts(needed, progress);

        send('complete', { ok: true });
        done();
    } catch (err) {
        send('error', { message: String(err) });
        done();
    }
});

bodyspaceRouter.post('/run/library/images/stream', async (req, res) => {
    const { send, done, isClosed } = setupSSE(req, res);

    const progress = (p: { type: string; message: string }) => {
        if (!isClosed()) send('progress', p);
    };

    try {
        const allPosts = await getAllPosts();
        const needed = allPosts.filter((p) => p.imageStatus === 'needed' || p.imageStatus === 'generating');

        if (needed.length === 0) {
            send('complete', { ok: true });
            done();
            return;
        }

        progress({
            type: 'status',
            message: `Found ${needed.length} post${needed.length !== 1 ? 's' : ''} needing images…`,
        });

        const imageGen = new ImageGeneratorAgent();
        await imageGen.runForPosts(needed, progress);

        send('complete', { ok: true });
        done();
    } catch (err) {
        send('error', { message: String(err) });
        done();
    }
});

bodyspaceRouter.post('/posts/:id/clone', async (req, res) => {
    try {
        const post = await clonePost(req.params.id);
        if (!post) {
            res.status(404).json({ ok: false, error: 'Post not found' });
            return;
        }
        res.json({ ok: true, post });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

bodyspaceRouter.patch('/posts/:id/schedule', async (req, res) => {
    try {
        const postId = req.params.id;
        const { scheduledFor } = req.body as { scheduledFor?: string };
        if (!scheduledFor || typeof scheduledFor !== 'string') {
            res.status(400).json({ ok: false, error: 'scheduledFor is required' });
            return;
        }
        await schedulePost(postId, scheduledFor);
        const post = await getPostById(postId);
        res.json({ ok: true, post });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

bodyspaceRouter.post('/campaigns/:id/posts/:postId', async (req, res) => {
    try {
        await addPostToCampaign(req.params.id, req.params.postId);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

bodyspaceRouter.post('/run/image-generator', async (req, res) => {
    try {
        const campaignId = typeof req.body?.campaignId === 'string' ? req.body.campaignId : undefined;
        if (!campaignId) {
            res.status(400).json({ ok: false, error: 'campaignId is required' });
            return;
        }
        const agent = new ImageGeneratorAgent();
        void agent.run(campaignId).catch((err) => {
            console.error('[Route] Image generator error:', err);
        });
        res.json({ ok: true, message: 'Image generation started', campaignId });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

// ── Subject inpainting ─────────────────────────────────────────────────────────

const inpaintingDir = resolve(settings.dataDir, 'inpainting');
mkdirSync(inpaintingDir, { recursive: true });
bodyspaceRouter.use('/inpainting/results', express.static(inpaintingDir));

bodyspaceRouter.post(
    '/inpainting/generate',
    upload.fields([
        { name: 'subjectImage', maxCount: 1 },
        { name: 'referenceImages', maxCount: 5 },
    ]),
    async (req, res) => {
        try {
            const files = req.files as Record<string, Express.Multer.File[]> | undefined;
            const subjectFiles = files?.['subjectImage'];
            if (!subjectFiles?.length) {
                res.status(400).json({ ok: false, error: 'subjectImage file is required' });
                return;
            }

            const sceneDescription =
                typeof req.body?.sceneDescription === 'string' ? req.body.sceneDescription.trim() : '';
            if (!sceneDescription) {
                res.status(400).json({ ok: false, error: 'sceneDescription is required' });
                return;
            }

            const aspectRatio = (req.body?.aspectRatio as string) || '1:1';
            const validRatios = ['1:1', '16:9', '9:16', '4:5'];
            if (!validRatios.includes(aspectRatio)) {
                res.status(400).json({ ok: false, error: `aspectRatio must be one of: ${validRatios.join(', ')}` });
                return;
            }

            const subjectFile = subjectFiles[0];
            const subjectBuffer = readFileSync(subjectFile.path);
            unlinkSync(subjectFile.path);

            const referenceImageUrls: string[] = [];
            const refFiles = files?.['referenceImages'] ?? [];
            for (const f of refFiles) {
                const buf = readFileSync(f.path);
                referenceImageUrls.push(`data:${f.mimetype};base64,${buf.toString('base64')}`);
                unlinkSync(f.path);
            }

            const result = await runSubjectInpainting({
                subjectBuffer,
                subjectMimeType: subjectFile.mimetype,
                sceneDescription,
                aspectRatio: aspectRatio as '1:1' | '16:9' | '9:16' | '4:5',
                referenceImageUrls: referenceImageUrls.length ? referenceImageUrls : undefined,
            });

            res.json({ ok: true, ...result });
        } catch (err) {
            res.status(500).json({ ok: false, error: String(err) });
        }
    }
);

// ── SSE Test Endpoints ────────────────────────────────────────────────────────

bodyspaceRouter.get('/test/sse', (req, res) => {
    const { send, done } = setupSSE(req, res);
    let count = 0;
    const max = 5;

    const interval = setInterval(() => {
        count++;
        send('progress', { type: 'test', message: `Test progress ${count}/${max}`, count });
        if (count >= max) {
            clearInterval(interval);
            send('complete', { ok: true });
            done();
        }
    }, 1000);

    req.on('close', () => clearInterval(interval));
});

bodyspaceRouter.post('/test/sse-post', (req, res) => {
    const { send, done } = setupSSE(req, res);
    const { seconds = 5 } = req.body as { seconds?: number };
    let count = 0;

    const interval = setInterval(() => {
        count++;
        send('progress', { type: 'test', message: `Test progress ${count}/${seconds}`, count });
        if (count >= seconds) {
            clearInterval(interval);
            send('complete', { ok: true });
            done();
        }
    }, 1000);

    req.on('close', () => clearInterval(interval));
});

export default bodyspaceRouter;
