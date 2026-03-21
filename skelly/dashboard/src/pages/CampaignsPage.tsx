import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { type Campaign, type CampaignStatus, getCampaigns } from '../api/appApi';
import { Wand2 } from 'lucide-react';
import Badge from '../components/Badge';
import PageHeader from '../components/PageHeader';

const ALL_STATUSES: { value: CampaignStatus | 'all'; label: string }[] = [
    { value: 'all',            label: 'All' },
    { value: 'pending_review', label: 'Pending review' },
    { value: 'approved',       label: 'Approved' },
    { value: 'scheduled',      label: 'Scheduled' },
    { value: 'published',      label: 'Published' },
    { value: 'rejected',       label: 'Rejected' },
];

export default function CampaignsPage() {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [filter, setFilter] = useState<CampaignStatus | 'all'>('all');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        getCampaigns(filter === 'all' ? undefined : filter)
            .then(({ campaigns: data }) => setCampaigns(data))
            .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
            .finally(() => setLoading(false));
    }, [filter]);

    return (
        <>
            <PageHeader
                title="Campaigns"
                subtitle={`${campaigns.length} campaign${campaigns.length !== 1 ? 's' : ''}`}
                actions={
                    <Link
                        to="/campaigns/new"
                        className="flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-600"
                    >
                        <Wand2 size={15} />
                        New Campaign
                    </Link>
                }
            />

            {error && (
                <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* Filter tabs */}
            <div className="mb-5 flex flex-wrap gap-1.5">
                {ALL_STATUSES.map(({ value, label }) => (
                    <button
                        key={value}
                        onClick={() => setFilter(value)}
                        className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                            filter === value
                                ? 'bg-teal-700 text-white'
                                : 'bg-white border border-warm-200 text-muted hover:border-teal-400 hover:text-teal-700'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* Table */}
            <div className="rounded-2xl border border-warm-200 bg-white shadow-sm overflow-hidden">
                {loading ? (
                    <div className="px-6 py-12 text-center text-sm text-muted">Loading…</div>
                ) : campaigns.length === 0 ? (
                    <div className="px-6 py-12 text-center text-sm text-muted">No campaigns found.</div>
                ) : (
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-warm-200 bg-warm-100 text-left text-xs font-semibold tracking-wider text-muted uppercase">
                                <th className="px-5 py-3">Campaign</th>
                                <th className="px-5 py-3">Posts</th>
                                <th className="px-5 py-3">Status</th>
                                <th className="px-5 py-3">Created</th>
                                <th className="px-5 py-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-warm-200">
                            {campaigns.map((c) => (
                                <tr key={c.id} className="group hover:bg-warm-100 transition-colors">
                                    <td className="px-5 py-3.5 font-medium text-charcoal">{c.title}</td>
                                    <td className="px-5 py-3.5 text-muted">{c.posts.length}</td>
                                    <td className="px-5 py-3.5">
                                        <Badge value={c.status} />
                                    </td>
                                    <td className="px-5 py-3.5 text-muted">
                                        {new Date(c.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="px-5 py-3.5 text-right">
                                        <Link
                                            to={`/campaigns/${c.id}`}
                                            className="text-xs font-semibold text-teal-700 opacity-0 transition group-hover:opacity-100 hover:text-teal-400"
                                        >
                                            View →
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </>
    );
}
