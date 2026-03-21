import { Activity, FileText, Megaphone, TrendingUp } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { type BodyspaceStatus, type Campaign, type SocialPost, getCampaigns, getBodyspaceStatus } from '../api/appApi';
import Badge from '../components/Badge';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';

export default function DashboardPage() {
    const [bsStatus, setBsStatus] = useState<BodyspaceStatus | null>(null);
    const [recent, setRecent] = useState<Campaign[]>([]);
    const [allCampaigns, setAllCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        Promise.all([getBodyspaceStatus(), getCampaigns()])
            .then(([status, { campaigns }]) => {
                setBsStatus(status);
                setRecent(campaigns.slice(0, 5));
                setAllCampaigns(campaigns);
            })
            .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
            .finally(() => setLoading(false));
    }, []);

    const counts = bsStatus?.counts;

    const scheduledQueue = useMemo(() => {
        const posts: SocialPost[] = [];
        for (const c of allCampaigns) {
            for (const p of c.posts) {
                if (p.scheduledFor && (p.status === 'scheduled' || p.status === 'approved')) {
                    posts.push(p);
                }
            }
        }
        return posts
            .sort((a, b) => new Date(a.scheduledFor!).getTime() - new Date(b.scheduledFor!).getTime())
            .slice(0, 8);
    }, [allCampaigns]);

    return (
        <>
            <PageHeader title="Dashboard" subtitle="Overview of your marketing automation" />

            {error && (
                <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* Stat cards */}
            <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    label="Total campaigns"
                    value={loading ? '—' : (counts?.totalCampaigns ?? 0)}
                    icon={Megaphone}
                />
                <StatCard
                    label="Approved"
                    value={loading ? '—' : (counts?.approvedCampaigns ?? 0)}
                    icon={TrendingUp}
                    accent
                />
                <StatCard
                    label="Pending review"
                    value={loading ? '—' : (counts?.pendingReviewCampaigns ?? 0)}
                    icon={Activity}
                />
                <StatCard
                    label="Posts published"
                    value={loading ? '—' : (counts?.publishedPosts ?? 0)}
                    icon={FileText}
                />
            </div>

            <div className="mb-8 grid gap-6 lg:grid-cols-2">
            {/* Recent campaigns */}
            <section className="rounded-2xl border border-warm-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-warm-200 px-6 py-4">
                    <h2 className="text-sm font-semibold text-charcoal">Recent campaigns</h2>
                    <Link
                        to="/campaigns"
                        className="text-xs font-semibold text-teal-700 hover:text-teal-400 transition-colors"
                    >
                        View all →
                    </Link>
                </div>

                {loading ? (
                    <div className="px-6 py-10 text-center text-sm text-muted">Loading…</div>
                ) : recent.length === 0 ? (
                    <div className="px-6 py-10 text-center text-sm text-muted">No campaigns yet.</div>
                ) : (
                    <ul className="divide-y divide-warm-200">
                        {recent.map((c) => (
                            <li key={c.id}>
                                <Link
                                    to={`/campaigns/${c.id}`}
                                    className="flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-warm-100"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-charcoal">{c.title}</p>
                                        <p className="mt-0.5 text-xs text-muted">
                                            {c.posts.length} post{c.posts.length !== 1 ? 's' : ''} ·{' '}
                                            {new Date(c.createdAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <Badge value={c.status} />
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* Scheduled queue */}
            <section className="rounded-2xl border border-warm-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-warm-200 px-6 py-4">
                    <h2 className="text-sm font-semibold text-charcoal">Scheduled queue</h2>
                    <Link
                        to="/posts"
                        className="text-xs font-semibold text-teal-700 hover:text-teal-400 transition-colors"
                    >
                        View all →
                    </Link>
                </div>

                {loading ? (
                    <div className="px-6 py-10 text-center text-sm text-muted">Loading…</div>
                ) : scheduledQueue.length === 0 ? (
                    <div className="px-6 py-10 text-center text-sm text-muted">No scheduled posts.</div>
                ) : (
                    <ul className="divide-y divide-warm-200">
                        {scheduledQueue.map((p) => (
                            <li key={p.id}>
                                <Link
                                    to={`/posts/${p.id}`}
                                    className="flex items-center gap-3 px-6 py-3.5 transition-colors hover:bg-warm-100"
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-xs text-charcoal leading-relaxed">
                                            {(p.ownerEdit ?? p.copy).slice(0, 80)}…
                                        </p>
                                        <div className="mt-1 flex items-center gap-1.5">
                                            <span className="rounded-full bg-warm-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-teal-700">
                                                {p.platform}
                                            </span>
                                            <Badge value={p.status} />
                                        </div>
                                    </div>
                                    <span className="shrink-0 text-xs text-muted">
                                        {new Date(p.scheduledFor!).toLocaleDateString('en-AU', {
                                            day: 'numeric',
                                            month: 'short',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        })}
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
            </div>
        </>
    );
}
