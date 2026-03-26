import { useEffect, useMemo, useState } from 'react';
import {
    Bar,
    BarChart,
    Cell,
    Legend,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import {
    type ServiceAvailability,
    type Campaign,
    type FbInsightRow,
    type MetaAnalyticsResult,
    type SocialPost,
    getCampaigns,
    getMetaAnalytics,
    getSignals,
    refreshMetaCache,
} from '../api/appApi';
import PageHeader from '../components/PageHeader';

// ── Colours ───────────────────────────────────────────────────────────────────

const STATUS_COLOURS: Record<string, string> = {
    draft: '#9ca3af',
    pending_review: '#f59e0b',
    approved: '#14b8a6',
    rejected: '#ef4444',
    scheduled: '#6366f1',
    published: '#22c55e',
};

const SIGNAL_COLOURS: Record<string, string> = {
    push: '#14b8a6',
    hold: '#f59e0b',
    pause: '#ef4444',
};

const PLATFORM_COLOURS: Record<string, string> = {
    instagram: '#e1306c',
    facebook: '#1877f2',
};

const TYPE_COLOURS: Record<string, string> = {
    feed: '#14b8a6',
    story: '#6366f1',
    reel: '#f59e0b',
};

const IMAGE_COLOURS: Record<string, string> = {
    needed: '#9ca3af',
    generating: '#f59e0b',
    draft: '#6366f1',
    approved: '#14b8a6',
};

// ── Small helpers ─────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
    return (
        <div className="rounded-2xl border border-warm-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
            <p className="mt-1 text-3xl font-bold text-charcoal">{value}</p>
            {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
        </div>
    );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="rounded-2xl border border-warm-200 bg-white shadow-sm">
            <div className="border-b border-warm-200 px-6 py-4">
                <h2 className="text-sm font-semibold text-charcoal">{title}</h2>
            </div>
            <div className="p-6">{children}</div>
        </div>
    );
}

