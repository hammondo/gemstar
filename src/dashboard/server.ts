// src/dashboard/server.ts
// Lightweight Express dashboard for the owner to review, edit, and approve campaigns.

import express, { Request, Response, NextFunction } from "express";
import { settings } from "../config.js";
import { getCampaignById, getCampaignsByStatus } from "../db.js";
import { ApprovalWorkflow } from "../workflows/approval.js";
import { SchedulerAgent } from "../agents/scheduler/agent.js";
import type { Campaign, SocialPost } from "../types.js";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ── Simple cookie auth ────────────────────────────────────────────────────

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const cookie = req.headers.cookie ?? "";
  if (cookie.includes(`auth=${settings.dashboardPassword}`)) {
    next();
    return;
  }
  res.redirect("/login");
}

// ── HTML helpers ──────────────────────────────────────────────────────────

const css = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Georgia,serif;background:#faf7f4;color:#3d2b1f}
  .nav{background:#5c4b3c;color:white;padding:14px 24px;display:flex;justify-content:space-between;align-items:center}
  .nav h1{font-size:17px;font-weight:normal}
  .nav a{color:#d4b896;text-decoration:none;margin-left:16px;font-size:13px}
  .container{max-width:900px;margin:0 auto;padding:24px}
  .card{background:white;border-radius:8px;padding:20px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.07)}
  .badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:bold;text-transform:uppercase}
  .badge-pending_review{background:#fff3cd;color:#856404}
  .badge-approved{background:#d4edda;color:#155724}
  .badge-rejected{background:#f8d7da;color:#721c24}
  .badge-scheduled{background:#cce5ff;color:#004085}
  .btn{display:inline-block;padding:7px 16px;border-radius:5px;border:none;cursor:pointer;font-size:13px;text-decoration:none;font-family:Georgia,serif}
  .btn-green{background:#28a745;color:white}
  .btn-red{background:#dc3545;color:white}
  .btn-dark{background:#5c4b3c;color:white}
  textarea{width:100%;padding:10px;border:1px solid #ddd;border-radius:5px;font-size:13px;line-height:1.6;font-family:Georgia,serif}
  .meta{font-size:12px;color:#888;margin-top:5px}
  .ig{border-left:4px solid #e1306c}
  .fb{border-left:4px solid #1877f2}
  h2{font-size:20px;margin-bottom:16px;color:#5c4b3c}
  h3{font-size:15px;color:#5c4b3c}
  .image-dir{background:#f8f4f0;padding:10px;border-radius:5px;font-size:13px;color:#666;margin:8px 0}
  .flash{background:#d4edda;color:#155724;padding:10px 14px;border-radius:5px;margin-bottom:14px;font-size:13px}
`;

function layout(title: string, body: string, flash?: string): string {
  return `<!DOCTYPE html><html><head><title>${title} | BodySpace Agent</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>${css}</style></head><body>
  <nav class="nav">
    <h1>🌿 BodySpace Marketing Agent</h1>
    <div><a href="/">Dashboard</a><a href="/schedule">Schedule</a></div>
  </nav>
  <div class="container">
    ${flash ? `<div class="flash">${flash}</div>` : ""}
    ${body}
  </div></body></html>`;
}

// ── Routes ────────────────────────────────────────────────────────────────

app.get("/login", (_req, res) => {
  res.send(`<!DOCTYPE html><html><body style="font-family:Georgia,serif;max-width:360px;margin:80px auto;padding:20px">
    <h2 style="color:#5c4b3c;margin-bottom:16px">BodySpace Agent</h2>
    <form method="POST" action="/login">
      <input type="password" name="password" placeholder="Password"
             style="width:100%;padding:8px;margin-bottom:10px;border:1px solid #ddd;border-radius:5px">
      <button type="submit" style="padding:8px 20px;background:#5c4b3c;color:white;border:none;border-radius:5px;cursor:pointer">Login</button>
    </form></body></html>`);
});

app.post("/login", (req, res) => {
  if (req.body.password === settings.dashboardPassword) {
    res.setHeader("Set-Cookie", `auth=${settings.dashboardPassword}; HttpOnly; Path=/`);
    res.redirect("/");
  } else {
    res.send("Wrong password. <a href='/login'>Try again</a>");
  }
});

app.get("/", requireAuth, (_req, res) => {
  const pending = getCampaignsByStatus("pending_review");
  const scheduled = getCampaignsByStatus("scheduled");

  const pendingCards = pending.map((c) => `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div>
          <h3>${c.name}</h3>
          <p style="font-size:13px;color:#666;margin-top:4px">${c.theme}</p>
          <p class="meta">${c.posts.length} posts · Created ${c.createdAt.slice(0, 10)}</p>
        </div>
        <span class="badge badge-pending_review">Needs Review</span>
      </div>
      <p style="margin-top:10px;font-size:13px">${c.description}</p>
      <div style="margin-top:12px">
        <a href="/campaigns/${c.id}/review" class="btn btn-dark">Review Campaign →</a>
      </div>
    </div>`).join("") || `<div class="card" style="text-align:center;padding:40px;color:#888">✅ No campaigns waiting for review</div>`;

  const stats = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px">
      <div class="card" style="text-align:center">
        <div style="font-size:28px;font-weight:bold;color:#5c4b3c">${pending.length}</div>
        <div style="color:#888;font-size:13px">Pending Review</div>
      </div>
      <div class="card" style="text-align:center">
        <div style="font-size:28px;font-weight:bold;color:#28a745">${scheduled.reduce((n, c) => n + c.posts.filter((p) => p.status === "scheduled").length, 0)}</div>
        <div style="color:#888;font-size:13px">Posts Scheduled</div>
      </div>
      <div class="card" style="text-align:center">
        <div style="font-size:28px;font-weight:bold;color:#888">${scheduled.length}</div>
        <div style="color:#888;font-size:13px">Active Campaigns</div>
      </div>
    </div>`;

  res.send(layout("Dashboard", `<h2>Dashboard</h2>${stats}${pendingCards}`));
});

app.get("/campaigns/:id/review", requireAuth, (req, res) => {
  const campaign = getCampaignById(req.params.id);
  if (!campaign) { res.redirect("/"); return; }

  const posts = [...campaign.posts].sort((a, b) =>
    (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? "")
  );

  const postCards = posts.map((p) => `
    <div class="card ${p.platform === "instagram" ? "ig" : "fb"}">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:10px">
        <div>
          <strong style="text-transform:capitalize">${p.platform}</strong>
          <span style="color:#888;font-size:12px;margin-left:8px">${p.contentPillar} · ${p.postType}</span>
          ${p.scheduledFor ? `<span style="color:#888;font-size:12px;margin-left:8px">📅 ${p.scheduledFor.slice(0, 10)}</span>` : ""}
        </div>
        <span class="badge badge-${p.status}">${p.status.replace("_", " ")}</span>
      </div>
      <form method="POST" action="/posts/${p.id}/update">
        <div style="margin-bottom:8px">
          <label style="font-size:11px;color:#888;display:block;margin-bottom:3px">POST COPY (edit as needed)</label>
          <textarea name="copy" rows="5">${p.ownerEdit ?? p.copy}</textarea>
        </div>
        ${p.imageDirection ? `<div class="image-dir"><strong style="font-size:11px;color:#888">IMAGE:</strong> ${p.imageDirection}</div>` : ""}
        ${p.hashtags?.length ? `<div class="meta" style="margin-bottom:8px">Tags: ${p.hashtags.join(", ")}</div>` : ""}
        <div style="display:flex;gap:8px">
          <button type="submit" name="action" value="approve" class="btn btn-green">✓ Approve</button>
          <button type="submit" name="action" value="reject" class="btn btn-red">✗ Reject</button>
        </div>
      </form>
    </div>`).join("");

  const header = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <div><h2>${campaign.name}</h2><p style="color:#666;font-size:13px">${campaign.theme}</p></div>
      <span class="badge badge-${campaign.status}">${campaign.status.replace("_", " ")}</span>
    </div>
    <div class="card" style="margin-bottom:20px">
      <p style="font-size:14px">${campaign.description}</p>
      <p class="meta" style="margin-top:6px">${campaign.posts.length} posts · ${campaign.durationWeeks} weeks</p>
    </div>
    <p style="font-size:13px;color:#666;margin-bottom:14px">Review each post below, edit the copy if needed, then approve or reject.</p>`;

  const approveForm = `
    <div class="card" style="margin-top:24px">
      <h3 style="margin-bottom:10px">Approve Entire Campaign</h3>
      <p style="font-size:13px;color:#666;margin-bottom:12px">
        Once you've reviewed posts above, approve the campaign to queue all approved posts for publishing.
      </p>
      <form method="POST" action="/campaigns/${campaign.id}/approve">
        <textarea name="notes" rows="2" placeholder="Optional notes for the agent..." style="margin-bottom:10px"></textarea>
        <div style="display:flex;gap:8px">
          <button type="submit" class="btn btn-green">✓ Approve & Schedule Campaign</button>
          <a href="/campaigns/${campaign.id}/reject" class="btn btn-red">✗ Reject & Revise</a>
        </div>
      </form>
    </div>`;

  res.send(layout(`Review: ${campaign.name}`, header + postCards + approveForm));
});

app.post("/posts/:id/update", requireAuth, (req, res) => {
  const approval = new ApprovalWorkflow();
  const { action, copy } = req.body as { action: string; copy: string };
  const postId = req.params.id;

  // Get campaign ID for redirect
  const campaigns = [...getCampaignsByStatus("pending_review"), ...getCampaignsByStatus("approved")];
  const campaign = campaigns.find((c) => c.posts.some((p) => p.id === postId));

  if (action === "approve") {
    approval.approvePost(postId, copy?.trim() || undefined);
  } else {
    approval.rejectPost(postId);
  }

  res.redirect(`/campaigns/${campaign?.id ?? ""}/review`);
});

app.post("/campaigns/:id/approve", requireAuth, async (req, res) => {
  const approval = new ApprovalWorkflow();
  const { notes } = req.body as { notes?: string };

  try {
    approval.approveCampaign(req.params.id, notes || undefined);
    // Schedule posts in background
    const scheduler = new SchedulerAgent();
    scheduler.run(req.params.id).catch((err) => console.error("[Scheduler error]", err));
    res.redirect("/?flash=Campaign approved and posts queued for publishing!");
  } catch (err) {
    res.redirect(`/campaigns/${req.params.id}/review`);
  }
});

app.get("/campaigns/:id/reject", requireAuth, (req, res) => {
  const approval = new ApprovalWorkflow();
  approval.rejectCampaign(req.params.id, "Rejected via dashboard");
  res.redirect("/");
});

app.get("/schedule", requireAuth, (_req, res) => {
  const campaigns = getCampaignsByStatus("scheduled");
  const posts = campaigns
    .flatMap((c) => c.posts.filter((p) => p.status === "scheduled"))
    .sort((a, b) => (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? ""));

  const rows = posts.map((p) => `
    <tr>
      <td style="padding:8px;font-size:13px">${p.scheduledFor?.slice(0, 10) ?? "–"}</td>
      <td style="padding:8px;font-size:13px;text-transform:capitalize">${p.platform}</td>
      <td style="padding:8px;font-size:13px">${p.contentPillar}</td>
      <td style="padding:8px;font-size:13px">${(p.ownerEdit ?? p.copy).slice(0, 80)}…</td>
    </tr>`).join("");

  const table = posts.length
    ? `<table style="width:100%;border-collapse:collapse;font-family:Georgia,serif">
        <thead><tr style="background:#f8f4f0">
          <th style="padding:8px;text-align:left;font-size:12px">Date</th>
          <th style="padding:8px;text-align:left;font-size:12px">Platform</th>
          <th style="padding:8px;text-align:left;font-size:12px">Type</th>
          <th style="padding:8px;text-align:left;font-size:12px">Preview</th>
        </tr></thead><tbody>${rows}</tbody></table>`
    : `<div style="text-align:center;padding:40px;color:#888">No posts scheduled yet</div>`;

  res.send(layout("Schedule", `<h2>Publishing Schedule</h2><div class="card">${table}</div>`));
});

// ── Start ─────────────────────────────────────────────────────────────────

app.listen(settings.dashboardPort, () => {
  console.log(`\n🌿 BodySpace Dashboard running at ${settings.dashboardBaseUrl}`);
  console.log(`   Password: ${settings.dashboardPassword}`);
});
