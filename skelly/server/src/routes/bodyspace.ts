import { Router } from "express";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { BodyspaceOrchestrator } from "../bodyspace/orchestrator.js";
import { FreshaWatcherAgent } from "../bodyspace/agents/fresha-watcher/agent.js";
import { SchedulerAgent } from "../bodyspace/agents/scheduler/agent.js";
import { ApprovalWorkflow } from "../bodyspace/workflows/approval.js";
import { getCampaignById, getCampaignsByStatus, getLatestSignals, getLatestTrendsBrief } from "../bodyspace/db.js";
import { settings } from "../bodyspace/config.js";
import type { Campaign, CampaignStatus } from "../bodyspace/types.js";

const bodyspaceRouter = Router();
const orchestrator = new BodyspaceOrchestrator();

const campaignStatuses: CampaignStatus[] = [
  "draft",
  "pending_review",
  "approved",
  "rejected",
  "scheduled",
  "published",
];

function getAllCampaigns(): Campaign[] {
  return campaignStatuses.flatMap((status) => getCampaignsByStatus(status));
}

function findCampaignByPostId(postId: string): Campaign | null {
  return getAllCampaigns().find((campaign) => campaign.posts.some((post) => post.id === postId)) ?? null;
}

bodyspaceRouter.get("/status", (_req, res) => {
  const pending = getCampaignsByStatus("pending_review");
  const approved = getCampaignsByStatus("approved");
  const scheduled = getCampaignsByStatus("scheduled");

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
        return count + campaign.posts.filter((post) => post.status === "scheduled").length;
      }, 0),
    },
  });
});

bodyspaceRouter.get("/signals", (_req, res) => {
  res.json({ ok: true, signals: getLatestSignals() });
});

bodyspaceRouter.get("/trends/latest", (_req, res) => {
  res.json({ ok: true, brief: getLatestTrendsBrief() });
});

bodyspaceRouter.get("/campaigns", (req, res) => {
  const status = req.query.status as CampaignStatus | undefined;
  const campaigns = status ? getCampaignsByStatus(status) : getAllCampaigns();
  res.json({ ok: true, campaigns });
});

bodyspaceRouter.get("/campaigns/:id", (req, res) => {
  const campaign = getCampaignById(req.params.id);
  if (!campaign) {
    res.status(404).json({ ok: false, error: "Campaign not found" });
    return;
  }

  res.json({ ok: true, campaign });
});

bodyspaceRouter.post("/run/fresha", async (_req, res) => {
  try {
    await orchestrator.runFreshaWatcher();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

bodyspaceRouter.post("/run/monitor", async (_req, res) => {
  try {
    await orchestrator.runMonitor();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

bodyspaceRouter.post("/run/campaign", async (req, res) => {
  try {
    const ownerBrief = typeof req.body?.ownerBrief === "string" ? req.body.ownerBrief : undefined;
    await orchestrator.runCampaignPlanner(ownerBrief);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

bodyspaceRouter.post("/run/all", async (req, res) => {
  try {
    const ownerBrief = typeof req.body?.ownerBrief === "string" ? req.body.ownerBrief : undefined;
    await orchestrator.runAll({ ownerBrief });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

bodyspaceRouter.post("/fresha/import", async (req, res) => {
  const { csvContent, filename } = req.body as { csvContent?: string; filename?: string };

  if (!csvContent || typeof csvContent !== "string") {
    res.status(400).json({ ok: false, error: "csvContent is required" });
    return;
  }

  try {
    const exportsDir = resolve(settings.dataDir, "fresha-exports");
    mkdirSync(exportsDir, { recursive: true });

    const safeName = (filename && filename.endsWith(".csv"))
      ? filename.replace(/[^a-zA-Z0-9_.-]/g, "_")
      : `appointments_${new Date().toISOString().slice(0, 10)}.csv`;

    const savePath = resolve(exportsDir, safeName);
    writeFileSync(savePath, csvContent, "utf8");

    const watcher = new FreshaWatcherAgent();
    const signals = await watcher.run();

    res.json({ ok: true, filename: safeName, signals });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

bodyspaceRouter.post("/posts/:id/approve", (req, res) => {
  try {
    const postId = req.params.id;
    const copy = typeof req.body?.copy === "string" ? req.body.copy : undefined;
    const approval = new ApprovalWorkflow();
    approval.approvePost(postId, copy?.trim() || undefined);

    const campaign = findCampaignByPostId(postId);
    res.json({ ok: true, campaignId: campaign?.id ?? null });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

bodyspaceRouter.post("/posts/:id/reject", (req, res) => {
  try {
    const postId = req.params.id;
    const reason = typeof req.body?.reason === "string" ? req.body.reason : undefined;
    const approval = new ApprovalWorkflow();
    approval.rejectPost(postId, reason);

    const campaign = findCampaignByPostId(postId);
    res.json({ ok: true, campaignId: campaign?.id ?? null });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

bodyspaceRouter.post("/campaigns/:id/approve", async (req, res) => {
  try {
    const campaignId = req.params.id;
    const notes = typeof req.body?.notes === "string" ? req.body.notes : undefined;
    const approval = new ApprovalWorkflow();
    const campaign = approval.approveCampaign(campaignId, notes);

    const scheduler = new SchedulerAgent();
    await scheduler.run(campaignId);

    res.json({ ok: true, campaign });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

bodyspaceRouter.post("/campaigns/:id/reject", (req, res) => {
  try {
    const campaignId = req.params.id;
    const reason = typeof req.body?.reason === "string" ? req.body.reason : undefined;
    const approval = new ApprovalWorkflow();
    const campaign = approval.rejectCampaign(campaignId, reason);

    res.json({ ok: true, campaign });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

bodyspaceRouter.post("/schedule", async (req, res) => {
  try {
    const campaignId = typeof req.body?.campaignId === "string" ? req.body.campaignId : undefined;
    const scheduler = new SchedulerAgent();
    await scheduler.run(campaignId);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

export default bodyspaceRouter;
