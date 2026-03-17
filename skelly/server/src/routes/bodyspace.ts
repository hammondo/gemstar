import express, { Router } from 'express';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FreshaWatcherAgent } from '../bodyspace/agents/fresha-watcher/agent.js';
import { ImageGeneratorAgent } from '../bodyspace/agents/image-generator/agent.js';
import { MonitorAgent } from '../bodyspace/agents/monitor/agent.js';
import { SchedulerAgent } from '../bodyspace/agents/scheduler/agent.js';
import { settings } from '../bodyspace/config.js';
import {
    getCampaignById,
    getCampaignsByStatus,
    getLatestSignals,
    getLatestTrendsBrief,
    updatePostImage,
    updatePostSanitySync,
} from '../bodyspace/db.js';
import { BodyspaceOrchestrator } from '../bodyspace/orchestrator.js';
import { SanityBlogPublisher } from '../bodyspace/services/sanity-blog-publisher.js';
import type { Campaign, CampaignStatus } from '../bodyspace/types.js';
import { ApprovalWorkflow } from '../bodyspace/workflows/approval.js';

const bodyspaceRouter = Router();
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

bodyspaceRouter.get('/signals', (_req, res) => {
    res.json({ ok: true, signals: getLatestSignals() });
});

bodyspaceRouter.get('/trends/latest', (_req, res) => {
    res.json({ ok: true, brief: getLatestTrendsBrief() });
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
        res.json({ ok: true, postId, imageStatus: 'approved', blogSync });
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
bodyspaceRouter.post('/posts/:id/image/regenerate', async (req, res) => {
    try {
        const postId = req.params.id;
        const campaignId = typeof req.body?.campaignId === 'string' ? req.body.campaignId : undefined;
        const feedback = typeof req.body?.feedback === 'string' ? req.body.feedback.trim() : undefined;
        const referenceImageUrl =
            typeof req.body?.referenceImageUrl === 'string' ? req.body.referenceImageUrl.trim() : undefined;
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
