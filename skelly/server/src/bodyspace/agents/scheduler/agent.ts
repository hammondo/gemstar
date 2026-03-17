// src/agents/scheduler/agent.ts
// Queues approved posts to Postiz → Instagram/Facebook.
// Only runs AFTER owner approval.

import { settings } from '../../config.js';
import { getCampaignById, getCampaignsByStatus, updateCampaignStatus, updatePostStatus } from '../../db.js';
import type { Campaign, SocialPost } from '../../types.js';
import { fetchWithLogging } from '../../utils/http.js';
import { getAgentLogger } from '../../utils/logger.js';

export class SchedulerAgent {
    private baseUrl = settings.postizApiUrl;
    private readonly log = getAgentLogger('Scheduler');
    private headers = {
        Authorization: `Bearer ${settings.postizApiKey}`,
        'Content-Type': 'application/json',
    };
    private accountsCache: Record<string, string> | null = null;

    async run(campaignId?: string): Promise<void> {
        const campaigns = campaignId
            ? ([getCampaignById(campaignId)].filter(Boolean) as Campaign[])
            : getCampaignsByStatus('approved');

        if (campaigns.length === 0) {
            this.log.info('No approved campaigns to schedule');
            return;
        }

        for (const campaign of campaigns) {
            await this.scheduleCampaign(campaign);
        }
    }

    private async scheduleCampaign(campaign: Campaign): Promise<void> {
        this.log.info({ campaignId: campaign.id, campaignName: campaign.name }, 'Scheduling campaign');

        const approvedPosts = campaign.posts.filter((p) => p.status === 'approved' && p.imageStatus === 'approved');

        const imagePending = campaign.posts.filter((p) => p.status === 'approved' && p.imageStatus !== 'approved');
        if (imagePending.length > 0) {
            this.log.warn(
                {
                    campaignId: campaign.id,
                    skipped: imagePending.length,
                    imageStatuses: [...new Set(imagePending.map((p) => p.imageStatus))],
                },
                'Skipping posts with non-approved images'
            );
        }

        let success = 0;
        let failed = 0;

        for (const post of approvedPosts) {
            try {
                const postizId = await this.schedulePost(post);
                updatePostStatus(post.id, 'scheduled', { postizPostId: postizId });
                success++;
                this.log.info(
                    {
                        campaignId: campaign.id,
                        postId: post.id,
                        platform: post.platform,
                        scheduledFor: post.scheduledFor,
                        postizId,
                    },
                    'Post scheduled'
                );
            } catch (err) {
                failed++;
                this.log.error(
                    { campaignId: campaign.id, postId: post.id, error: String(err) },
                    'Failed to schedule post'
                );
            }
        }

        if (success > 0) {
            updateCampaignStatus(campaign.id, 'scheduled');
        }

        this.log.info(
            { campaignId: campaign.id, campaignName: campaign.name, success, failed },
            'Campaign scheduling complete'
        );
    }

    private async schedulePost(post: SocialPost): Promise<string> {
        const copy = post.ownerEdit ?? post.copy;
        const hashtags = (post.hashtags ?? []).map((t) => `#${t.replace(/^#/, '')}`).join(' ');
        const fullContent = hashtags ? `${copy}\n\n${hashtags}` : copy;

        if (!post.scheduledFor) {
            throw new Error(`Post ${post.id} has no scheduledFor date`);
        }

        const accountId = await this.getAccountId(post.platform);

        const body = {
            type: 'post',
            date: post.scheduledFor,
            value: [
                {
                    content: fullContent,
                    id: accountId,
                    ...(post.imageUrl ? { media: [{ url: post.imageUrl }] } : {}),
                },
            ],
        };

        const response = await fetchWithLogging(
            this.log,
            `${this.baseUrl}/api/posts`,
            {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(body),
            },
            { system: 'postiz', operation: 'create_post', postId: post.id, campaignId: post.campaignId }
        );

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Postiz ${response.status}: ${text}`);
        }

        const result = (await response.json()) as { id: string };
        return result.id;
    }

    private async getAccountId(platform: string): Promise<string> {
        if (!this.accountsCache) {
            const response = await fetchWithLogging(
                this.log,
                `${this.baseUrl}/api/integrations`,
                { headers: this.headers },
                { system: 'postiz', operation: 'list_integrations' }
            );
            if (!response.ok) throw new Error(`Failed to fetch Postiz accounts: ${response.status}`);

            const accounts = (await response.json()) as Array<{ id: string; providerIdentifier: string }>;
            this.accountsCache = Object.fromEntries(accounts.map((a) => [a.providerIdentifier.toLowerCase(), a.id]));
        }

        const id = this.accountsCache[platform.toLowerCase()];
        if (!id) {
            throw new Error(
                `No Postiz account for '${platform}'. Available: ${Object.keys(this.accountsCache).join(', ')}. ` +
                    `Connect ${platform} in Postiz first.`
            );
        }
        return id;
    }
}
