import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { type Campaign, type PostStatus, approveCampaign, getCampaign, rejectCampaign } from '../api/appApi';
import Badge from '../components/Badge';
import PageHeader from '../components/PageHeader';
import PostPreview from '../components/PostPreview';

export default function CampaignDetailPage() {
    const { id } = useParams<{ id: string }>();
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [loading, setLoading] = useState(true);
    const [acting, setActing] = useState<'approving' | 'rejecting' | null>(null);
    const [notes, setNotes] = useState('');
    const [filter, setFilter] = useState<PostStatus | 'all'>('all');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        getCampaign(id)
            .then(({ campaign: c }) => setCampaign(c))
            .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
            .finally(() => setLoading(false));
    }, [id]);

    async function handleApprove() {
        if (!id) return;
        setActing('approving');
        try {
            await approveCampaign(id, notes.trim() || undefined);
            const { campaign: c } = await getCampaign(id);
            setCampaign(c);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to approve');
        } finally {
            setActing(null);
        }
    }

    async function handleReject() {
        if (!id) return;
        setActing('rejecting');
        try {
            await rejectCampaign(id);
            const { campaign: c } = await getCampaign(id);
            setCampaign(c);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to reject');
        } finally {
            setActing(null);
        }
    }

    const statusCounts = useMemo(() => {
        const counts: Partial<Record<PostStatus, number>> = {};
        for (const p of campaign?.posts ?? []) {
            counts[p.status] = (counts[p.status] ?? 0) + 1;
        }
        return counts;
    }, [campaign?.posts]);

    const presentStatuses = useMemo(
        () => (Object.keys(statusCounts) as PostStatus[]).sort(),
        [statusCounts],
    );

    const visiblePosts = useMemo(
        () => (filter === 'all' ? campaign?.posts ?? [] : (campaign?.posts ?? []).filter((p) => p.status === filter)),
        [campaign?.posts, filter],
    );

    if (loading) {
        return (
            <>
                <PageHeader title="Campaign" />
                <div className="py-12 text-center text-sm text-muted">Loading…</div>
            </>
        );
    }

    if (!campaign) {
        return (
            <>
                <PageHeader title="Campaign" />
                <div className="py-12 text-center text-sm text-red-600">{error ?? 'Campaign not found.'}</div>
            </>
        );
    }

    const canAct = campaign.status === 'pending_review' && !acting;

    return (
        <>
            <PageHeader
                title={campaign.name}
                subtitle={
                    filter === 'all'
                        ? `${campaign.posts.length} post${campaign.posts.length !== 1 ? 's' : ''}`
                        : `${visiblePosts.length} of ${campaign.posts.length} posts · ${filter.replace(/_/g, ' ')}`
                }
                actions={
                    canAct ? (
                        <>
                            <button
                                onClick={() => void handleReject()}
                                disabled={!!acting}
                                className="rounded-lg border border-warm-200 bg-white px-4 py-2 text-sm font-semibold text-muted transition hover:border-red-300 hover:text-red-600 disabled:opacity-50"
                            >
                                Reject
                            </button>
                            <button
                                onClick={() => void handleApprove()}
                                disabled={!!acting}
                                className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-600 disabled:opacity-50"
                            >
                                {acting === 'approving' ? 'Approving…' : 'Approve'}
                            </button>
                        </>
                    ) : undefined
                }
            />

            {error && (
                <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="mb-4 flex items-center gap-3">
                <Link to="/campaigns" className="text-xs font-semibold text-teal-700 hover:text-teal-400">
                    ← Campaigns
                </Link>
                <Badge value={campaign.status} />
            </div>

            {/* Approval notes */}
            {campaign.status === 'pending_review' && (
                <div className="mb-6 rounded-2xl border border-warm-200 bg-white p-5 shadow-sm">
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
                        Approval notes <span className="normal-case font-normal">(optional)</span>
                    </label>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Any instructions or context for the campaign…"
                        rows={3}
                        className="w-full resize-none rounded-xl border border-warm-200 bg-warm-50 px-3 py-2 text-sm text-charcoal placeholder:text-muted focus:border-teal-400 focus:outline-none"
                    />
                </div>
            )}

            {/* Campaign metadata */}
            {(campaign.description || campaign.theme || campaign.ownerNotes) && (
                <div className="mb-6 rounded-2xl border border-warm-200 bg-white p-5 shadow-sm">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Campaign details</p>
                    <dl className="space-y-2 text-sm">
                        {campaign.description && (
                            <div>
                                <dt className="text-xs text-muted">Description</dt>
                                <dd className="mt-0.5 text-charcoal">{campaign.description}</dd>
                            </div>
                        )}
                        {campaign.theme && (
                            <div>
                                <dt className="text-xs text-muted">Theme</dt>
                                <dd className="mt-0.5 text-charcoal">{campaign.theme}</dd>
                            </div>
                        )}
                        {campaign.targetServices && campaign.targetServices.length > 0 && (
                            <div>
                                <dt className="text-xs text-muted">Target services</dt>
                                <dd className="mt-0.5 text-charcoal">{campaign.targetServices.join(', ')}</dd>
                            </div>
                        )}
                        {campaign.ownerNotes && (
                            <div>
                                <dt className="text-xs text-muted">Owner notes</dt>
                                <dd className="mt-0.5 text-charcoal">{campaign.ownerNotes}</dd>
                            </div>
                        )}
                    </dl>
                </div>
            )}

            {/* Post filters */}
            {presentStatuses.length > 1 && (
                <div className="mb-5 flex flex-wrap gap-1.5">
                    <button
                        onClick={() => setFilter('all')}
                        className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                            filter === 'all'
                                ? 'bg-teal-700 text-white'
                                : 'border border-warm-200 bg-white text-muted hover:border-teal-400 hover:text-teal-700'
                        }`}
                    >
                        All <span className="ml-1 opacity-70">{campaign.posts.length}</span>
                    </button>
                    {presentStatuses.map((s) => (
                        <button
                            key={s}
                            onClick={() => setFilter(s)}
                            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold capitalize transition-colors ${
                                filter === s
                                    ? 'bg-teal-700 text-white'
                                    : 'border border-warm-200 bg-white text-muted hover:border-teal-400 hover:text-teal-700'
                            }`}
                        >
                            {s.replace(/_/g, ' ')}{' '}
                            <span className="ml-1 opacity-70">{statusCounts[s]}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Posts */}
            <div className="flex flex-wrap gap-6">
                {visiblePosts.map((post) => (
                    <Link
                        key={post.id}
                        to={`/posts/${post.id}`}
                        className="group relative block shrink-0 transition"
                    >
                        <div className="transition group-hover:opacity-90 group-hover:ring-2 group-hover:ring-teal-400 group-hover:ring-offset-2 rounded-2xl">
                            <PostPreview post={post} />
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <span className="rounded-full bg-warm-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-teal-700">
                                {post.platform}
                            </span>
                            <span className="rounded-full bg-warm-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                                {post.postType}
                            </span>
                            <Badge value={post.status} />
                            {post.scheduledFor && (
                                <span className="text-xs text-muted">
                                    {new Date(post.scheduledFor).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                                </span>
                            )}
                        </div>
                    </Link>
                ))}
                {visiblePosts.length === 0 && (
                    <p className="py-8 text-sm text-muted">No posts with this status.</p>
                )}
            </div>
        </>
    );
}
