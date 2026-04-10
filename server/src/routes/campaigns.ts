// routes/campaigns.ts — Campaign and post management routes

import express, { Router } from 'express';
import multer from 'multer';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ImageGeneratorAgent } from '../bodyspace/agents/image-generator/agent.js';
import { SchedulerAgent } from '../bodyspace/agents/scheduler/agent.js';
import { withAudit } from '../bodyspace/audit.js';
import { settings } from '../bodyspace/config.js';
import {
    getAllCampaigns,
    getCampaignById,
    getCampaignsByStatus,
    getPostById,
    getPostCampaigns,
    updatePostCopy,
    updatePostImage,
    updatePostSanitySync,
} from '../bodyspace/db.js';
import { SanityBlogPublisher } from '../bodyspace/services/sanity-blog-publisher.js';
import type { Campaign, CampaignStatus } from '../bodyspace/types.js';
import { getAgentLogger } from '../bodyspace/utils/logger.js';
import { ApprovalWorkflow } from '../bodyspace/workflows/approval.js';

const log = getAgentLogger('CampaignsRoute');

const campaignsRouter = Router();
export const upload = multer({
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

// Serve locally stored generated images
const imagesDir = resolve(settings.dataDir, 'images');
mkdirSync(imagesDir, { recursive: true });
campaignsRouter.use('/images', express.static(imagesDir));

async function findCampaignByPostId(postId: string): Promise<Campaign | null> {
    const campaigns = await getAllCampaigns();
    return campaigns.find((campaign) => campaign.posts.some((post) => post.id === postId)) ?? null;
}

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

// ── Campaigns ─────────────────────────────────────────────────────────────────

campaignsRouter.get('/campaigns', async (req, res) => {
    try {
        const status = req.query.status as CampaignStatus | undefined;
        const campaigns = status ? await getCampaignsByStatus(status) : await getAllCampaigns();
        res.json({ ok: true, campaigns });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

campaignsRouter.get('/campaigns/:id', async (req, res) => {
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

campaignsRouter.post('/campaigns/:id/approve', async (req, res) => {
    try {
        const campaignId = req.params.id;
        const notes = typeof req.body?.notes === 'string' ? req.body.notes : undefined;
        const approval = new ApprovalWorkflow();
        const campaign = await approval.approveCampaign(campaignId, notes);

        await withAudit(
            'scheduler',
            'api',
            req.session.user,
            async () => {
                const scheduler = new SchedulerAgent();
                await scheduler.run(campaignId);
                return { campaignId };
            },
            { input: { campaignId } }
        );

        res.json({ ok: true, campaign });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

campaignsRouter.post('/campaigns/:id/reject', async (req, res) => {
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

// ── Posts ─────────────────────────────────────────────────────────────────────

campaignsRouter.get('/posts/:id', async (req, res) => {
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

campaignsRouter.patch('/posts/:id', async (req, res) => {
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

campaignsRouter.post('/posts/:id/approve', async (req, res) => {
    try {
        const postId = req.params.id;
        const copy = typeof req.body?.copy === 'string' ? req.body.copy : undefined;
        const approval = new ApprovalWorkflow();
        await approval.approvePost(postId, copy?.trim() || undefined);

        const blogSync = await trySyncApprovedPostToBlog(postId);
        const campaign = await findCampaignByPostId(postId);
        res.json({ ok: true, campaignId: campaign?.id ?? null, blogSync });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

campaignsRouter.post('/posts/:id/reject', async (req, res) => {
    try {
        const postId = req.params.id;
        const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
        const approval = new ApprovalWorkflow();
        await approval.rejectPost(postId, reason);

        const campaign = await findCampaignByPostId(postId);
        res.json({ ok: true, campaignId: campaign?.id ?? null });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

// ── Post images ───────────────────────────────────────────────────────────────

campaignsRouter.post('/posts/:id/image', async (req, res) => {
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

campaignsRouter.post('/posts/:id/image/upload', upload.single('imageFile'), async (req, res) => {
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

campaignsRouter.post('/posts/:id/image/approve', async (req, res) => {
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

campaignsRouter.post('/posts/:id/image/regenerate', upload.single('referenceImageFile'), async (req, res) => {
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

campaignsRouter.post('/posts/:id/blog/sync', async (req, res) => {
    try {
        const postId = req.params.id;
        const result = await trySyncApprovedPostToBlog(postId);
        res.json({ ok: true, postId, blogSync: result });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

// ── Scheduler ─────────────────────────────────────────────────────────────────

campaignsRouter.post('/schedule', async (req, res) => {
    try {
        const campaignId = typeof req.body?.campaignId === 'string' ? req.body.campaignId : undefined;
        await withAudit(
            'scheduler',
            'api',
            req.session.user,
            async () => {
                const scheduler = new SchedulerAgent();
                await scheduler.run(campaignId);
                return campaignId ? { campaignId } : undefined;
            },
            { input: campaignId ? { campaignId } : undefined }
        );
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

export default campaignsRouter;
