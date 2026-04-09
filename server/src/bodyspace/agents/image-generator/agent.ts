// src/agents/image-generator/agent.ts
// Generates brand-consistent images for social posts using Replicate FLUX Schnell.
// Runs after campaign creation; images are saved locally and served by this API.
// Owner reviews AI drafts in the dashboard and approves, replaces, or regenerates.

import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { getBrandVoice, settings } from '../../config.js';
import { getCampaignById, updatePostImage } from '../../db.js';
import type { Platform, PostType, SocialPost } from '../../types.js';
import { fetchWithLogging } from '../../utils/http.js';
import { getAgentLogger } from '../../utils/logger.js';

class RateLimitError extends Error {
    constructor() {
        super('Replicate rate limit (429)');
        this.name = 'RateLimitError';
    }
}

interface ReplicatePrediction {
    id: string;
    status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
    output?: string[];
    error?: string;
    urls?: { get: string; cancel: string };
}

function sleep(ms: number): Promise<void> {
    return new Promise((res) => setTimeout(res, ms));
}

export class ImageGeneratorAgent {
    private readonly isMock: boolean;
    private readonly token: string;
    private readonly log = getAgentLogger('ImageGenerator');

    constructor() {
        this.isMock = settings.mockImageGeneration;
        this.token = settings.replicateApiToken;

        if (!this.isMock && !this.token) {
            this.log.warn('REPLICATE_API_TOKEN not set — images will not be generated');
        }
    }

    // ── Full campaign run ────────────────────────────────────────────────────

    async run(campaignId: string): Promise<void> {
        const campaign = await getCampaignById(campaignId);
        if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

        const pending = campaign.posts.filter(
            (p) => !p.imageUrl || p.imageStatus === 'needed' || p.imageStatus === 'generating'
        );

        if (pending.length === 0) {
            this.log.info({ campaignId }, 'No posts need images');
            return;
        }

        this.log.info({ campaignId, campaignName: campaign.name, count: pending.length }, 'Starting image generation');

        const imageDir = resolve(settings.dataDir, 'images', campaignId);
        mkdirSync(imageDir, { recursive: true });

        let success = 0;
        let failed = 0;

        for (let i = 0; i < pending.length; i++) {
            const post = pending[i];
            try {
                await updatePostImage(post.id, '', 'generating');
                const imageUrl = await this.generateForPost(post, campaignId, imageDir);
                await updatePostImage(post.id, imageUrl, 'draft');
                success++;
                this.log.info(
                    { campaignId, postId: post.id, platform: post.platform, postType: post.postType },
                    'Image generated'
                );
            } catch (err) {
                if (err instanceof RateLimitError) {
                    this.log.warn(
                        { campaignId, postId: post.id, remaining: pending.length - i },
                        'Rate limited by Replicate — retrying in 60s'
                    );
                    await updatePostImage(post.id, '', 'needed');
                    await sleep(60_000);
                    i--; // retry this post
                    continue;
                }
                failed++;
                await updatePostImage(post.id, '', 'needed');
                this.log.error({ campaignId, postId: post.id, error: String(err) }, 'Image generation failed');
            }
        }

        this.log.info({ campaignId, success, failed }, 'Image generation complete');
    }

    // ── Library post batch generation ───────────────────────────────────────

    async runForPosts(
        posts: SocialPost[],
        onProgress?: (p: { type: string; message: string }) => void,
    ): Promise<void> {
        const pending = posts.filter(
            (p) => !p.imageUrl || p.imageStatus === 'needed' || p.imageStatus === 'generating'
        );

        if (pending.length === 0) {
            this.log.info('No library posts need images');
            return;
        }

        this.log.info({ count: pending.length }, 'Starting library image generation');

        let success = 0;
        let failed = 0;

        for (let i = 0; i < pending.length; i++) {
            const post = pending[i];
            // Library posts store images under 'library/{postId}/' rather than a campaignId folder
            const imageDir = resolve(settings.dataDir, 'images', 'library', post.id);
            mkdirSync(imageDir, { recursive: true });

            try {
                await updatePostImage(post.id, '', 'generating');
                onProgress?.({ type: 'status', message: `Generating image ${i + 1} of ${pending.length}…` });
                const imageUrl = await this.generateForPost(post, `library/${post.id}`, imageDir);
                await updatePostImage(post.id, imageUrl, 'draft');
                success++;
                onProgress?.({ type: 'status', message: `✓ Image ${success} of ${pending.length} done` });
                this.log.info({ postId: post.id, serviceId: post.serviceId }, 'Library image generated');
            } catch (err) {
                if (err instanceof RateLimitError) {
                    this.log.warn(
                        { postId: post.id, remaining: pending.length - i },
                        'Rate limited by Replicate — retrying in 20s'
                    );
                    onProgress?.({ type: 'status', message: 'Rate limited — waiting before retrying…' });
                    await updatePostImage(post.id, '', 'needed');
                    await sleep(20_000);
                    i--; // retry this post
                    continue;
                }
                failed++;
                await updatePostImage(post.id, '', 'needed');
                this.log.error({ postId: post.id, error: String(err) }, 'Library image generation failed');
            }
        }

        this.log.info({ success, failed }, 'Library image generation complete');
    }

