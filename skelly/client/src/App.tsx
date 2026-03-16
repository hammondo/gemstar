import { useEffect, useMemo, useState } from 'react';
import ThemeColors from './ThemeColors';
import {
    approveCampaign,
    approvePost,
    approvePostImage,
    getBodyspaceStatus,
    getCampaign,
    getCampaigns,
    getHealth,
    getLatestTrends,
    getSignals,
    importFreshaCsv,
    rejectCampaign,
    rejectPost,
    regeneratePostImage,
    runAll,
    runCampaign,
    runFreshaWatcher,
    runMonitorStream,
    scheduleCampaign,
    type AvailabilitySignal,
    type BodyspaceStatus,
    type Campaign,
    type ImageStatus,
    type MonitorProgressEvent,
    type SocialPost,
    type TrendsBrief,
} from './api/appApi';

const statusBadge: Record<string, string> = {
    pending_review: 'bg-amber-100 text-amber-800',
    approved: 'bg-emerald-100 text-emerald-800',
    scheduled: 'bg-emerald-100 text-emerald-800',
    published: 'bg-emerald-100 text-emerald-800',
    rejected: 'bg-red-100 text-red-800',
};

const signalBorder: Record<string, string> = {
    push: 'border-l-4 border-l-ok',
    hold: 'border-l-4 border-l-warn',
    pause: 'border-l-4 border-l-bad',
};

