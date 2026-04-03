// routes/library.ts — Library post management + generation routes

import { Router } from 'express';
import { ImageGeneratorAgent } from '../bodyspace/agents/image-generator/agent.js';
import { LibraryGeneratorAgent } from '../bodyspace/agents/library-generator/agent.js';
import { withAudit } from '../bodyspace/audit.js';
import {
    getLibraryPosts,
    getPostById,
    markLibraryPostUsed,
    reviveLibraryPost,
    scheduleLibraryPost,
} from '../bodyspace/db.js';
import { getAgentLogger } from '../bodyspace/utils/logger.js';
import { setupSSE } from './sse.js';

const log = getAgentLogger('LibraryRoute');
const libraryRouter = Router();

libraryRouter.get('/library', (req, res) => {
    try {
        const { serviceId, status, variantTag } = req.query as Record<string, string | undefined>;
        const posts = getLibraryPosts({ serviceId, status, variantTag } as Parameters<typeof getLibraryPosts>[0]);
        res.json({ ok: true, posts });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

libraryRouter.post('/run/library', async (req, res) => {
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

        const posts = await withAudit('library-generator', 'api', req.session.user, async () => {
            const agent = new LibraryGeneratorAgent();
            return agent.run(serviceIds as string[], count);
        }, {
            input: { serviceIds, postsPerService: count },
            getOutput: (p) => ({ postsGenerated: p.length }),
        });

        const imageGen = new ImageGeneratorAgent();
        void imageGen.runForPosts(posts).catch((err) => {
            log.error({ err }, '[Library] Image generation failed');
        });

        res.json({ ok: true, posts });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

libraryRouter.post('/run/library/stream', async (req, res) => {
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
        await withAudit('library-generator', 'api', req.session.user, async () => {
            const agent = new LibraryGeneratorAgent();
            const posts = await agent.run(serviceIds as string[], count, progress);

            progress({ type: 'status', message: 'Post copy ready — generating images…' });

            const imageGen = new ImageGeneratorAgent();
            await imageGen.runForPosts(posts, progress);

            send('complete', { ok: true });
            done();
            return posts;
        }, {
            input: { serviceIds, postsPerService: count },
            getOutput: (posts) => ({ postsGenerated: posts.length }),
        });
    } catch (err) {
        send('error', { message: String(err) });
        done();
    }
});

libraryRouter.post('/run/library/images/stream', async (req, res) => {
    const { send, done, isClosed } = setupSSE(req, res);

    const progress = (p: { type: string; message: string }) => { if (!isClosed()) send('progress', p); };

    try {
        const allLibraryPosts = getLibraryPosts();
        const needed = allLibraryPosts.filter(
            (p) => p.imageStatus === 'needed' || p.imageStatus === 'generating',
        );

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

libraryRouter.post('/library/posts/:id/used', (req, res) => {
    try {
        markLibraryPostUsed(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

libraryRouter.post('/library/posts/:id/revive', (req, res) => {
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

libraryRouter.patch('/library/posts/:id/schedule', (req, res) => {
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

export default libraryRouter;
