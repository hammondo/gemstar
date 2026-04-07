import { settings } from '../config.js';
import type { Campaign, SocialPost } from '../types.js';
import { fetchWithLogging } from '../utils/http.js';
import { getAgentLogger } from '../utils/logger.js';

interface SanityAsset {
    _id: string;
    url?: string;
}

export interface BlogSyncResult {
    synced: boolean;
    reason?: string;
    documentId?: string;
    slug?: string;
}

export class SanityBlogPublisher {
    private readonly projectId = settings.sanityProjectId;
    private readonly dataset = settings.sanityDataset;
    private readonly apiVersion = settings.sanityApiVersion;
    private readonly token = settings.sanityToken;
    private readonly log = getAgentLogger('SanityBlogPublisher');

    isConfigured(): boolean {
        return Boolean(this.projectId && this.dataset && this.token);
    }

    async syncApprovedPost(campaign: Campaign | null, post: SocialPost): Promise<BlogSyncResult> {
        if (!this.isConfigured()) {
            return {
                synced: false,
                reason: 'Sanity not configured (SANITY_PROJECT_ID, SANITY_DATASET, SANITY_API_TOKEN)',
            };
        }

        if (post.status !== 'approved') {
            return { synced: false, reason: 'Post copy is not approved yet' };
        }

        if (post.imageStatus !== 'approved' || !post.imageUrl) {
            return { synced: false, reason: 'Post image is not approved yet' };
        }

        const imageBuffer = await this.downloadImage(post.imageUrl);
        const imageAsset = await this.uploadImageAsset(imageBuffer, `${post.id}.webp`);

        const documentId = `blogPost-social-${post.id}`;
        const title = this.buildTitle(campaign, post);
        const slug = this.buildSlug(title, post.id);
        const content = (post.ownerEdit ?? post.copy).trim();
        const excerpt = this.toExcerpt(content);
        const tags = this.buildTags(post);
        const publishedAt = post.scheduledFor ?? new Date().toISOString();

        const body = [
            this.toPortableTextBlock(content),
            {
                _type: 'image',
                asset: {
                    _type: 'reference',
                    _ref: imageAsset._id,
                },
                alt: post.imageDirection || title,
                caption: post.callToAction || undefined,
            },
        ];

        await this.mutate([
            {
                createOrReplace: {
                    _id: documentId,
                    _type: 'blogPost',
                    title,
                    slug: { _type: 'slug', current: slug },
                    publishedAt,
                    author: settings.sanityBlogAuthor,
                    heroImage: {
                        _type: 'image',
                        asset: {
                            _type: 'reference',
                            _ref: imageAsset._id,
                        },
                        alt: post.imageDirection || title,
                    },
                    excerpt,
                    body,
                    tags,
                    seo: {
                        metaTitle: title,
                        metaDescription: excerpt,
                    },
                },
            },
        ]);

        return { synced: true, documentId, slug };
    }

    private async downloadImage(url: string): Promise<ArrayBuffer> {
        const res = await fetchWithLogging(this.log, url, undefined, {
            system: 'sanity',
            operation: 'download_source_image',
            postId: undefined,
        });
        if (!res.ok) {
            throw new Error(`Failed to download image for Sanity upload (${res.status})`);
        }
        return res.arrayBuffer();
    }

    private async uploadImageAsset(bytes: ArrayBuffer, filename: string): Promise<SanityAsset> {
        const url = `https://${this.projectId}.api.sanity.io/v${this.apiVersion}/assets/images/${this.dataset}?filename=${encodeURIComponent(filename)}`;
        const res = await fetchWithLogging(
            this.log,
            url,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    'Content-Type': 'image/webp',
                },
                body: bytes,
            },
            { system: 'sanity', operation: 'upload_image_asset' }
        );

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Sanity image upload failed (${res.status}): ${text}`);
        }

        return (await res.json()) as SanityAsset;
    }

    private async mutate(mutations: Array<Record<string, unknown>>): Promise<void> {
        const url = `https://${this.projectId}.api.sanity.io/v${this.apiVersion}/data/mutate/${this.dataset}`;
        const res = await fetchWithLogging(
            this.log,
            url,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ mutations }),
            },
            { system: 'sanity', operation: 'mutate' }
        );

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Sanity mutate failed (${res.status}): ${text}`);
        }
    }

    private buildTitle(campaign: Campaign | null, post: SocialPost): string {
        const copy = (post.ownerEdit ?? post.copy).trim();
        const firstSentence = copy
            .split(/[.!?]/)
            .map((s) => s.trim())
            .find(Boolean);
        if (firstSentence) {
            return this.toTitleCase(firstSentence).slice(0, 90);
        }
        const prefix = campaign?.name ?? 'BodySpace';
        return `${prefix} - ${post.contentPillar.replace(/_/g, ' ')}`;
    }

    private buildSlug(title: string, postId: string): string {
        const base = title
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .trim()
            .replace(/\s+/g, '-')
            .slice(0, 70);
        return `${base || 'bodyspace-post'}-${postId.slice(0, 8)}`;
    }

    private toExcerpt(text: string): string {
        const clean = text.replace(/\s+/g, ' ').trim();
        return clean.length > 180 ? `${clean.slice(0, 177)}...` : clean;
    }

    private buildTags(post: SocialPost): string[] {
        const tags = new Set<string>();
        tags.add(post.contentPillar.replace(/_/g, ' '));
        for (const hashtag of post.hashtags.slice(0, 8)) {
            const normalized = hashtag.replace(/^#/, '').trim();
            if (normalized) tags.add(normalized);
        }
        return Array.from(tags);
    }

    private toPortableTextBlock(text: string): Record<string, unknown> {
        return {
            _type: 'block',
            style: 'normal',
            markDefs: [],
            children: [
                {
                    _type: 'span',
                    marks: [],
                    text,
                },
            ],
        };
    }

    private toTitleCase(value: string): string {
        if (!value) return value;
        return value.charAt(0).toUpperCase() + value.slice(1);
    }
}