function App() {
    const [health, setHealth] = useState<{
        status: string;
        service: string;
        timestamp: string;
    } | null>(null);
    const [status, setStatus] = useState<BodyspaceStatus | null>(null);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
    const [signals, setSignals] = useState<Record<string, AvailabilitySignal>>({});
    const [trends, setTrends] = useState<TrendsBrief | null>(null);
    const [ownerBrief, setOwnerBrief] = useState('');
    const [campaignNotes, setCampaignNotes] = useState('');
    const [postDrafts, setPostDrafts] = useState<Record<string, string>>({});
    const [imageFeedback, setImageFeedback] = useState<Record<string, string>>({});
    const [imageAction, setImageAction] = useState<Record<string, 'generating' | 'approving' | null>>({});
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState<'dashboard' | 'theme'>('dashboard');
    const [runningAction, setRunningAction] = useState<string | null>(null);
    const [monitorProgress, setMonitorProgress] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    async function loadDashboard() {
        setLoading(true);
        setError(null);
        try {
            const [healthResult, statusResult, campaignsResult, signalsResult, trendsResult] = await Promise.all([
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
                const pendingFirst = campaignsResult.campaigns.find((campaign) => campaign.status === 'pending_review');
                const initial = pendingFirst ?? campaignsResult.campaigns[0];
                await loadCampaign(initial.id);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load dashboard');
        } finally {
            setLoading(false);
        }
    }

    async function loadCampaign(campaignId: string) {
        const data = await getCampaign(campaignId);
        setSelectedCampaign(data.campaign);
        setPostDrafts(Object.fromEntries(data.campaign.posts.map((post) => [post.id, post.ownerEdit ?? post.copy])));
    }

    useEffect(() => {
        void loadDashboard();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const pendingCampaigns = useMemo(
        () => campaigns.filter((campaign) => campaign.status === 'pending_review'),
        [campaigns]
    );

    const scheduledPosts = useMemo(
        () =>
            campaigns
                .flatMap((campaign) => campaign.posts)
                .filter((post) => post.status === 'scheduled')
                .sort((a, b) => (a.scheduledFor ?? '').localeCompare(b.scheduledFor ?? '')),
        [campaigns]
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
        await runAction('Approve post', async () => {
            await approvePost(post.id, edited);
            if (selectedCampaign) {
                await loadCampaign(selectedCampaign.id);
            }
        });
    }

    async function onRejectPost(post: SocialPost) {
        await runAction('Reject post', async () => {
            await rejectPost(post.id, 'Rejected in dashboard');
            if (selectedCampaign) {
                await loadCampaign(selectedCampaign.id);
            }
        });
    }

    async function onRegenerateImage(post: SocialPost) {
        if (!selectedCampaign) return;
        const feedback = imageFeedback[post.id]?.trim() || undefined;
        setImageAction((prev) => ({ ...prev, [post.id]: 'generating' }));
        setError(null);
        try {
            await regeneratePostImage(post.id, selectedCampaign.id, feedback);
            await loadCampaign(selectedCampaign.id);
            setImageFeedback((prev) => ({ ...prev, [post.id]: '' }));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Image generation failed');
        } finally {
            setImageAction((prev) => ({ ...prev, [post.id]: null }));
        }
    }

    async function onApproveImage(post: SocialPost) {
        setImageAction((prev) => ({ ...prev, [post.id]: 'approving' }));
        setError(null);
        try {
            await approvePostImage(post.id);
            await loadCampaign(selectedCampaign!.id);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Image approval failed');
        } finally {
            setImageAction((prev) => ({ ...prev, [post.id]: null }));
        }
    }

    async function onImportCsv(file: File) {
        const text = await file.text();
        await runAction('Import Fresha CSV', async () => {
            await importFreshaCsv(text, file.name);
        });
    }

    async function onApproveCampaign() {
        if (!selectedCampaign) {
            return;
        }

        await runAction('Approve campaign', async () => {
            await approveCampaign(selectedCampaign.id, campaignNotes || undefined);
            await loadCampaign(selectedCampaign.id);
        });
    }

    async function onRejectCampaign() {
        if (!selectedCampaign) {
            return;
        }

        await runAction('Reject campaign', async () => {
            await rejectCampaign(selectedCampaign.id, campaignNotes || 'Rejected from React dashboard');
            await loadCampaign(selectedCampaign.id);
        });
    }

    function onRunMonitorStream() {
        setRunningAction('Run monitor');
        setError(null);
        setNotice(null);
        setMonitorProgress('Connecting...');

        runMonitorStream({
            onProgress(event: MonitorProgressEvent) {
                if (event.type === 'status' || event.type === 'done') {
                    setMonitorProgress(event.message);
                }
            },
            onComplete() {
                setRunningAction(null);
                setMonitorProgress(null);
                setNotice('Run monitor complete');
                void loadDashboard();
            },
            onError(message: string) {
                setRunningAction(null);
                setMonitorProgress(null);
                setError(message);
            },
        });
    }

    if (page === 'theme') {
        return (
            <div>
                <nav className="mx-auto mt-8 flex w-[min(1180px,92vw)] gap-2">
                    <button
                        onClick={() => setPage('dashboard')}
                        className="border-warm-200 text-muted hover:bg-warm-100 rounded-lg border bg-white px-4 py-2 text-sm font-medium shadow-sm"
                    >
                        ← Dashboard
                    </button>
                </nav>
                <ThemeColors />
            </div>
        );
    }

    return (
        <main className="mx-auto my-8 mb-16 grid w-[min(1180px,92vw)] gap-4">
            {/* Hero */}
            <header className="border-warm-200 rounded-2xl border bg-white p-7 shadow-sm">
                <p className="mb-2 text-sm font-semibold tracking-widest text-teal-700 uppercase">BodySpace GemStar</p>
                <h1 className="font-heading text-charcoal m-0 text-[clamp(1.5rem,2.8vw,2.4rem)] leading-tight">
                    Campaigns, approvals, and automation in one place
                </h1>
                <p className="text-muted mt-3 max-w-[74ch]">
                    We are currently running <code>{status?.counts.approvedCampaigns}</code> approved campaigns for
                    BodySpace Recovery Studio. Use the buttons below to trigger agents on demand, or set up cron jobs to
                    run automatically. Click on a pending campaign to review and approve posts before they go live.
                </p>
                <button
                    onClick={() => setPage('theme')}
                    className="border-warm-200 bg-warm-100 mt-4 rounded-lg border px-4 py-2 text-sm font-medium text-teal-700 shadow-sm hover:bg-teal-300"
                >
                    View Theme Colours
                </button>
            </header>

            {loading && <p className="text-muted">Loading BodySpace dashboard...</p>}
            {error && (
                <p className="rounded-xl border border-red-200 bg-red-100 px-4 py-3 font-semibold text-red-800">
                    {error}
                </p>
            )}
            {notice && (
                <p className="rounded-xl border border-emerald-200 bg-emerald-100 px-4 py-3 font-semibold text-emerald-800">
                    {notice}
                </p>
            )}

            {!loading && status && health && (
                <>
                    {/* Metrics */}
                    <section className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
                        <article className="border-warm-200 rounded-xl border bg-white p-4 shadow-sm">
                            <h2 className="text-muted m-0 text-sm font-medium tracking-wider uppercase">API Health</h2>
                            <p className="text-charcoal my-1 text-xl font-bold">{health.status}</p>
                            <span className="text-muted text-sm">{new Date(health.timestamp).toLocaleString()}</span>
                        </article>
                        <article className="border-warm-200 rounded-xl border bg-white p-4 shadow-sm">
                            <h2 className="text-muted m-0 text-sm font-medium tracking-wider uppercase">
                                Pending Review
                            </h2>
                            <p className="text-charcoal my-1 text-xl font-bold">
                                {status.counts.pendingReviewCampaigns}
                            </p>
                            <span className="text-muted text-sm">campaigns awaiting owner action</span>
                        </article>
                        <article className="border-warm-200 rounded-xl border bg-white p-4 shadow-sm">
                            <h2 className="text-muted m-0 text-sm font-medium tracking-wider uppercase">
                                Scheduled Posts
                            </h2>
                            <p className="text-charcoal my-1 text-xl font-bold">{status.counts.scheduledPosts}</p>
                            <span className="text-muted text-sm">queued in Postiz</span>
                        </article>
                        <article className="border-warm-200 rounded-xl border bg-white p-4 shadow-sm">
                            <h2 className="text-muted m-0 text-sm font-medium tracking-wider uppercase">
                                Cron Timezone
                            </h2>
                            <p className="text-charcoal my-1 text-xl font-bold">{status.timezone}</p>
                            <span className="text-muted text-sm">
                                {status.schedules.freshaWatcher} / {status.schedules.monitor} /{' '}
                                {status.schedules.campaignPlanner}
                            </span>
                        </article>
                    </section>

                    {/* Actions */}
                    <section className="border-warm-200 rounded-xl border bg-white p-4 shadow-sm">
                        <h2 className="font-heading text-charcoal mb-3">Manual Agent Triggers</h2>
                        <div className="mb-3 flex flex-wrap gap-2">
                            <button
                                type="button"
                                className="cursor-pointer rounded-lg bg-teal-400 px-4 py-2 font-bold text-white transition hover:-translate-y-px hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={runningAction !== null}
                                onClick={() => runAction('Run Fresha watcher', runFreshaWatcher)}
                            >
                                Run Fresha watcher
                            </button>
                            <button
                                type="button"
                                className="cursor-pointer rounded-lg bg-teal-400 px-4 py-2 font-bold text-white transition hover:-translate-y-px hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={runningAction !== null}
                                onClick={onRunMonitorStream}
                            >
                                Run monitor
                            </button>
                            <button
                                type="button"
                                className="cursor-pointer rounded-lg bg-teal-400 px-4 py-2 font-bold text-white transition hover:-translate-y-px hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={runningAction !== null}
                                onClick={() =>
                                    runAction('Run campaign planner', () => runCampaign(ownerBrief || undefined))
                                }
                            >
                                Run campaign planner
                            </button>
                            <button
                                type="button"
                                className="cursor-pointer rounded-lg bg-teal-400 px-4 py-2 font-bold text-white transition hover:-translate-y-px hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={runningAction !== null}
                                onClick={() => runAction('Run full pipeline', () => runAll(ownerBrief || undefined))}
                            >
                                Run all
                            </button>
                            <button
                                type="button"
                                className="cursor-pointer rounded-lg bg-teal-400 px-4 py-2 font-bold text-white transition hover:-translate-y-px hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={runningAction !== null}
                                onClick={() => runAction('Schedule approved campaigns', () => scheduleCampaign())}
                            >
                                Queue approved campaigns
                            </button>
                        </div>
                        <textarea
                            className="border-warm-200 bg-warm-50 text-charcoal w-full rounded-lg border p-2 font-[inherit]"
                            rows={2}
                            placeholder="Optional owner brief for campaign generation"
                            value={ownerBrief}
                            onChange={(event) => setOwnerBrief(event.target.value)}
                        />
                    </section>

                    {/* Split: Trends + Queue */}
                    <section className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
                        <article className="border-warm-200 rounded-xl border bg-white p-4 shadow-sm">
                            <h2 className="font-heading text-charcoal mb-3">Latest Trends Brief</h2>
                            <button
                                type="button"
                                className="cursor-pointer rounded-lg bg-teal-400 px-4 py-2 font-bold text-white transition hover:-translate-y-px hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={runningAction !== null}
                                onClick={onRunMonitorStream}
                            >
                                {runningAction === 'Run monitor' ? 'Running…' : 'Update trends'}
                            </button>
                            {monitorProgress && (
                                <p className="animate-pulse-opacity my-2 rounded border-l-3 border-l-teal-400 bg-teal-300/30 px-2 py-1 text-sm font-semibold text-teal-700">
                                    {monitorProgress}
                                </p>
                            )}
                            {!trends && <p className="text-muted">No trends brief has been generated yet.</p>}
                            {trends && (
                                <>
                                    <p>
                                        <strong>Week:</strong> {trends.weekOf}
                                    </p>
                                    <p>
                                        <strong>Recommended Focus:</strong> {trends.recommendedFocus}
                                    </p>
                                    <p>
                                        <strong>Opportunities:</strong> {trends.opportunities}
                                    </p>
                                    <p className="text-muted">Confidence: {trends.confidence}</p>
                                </>
                            )}
                        </article>

                        <article className="border-warm-200 rounded-xl border bg-white p-4 shadow-sm">
                            <h2 className="font-heading text-charcoal mb-3">Scheduled Queue Preview</h2>
                            {scheduledPosts.length === 0 && <p className="text-muted">No scheduled posts yet.</p>}
                            {scheduledPosts.slice(0, 8).map((post) => (
                                <div
                                    key={post.id}
                                    className="border-warm-200 grid grid-cols-[106px_88px_1fr] gap-2 border-t py-2 text-sm max-sm:grid-cols-1"
                                >
                                    <strong>{post.scheduledFor?.slice(0, 10) ?? 'No date'}</strong>
                                    <span>{post.platform}</span>
                                    <span>{(post.ownerEdit ?? post.copy).slice(0, 65)}...</span>
                                </div>
                            ))}
                        </article>
                    </section>

                    {/* Split: Campaigns + Signals */}
                    <section className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
                        <article className="border-warm-200 rounded-xl border bg-white p-4 shadow-sm">
                            <h2 className="font-heading text-charcoal mb-3">Pending Campaigns</h2>
                            {pendingCampaigns.length === 0 && (
                                <p className="text-muted">No campaigns pending review.</p>
                            )}
                            {pendingCampaigns.map((campaign) => (
                                <button
                                    type="button"
                                    key={campaign.id}
                                    className={`mb-2 grid w-full cursor-pointer rounded-lg border-none px-4 py-2 text-left transition ${
                                        selectedCampaign?.id === campaign.id
                                            ? 'bg-teal-400 text-white'
                                            : 'bg-warm-100 text-charcoal'
                                    }`}
                                    onClick={() => void loadCampaign(campaign.id)}
                                >
                                    <strong>{campaign.name}</strong>
                                    <span className="text-sm opacity-80">{campaign.theme}</span>
                                    <span className="text-sm opacity-80">{campaign.posts.length} posts</span>
                                </button>
                            ))}
                        </article>

                        <article className="border-warm-200 rounded-xl border bg-white p-4 shadow-sm">
                            <h2 className="font-heading text-charcoal mb-3">Fresha CSV Import</h2>
                            <input
                                type="file"
                                accept=".csv"
                                className="border-warm-200 bg-warm-50 text-charcoal w-full rounded-lg border p-2 font-[inherit]"
                                onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    if (file) {
                                        void onImportCsv(file);
                                    }
                                }}
                            />
                            <p className="text-muted">
                                Upload an appointments CSV export to refresh PUSH/HOLD/PAUSE signals.
                            </p>

                            <h3>Current Signals</h3>
                            <div className="grid max-h-64 gap-2 overflow-auto">
                                {Object.values(signals)
                                    .sort((a, b) => a.serviceName.localeCompare(b.serviceName))
                                    .map((signal) => (
                                        <div
                                            key={signal.serviceId}
                                            className={`border-warm-200 bg-warm-100 flex justify-between rounded-lg border p-2 ${signalBorder[signal.signal] ?? ''}`}
                                        >
                                            <strong>{signal.serviceName}</strong>
                                            <span>{signal.availableSlots} slots</span>
                                        </div>
                                    ))}
                            </div>
                        </article>
                    </section>

                    {/* Campaign Review */}
                    <section className="border-warm-200 rounded-xl border bg-white p-4 shadow-sm">
                        <h2 className="font-heading text-charcoal mb-3">Campaign Review</h2>
                        {!selectedCampaign && <p className="text-muted">Select a campaign to review posts.</p>}
                        {selectedCampaign && (
                            <>
                                <header className="mb-3 flex items-start justify-between gap-3">
                                    <div>
                                        <h3 className="text-charcoal m-0">{selectedCampaign.name}</h3>
                                        <p className="text-muted mt-1">{selectedCampaign.theme}</p>
                                    </div>
                                    <span
                                        className={`rounded-full px-2 py-0.5 text-xs font-bold tracking-wide uppercase ${statusBadge[selectedCampaign.status] ?? ''}`}
                                    >
                                        {selectedCampaign.status}
                                    </span>
                                </header>

                                <p>{selectedCampaign.description}</p>

                                <div className="my-3 grid gap-3">
                                    {selectedCampaign.posts
                                        .slice()
                                        .sort((a, b) => (a.scheduledFor ?? '').localeCompare(b.scheduledFor ?? ''))
                                        .map((post) => (
                                            <article
                                                className="border-warm-200 bg-warm-50 rounded-lg border p-3"
                                                key={post.id}
                                            >
                                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                                    <strong>{post.platform}</strong>
                                                    <span>{post.contentPillar}</span>
                                                    <span>{post.scheduledFor?.slice(0, 10) ?? 'No date'}</span>
                                                    <span
                                                        className={`rounded-full px-2 py-0.5 text-xs font-bold tracking-wide uppercase ${statusBadge[post.status] ?? ''}`}
                                                    >
                                                        {post.status}
                                                    </span>
                                                </div>
                                                <textarea
                                                    className="border-warm-200 bg-warm-50 text-charcoal w-full rounded-lg border p-2 font-[inherit]"
                                                    rows={4}
                                                    value={postDrafts[post.id] ?? post.ownerEdit ?? post.copy}
                                                    onChange={(event) => {
                                                        setPostDrafts((current) => ({
                                                            ...current,
                                                            [post.id]: event.target.value,
                                                        }));
                                                    }}
                                                />
                                                <PostImagePanel
                                                    post={post}
                                                    feedback={imageFeedback[post.id] ?? ''}
                                                    onFeedbackChange={(val) =>
                                                        setImageFeedback((prev) => ({ ...prev, [post.id]: val }))
                                                    }
                                                    isGenerating={imageAction[post.id] === 'generating'}
                                                    isApproving={imageAction[post.id] === 'approving'}
                                                    onRegenerate={() => void onRegenerateImage(post)}
                                                    onApproveImage={() => void onApproveImage(post)}
                                                />
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    <button
                                                        type="button"
                                                        className="bg-ok cursor-pointer rounded-lg px-4 py-2 font-bold text-white transition hover:-translate-y-px hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                                                        disabled={runningAction !== null}
                                                        onClick={() => void onApprovePost(post)}
                                                    >
                                                        Approve post
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="bg-bad cursor-pointer rounded-lg px-4 py-2 font-bold text-white transition hover:-translate-y-px hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
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
                                    className="border-warm-200 bg-warm-50 text-charcoal w-full rounded-lg border p-2 font-[inherit]"
                                    rows={2}
                                    placeholder="Optional campaign-level notes"
                                    value={campaignNotes}
                                    onChange={(event) => setCampaignNotes(event.target.value)}
                                />
                                <div className="mt-2 flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        className="bg-ok cursor-pointer rounded-lg px-4 py-2 font-bold text-white transition hover:-translate-y-px hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                                        disabled={runningAction !== null}
                                        onClick={() => void onApproveCampaign()}
                                    >
                                        Approve and schedule campaign
                                    </button>
                                    <button
                                        type="button"
                                        className="bg-bad cursor-pointer rounded-lg px-4 py-2 font-bold text-white transition hover:-translate-y-px hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                                        disabled={runningAction !== null}
                                        onClick={() => void onRejectCampaign()}
                                    >
                                        Reject campaign
                                    </button>
                                </div>
                            </>
                        )}
                    </section>
                </>
            )}
        </main>
    );
}

// ---------------------------------------------------------------------------
// PostImagePanel
// ---------------------------------------------------------------------------

interface PostImagePanelProps {
    post: SocialPost;
    feedback: string;
    onFeedbackChange: (val: string) => void;
    isGenerating: boolean;
    isApproving: boolean;
    onRegenerate: () => void;
    onApproveImage: () => void;
}

const imageBadge: Record<ImageStatus, string> = {
    needed: 'bg-gray-100 text-gray-600',
    generating: 'bg-amber-100 text-amber-800',
    draft: 'bg-sky-100 text-sky-800',
    approved: 'bg-emerald-100 text-emerald-800',
};

function PostImagePanel({
    post,
    feedback,
    onFeedbackChange,
    isGenerating,
    isApproving,
    onRegenerate,
    onApproveImage,
}: PostImagePanelProps) {
    const status = post.imageStatus ?? 'needed';
    const hasImage = Boolean(post.imageUrl);

    return (
        <div className="border-warm-200 mt-2 rounded-lg border p-3">
            {/* Status badge + direction hint */}
            <div className="mb-2 flex flex-wrap items-center gap-2">
                <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold tracking-wide uppercase ${imageBadge[status]}`}
                >
                    image: {status}
                </span>
                {post.imageDirection && (
                    <span className="text-muted text-xs italic">{post.imageDirection}</span>
                )}
            </div>

            {/* Image preview */}
            {hasImage && (
                <img
                    src={post.imageUrl}
                    alt="Generated post image"
                    className="mb-2 w-full max-w-sm rounded-lg object-cover"
                />
            )}

            {/* Feedback textarea */}
            <textarea
                className="border-warm-200 bg-warm-50 text-charcoal mb-2 w-full rounded-lg border p-2 font-[inherit] text-sm"
                rows={2}
                placeholder={hasImage ? 'Optional feedback for regeneration…' : 'Optional direction for image generation…'}
                value={feedback}
                onChange={(e) => onFeedbackChange(e.target.value)}
                disabled={isGenerating || isApproving}
            />

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    className="cursor-pointer rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-bold text-white transition hover:-translate-y-px hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isGenerating || isApproving || status === 'generating'}
                    onClick={onRegenerate}
                >
                    {isGenerating ? 'Generating…' : hasImage ? 'Regenerate image' : 'Generate image'}
                </button>
                {status === 'draft' && (
                    <button
                        type="button"
                        className="bg-ok cursor-pointer rounded-lg px-3 py-1.5 text-sm font-bold text-white transition hover:-translate-y-px hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isGenerating || isApproving}
                        onClick={onApproveImage}
                    >
                        {isApproving ? 'Approving…' : 'Approve image'}
                    </button>
                )}
            </div>
        </div>
    );
}

export default App;
