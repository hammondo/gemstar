import Anthropic from '@anthropic-ai/sdk';
import express, { Router } from 'express';
import type { IncomingMessage, ServerResponse } from 'node:http';
import multer from 'multer';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FreshaWatcherAgent } from '../bodyspace/agents/fresha-watcher/agent.js';
import { ImageGeneratorAgent } from '../bodyspace/agents/image-generator/agent.js';
import { LibraryGeneratorAgent } from '../bodyspace/agents/library-generator/agent.js';
import { MonitorAgent } from '../bodyspace/agents/monitor/agent.js';
import { CampaignPlannerAgent } from '../bodyspace/agents/campaign-planner/agent.js';
import { SchedulerAgent } from '../bodyspace/agents/scheduler/agent.js';
import { getAllServices, settings } from '../bodyspace/config.js';
import { getMonitorSearchTerms, saveMonitorSearchTerms, getSelectedCampaignServices, saveSelectedCampaignServices } from '../bodyspace/settings-store.js';
import {
    getCampaignById,
    getCampaignsByStatus,
    getLatestSignals,
    getLatestTrendsBrief,
    getLibraryPosts,
    markLibraryPostUsed,
    reviveLibraryPost,
    scheduleLibraryPost,
    updateTrendsBrief,
    getPostById,
    updatePostCopy,
    updatePostImage,
    updatePostSanitySync,
} from '../bodyspace/db.js';
import { clearMetaCache, getMetaAnalytics } from '../bodyspace/services/meta-analytics.js';
import { BodyspaceOrchestrator } from '../bodyspace/orchestrator.js';
import { SanityBlogPublisher } from '../bodyspace/services/sanity-blog-publisher.js';
import type { Campaign, CampaignStatus } from '../bodyspace/types.js';
import { ApprovalWorkflow } from '../bodyspace/workflows/approval.js';

// ── SSE helper ────────────────────────────────────────────────────────────────
// Sets up an SSE response and returns a `send` helper + teardown.
// Sends `: ping` comments every 25s so proxies don't close idle connections.
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
    const keepalive = setInterval(() => { if (!closed) res.write(': ping\n\n'); }, 25_000);

    req.on('close', () => { closed = true; clearInterval(keepalive); });

    const send = (event: string, data: unknown) => {
        if (!closed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const done = () => { clearInterval(keepalive); if (!closed) res.end(); };

    return { send, done, isClosed: () => closed };
}

const bodyspaceRouter = Router();
const upload = multer({
    dest: resolve(settings.dataDir, 'uploads'),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    },
});
const orchestrator = new BodyspaceOrchestrator();

// Serve locally stored generated images
const imagesDir = resolve(settings.dataDir, 'images');
mkdirSync(imagesDir, { recursive: true });
bodyspaceRouter.use('/images', express.static(imagesDir));

const campaignStatuses: CampaignStatus[] = [
    'draft',
    'pending_review',
    'approved',
    'rejected',
    'scheduled',
    'published',
];

function getAllCampaigns(): Campaign[] {
    return campaignStatuses.flatMap((status) => getCampaignsByStatus(status));
}

function findCampaignByPostId(postId: string): Campaign | null {
    return getAllCampaigns().find((campaign) => campaign.posts.some((post) => post.id === postId)) ?? null;
}

async function trySyncApprovedPostToBlog(postId: string): Promise<{
    attempted: boolean;
    synced: boolean;
    reason?: string;
    documentId?: string;
    slug?: string;
}> {
    const campaign = findCampaignByPostId(postId);
    const post = campaign?.posts.find((p) => p.id === postId);

    if (!campaign || !post) {
        updatePostSanitySync(postId, {
            status: 'failed',
            error: 'Post not found',
        });
        return { attempted: false, synced: false, reason: 'Post not found' };
    }

    try {
        const publisher = new SanityBlogPublisher();
        const result = await publisher.syncApprovedPost(campaign, post);

        if (result.synced) {
            updatePostSanitySync(postId, {
                status: 'synced',
                documentId: result.documentId,
                slug: result.slug,
                syncedAt: new Date().toISOString(),
                error: '',
            });
        } else {
            updatePostSanitySync(postId, {
                status: 'skipped',
                error: result.reason ?? 'Sanity sync skipped',
            });
        }

        return {
            attempted: true,
            ...result,
        };
    } catch (err) {
        const reason = String(err);
        updatePostSanitySync(postId, {
            status: 'failed',
            error: reason,
        });

        return {
            attempted: true,
            synced: false,
            reason,
        };
    }
}