function labelFor(key: string) {
    return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── FB insight config ─────────────────────────────────────────────────────────

const FB_METRIC_LABELS: Record<string, string> = {
    page_impressions_unique: 'Unique reach',
    page_impressions_paid_unique: 'Paid reach',
    page_impressions_viral_unique: 'Viral reach',
    page_posts_impressions_unique: 'Post reach',
    page_posts_impressions_organic_unique: 'Organic post reach',
    page_posts_impressions_paid_unique: 'Paid post reach',
    page_post_engagements: 'Engagements',
    page_follows: 'New follows',
    page_daily_follows: 'Daily follows',
};

const FB_METRIC_COLOURS: Record<string, string> = {
    page_impressions_unique: '#1877f2',
    page_impressions_paid_unique: '#f97316',
    page_impressions_viral_unique: '#a855f7',
    page_posts_impressions_unique: '#60a5fa',
    page_posts_impressions_organic_unique: '#22c55e',
    page_posts_impressions_paid_unique: '#f59e0b',
    page_post_engagements: '#ef4444',
    page_follows: '#14b8a6',
    page_daily_follows: '#06b6d4',
};

// Group metrics into separate charts so scales don't clash
const FB_CHART_GROUPS = [
    {
        title: 'Reach & impressions (28 days)',
        metrics: [
            'page_impressions_unique',
            'page_posts_impressions_unique',
            'page_posts_impressions_organic_unique',
            'page_posts_impressions_paid_unique',
            'page_impressions_paid_unique',
            'page_impressions_viral_unique',
        ],
    },
    {
        title: 'Engagement (28 days)',
        metrics: ['page_post_engagements'],
    },
    {
        title: 'Follows (28 days)',
        metrics: ['page_daily_follows'],
    },
];

function FbInsightsCharts({ series, metrics }: { series: FbInsightRow[]; metrics: string[] }) {
    const fmtDate = (d: string) =>
        new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

    return (
        <div className="mb-6 space-y-6">
            {FB_CHART_GROUPS.map((group) => {
                const activeMetrics = group.metrics.filter((m) => metrics.includes(m));
                if (activeMetrics.length === 0) return null;
                return (
                    <SectionCard key={group.title} title={group.title}>
                        <ResponsiveContainer width="100%" height={240}>
                            <LineChart data={series} margin={{ left: 8, right: 24, top: 8, bottom: 4 }}>
                                <XAxis
                                    dataKey="date"
                                    tickFormatter={fmtDate}
                                    tick={{ fontSize: 11, fill: '#6b7280' }}
                                    interval="preserveStartEnd"
                                />
                                <YAxis
                                    allowDecimals={false}
                                    tick={{ fontSize: 11, fill: '#6b7280' }}
                                    width={48}
                                    tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
                                />
                                <Tooltip
                                    content={({ active, payload, label }) =>
                                        active && payload?.length ? (
                                            <div className="rounded-lg border border-warm-200 bg-white px-3 py-2 text-xs shadow space-y-0.5">
                                                <p className="font-semibold text-charcoal mb-1">{fmtDate(label as string)}</p>
                                                {payload.map((p) => (
                                                    <p key={p.dataKey as string} style={{ color: p.color }}>
                                                        {FB_METRIC_LABELS[p.dataKey as string] ?? p.dataKey}: {(p.value as number).toLocaleString()}
                                                    </p>
                                                ))}
                                            </div>
                                        ) : null
                                    }
                                />
                                <Legend
                                    formatter={(value) => FB_METRIC_LABELS[value] ?? value}
                                    wrapperStyle={{ fontSize: 11 }}
                                />
                                {activeMetrics.map((m) => (
                                    <Line
                                        key={m}
                                        type="monotone"
                                        dataKey={m}
                                        stroke={FB_METRIC_COLOURS[m] ?? '#9ca3af'}
                                        strokeWidth={2}
                                        dot={false}
                                        activeDot={{ r: 4 }}
                                    />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    </SectionCard>
                );
            })}
        </div>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [signals, setSignals] = useState<Record<string, ServiceAvailability>>({});
    const [meta, setMeta] = useState<MetaAnalyticsResult | null>(null);
    const [metaRefreshing, setMetaRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        Promise.all([getCampaigns(), getSignals(), getMetaAnalytics()])
            .then(([{ campaigns: c }, { signals: s }, m]) => {
                setCampaigns(c);
                setSignals(s);
                setMeta(m);
            })
            .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
            .finally(() => setLoading(false));
    }, []);

    async function handleMetaRefresh() {
        setMetaRefreshing(true);
        try {
            await refreshMetaCache();
            const m = await getMetaAnalytics();
            setMeta(m);
        } finally {
            setMetaRefreshing(false);
        }
    }

    const allPosts = useMemo<SocialPost[]>(() => campaigns.flatMap((c) => c.posts), [campaigns]);

    // Pipeline: post counts by status in funnel order
    const pipelineData = useMemo(() => {
        const order: SocialPost['status'][] = ['draft', 'pending_review', 'approved', 'scheduled', 'published', 'rejected'];
        const counts = Object.fromEntries(order.map((s) => [s, 0]));
        allPosts.forEach((p) => { if (p.status in counts) counts[p.status]++; });
        return order.map((s) => ({ name: labelFor(s), value: counts[s], status: s }));
    }, [allPosts]);

    // Campaign status donut
    const campaignStatusData = useMemo(() => {
        const counts: Record<string, number> = {};
        campaigns.forEach((c) => { counts[c.status] = (counts[c.status] ?? 0) + 1; });
        return Object.entries(counts).map(([status, value]) => ({ name: labelFor(status), value, status }));
    }, [campaigns]);

    // Platform split
    const platformData = useMemo(() => {
        const counts = { instagram: 0, facebook: 0 };
        allPosts.forEach((p) => { counts[p.platform] = (counts[p.platform] ?? 0) + 1; });
        return Object.entries(counts).map(([key, value]) => ({ name: labelFor(key), value, key }));
    }, [allPosts]);

    // Post type split
    const postTypeData = useMemo(() => {
        const counts: Record<string, number> = {};
        allPosts.forEach((p) => { counts[p.postType] = (counts[p.postType] ?? 0) + 1; });
        return Object.entries(counts).map(([key, value]) => ({ name: labelFor(key), value, key }));
    }, [allPosts]);

    // Image status
    const imageStatusData = useMemo(() => {
        const counts: Record<string, number> = { needed: 0, generating: 0, draft: 0, approved: 0 };
        allPosts.forEach((p) => { const s = p.imageStatus ?? 'needed'; counts[s] = (counts[s] ?? 0) + 1; });
        return Object.entries(counts)
            .filter(([, v]) => v > 0)
            .map(([status, value]) => ({ name: labelFor(status), value, status }));
    }, [allPosts]);

    // Upcoming posts — next 30 days grouped by week
    const upcomingData = useMemo(() => {
        const now = new Date();
        const cutoff = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const buckets: Record<string, number> = {};
        allPosts
            .filter((p) => p.scheduledFor && new Date(p.scheduledFor) >= now && new Date(p.scheduledFor) <= cutoff)
            .forEach((p) => {
                const d = new Date(p.scheduledFor!);
                const day = d.getDay();
                const monday = new Date(d);
                monday.setDate(d.getDate() - ((day + 6) % 7));
                const key = monday.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
                buckets[key] = (buckets[key] ?? 0) + 1;
            });
        return Object.entries(buckets)
            .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
            .map(([week, count]) => ({ week, count }));
    }, [allPosts]);

    // Key metrics
    const totalPosts = allPosts.length;
    const pendingReview = allPosts.filter((p) => p.status === 'pending_review').length;
    const published = allPosts.filter((p) => p.status === 'published').length;
    const approvalRate =
        totalPosts > 0
            ? Math.round(
                  (allPosts.filter(
                      (p) => p.status === 'approved' || p.status === 'published' || p.status === 'scheduled',
                  ).length /
                      totalPosts) *
                      100,
              )
            : 0;

    if (loading) {
        return (
            <>
                <PageHeader title="Analytics" subtitle="Campaign and content performance" />
                <div className="py-16 text-center text-sm text-muted">Loading…</div>
            </>
        );
    }

    return (
        <>
            <PageHeader title="Analytics" subtitle="Campaign and content performance" />

            {error && (
                <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* Key metrics */}
            <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label="Total posts" value={totalPosts} />
                <StatCard label="Pending review" value={pendingReview} sub="need attention" />
                <StatCard label="Published" value={published} />
                <StatCard label="Approval rate" value={`${approvalRate}%`} sub="approved / scheduled / published" />
            </div>

            {/* Pipeline + Campaign status */}
            <div className="mb-6 grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2">
                    <SectionCard title="Publishing pipeline">
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={pipelineData} layout="vertical" margin={{ left: 16, right: 24, top: 4, bottom: 4 }}>
                                <XAxis type="number" hide />
                                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12, fill: '#6b7280' }} />
                                <Tooltip
                                    cursor={{ fill: '#f5f0eb' }}
                                    content={({ active, payload }) =>
                                        active && payload?.[0] ? (
                                            <div className="rounded-lg border border-warm-200 bg-white px-3 py-2 text-xs shadow">
                                                <span className="font-semibold">{payload[0].payload.name}:</span>{' '}
                                                {payload[0].value} posts
                                            </div>
                                        ) : null
                                    }
                                />
                                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                                    {pipelineData.map((entry) => (
                                        <Cell key={entry.status} fill={STATUS_COLOURS[entry.status] ?? '#9ca3af'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </SectionCard>
                </div>

                <SectionCard title="Campaigns by status">
                    {campaignStatusData.length === 0 ? (
                        <p className="text-sm text-muted">No campaigns yet.</p>
                    ) : (
                        <>
                            <ResponsiveContainer width="100%" height={180}>
                                <PieChart>
                                    <Pie
                                        data={campaignStatusData}
                                        dataKey="value"
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={50}
                                        outerRadius={80}
                                        paddingAngle={3}
                                    >
                                        {campaignStatusData.map((entry) => (
                                            <Cell key={entry.status} fill={STATUS_COLOURS[entry.status] ?? '#9ca3af'} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        content={({ active, payload }) =>
                                            active && payload?.[0] ? (
                                                <div className="rounded-lg border border-warm-200 bg-white px-3 py-2 text-xs shadow">
                                                    <span className="font-semibold">{payload[0].payload.name}:</span>{' '}
                                                    {payload[0].value}
                                                </div>
                                            ) : null
                                        }
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                            <ul className="mt-2 space-y-1">
                                {campaignStatusData.map((entry) => (
                                    <li key={entry.status} className="flex items-center justify-between text-xs">
                                        <span className="flex items-center gap-1.5">
                                            <span
                                                className="h-2 w-2 rounded-full"
                                                style={{ background: STATUS_COLOURS[entry.status] ?? '#9ca3af' }}
                                            />
                                            {entry.name}
                                        </span>
                                        <span className="font-semibold text-charcoal">{entry.value}</span>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </SectionCard>
            </div>

            {/* Content mix */}
            <div className="mb-6 grid gap-6 lg:grid-cols-2">
                <SectionCard title="Platform split">
                    <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={platformData} margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
                            <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6b7280' }} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#6b7280' }} width={28} />
                            <Tooltip
                                cursor={{ fill: '#f5f0eb' }}
                                content={({ active, payload }) =>
                                    active && payload?.[0] ? (
                                        <div className="rounded-lg border border-warm-200 bg-white px-3 py-2 text-xs shadow">
                                            <span className="font-semibold">{payload[0].payload.name}:</span>{' '}
                                            {payload[0].value} posts
                                        </div>
                                    ) : null
                                }
                            />
                            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                                {platformData.map((entry) => (
                                    <Cell key={entry.key} fill={PLATFORM_COLOURS[entry.key] ?? '#9ca3af'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </SectionCard>

                <SectionCard title="Post type split">
                    <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={postTypeData} margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
                            <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6b7280' }} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#6b7280' }} width={28} />
                            <Tooltip
                                cursor={{ fill: '#f5f0eb' }}
                                content={({ active, payload }) =>
                                    active && payload?.[0] ? (
                                        <div className="rounded-lg border border-warm-200 bg-white px-3 py-2 text-xs shadow">
                                            <span className="font-semibold">{payload[0].payload.name}:</span>{' '}
                                            {payload[0].value} posts
                                        </div>
                                    ) : null
                                }
                            />
                            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                                {postTypeData.map((entry) => (
                                    <Cell key={entry.key} fill={TYPE_COLOURS[entry.key] ?? '#9ca3af'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </SectionCard>
            </div>

            {/* Image status + Upcoming schedule */}
            <div className="mb-6 grid gap-6 lg:grid-cols-2">
                <SectionCard title="Image status">
                    {imageStatusData.length === 0 ? (
                        <p className="text-sm text-muted">No image data yet.</p>
                    ) : (
                        <>
                            <ResponsiveContainer width="100%" height={160}>
                                <PieChart>
                                    <Pie
                                        data={imageStatusData}
                                        dataKey="value"
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={40}
                                        outerRadius={70}
                                        paddingAngle={3}
                                    >
                                        {imageStatusData.map((entry) => (
                                            <Cell key={entry.status} fill={IMAGE_COLOURS[entry.status] ?? '#9ca3af'} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        content={({ active, payload }) =>
                                            active && payload?.[0] ? (
                                                <div className="rounded-lg border border-warm-200 bg-white px-3 py-2 text-xs shadow">
                                                    <span className="font-semibold">{payload[0].payload.name}:</span>{' '}
                                                    {payload[0].value}
                                                </div>
                                            ) : null
                                        }
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                            <ul className="mt-2 space-y-1">
                                {imageStatusData.map((entry) => (
                                    <li key={entry.status} className="flex items-center justify-between text-xs">
                                        <span className="flex items-center gap-1.5">
                                            <span
                                                className="h-2 w-2 rounded-full"
                                                style={{ background: IMAGE_COLOURS[entry.status] ?? '#9ca3af' }}
                                            />
                                            {entry.name}
                                        </span>
                                        <span className="font-semibold text-charcoal">{entry.value}</span>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </SectionCard>

                <SectionCard title="Scheduled posts — next 30 days">
                    {upcomingData.length === 0 ? (
                        <p className="text-sm text-muted">No posts scheduled in the next 30 days.</p>
                    ) : (
                        <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={upcomingData} margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
                                <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#6b7280' }} />
                                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#6b7280' }} width={28} />
                                <Tooltip
                                    cursor={{ fill: '#f5f0eb' }}
                                    content={({ active, payload }) =>
                                        active && payload?.[0] ? (
                                            <div className="rounded-lg border border-warm-200 bg-white px-3 py-2 text-xs shadow">
                                                <span className="font-semibold">w/c {payload[0].payload.week}:</span>{' '}
                                                {payload[0].value} posts
                                            </div>
                                        ) : null
                                    }
                                />
                                <Bar dataKey="count" fill="#14b8a6" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </SectionCard>
            </div>

            {/* Availability signals */}
            <SectionCard title="Current availability signals">
                {Object.keys(signals).length === 0 ? (
                    <p className="text-sm text-muted">No signals recorded yet.</p>
                ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {Object.values(signals).map((s) => (
                            <div
                                key={s.serviceId}
                                className="flex items-center justify-between rounded-xl border border-warm-200 px-4 py-3"
                            >
                                <div>
                                    <p className="text-sm font-medium text-charcoal">{s.serviceName}</p>
                                    <p className="text-xs text-muted">{s.availableSlots} available slots</p>
                                </div>
                                <span
                                    className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
                                    style={{ background: SIGNAL_COLOURS[s.signal] ?? '#9ca3af' }}
                                >
                                    {s.signal}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </SectionCard>

            {/* ── Meta analytics ─────────────────────────────────────────── */}
            <div className="mt-8 mb-4 flex items-center justify-between">
                <div>
                    <h2 className="text-base font-bold text-charcoal">Social media performance</h2>
                    <p className="text-xs text-muted">Live data from Meta Graph API</p>
                </div>
                {meta?.configured && (
                    <div className="flex items-center gap-3">
                        {meta.fetchedAt && (
                            <span className="text-xs text-muted">
                                Updated {new Date(meta.fetchedAt).toLocaleTimeString()}
                            </span>
                        )}
                        <button
                            onClick={() => void handleMetaRefresh()}
                            disabled={metaRefreshing}
                            className="rounded-lg border border-warm-200 bg-white px-3 py-1.5 text-xs font-semibold text-charcoal transition hover:bg-warm-100 disabled:opacity-50"
                        >
                            {metaRefreshing ? 'Refreshing…' : 'Refresh'}
                        </button>
                    </div>
                )}
            </div>

            {!meta || !meta.configured ? (
                <div className="rounded-2xl border border-dashed border-warm-200 bg-white px-8 py-12 text-center shadow-sm">
                    <p className="text-sm font-semibold text-charcoal">Meta analytics not connected</p>
                    <p className="mt-1 text-xs text-muted max-w-sm mx-auto">
                        Add <code className="rounded bg-warm-100 px-1 py-0.5">META_ACCESS_TOKEN</code>,{' '}
                        <code className="rounded bg-warm-100 px-1 py-0.5">META_PAGE_ID</code>, and{' '}
                        <code className="rounded bg-warm-100 px-1 py-0.5">META_IG_USER_ID</code> to your{' '}
                        <code className="rounded bg-warm-100 px-1 py-0.5">.env</code> to enable real social metrics.
                    </p>
                </div>
            ) : (
                <>
                    {/* Instagram */}
                    {meta.instagram && (
                        <>
                            <div className="mb-4 flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-[#e1306c]" />
                                <h3 className="text-sm font-semibold text-charcoal">Instagram — @{meta.instagram.account.username}</h3>
                            </div>

                            <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-2">
                                <StatCard label="Followers" value={meta.instagram.account.followersCount.toLocaleString()} />
                                <StatCard label="Total posts" value={meta.instagram.account.mediaCount.toLocaleString()} />
                            </div>

                            <div className="mb-8">
                                <SectionCard title="Top Instagram posts by interactions">
                                    {meta.instagram.recentPosts.length === 0 ? (
                                        <p className="text-sm text-muted">No posts found.</p>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="w-full border-collapse text-sm">
                                                <thead>
                                                    <tr className="border-b border-warm-200 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                                                        <th className="pb-3 pr-4">Caption</th>
                                                        <th className="pb-3 pr-4">Type</th>
                                                        <th className="pb-3 pr-4 text-right">Views</th>
                                                        <th className="pb-3 pr-4 text-right">Reach</th>
                                                        <th className="pb-3 pr-4 text-right">Likes</th>
                                                        <th className="pb-3 pr-4 text-right">Comments</th>
                                                        <th className="pb-3 pr-4 text-right">Saves</th>
                                                        <th className="pb-3 pr-4 text-right">Shares</th>
                                                        <th className="pb-3 text-right">Interactions</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-warm-200">
                                                    {meta.instagram.recentPosts.map((p) => (
                                                        <tr key={p.id} className="hover:bg-warm-100">
                                                            <td className="py-3 pr-4">
                                                                <a
                                                                    href={p.permalink}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="block max-w-xs truncate text-teal-700 hover:underline"
                                                                >
                                                                    {p.caption.slice(0, 80) || '(no caption)'}
                                                                </a>
                                                                <span className="text-xs text-muted">
                                                                    {new Date(p.timestamp).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                                                                </span>
                                                            </td>
                                                            <td className="py-3 pr-4">
                                                                <span className="rounded-full bg-warm-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                                                                    {p.mediaType}
                                                                </span>
                                                            </td>
                                                            <td className="py-3 pr-4 text-right text-charcoal">{p.views.toLocaleString()}</td>
                                                            <td className="py-3 pr-4 text-right text-charcoal">{p.reach.toLocaleString()}</td>
                                                            <td className="py-3 pr-4 text-right text-charcoal">{p.likeCount.toLocaleString()}</td>
                                                            <td className="py-3 pr-4 text-right text-charcoal">{p.commentsCount.toLocaleString()}</td>
                                                            <td className="py-3 pr-4 text-right text-charcoal">{p.saved.toLocaleString()}</td>
                                                            <td className="py-3 pr-4 text-right text-charcoal">{p.shares.toLocaleString()}</td>
                                                            <td className="py-3 text-right font-semibold text-teal-700">{p.totalInteractions.toLocaleString()}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </SectionCard>
                            </div>
                        </>
                    )}

                    {/* Facebook */}
                    {meta.facebook && (
                        <>
                            <div className="mb-4 flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-[#1877f2]" />
                                <h3 className="text-sm font-semibold text-charcoal">Facebook — {meta.facebook.page.name}</h3>
                            </div>

                            <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-2">
                                <StatCard label="Page likes" value={meta.facebook.page.fanCount.toLocaleString()} />
                            </div>

                            {meta.facebook.page.series.length > 0 && (
                                <FbInsightsCharts
                                    series={meta.facebook.page.series}
                                    metrics={meta.facebook.page.metrics}
                                />
                            )}
                        </>
                    )}
                </>
            )}
        </>
    );
}