    // ── Single-post regeneration (called from dashboard) ─────────────────────

    async regenerate(
        postId: string,
        campaignId: string,
        feedback?: string,
        referenceImageUrl?: string
    ): Promise<string> {
        const campaign = await getCampaignById(campaignId);
        if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

        const post = campaign.posts.find((p) => p.id === postId);
        if (!post) throw new Error(`Post ${postId} not found in campaign ${campaignId}`);

        const imageDir = resolve(settings.dataDir, 'images', campaignId);
        mkdirSync(imageDir, { recursive: true });

        await updatePostImage(postId, post.imageUrl ?? '', 'generating');
        try {
            const imageUrl = await this.generateForPost(post, campaignId, imageDir, feedback, referenceImageUrl);
            await updatePostImage(postId, imageUrl, 'draft');
            return imageUrl;
        } catch (err) {
            // Restore to 'needed' so the owner can retry — never leave stuck at 'generating'
            await updatePostImage(postId, post.imageUrl ?? '', 'needed');
            throw err;
        }
    }

    // ── Core generation ──────────────────────────────────────────────────────

    private async generateForPost(
        post: SocialPost,
        campaignId: string,
        imageDir: string,
        feedback?: string,
        referenceImageUrl?: string
    ): Promise<string> {
        if (this.isMock) {
            return this.getMockUrl(campaignId, post.id);
        }

        if (!this.token) {
            throw new Error('REPLICATE_API_TOKEN is required for image generation');
        }

        const prompt = this.buildPrompt(post, feedback, referenceImageUrl);
        const aspectRatio = this.getAspectRatio(post.platform, post.postType);

        // When a reference image is supplied, use FLUX Dev with a high prompt strength
        // so the linked image acts as influence (object/material cues), not a direct remix.
        // Otherwise fall back to the faster FLUX Schnell text-to-image model.
        const useImgToImg = Boolean(referenceImageUrl);
        const modelPath = useImgToImg ? 'black-forest-labs/flux-dev' : 'black-forest-labs/flux-schnell';

        const input: Record<string, unknown> = {
            prompt,
            aspect_ratio: aspectRatio,
            num_outputs: 1,
            output_format: 'webp',
            output_quality: 90,
        };

        if (useImgToImg) {
            input.image = referenceImageUrl;
            // Keep output mostly prompt-led while borrowing object design/style cues.
            input.prompt_strength = 0.92;
        }

        // Use Prefer: wait=60 for synchronous response — no polling needed in most cases
        const replicateUrl = `https://api.replicate.com/v1/models/${modelPath}/predictions`;
        const res = await fetchWithLogging(
            this.log,
            replicateUrl,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    'Content-Type': 'application/json',
                    Prefer: 'wait=60',
                },
                body: JSON.stringify({ input }),
            },
            { system: 'replicate', operation: 'create_prediction', campaignId, postId: post.id }
        );

        if (res.status === 429) throw new RateLimitError();
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Replicate API ${res.status}: ${text}`);
        }

        let prediction = (await res.json()) as ReplicatePrediction;

        // Fall back to polling if synchronous wait didn't complete
        if (prediction.status !== 'succeeded') {
            prediction = await this.pollUntilDone(prediction);
        }

        if (prediction.status === 'failed' || !prediction.output?.length) {
            throw new Error(`Replicate prediction ${prediction.id} failed: ${prediction.error ?? 'no output'}`);
        }

        // Download and store locally so the image survives Replicate's 1-hour URL expiry
        const filename = `${post.id}.webp`;
        const localPath = resolve(imageDir, filename);
        await this.downloadFile(prediction.output[0], localPath);

        return `${settings.apiBaseUrl}/api/bodyspace/images/${campaignId}/${filename}`;
    }

    private async pollUntilDone(prediction: ReplicatePrediction): Promise<ReplicatePrediction> {
        const getUrl = prediction.urls?.get;
        if (!getUrl) throw new Error('No polling URL in Replicate prediction response');

        const maxAttempts = 30; // up to 60s
        for (let i = 0; i < maxAttempts; i++) {
            await sleep(2000);
            const res = await fetchWithLogging(
                this.log,
                getUrl,
                {
                    headers: { Authorization: `Bearer ${this.token}` },
                },
                { system: 'replicate', operation: 'poll_prediction' }
            );
            if (!res.ok) continue;
            const updated = (await res.json()) as ReplicatePrediction;
            if (updated.status === 'succeeded' || updated.status === 'failed' || updated.status === 'canceled') {
                return updated;
            }
        }
        throw new Error(`Replicate prediction ${prediction.id} timed out after ${maxAttempts * 2}s`);
    }

    private async downloadFile(url: string, dest: string): Promise<void> {
        const res = await fetchWithLogging(this.log, url, undefined, {
            system: 'replicate',
            operation: 'download_generated_image',
        });
        if (!res.ok) throw new Error(`Failed to download generated image: ${res.status}`);
        const buffer = await res.arrayBuffer();
        writeFileSync(dest, Buffer.from(buffer));
    }

    // ── Prompt construction ──────────────────────────────────────────────────

    private buildPrompt(post: SocialPost, feedback?: string, referenceImageUrl?: string): string {
        const brand = getBrandVoice();
        const studioName = brand.studio.name;
        const pillarStyle = this.getPillarStyle(post.contentPillar);
        const formatStyle = this.getFormatStyle(post.postType);

        // Brand-consistent visual style prefix
        const stylePrefix = [
            `Professional wellness studio photography for ${studioName}`,
            'Warm soft natural lighting',
            'Calm, restorative atmosphere',
            'Clean whites, earthy neutrals, soft sage greens',
            'Southern Perth Western Australia aesthetic',
            'No text overlays, no logos, no watermarks',
            'Natural high-quality lifestyle photography with authentic human presence',
            'Avoid stock-photo look and overly polished commercial styling',
            pillarStyle,
            formatStyle,
        ].join('. ');

        const cleanedFeedback = feedback?.trim();
        const revisionInstructions = cleanedFeedback
            ? `REVISION NOTES FROM OWNER: ${cleanedFeedback}. Apply these notes while preserving brand style and wellness context.`
            : '';

        const referenceInstructions = referenceImageUrl
            ? `REFERENCE IMAGE: ${referenceImageUrl}. Use this image only to influence key object details (shape, materials, product design cues). Do not copy framing, background, people, or composition. Create a fresh scene aligned to the campaign brief.`
            : '';

        return `${stylePrefix}. ${post.imageDirection}. ${referenceInstructions} ${revisionInstructions} Realistic textures, approachable tone, social-ready composition`;
    }

    private getPillarStyle(pillar: SocialPost['contentPillar']): string {
        switch (pillar) {
            case 'education':
                return 'Educational visual tone with clear service context and grounded, practical details';
            case 'promotion':
                return 'Service-focused composition that feels inviting and premium but still authentic';
            case 'community':
                return 'Community and lifestyle feel with candid moments and relatable Perth local energy';
            case 'social_proof':
                return 'Client-story mood with warm candid authenticity and trust-building realness';
            case 'seasonal':
                return 'Seasonal atmosphere with subtle local cues and balanced, natural colours';
            default:
                return 'Balanced wellness lifestyle aesthetic with natural authenticity';
        }
    }

    private getFormatStyle(postType: PostType): string {
        switch (postType) {
            case 'story':
            case 'reel':
                return 'Mobile-first vertical framing with a strong focal subject and uncluttered background';
            case 'feed':
            default:
                return 'Square-friendly composition with clean framing and immediate visual clarity';
        }
    }

    private getAspectRatio(platform: Platform, postType: PostType): string {
        if (postType === 'story' || postType === 'reel') return '9:16';
        if (platform === 'facebook' && postType === 'feed') return '16:9';
        return '1:1'; // instagram feed default
    }

    private getMockUrl(campaignId: string, postId: string): string {
        // Returns a placeholder — in mock mode images aren't actually generated
        return `${settings.apiBaseUrl}/api/bodyspace/images/mock/${postId}.webp`;
    }
}
