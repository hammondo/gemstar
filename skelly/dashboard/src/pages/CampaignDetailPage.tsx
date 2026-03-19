import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { type Campaign, approveCampaign, getCampaign, rejectCampaign } from '../api/appApi';
import Badge from '../components/Badge';
import PageHeader from '../components/PageHeader';

export default function CampaignDetailPage() {
    const { id } = useParams<{ id: string }>();
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [loading, setLoading] = useState(true);
    const [acting, setActing] = useState<'approving' | 'rejecting' | null>(null);
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
            await approveCampaign(id);
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

            {/* Posts grid */}
            <div className="grid gap-4 md:grid-cols-2">
                {campaign.posts.map((post) => (
                    <div key={post.id} className="rounded-2xl border border-warm-200 bg-white p-5 shadow-sm">
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <span className="rounded-full bg-warm-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-teal-700">
                                    {post.platform}
                                </span>
                                <span className="rounded-full bg-warm-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                                    {post.postType}
                                </span>
                            </div>
                            <Badge value={post.status} />
                        </div>

                        {post.imageUrl && (
                            <img
                                src={post.imageUrl}
                                alt="Post visual"
                                className="mb-3 h-40 w-full rounded-xl object-cover"
                            />
                        )}

                        <p className="text-sm leading-relaxed text-charcoal">{post.copy}</p>
                    </div>
                ))}
            </div>
        </>
    );
}
