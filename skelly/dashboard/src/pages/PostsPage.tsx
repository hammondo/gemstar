import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { type Campaign, type SocialPost, getCampaigns } from '../api/appApi';
import Badge from '../components/Badge';
import PageHeader from '../components/PageHeader';

interface FlatPost extends SocialPost {
    campaignTitle: string;
}

export default function PostsPage() {
    const [posts, setPosts] = useState<FlatPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        getCampaigns()
            .then(({ campaigns }) => {
                const flat: FlatPost[] = campaigns.flatMap((c: Campaign) =>
                    c.posts.map((p) => ({ ...p, campaignTitle: c.name })),
                );
                flat.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                setPosts(flat);
            })
            .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
            .finally(() => setLoading(false));
    }, []);

    return (
        <>
            <PageHeader title="Posts" subtitle={`${posts.length} post${posts.length !== 1 ? 's' : ''} across all campaigns`} />

            {error && (
                <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="rounded-2xl border border-warm-200 bg-white shadow-sm overflow-hidden">
                {loading ? (
                    <div className="px-6 py-12 text-center text-sm text-muted">Loading…</div>
                ) : posts.length === 0 ? (
                    <div className="px-6 py-12 text-center text-sm text-muted">No posts found.</div>
                ) : (
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-warm-200 bg-warm-100 text-left text-xs font-semibold tracking-wider text-muted uppercase">
                                <th className="px-5 py-3">Campaign</th>
                                <th className="px-5 py-3">Platform</th>
                                <th className="px-5 py-3">Type</th>
                                <th className="px-5 py-3">Status</th>
                                <th className="px-5 py-3">Image</th>
                                <th className="px-5 py-3">Scheduled</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-warm-200">
                            {posts.map((post) => (
                                <tr key={post.id} className="hover:bg-warm-100 transition-colors cursor-pointer">
                                    <td className="px-5 py-3.5">
                                        <Link to={`/posts/${post.id}`} className="block">
                                            <p className="font-medium text-charcoal">{post.campaignTitle}</p>
                                            <p className="mt-0.5 max-w-xs truncate text-xs text-muted">{post.ownerEdit ?? post.copy}</p>
                                        </Link>
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <span className="rounded-full bg-warm-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-teal-700">
                                            {post.platform}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3.5 text-muted capitalize">{post.postType}</td>
                                    <td className="px-5 py-3.5">
                                        <Badge value={post.status} />
                                    </td>
                                    <td className="px-5 py-3.5">
                                        {post.imageStatus && <Badge value={post.imageStatus} />}
                                    </td>
                                    <td className="px-5 py-3.5 text-muted text-xs">
                                        {post.scheduledFor
                                            ? new Date(post.scheduledFor).toLocaleDateString()
                                            : '—'}
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
