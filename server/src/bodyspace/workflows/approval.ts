// src/workflows/approval.ts
// Human-in-the-loop: notifies owner, processes approve/reject decisions.
// NOTHING is published without passing through this workflow.

import { Resend } from 'resend';
import { settings } from '../config.js';
import { getCampaignById, getCampaignsByStatus, updateCampaignStatus, updatePostStatus } from '../db.js';
import type { Campaign } from '../types.js';
import { getAgentLogger } from '../utils/logger.js';

export class ApprovalWorkflow {
    private resend: Resend | null;
    private readonly log = getAgentLogger('ApprovalWorkflow');

    constructor() {
        this.resend = settings.resendApiKey ? new Resend(settings.resendApiKey) : null;
    }

    // ── Notifications ───────────────────────────────────────────────────────

    async notifyOwner(campaign: Campaign): Promise<void> {
        const approvalUrl = `${settings.dashboardBaseUrl}/campaigns/${campaign.id}/review`;

        if (this.resend && settings.ownerEmail) {
            const startedAt = Date.now();
            this.log.info(
                {
                    event: 'outbound.request',
                    system: 'resend',
                    operation: 'emails.send',
                    campaignId: campaign.id,
                    to: settings.ownerEmail,
                },
                'Outbound request started'
            );

            await this.resend.emails.send({
                from: 'BodySpace Agent <agent@bodyspacerecoverystudio.com.au>',
                to: [settings.ownerEmail],
                subject: `✅ New campaign ready for review: ${campaign.name}`,
                html: this.buildEmailHtml(campaign, approvalUrl),
            });

            this.log.info(
                {
                    event: 'outbound.response',
                    system: 'resend',
                    operation: 'emails.send',
                    campaignId: campaign.id,
                    durationMs: Date.now() - startedAt,
                },
                'Outbound response received'
            );
            this.log.info({ campaignId: campaign.id, email: settings.ownerEmail }, 'Owner notification sent');
        } else {
            // Console fallback for development
            this.log.info(
                {
                    campaignId: campaign.id,
                    campaignName: campaign.name,
                    theme: campaign.theme,
                    posts: campaign.posts.length,
                    reviewUrl: approvalUrl,
                },
                'Campaign ready for review (email disabled)'
            );
        }
    }

    // ── Approval actions ────────────────────────────────────────────────────

    async approvePost(postId: string, editedCopy?: string): Promise<void> {
        await updatePostStatus(postId, 'approved', {
            ownerEdit: editedCopy || undefined,
        });
        this.log.info({ postId }, 'Post approved');
    }

    async rejectPost(postId: string, reason?: string): Promise<void> {
        await updatePostStatus(postId, 'rejected', { rejectionReason: reason });
        this.log.info({ postId, reason: reason ?? '(no reason)' }, 'Post rejected');
    }

    async approveCampaign(campaignId: string, ownerNotes?: string): Promise<Campaign> {
        const campaign = await getCampaignById(campaignId);
        if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

        const approvedPosts = campaign.posts.filter((p) => p.status === 'approved');
        if (approvedPosts.length === 0) {
            throw new Error('Cannot approve campaign — approve at least one post first');
        }

        await updateCampaignStatus(campaignId, 'approved', { ownerNotes });
        this.log.info(
            { campaignId, campaignName: campaign.name, approvedPosts: approvedPosts.length },
            'Campaign approved'
        );

        return { ...campaign, status: 'approved', ownerNotes };
    }

    async rejectCampaign(campaignId: string, reason?: string): Promise<Campaign> {
        const campaign = await getCampaignById(campaignId);
        if (!campaign) throw new Error(`Campaign ${campaignId} not found`);
        await updateCampaignStatus(campaignId, 'rejected', { ownerNotes: reason });
        this.log.info(
            { campaignId, campaignName: campaign.name, reason: reason ?? '(no reason)' },
            'Campaign rejected'
        );
        return { ...campaign, status: 'rejected' };
    }

    // ── Queries ─────────────────────────────────────────────────────────────

    async getPendingCampaigns(): Promise<Campaign[]> {
        return getCampaignsByStatus('pending_review');
    }

    async getApprovedCampaigns(): Promise<Campaign[]> {
        return getCampaignsByStatus('approved');
    }

    // ── Email template ───────────────────────────────────────────────────────

    private buildEmailHtml(campaign: Campaign, approvalUrl: string): string {
        const servicesList = campaign.targetServices
            .map((s) => `<li>${s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</li>`)
            .join('');

        return `
<html><body style="font-family:Georgia,serif;max-width:580px;margin:0 auto;background:#faf7f4;padding:24px">
  <div style="background:white;border-radius:8px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.08)">
    <h2 style="color:#5c4b3c;margin-top:0">🌿 BodySpace Marketing Agent</h2>
    <p>Your agent has drafted a new campaign plan for your review.</p>

    <div style="background:#f8f4f0;border-radius:6px;padding:16px;margin:16px 0">
      <h3 style="margin:0 0 8px;color:#5c4b3c">${campaign.name}</h3>
      <p style="margin:0 0 8px;color:#666;font-size:14px">${campaign.theme}</p>
      <p style="margin:0;font-size:14px">${campaign.description}</p>
    </div>

    <p style="font-size:14px"><strong>${campaign.posts.length} posts drafted</strong></p>
    <p style="font-size:14px">Services promoted:<ul style="margin:4px 0">${servicesList}</ul></p>

    <p style="font-size:14px;color:#888">Review each post, make any edits, then approve.
    <strong>Nothing will publish until you approve.</strong></p>

    <div style="text-align:center;margin:24px 0">
      <a href="${approvalUrl}"
         style="background:#5c4b3c;color:white;padding:12px 28px;border-radius:6px;
                text-decoration:none;font-size:15px">
        Review Campaign →
      </a>
    </div>
  </div>
</body></html>`;
    }
}
