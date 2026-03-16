// src/agents/image-generator/agent.ts
// Generates brand-consistent images for social posts using Replicate FLUX Schnell.
// Runs after campaign creation; images are saved locally and served by this API.
// Owner reviews AI drafts in the dashboard and approves, replaces, or regenerates.

import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { getBrandVoice, settings } from '../../config.js';
import { getCampaignById, updatePostImage } from '../../db.js';
import type { Platform, PostType, SocialPost } from '../../types.js';

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

    constructor() {
        this.isMock = settings.mockImageGeneration;
        this.token = settings.replicateApiToken;

        if (!this.isMock && !this.token) {
            console.warn('[ImageGenerator] REPLICATE_API_TOKEN not set — images will not be generated');
        }
    }

    // ── Full campaign run ────────────────────────────────────────────────────

    async run(campaignId: string): Promise<void> {
        const campaign = getCampaignById(campaignId);
        if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

        const pending = campaign.posts.filter(
            (p) => !p.imageUrl || p.imageStatus === 'needed' || p.imageStatus === 'generating'
        );

        if (pending.length === 0) {
            console.log('[ImageGenerator] No posts need images');
            return;
        }

        console.log(`[ImageGenerator] Generating ${pending.length} images for '${campaign.name}'`);

        const imageDir = resolve(settings.dataDir, 'images', campaignId);
        mkdirSync(imageDir, { recursive: true });

        let success = 0;
        let failed = 0;

        for (const post of pending) {
            try {
                updatePostImage(post.id, '', 'generating');
                const imageUrl = await this.generateForPost(post, campaignId, imageDir);
                updatePostImage(post.id, imageUrl, 'draft');
                success++;
                console.log(`[ImageGenerator] ✓ ${post.platform}/${post.postType} post ${post.id.slice(0, 8)}`);
            } catch (err) {
                failed++;
                updatePostImage(post.id, '', 'needed');
                console.error(`[ImageGenerator] ✗ Post ${post.id.slice(0, 8)}: ${String(err)}`);
            }
        }

        console.log(`[ImageGenerator] Complete: ${success} generated, ${failed} failed`);
    }

    // ── Single-post regeneration (called from dashboard) ─────────────────────

    async regenerate(postId: string, campaignId: string): Promise<string> {
        const campaign = getCampaignById(campaignId);
        if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

        const post = campaign.posts.find((p) => p.id === postId);
        if (!post) throw new Error(`Post ${postId} not found in campaign ${campaignId}`);

        const imageDir = resolve(settings.dataDir, 'images', campaignId);
        mkdirSync(imageDir, { recursive: true });

        updatePostImage(postId, '', 'generating');
        const imageUrl = await this.generateForPost(post, campaignId, imageDir);
        updatePostImage(postId, imageUrl, 'draft');

        return imageUrl;
    }

    // ── Core generation ──────────────────────────────────────────────────────

    private async generateForPost(post: SocialPost, campaignId: string, imageDir: string): Promise<string> {
        if (this.isMock) {
            return this.getMockUrl(campaignId, post.id);
        }

        if (!this.token) {
            throw new Error('REPLICATE_API_TOKEN is required for image generation');
        }

        const prompt = this.buildPrompt(post);
        const aspectRatio = this.getAspectRatio(post.platform, post.postType);

        // Use Prefer: wait=60 for synchronous response — no polling needed in most cases
        const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.token}`,
                'Content-Type': 'application/json',
                Prefer: 'wait=60',
            },
            body: JSON.stringify({
                input: {
                    prompt,
                    aspect_ratio: aspectRatio,
                    num_outputs: 1,
                    output_format: 'webp',
                    output_quality: 90,
                },
            }),
        });

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
            const res = await fetch(getUrl, {
                headers: { Authorization: `Bearer ${this.token}` },
            });
            if (!res.ok) continue;
            const updated = (await res.json()) as ReplicatePrediction;
            if (updated.status === 'succeeded' || updated.status === 'failed' || updated.status === 'canceled') {
                return updated;
            }
        }
        throw new Error(`Replicate prediction ${prediction.id} timed out after ${maxAttempts * 2}s`);
    }

    private async downloadFile(url: string, dest: string): Promise<void> {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to download generated image: ${res.status}`);
        const buffer = await res.arrayBuffer();
        writeFileSync(dest, Buffer.from(buffer));
    }

    // ── Prompt construction ──────────────────────────────────────────────────

    private buildPrompt(post: SocialPost): string {
        const brand = getBrandVoice();
        const studioName = brand.studio.name;

        // Brand-consistent visual style prefix
        const stylePrefix = [
            `Professional wellness studio photography for ${studioName}`,
            'Warm soft natural lighting',
            'Calm, restorative atmosphere',
            'Clean whites, earthy neutrals, soft sage greens',
            'Southern Perth Western Australia aesthetic',
            'No text overlays, no logos, no watermarks',
            'Canon 5D Mark IV quality, shallow depth of field',
        ].join('. ');

        return `${stylePrefix}. ${post.imageDirection}. 4K photorealistic, magazine editorial quality`;
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
