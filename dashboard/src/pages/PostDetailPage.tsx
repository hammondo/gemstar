import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
    type SocialPost,
    approvePost,
    approvePostImage,
    clonePost,
    getPost,
    regeneratePostImage,
    regeneratePostImageWithFile,
    rejectPost,
    updatePost,
    uploadPostImage,
} from '../api/appApi';
import Badge from '../components/Badge';
import PageHeader from '../components/PageHeader';
import PostPreview from '../components/PostPreview';

export default function PostDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [post, setPost] = useState<SocialPost | null>(null);
    const [copy, setCopy] = useState('');
    const [scheduledFor, setScheduledFor] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [acting, setActing] = useState<'approving' | 'rejecting' | 'cloning' | null>(null);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [imageFeedback, setImageFeedback] = useState('');
    const [imageRefUrl, setImageRefUrl] = useState('');
    const [imageRefFile, setImageRefFile] = useState<File | null>(null);
    const [imageActing, setImageActing] = useState<'generating' | 'approving' | 'uploading' | null>(null);
    const [imageError, setImageError] = useState<string | null>(null);
    const [imageUploadFile, setImageUploadFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const uploadInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!id) return;
        getPost(id)
            .then(({ post: p }) => {
                setPost(p);
                setCopy(p.ownerEdit ?? p.copy);
                setScheduledFor(p.scheduledFor ? toDatetimeLocal(p.scheduledFor) : '');
            })
            .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
            .finally(() => setLoading(false));
    }, [id]);

    function toDatetimeLocal(iso: string): string {
        // Trim seconds/ms so datetime-local input accepts the value
        return iso.slice(0, 16);
    }

    async function handleSave() {
        if (!id) return;
        setSaving(true);
        setSaved(false);
        try {
            const { post: p } = await updatePost(id, copy, scheduledFor ? new Date(scheduledFor).toISOString() : null);
            setPost(p);
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSaving(false);
        }
    }

    async function handleApprove() {
        if (!id) return;
        setActing('approving');
        try {
            // Save any edits first, then approve passing the current copy
            await approvePost(id, copy.trim());
            navigate(-1);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to approve');
            setActing(null);
        }
    }

    async function handleClone() {
        if (!id) return;
        setActing('cloning');
        try {
            await clonePost(id);
            navigate('/library');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to clone post');
            setActing(null);
        }
    }

    async function handleImageGenerate() {
        if (!id || !post) return;
        setImageActing('generating');
        setImageError(null);
        const campaignId = post.campaigns?.[0]?.id;
        try {
            let result;
            if (imageRefFile) {
                result = await regeneratePostImageWithFile(post.id, campaignId, {
                    feedback: imageFeedback || undefined,
                    file: imageRefFile,
                });
            } else {
                result = await regeneratePostImage(post.id, campaignId, {
                    feedback: imageFeedback || undefined,
                    referenceImageUrl: imageRefUrl || undefined,
                });
            }
            setPost(result.post);
        } catch (err) {
            setImageError(err instanceof Error ? err.message : 'Failed to generate image');
        } finally {
            setImageActing(null);
        }
    }

    async function handleImageApprove() {
        if (!id || !post) return;
        setImageActing('approving');
        setImageError(null);
        try {
            const result = await approvePostImage(post.id);
            setPost(result.post);
        } catch (err) {
            setImageError(err instanceof Error ? err.message : 'Failed to approve image');
        } finally {
            setImageActing(null);
        }
    }

    async function handleImageUpload() {
        if (!id || !imageUploadFile) return;
        setImageActing('uploading');
        setImageError(null);
        try {
            const result = await uploadPostImage(id, imageUploadFile);
            setPost(result.post);
            setImageUploadFile(null);
            if (uploadInputRef.current) uploadInputRef.current.value = '';
        } catch (err) {
            setImageError(err instanceof Error ? err.message : 'Failed to upload image');
        } finally {
            setImageActing(null);
        }
    }

    async function handleReject() {
        if (!id) return;
        setActing('rejecting');
        try {
            await rejectPost(id);
            navigate(-1);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to reject');
            setActing(null);
        }
    }

    if (loading) {
        return (
            <>
                <PageHeader title="Post" />
                <div className="text-muted py-12 text-center text-sm">Loading…</div>
            </>
        );
    }

    if (!post) {
        return (
            <>
                <PageHeader title="Post" />
                <div className="py-12 text-center text-sm text-red-600">{error ?? 'Post not found.'}</div>
            </>
        );
    }

    const canEdit = post.status === 'pending_review' || post.status === 'draft';

    return (
        <>
            <PageHeader
                title="Edit Post"
                subtitle={`${post.platform} · ${post.postType}`}
                actions={
                    <>
                        <button
                            onClick={() => void handleClone()}
                            disabled={!!acting}
                            className="border-warm-200 text-charcoal hover:bg-warm-100 rounded-lg border bg-white px-4 py-2 text-sm font-semibold transition disabled:opacity-50"
                        >
                            {acting === 'cloning' ? 'Cloning…' : 'Clone as draft'}
                        </button>
                        {canEdit && (
                            <>
                                <button
                                    onClick={() => void handleReject()}
                                    disabled={!!acting}
                                    className="border-warm-200 text-muted rounded-lg border bg-white px-4 py-2 text-sm font-semibold transition hover:border-red-300 hover:text-red-600 disabled:opacity-50"
                                >
                                    {acting === 'rejecting' ? 'Rejecting…' : 'Reject'}
                                </button>
                                <button
                                    onClick={() => void handleSave()}
                                    disabled={saving || !!acting}
                                    className="border-warm-200 text-charcoal hover:bg-warm-100 rounded-lg border bg-white px-4 py-2 text-sm font-semibold transition disabled:opacity-50"
                                >
                                    {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
                                </button>
                                <button
                                    onClick={() => void handleApprove()}
                                    disabled={!!acting || saving}
                                    className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-600 disabled:opacity-50"
                                >
                                    {acting === 'approving' ? 'Approving…' : 'Approve'}
                                </button>
                            </>
                        )}
                    </>
                }
            />

            {error && (
                <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="mb-4 flex items-center gap-3">
                <button
                    onClick={() => navigate(-1)}
                    className="text-xs font-semibold text-teal-700 hover:text-teal-400"
                >
                    ← Back
                </button>
                <Badge value={post.status} />
                <span className="bg-warm-100 rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wider text-teal-700 uppercase">
                    {post.platform}
                </span>
                <span className="bg-warm-100 text-muted rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase">
                    {post.postType}
                </span>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                {/* Left column: copy, schedule, preview */}
                <div className="space-y-5">
                    <div className="border-warm-200 rounded-2xl border bg-white p-6 shadow-sm">
                        <label className="text-muted mb-2 block text-xs font-semibold tracking-wide uppercase">
                            Post copy
                        </label>
                        <textarea
                            value={copy}
                            onChange={(e) => setCopy(e.target.value)}
                            disabled={!canEdit}
                            rows={10}
                            className="border-warm-200 bg-warm-100 text-charcoal w-full resize-none rounded-xl border p-3 text-sm leading-relaxed focus:border-teal-400 focus:ring-1 focus:ring-teal-400 focus:outline-none disabled:opacity-60"
                        />
                        {post.ownerEdit && post.ownerEdit !== post.copy && (
                            <p className="text-muted mt-2 text-xs">
                                Original AI copy:{' '}
                                <button
                                    className="text-teal-700 underline hover:text-teal-400"
                                    onClick={() => setCopy(post.copy)}
                                >
                                    restore
                                </button>
                            </p>
                        )}
                    </div>

                    <div className="border-warm-200 rounded-2xl border bg-white p-6 shadow-sm">
                        <label className="text-muted mb-2 block text-xs font-semibold tracking-wide uppercase">
                            Scheduled date &amp; time
                        </label>
                        <input
                            type="datetime-local"
                            value={scheduledFor}
                            onChange={(e) => setScheduledFor(e.target.value)}
                            disabled={!canEdit}
                            className="border-warm-200 bg-warm-100 text-charcoal w-full rounded-xl border px-3 py-2 text-sm focus:border-teal-400 focus:ring-1 focus:ring-teal-400 focus:outline-none disabled:opacity-60"
                        />
                    </div>

                    <div className="border-warm-200 rounded-2xl border bg-white p-5 shadow-sm">
                        <p className="text-muted mb-4 text-xs font-semibold tracking-wide uppercase">Live preview</p>
                        <div className="flex justify-center">
                            <PostPreview post={{ ...post, ownerEdit: copy }} />
                        </div>
                    </div>
                </div>

                {/* Right column: image, details */}
                <div className="space-y-5">
                    {/* Image panel */}
                    <div className="border-warm-200 rounded-2xl border bg-white p-6 shadow-sm">
                        <div className="mb-4 flex items-center justify-between">
                            <p className="text-muted text-xs font-semibold tracking-wide uppercase">Image</p>
                            {post.imageStatus && <Badge value={post.imageStatus} />}
                        </div>

                        {post.imageUrl && (
                            <img
                                src={post.imageUrl}
                                alt="Post image"
                                className="border-warm-200 mb-4 w-full rounded-xl border object-cover"
                            />
                        )}

                        {imageError && (
                            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                                {imageError}
                            </p>
                        )}

                        {/* Upload your own image */}
                        <div className="mb-4 space-y-2">
                            <p className="text-muted text-xs font-medium">Upload your own image</p>
                            <div className="flex items-center gap-2">
                                <label className="border-warm-200 bg-warm-50 text-charcoal hover:bg-warm-100 cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition">
                                    {imageUploadFile ? imageUploadFile.name : 'Choose image…'}
                                    <input
                                        ref={uploadInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="sr-only"
                                        onChange={(e) => setImageUploadFile(e.target.files?.[0] ?? null)}
                                    />
                                </label>
                                {imageUploadFile && (
                                    <>
                                        <button
                                            onClick={() => void handleImageUpload()}
                                            disabled={!!imageActing}
                                            className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-600 disabled:opacity-50"
                                        >
                                            {imageActing === 'uploading' ? 'Uploading…' : 'Use this image'}
                                        </button>
                                        <button
                                            onClick={() => {
                                                setImageUploadFile(null);
                                                if (uploadInputRef.current) uploadInputRef.current.value = '';
                                            }}
                                            className="text-muted hover:text-charcoal text-xs"
                                        >
                                            Remove
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="border-warm-100 mb-4 border-t" />

                        {/* AI generation */}
                        <div className="space-y-3">
                            <p className="text-muted text-xs font-medium">AI generation</p>
                            <div>
                                <label className="text-muted mb-1 block text-xs">Feedback</label>
                                <textarea
                                    value={imageFeedback}
                                    onChange={(e) => setImageFeedback(e.target.value)}
                                    placeholder="e.g. Make it warmer, more inviting…"
                                    rows={2}
                                    className="border-warm-200 bg-warm-100 text-charcoal placeholder:text-muted w-full resize-none rounded-xl border px-3 py-2 text-xs focus:border-teal-400 focus:outline-none"
                                />
                            </div>

                            <div>
                                <label className="text-muted mb-1 block text-xs">Reference image URL</label>
                                <input
                                    type="url"
                                    value={imageRefUrl}
                                    onChange={(e) => {
                                        setImageRefUrl(e.target.value);
                                        setImageRefFile(null);
                                    }}
                                    placeholder="https://…"
                                    className="border-warm-200 bg-warm-100 text-charcoal placeholder:text-muted w-full rounded-xl border px-3 py-2 text-xs focus:border-teal-400 focus:outline-none"
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <label className="border-warm-200 bg-warm-50 text-charcoal hover:bg-warm-100 cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition">
                                    {imageRefFile ? imageRefFile.name : 'Or upload reference'}
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="sr-only"
                                        onChange={(e) => {
                                            setImageRefFile(e.target.files?.[0] ?? null);
                                            setImageRefUrl('');
                                        }}
                                    />
                                </label>
                                {imageRefFile && (
                                    <button
                                        onClick={() => {
                                            setImageRefFile(null);
                                            if (fileInputRef.current) fileInputRef.current.value = '';
                                        }}
                                        className="text-muted hover:text-charcoal text-xs"
                                    >
                                        Remove
                                    </button>
                                )}
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={() => void handleImageGenerate()}
                                    disabled={!!imageActing}
                                    className="text-charcoal flex-1 rounded-lg bg-teal-400 px-3 py-2 text-xs font-semibold transition hover:brightness-110 disabled:opacity-50"
                                >
                                    {imageActing === 'generating'
                                        ? 'Generating…'
                                        : post.imageUrl
                                          ? 'Regenerate'
                                          : 'Generate'}
                                </button>
                                {post.imageStatus === 'draft' && (
                                    <button
                                        onClick={() => void handleImageApprove()}
                                        disabled={!!imageActing}
                                        className="flex-1 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-teal-600 disabled:opacity-50"
                                    >
                                        {imageActing === 'approving' ? 'Approving…' : 'Approve image'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {post.campaigns && post.campaigns.length > 0 && (
                        <div className="border-warm-200 rounded-2xl border bg-white p-6 shadow-sm">
                            <p className="text-muted mb-3 text-xs font-semibold tracking-wide uppercase">
                                Used in campaigns
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {post.campaigns.map((c) => (
                                    <Link
                                        key={c.id}
                                        to={`/campaigns/${c.id}`}
                                        className="rounded-full bg-teal-400/15 px-3 py-1 text-xs font-semibold text-teal-700 transition hover:bg-teal-400/25"
                                    >
                                        {c.name}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="border-warm-200 rounded-2xl border bg-white p-6 shadow-sm">
                        <p className="text-muted mb-3 text-xs font-semibold tracking-wide uppercase">Details</p>
                        <dl className="space-y-2 text-sm">
                            {post.hashtags?.length > 0 && (
                                <div>
                                    <dt className="text-muted text-xs">Hashtags</dt>
                                    <dd className="text-charcoal mt-0.5">{post.hashtags.join(' ')}</dd>
                                </div>
                            )}
                            {post.callToAction && (
                                <div>
                                    <dt className="text-muted text-xs">Call to action</dt>
                                    <dd className="text-charcoal mt-0.5">{post.callToAction}</dd>
                                </div>
                            )}
                            {post.contentPillar && (
                                <div>
                                    <dt className="text-muted text-xs">Content pillar</dt>
                                    <dd className="text-charcoal mt-0.5 capitalize">
                                        {post.contentPillar.replace(/_/g, ' ')}
                                    </dd>
                                </div>
                            )}
                            {post.imageDirection && (
                                <div>
                                    <dt className="text-muted text-xs">Image direction</dt>
                                    <dd className="text-charcoal mt-0.5">{post.imageDirection}</dd>
                                </div>
                            )}
                            {post.rejectionReason && (
                                <div>
                                    <dt className="text-muted text-xs">Rejection reason</dt>
                                    <dd className="mt-0.5 text-red-600">{post.rejectionReason}</dd>
                                </div>
                            )}
                            <div>
                                <dt className="text-muted text-xs">Created</dt>
                                <dd className="text-charcoal mt-0.5">{new Date(post.createdAt).toLocaleString()}</dd>
                            </div>
                            {post.publishedAt && (
                                <div>
                                    <dt className="text-muted text-xs">Published</dt>
                                    <dd className="text-charcoal mt-0.5">
                                        {new Date(post.publishedAt).toLocaleString()}
                                    </dd>
                                </div>
                            )}
                        </dl>
                    </div>
                </div>
            </div>
        </>
    );
}
