// src/workflows/approval.ts
// Human-in-the-loop: notifies owner, processes approve/reject decisions.
// NOTHING is published without passing through this workflow.

import { Resend } from "resend";
import { settings } from "../config.js";
import {
  getCampaignById, getCampaignsByStatus,
  updateCampaignStatus, updatePostStatus,
} from "../db.js";
import type { Campaign, SocialPost } from "../types.js";

export class ApprovalWorkflow {
  private resend: Resend | null;

  constructor() {
    this.resend = settings.resendApiKey ? new Resend(settings.resendApiKey) : null;
  }

  // ── Notifications ───────────────────────────────────────────────────────

  async notifyOwner(campaign: Campaign): Promise<void> {
    const approvalUrl = `${settings.dashboardBaseUrl}/campaigns/${campaign.id}/review`;

    if (this.resend && settings.ownerEmail) {
      await this.resend.emails.send({
        from: "BodySpace Agent <agent@bodyspacerecoverystudio.com.au>",
        to: [settings.ownerEmail],
        subject: `✅ New campaign ready for review: ${campaign.name}`,
        html: this.buildEmailHtml(campaign, approvalUrl),
      });
      console.log(`[Approval] Email sent to ${settings.ownerEmail}`);
    } else {
      // Console fallback for development
      console.log("\n" + "=".repeat(60));
      console.log(`CAMPAIGN READY FOR REVIEW: ${campaign.name}`);
      console.log(`Theme: ${campaign.theme}`);
      console.log(`Posts: ${campaign.posts.length}`);
      console.log(`Review URL: ${approvalUrl}`);
      console.log("=".repeat(60) + "\n");
    }
  }

  // ── Approval actions ────────────────────────────────────────────────────

  approvePost(postId: string, editedCopy?: string): void {
    updatePostStatus(postId, "approved", {
      ownerEdit: editedCopy || undefined,
    });
    console.log(`[Approval] Post ${postId} approved`);
  }

  rejectPost(postId: string, reason?: string): void {
    updatePostStatus(postId, "rejected", { rejectionReason: reason });
    console.log(`[Approval] Post ${postId} rejected: ${reason ?? "(no reason)"}`);
  }

  approveCampaign(campaignId: string, ownerNotes?: string): Campaign {
    const campaign = getCampaignById(campaignId);
    if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

    const approvedPosts = campaign.posts.filter((p) => p.status === "approved");
    if (approvedPosts.length === 0) {
      throw new Error("Cannot approve campaign — approve at least one post first");
    }

    updateCampaignStatus(campaignId, "approved", { ownerNotes });
    console.log(`[Approval] Campaign '${campaign.name}' approved (${approvedPosts.length} posts ready)`);

    return { ...campaign, status: "approved", ownerNotes };
  }

  rejectCampaign(campaignId: string, reason?: string): Campaign {
    const campaign = getCampaignById(campaignId);
    if (!campaign) throw new Error(`Campaign ${campaignId} not found`);
    updateCampaignStatus(campaignId, "rejected", { ownerNotes: reason });
    console.log(`[Approval] Campaign '${campaign.name}' rejected`);
    return { ...campaign, status: "rejected" };
  }

  // ── Queries ─────────────────────────────────────────────────────────────

  getPendingCampaigns(): Campaign[] {
    return getCampaignsByStatus("pending_review");
  }

  getApprovedCampaigns(): Campaign[] {
    return getCampaignsByStatus("approved");
  }

  // ── Email template ───────────────────────────────────────────────────────

  private buildEmailHtml(campaign: Campaign, approvalUrl: string): string {
    const servicesList = campaign.targetServices
      .map((s) => `<li>${s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</li>`)
      .join("");

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
