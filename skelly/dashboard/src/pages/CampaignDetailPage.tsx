import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { type Campaign, approveCampaign, getCampaign, rejectCampaign } from '../api/appApi';
import Badge from '../components/Badge';
import PageHeader from '../components/PageHeader';
import PostPreview from '../components/PostPreview';

export default function CampaignDetailPage() {
    const { id } = useParams<{ id: string }>();
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [loading, setLoading] = useState(true);
    const [acting, setActing] = useState<'approving' | 'rejecting' | null>(null);
    const [notes, setNotes] = useState('');
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
                title={campaign.title}
                subtitle={`${campaign.posts.length} post${campaign.posts.length !== 1 ? 's' : ''}`}
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

            {/* Posts */}
            <div className="flex flex-wrap gap-6">
                {campaign.posts.map((post) => (
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
            </div>
        </>
    );
}
