import { useEffect, useMemo, useState } from "react";
import {
  approveCampaign,
  approvePost,
  getBodyspaceStatus,
  getCampaign,
  getCampaigns,
  getHealth,
  getLatestTrends,
  getSignals,
  importFreshaCsv,
  rejectCampaign,
  rejectPost,
  runAll,
  runCampaign,
  runFreshaWatcher,
  runMonitorStream,
  scheduleCampaign,
  type AvailabilitySignal,
  type BodyspaceStatus,
  type Campaign,
  type MonitorProgressEvent,
  type SocialPost,
  type TrendsBrief,
} from "./api/appApi";
import "./App.css";

function App() {
  const [health, setHealth] = useState<{
    status: string;
    service: string;
    timestamp: string;
  } | null>(null);
  const [status, setStatus] = useState<BodyspaceStatus | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(
    null,
  );
  const [signals, setSignals] = useState<Record<string, AvailabilitySignal>>(
    {},
  );
  const [trends, setTrends] = useState<TrendsBrief | null>(null);
  const [ownerBrief, setOwnerBrief] = useState("");
  const [campaignNotes, setCampaignNotes] = useState("");
  const [postDrafts, setPostDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [monitorProgress, setMonitorProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadDashboard() {
    setLoading(true);
    setError(null);
    try {
      const [
        healthResult,
        statusResult,
        campaignsResult,
        signalsResult,
        trendsResult,
      ] = await Promise.all([
        getHealth(),
        getBodyspaceStatus(),
        getCampaigns(),
        getSignals(),
        getLatestTrends(),
      ]);

      setHealth(healthResult);
      setStatus(statusResult);
      setCampaigns(campaignsResult.campaigns);
      setSignals(signalsResult.signals);
      setTrends(trendsResult.brief);

      if (!selectedCampaign && campaignsResult.campaigns.length > 0) {
        const pendingFirst = campaignsResult.campaigns.find(
          (campaign) => campaign.status === "pending_review",
        );
        const initial = pendingFirst ?? campaignsResult.campaigns[0];
        await loadCampaign(initial.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  async function loadCampaign(campaignId: string) {
    const data = await getCampaign(campaignId);
    setSelectedCampaign(data.campaign);
    setPostDrafts(
      Object.fromEntries(
        data.campaign.posts.map((post) => [
          post.id,
          post.ownerEdit ?? post.copy,
        ]),
      ),
    );
  }

  useEffect(() => {
    void loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pendingCampaigns = useMemo(
    () => campaigns.filter((campaign) => campaign.status === "pending_review"),
    [campaigns],
  );

  const scheduledPosts = useMemo(
    () =>
      campaigns
        .flatMap((campaign) => campaign.posts)
        .filter((post) => post.status === "scheduled")
        .sort((a, b) =>
          (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? ""),
        ),
    [campaigns],
  );

  async function runAction(name: string, action: () => Promise<unknown>) {
    try {
      setRunningAction(name);
      setError(null);
      setNotice(null);
      await action();
      await loadDashboard();
      setNotice(`${name} complete`);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed: ${name}`);
    } finally {
      setRunningAction(null);
    }
  }

  async function onApprovePost(post: SocialPost) {
    const edited = postDrafts[post.id] ?? post.copy;
    await runAction("Approve post", async () => {
      await approvePost(post.id, edited);
      if (selectedCampaign) {
        await loadCampaign(selectedCampaign.id);
      }
    });
  }

  async function onRejectPost(post: SocialPost) {
    await runAction("Reject post", async () => {
      await rejectPost(post.id, "Rejected in dashboard");
      if (selectedCampaign) {
        await loadCampaign(selectedCampaign.id);
      }
    });
  }

  async function onImportCsv(file: File) {
    const text = await file.text();
    await runAction("Import Fresha CSV", async () => {
      await importFreshaCsv(text, file.name);
    });
  }

  async function onApproveCampaign() {
    if (!selectedCampaign) {
      return;
    }

    await runAction("Approve campaign", async () => {
      await approveCampaign(selectedCampaign.id, campaignNotes || undefined);
      await loadCampaign(selectedCampaign.id);
    });
  }

  async function onRejectCampaign() {
    if (!selectedCampaign) {
      return;
    }

    await runAction("Reject campaign", async () => {
      await rejectCampaign(
        selectedCampaign.id,
        campaignNotes || "Rejected from React dashboard",
      );
      await loadCampaign(selectedCampaign.id);
    });
  }

  function onRunMonitorStream() {
    setRunningAction("Run monitor");
    setError(null);
    setNotice(null);
    setMonitorProgress("Connecting...");

    runMonitorStream({
      onProgress(event: MonitorProgressEvent) {
        if (event.type === "status" || event.type === "done") {
          setMonitorProgress(event.message);
        }
      },
      onComplete() {
        setRunningAction(null);
        setMonitorProgress(null);
        setNotice("Run monitor complete");
        void loadDashboard();
      },
      onError(message: string) {
        setRunningAction(null);
        setMonitorProgress(null);
        setError(message);
      },
    });
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="kicker">BodySpace Ops Console</p>
        <h1>Campaigns, approvals, and cron-driven automation in one place</h1>
        <p>
          Server hosts orchestration and scheduling. This client handles human
          review and manual trigger controls.
        </p>
      </header>

      {loading && <p className="loading">Loading BodySpace dashboard...</p>}
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {!loading && status && health && (
        <>
          <section className="metrics-grid">
            <article className="metric-card">
              <h2>API Health</h2>
              <p>{health.status}</p>
              <span>{new Date(health.timestamp).toLocaleString()}</span>
            </article>
            <article className="metric-card">
              <h2>Pending Review</h2>
              <p>{status.counts.pendingReviewCampaigns}</p>
              <span>campaigns awaiting owner action</span>
            </article>
            <article className="metric-card">
              <h2>Scheduled Posts</h2>
              <p>{status.counts.scheduledPosts}</p>
              <span>queued in Postiz</span>
            </article>
            <article className="metric-card">
              <h2>Cron Timezone</h2>
              <p>{status.timezone}</p>
              <span>
                {status.schedules.freshaWatcher} / {status.schedules.monitor} /{" "}
                {status.schedules.campaignPlanner}
              </span>
            </article>
          </section>

          <section className="panel">
            <h2>Manual Agent Triggers</h2>
            <div className="actions-row">
              <button
                type="button"
                disabled={runningAction !== null}
                onClick={() =>
                  runAction("Run Fresha watcher", runFreshaWatcher)
                }
              >
                Run Fresha watcher
              </button>
              <button
                type="button"
                disabled={runningAction !== null}
                onClick={onRunMonitorStream}
              >
                Run monitor
              </button>
              <button
                type="button"
                disabled={runningAction !== null}
                onClick={() =>
                  runAction("Run campaign planner", () =>
                    runCampaign(ownerBrief || undefined),
                  )
                }
              >
                Run campaign planner
              </button>
              <button
                type="button"
                disabled={runningAction !== null}
                onClick={() =>
                  runAction("Run full pipeline", () =>
                    runAll(ownerBrief || undefined),
                  )
                }
              >
                Run all
              </button>
              <button
                type="button"
                disabled={runningAction !== null}
                onClick={() =>
                  runAction("Schedule approved campaigns", () =>
                    scheduleCampaign(),
                  )
                }
              >
                Queue approved campaigns
              </button>
            </div>
            <textarea
              rows={2}
              placeholder="Optional owner brief for campaign generation"
              value={ownerBrief}
              onChange={(event) => setOwnerBrief(event.target.value)}
            />
          </section>

          <section className="split-grid">
            <article className="panel">
              <h2>Pending Campaigns</h2>
              {pendingCampaigns.length === 0 && (
                <p className="muted">No campaigns pending review.</p>
              )}
              {pendingCampaigns.map((campaign) => (
                <button
                  type="button"
                  key={campaign.id}
                  className={`campaign-row ${selectedCampaign?.id === campaign.id ? "active" : ""}`}
                  onClick={() => void loadCampaign(campaign.id)}
                >
                  <strong>{campaign.name}</strong>
                  <span>{campaign.theme}</span>
                  <span>{campaign.posts.length} posts</span>
                </button>
              ))}
            </article>

            <article className="panel">
              <h2>Fresha CSV Import</h2>
              <input
                type="file"
                accept=".csv"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void onImportCsv(file);
                  }
                }}
              />
              <p className="muted">
                Upload an appointments CSV export to refresh PUSH/HOLD/PAUSE
                signals.
              </p>

              <h3>Current Signals</h3>
              <div className="signal-list">
                {Object.values(signals)
                  .sort((a, b) => a.serviceName.localeCompare(b.serviceName))
                  .map((signal) => (
                    <div
                      key={signal.serviceId}
                      className={`signal signal-${signal.signal}`}
                    >
                      <strong>{signal.serviceName}</strong>
                      <span>{signal.availableSlots} slots</span>
                    </div>
                  ))}
              </div>
            </article>
          </section>

          <section className="panel review-panel">
            <h2>Campaign Review</h2>
            {!selectedCampaign && (
              <p className="muted">Select a campaign to review posts.</p>
            )}
            {selectedCampaign && (
              <>
                <header className="campaign-header">
                  <div>
                    <h3>{selectedCampaign.name}</h3>
                    <p>{selectedCampaign.theme}</p>
                  </div>
                  <span className={`status status-${selectedCampaign.status}`}>
                    {selectedCampaign.status}
                  </span>
                </header>

                <p>{selectedCampaign.description}</p>

                <div className="post-list">
                  {selectedCampaign.posts
                    .slice()
                    .sort((a, b) =>
                      (a.scheduledFor ?? "").localeCompare(
                        b.scheduledFor ?? "",
                      ),
                    )
                    .map((post) => (
                      <article className="post-card" key={post.id}>
                        <div className="post-meta">
                          <strong>{post.platform}</strong>
                          <span>{post.contentPillar}</span>
                          <span>
                            {post.scheduledFor?.slice(0, 10) ?? "No date"}
                          </span>
                          <span className={`status status-${post.status}`}>
                            {post.status}
                          </span>
                        </div>
                        <textarea
                          rows={4}
                          value={
                            postDrafts[post.id] ?? post.ownerEdit ?? post.copy
                          }
                          onChange={(event) => {
                            setPostDrafts((current) => ({
                              ...current,
                              [post.id]: event.target.value,
                            }));
                          }}
                        />
                        {post.imageDirection && (
                          <p className="muted">Image: {post.imageDirection}</p>
                        )}
                        <p className="hashtags">
                          {post.hashtags
                            .map((tag) => `#${tag.replace(/^#/, "")}`)
                            .join(" ")}
                        </p>
                        <div className="actions-row compact">
                          <button
                            type="button"
                            className="approve"
                            disabled={runningAction !== null}
                            onClick={() => void onApprovePost(post)}
                          >
                            Approve post
                          </button>
                          <button
                            type="button"
                            className="reject"
                            disabled={runningAction !== null}
                            onClick={() => void onRejectPost(post)}
                          >
                            Reject post
                          </button>
                        </div>
                      </article>
                    ))}
                </div>

                <textarea
                  rows={2}
                  placeholder="Optional campaign-level notes"
                  value={campaignNotes}
                  onChange={(event) => setCampaignNotes(event.target.value)}
                />
                <div className="actions-row compact">
                  <button
                    type="button"
                    className="approve"
                    disabled={runningAction !== null}
                    onClick={() => void onApproveCampaign()}
                  >
                    Approve and schedule campaign
                  </button>
                  <button
                    type="button"
                    className="reject"
                    disabled={runningAction !== null}
                    onClick={() => void onRejectCampaign()}
                  >
                    Reject campaign
                  </button>
                </div>
              </>
            )}
          </section>

          <section className="split-grid">
            <article className="panel">
              <h2>Latest Trends Brief</h2>
              <button
                type="button"
                disabled={runningAction !== null}
                onClick={onRunMonitorStream}
              >
                {runningAction === "Run monitor" ? "Running…" : "Update trends"}
              </button>
              {monitorProgress && (
                <p className="monitor-progress">{monitorProgress}</p>
              )}
              {!trends && (
                <p className="muted">No trends brief has been generated yet.</p>
              )}
              {trends && (
                <>
                  <p>
                    <strong>Week:</strong> {trends.weekOf}
                  </p>
                  <p>
                    <strong>Recommended Focus:</strong>{" "}
                    {trends.recommendedFocus}
                  </p>
                  <p>
                    <strong>Opportunities:</strong> {trends.opportunities}
                  </p>
                  <p className="muted">Confidence: {trends.confidence}</p>
                </>
              )}
            </article>

            <article className="panel">
              <h2>Scheduled Queue Preview</h2>
              {scheduledPosts.length === 0 && (
                <p className="muted">No scheduled posts yet.</p>
              )}
              {scheduledPosts.slice(0, 8).map((post) => (
                <div key={post.id} className="queue-row">
                  <strong>
                    {post.scheduledFor?.slice(0, 10) ?? "No date"}
                  </strong>
                  <span>{post.platform}</span>
                  <span>{(post.ownerEdit ?? post.copy).slice(0, 65)}...</span>
                </div>
              ))}
            </article>
          </section>
        </>
      )}
    </main>
  );
}

export default App;
