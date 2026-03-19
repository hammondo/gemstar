import { Activity, FileText, Megaphone, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { type BodyspaceStatus, type Campaign, getCampaigns, getBodyspaceStatus } from '../api/appApi';
import Badge from '../components/Badge';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';

export default function DashboardPage() {
    const [bsStatus, setBsStatus] = useState<BodyspaceStatus | null>(null);
    const [recent, setRecent] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        Promise.all([getBodyspaceStatus(), getCampaigns()])
            .then(([status, { campaigns }]) => {
                setBsStatus(status);
                setRecent(campaigns.slice(0, 5));
            })
            .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
            .finally(() => setLoading(false));
    }, []);

    const counts = bsStatus?.counts;

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
        </>
    );
}