bodyspaceRouter.get('/status', (_req, res) => {
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

bodyspaceRouter.get('/signals', (_req, res) => {
    res.json({ ok: true, signals: getLatestSignals() });
});

bodyspaceRouter.get('/services', (_req, res) => {
    const services = getAllServices().map(({ id, name, category }) => ({ id, name, category }));
    res.json({ ok: true, services });
});

bodyspaceRouter.get('/trends/latest', (_req, res) => {
    res.json({ ok: true, brief: getLatestTrendsBrief() });
});

bodyspaceRouter.patch('/trends/:id', (req, res) => {
    const id = req.params.id as string;
    const { competitorSummary, trendSignals, seasonalFactors, recommendedFocus, opportunities } = req.body as Record<string, string>;
    const brief = updateTrendsBrief(id, { competitorSummary, trendSignals, seasonalFactors, recommendedFocus, opportunities });
    res.json({ ok: true, brief });
});

bodyspaceRouter.get('/campaigns', (req, res) => {
    const status = req.query.status as CampaignStatus | undefined;
    const campaigns = status ? getCampaignsByStatus(status) : getAllCampaigns();
    res.json({ ok: true, campaigns });
});

bodyspaceRouter.get('/campaigns/:id', (req, res) => {
    const campaign = getCampaignById(req.params.id);
    if (!campaign) {
        res.status(404).json({ ok: false, error: 'Campaign not found' });
        return;
    }

    res.json({ ok: true, campaign });
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

bodyspaceRouter.get('/posts/:id', (req, res) => {
    try {
        const post = getPostById(req.params.id);
        if (!post) {
            res.status(404).json({ ok: false, error: 'Post not found' });
            return;
        }
        res.json({ ok: true, post });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

bodyspaceRouter.patch('/posts/:id', (req, res) => {
    try {
        const postId = req.params.id;
        const { copy, scheduledFor } = req.body as { copy?: string; scheduledFor?: string | null };
        if (typeof copy !== 'string') {
            res.status(400).json({ ok: false, error: 'copy is required' });
            return;
        }
        updatePostCopy(postId, copy.trim(), scheduledFor);
        const post = getPostById(postId);
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
        approval.approvePost(postId, copy?.trim() || undefined);

        const blogSync = await trySyncApprovedPostToBlog(postId);
        const campaign = findCampaignByPostId(postId);
        res.json({ ok: true, campaignId: campaign?.id ?? null, blogSync });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

bodyspaceRouter.post('/posts/:id/reject', (req, res) => {
    try {
        const postId = req.params.id;
        const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
        const approval = new ApprovalWorkflow();
        approval.rejectPost(postId, reason);

        const campaign = findCampaignByPostId(postId);
        res.json({ ok: true, campaignId: campaign?.id ?? null });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

bodyspaceRouter.post('/campaigns/:id/approve', async (req, res) => {
    try {
        const campaignId = req.params.id;
        const notes = typeof req.body?.notes === 'string' ? req.body.notes : undefined;
        const approval = new ApprovalWorkflow();
        const campaign = approval.approveCampaign(campaignId, notes);

        const scheduler = new SchedulerAgent();
        await scheduler.run(campaignId);

        res.json({ ok: true, campaign });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

bodyspaceRouter.post('/campaigns/:id/reject', (req, res) => {
    try {
        const campaignId = req.params.id;
        const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
        const approval = new ApprovalWorkflow();
        const campaign = approval.rejectCampaign(campaignId, reason);

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

// Set image URL manually (owner pastes a URL or uploads via external tool)
bodyspaceRouter.post('/posts/:id/image', (req, res) => {
    try {
        const postId = req.params.id;
        const imageUrl = typeof req.body?.imageUrl === 'string' ? req.body.imageUrl.trim() : undefined;
        if (!imageUrl) {
            res.status(400).json({ ok: false, error: 'imageUrl is required' });
            return;
        }
        updatePostImage(postId, imageUrl, 'draft');
        res.json({ ok: true, postId, imageUrl, imageStatus: 'draft' });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

// Upload an owner image directly (bypasses AI — saves file and sets as draft)
bodyspaceRouter.post('/posts/:id/image/upload', upload.single('imageFile'), (req, res) => {
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
        updatePostImage(postId, imageUrl, 'draft');
        const post = getPostById(postId);
        res.json({ ok: true, post });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

// Approve the current image draft so the post becomes schedulable
bodyspaceRouter.post('/posts/:id/image/approve', async (req, res) => {
    try {
        const postId = req.params.id;
        const campaign = findCampaignByPostId(postId);
        const post = campaign?.posts.find((p) => p.id === postId);
        if (!post) {
            res.status(404).json({ ok: false, error: 'Post not found' });
            return;
        }
        if (!post.imageUrl) {
            res.status(400).json({ ok: false, error: 'No image to approve — generate or set one first' });
            return;
        }
        updatePostImage(postId, post.imageUrl, 'approved');

        const blogSync = await trySyncApprovedPostToBlog(postId);
        const updatedPost = getPostById(postId);
        res.json({ ok: true, post: updatedPost, blogSync });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

// Manually sync a post to Sanity blog (useful for retries)
bodyspaceRouter.post('/posts/:id/blog/sync', async (req, res) => {
    try {
        const postId = req.params.id;
        const result = await trySyncApprovedPostToBlog(postId);
        res.json({ ok: true, postId, blogSync: result });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

// Regenerate the AI image for a single post
bodyspaceRouter.post('/posts/:id/image/regenerate', upload.single('referenceImageFile'), async (req, res) => {
    try {
        const postId = req.params.id as string;
        const campaignId = typeof req.body?.campaignId === 'string' ? req.body.campaignId : undefined;
        const feedback = typeof req.body?.feedback === 'string' ? req.body.feedback.trim() : undefined;
        let referenceImageUrl =
            typeof req.body?.referenceImageUrl === 'string' ? req.body.referenceImageUrl.trim() : undefined;
        // If file uploaded, convert to data URL then clean up the temp file
        const file = req.file;
        if (file) {
            const buffer = readFileSync(file.path);
            referenceImageUrl = `data:${file.mimetype};base64,${buffer.toString('base64')}`;
            unlinkSync(file.path);
        }
        if (!campaignId) {
            res.status(400).json({ ok: false, error: 'campaignId is required' });
            return;
        }
        const agent = new ImageGeneratorAgent();
        const imageUrl = await agent.regenerate(postId, campaignId, feedback, referenceImageUrl);
        res.json({
            ok: true,
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
    const customTerms = Array.isArray(rawTerms) && rawTerms.every((t) => typeof t === 'string')
        ? (rawTerms as string[])
        : undefined;
    let closed = false;
    req.on('close', () => { closed = true; });

    const agent = new MonitorAgent();
    agent
        .runStreaming((progress) => {
            if (closed) return;
            send('progress', progress);
        }, customTerms)
        .then(() => {
            if (!closed) { send('complete', { ok: true }); res.end(); }
        })
        .catch((err) => {
            if (!closed) { send('error', { message: String(err) }); res.end(); }
        });
});

bodyspaceRouter.get('/wizard/campaign-prompt', (_req, res) => {
    const planner = new CampaignPlannerAgent();
    res.json({ ok: true, prompt: planner.buildPromptForWizard() });
});

bodyspaceRouter.post('/wizard/campaign', async (req, res) => {
    try {
        const ownerBrief = typeof req.body?.ownerBrief === 'string' ? req.body.ownerBrief : undefined;
        const selectedServices = Array.isArray(req.body?.selectedServices) ? req.body.selectedServices as string[] : undefined;

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

// ── Wizard: suggest monitor search terms ─────────────────────────────────────

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

// ── Library ───────────────────────────────────────────────────────────────

bodyspaceRouter.get('/library', (req, res) => {
    try {
        const { serviceId, status, variantTag } = req.query as Record<string, string | undefined>;
        const posts = getLibraryPosts({ serviceId, status, variantTag } as Parameters<typeof getLibraryPosts>[0]);
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

        // Fire image generation in background
        const imageGen = new ImageGeneratorAgent();
        void imageGen.runForPosts(posts).catch((err) => {
            console.error('[Library] Image generation failed:', err);
        });

        res.json({ ok: true, posts });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

bodyspaceRouter.post('/run/library/stream', async (req, res) => {
    const { send, done, isClosed } = setupSSE(req, res);

    const { serviceIds, postsPerService } = req.body as { serviceIds?: unknown; postsPerService?: unknown };
    if (!Array.isArray(serviceIds) || !serviceIds.every((s) => typeof s === 'string')) {
        send('error', { message: 'serviceIds must be an array of strings' });
        done();
        return;
    }

    const count = typeof postsPerService === 'number' ? postsPerService : 6;
    const progress = (p: { type: string; message: string }) => { if (!isClosed()) send('progress', p); };

    try {
        const agent = new LibraryGeneratorAgent();
        const posts = await agent.run(serviceIds as string[], count, progress);

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

bodyspaceRouter.post('/run/library/images/stream', async (req, res) => {
    const { send, done, isClosed } = setupSSE(req, res);

    const progress = (p: { type: string; message: string }) => { if (!isClosed()) send('progress', p); };

    try {
        const allLibraryPosts = getLibraryPosts();
        const needed = allLibraryPosts.filter((p) => p.imageStatus === 'needed' || p.imageStatus === 'generating');

        if (needed.length === 0) {
            send('complete', { ok: true });
            done();
            return;
        }

        progress({ type: 'status', message: `Found ${needed.length} post${needed.length !== 1 ? 's' : ''} needing images…` });

        const imageGen = new ImageGeneratorAgent();
        await imageGen.runForPosts(needed, progress);

        send('complete', { ok: true });
        done();
    } catch (err) {
        send('error', { message: String(err) });
        done();
    }
});

bodyspaceRouter.post('/library/posts/:id/used', (req, res) => {
    try {
        markLibraryPostUsed(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

bodyspaceRouter.post('/library/posts/:id/revive', (req, res) => {
    try {
        const post = reviveLibraryPost(req.params.id);
        if (!post) {
            res.status(404).json({ ok: false, error: 'Post not found or not a library post' });
            return;
        }
        res.json({ ok: true, post });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

bodyspaceRouter.patch('/library/posts/:id/schedule', (req, res) => {
    try {
        const postId = req.params.id;
        const { scheduledFor } = req.body as { scheduledFor?: string };
        if (!scheduledFor || typeof scheduledFor !== 'string') {
            res.status(400).json({ ok: false, error: 'scheduledFor is required' });
            return;
        }
        scheduleLibraryPost(postId, scheduledFor);
        const post = getPostById(postId);
        res.json({ ok: true, post });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

// Run image generation for a whole campaign
bodyspaceRouter.post('/run/image-generator', async (req, res) => {
    try {
        const campaignId = typeof req.body?.campaignId === 'string' ? req.body.campaignId : undefined;
        if (!campaignId) {
            res.status(400).json({ ok: false, error: 'campaignId is required' });
            return;
        }
        const agent = new ImageGeneratorAgent();
        // Run async and return immediately — generation takes time
        void agent.run(campaignId).catch((err) => {
            console.error('[Route] Image generator error:', err);
        });
        res.json({ ok: true, message: 'Image generation started', campaignId });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

export default bodyspaceRouter;
