import { useRef, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
    type SocialPost,
    approvePost,
    approvePostImage,
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
    const [acting, setActing] = useState<'approving' | 'rejecting' | null>(null);
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
            navigate(post?.campaignId ? `/campaigns/${post.campaignId}` : '/posts');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to approve');
            setActing(null);
        }
    }

    async function handleImageGenerate() {
        if (!id || !post) return;
        setImageActing('generating');
        setImageError(null);
        try {
            let result;
            if (imageRefFile) {
                result = await regeneratePostImageWithFile(post.id, post.campaignId ?? '', {
                    feedback: imageFeedback || undefined,
                    file: imageRefFile,
                });
            } else {
                result = await regeneratePostImage(post.id, post.campaignId ?? '', {
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
            navigate(post?.campaignId ? `/campaigns/${post.campaignId}` : '/posts');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to reject');
            setActing(null);
        }
    }

    if (loading) {
        return (
            <>
                <PageHeader title="Post" />
                <div className="py-12 text-center text-sm text-muted">Loading…</div>
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
                    canEdit ? (
                        <>
                            <button
                                onClick={() => void handleReject()}
                                disabled={!!acting}
                                className="rounded-lg border border-warm-200 bg-white px-4 py-2 text-sm font-semibold text-muted transition hover:border-red-300 hover:text-red-600 disabled:opacity-50"
                            >
                                {acting === 'rejecting' ? 'Rejecting…' : 'Reject'}
                            </button>
                            <button
                                onClick={() => void handleSave()}
                                disabled={saving || !!acting}
                                className="rounded-lg border border-warm-200 bg-white px-4 py-2 text-sm font-semibold text-charcoal transition hover:bg-warm-100 disabled:opacity-50"
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
                    ) : undefined
                }
            />

            {error && (
                <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="mb-4 flex items-center gap-3">
                <Link
                    to={post.campaignId ? `/campaigns/${post.campaignId}` : '/posts'}
                    className="text-xs font-semibold text-teal-700 hover:text-teal-400"
                >
                    ← Back
                </Link>
                <Badge value={post.status} />
                <span className="rounded-full bg-warm-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-teal-700">
                    {post.platform}
                </span>
                <span className="rounded-full bg-warm-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                    {post.postType}
                </span>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                {/* Left column: copy, schedule, preview */}
                <div className="space-y-5">
                    <div className="rounded-2xl border border-warm-200 bg-white p-6 shadow-sm">
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted">
                            Post copy
                        </label>
                        <textarea
                            value={copy}
                            onChange={(e) => setCopy(e.target.value)}
                            disabled={!canEdit}
                            rows={10}
                            className="w-full resize-none rounded-xl border border-warm-200 bg-warm-100 p-3 text-sm leading-relaxed text-charcoal focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400 disabled:opacity-60"
                        />
                        {post.ownerEdit && post.ownerEdit !== post.copy && (
                            <p className="mt-2 text-xs text-muted">
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

                    <div className="rounded-2xl border border-warm-200 bg-white p-6 shadow-sm">
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted">
                            Scheduled date &amp; time
                        </label>
                        <input
                            type="datetime-local"
                            value={scheduledFor}
                            onChange={(e) => setScheduledFor(e.target.value)}
                            disabled={!canEdit}
                            className="w-full rounded-xl border border-warm-200 bg-warm-100 px-3 py-2 text-sm text-charcoal focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400 disabled:opacity-60"
                        />
                    </div>

                    <div className="rounded-2xl border border-warm-200 bg-white p-5 shadow-sm">
                        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted">Live preview</p>
                        <div className="flex justify-center">
                            <PostPreview post={{ ...post, ownerEdit: copy }} />
                        </div>
                    </div>
                </div>

                {/* Right column: image, details */}
                <div className="space-y-5">
                    {/* Image panel */}
                    <div className="rounded-2xl border border-warm-200 bg-white p-6 shadow-sm">
                        <div className="mb-4 flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Image</p>
                            {post.imageStatus && (
                                <Badge value={post.imageStatus} />
                            )}
                        </div>

                        {post.imageUrl && (
                            <img
                                src={post.imageUrl}
                                alt="Post image"
                                className="mb-4 w-full rounded-xl border border-warm-200 object-cover"
                            />
                        )}

                        {imageError && (
                            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                                {imageError}
                            </p>
                        )}

                        {/* Upload your own image */}
                        <div className="mb-4 space-y-2">
                            <p className="text-xs font-medium text-muted">Upload your own image</p>
                            <div className="flex items-center gap-2">
                                <label className="cursor-pointer rounded-lg border border-warm-200 bg-warm-50 px-3 py-1.5 text-xs font-medium text-charcoal transition hover:bg-warm-100">
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
                                            onClick={() => { setImageUploadFile(null); if (uploadInputRef.current) uploadInputRef.current.value = ''; }}
                                            className="text-xs text-muted hover:text-charcoal"
                                        >
                                            Remove
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="mb-4 border-t border-warm-100" />

                        {/* AI generation */}
                        <div className="space-y-3">
                            <p className="text-xs font-medium text-muted">AI generation</p>
                            <div>
                                <label className="mb-1 block text-xs text-muted">Feedback</label>
                                <textarea
                                    value={imageFeedback}
                                    onChange={(e) => setImageFeedback(e.target.value)}
                                    placeholder="e.g. Make it warmer, more inviting…"
                                    rows={2}
                                    className="w-full resize-none rounded-xl border border-warm-200 bg-warm-100 px-3 py-2 text-xs text-charcoal placeholder:text-muted focus:border-teal-400 focus:outline-none"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-xs text-muted">Reference image URL</label>
                                <input
                                    type="url"
                                    value={imageRefUrl}
                                    onChange={(e) => { setImageRefUrl(e.target.value); setImageRefFile(null); }}
                                    placeholder="https://…"
                                    className="w-full rounded-xl border border-warm-200 bg-warm-100 px-3 py-2 text-xs text-charcoal placeholder:text-muted focus:border-teal-400 focus:outline-none"
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <label className="cursor-pointer rounded-lg border border-warm-200 bg-warm-50 px-3 py-1.5 text-xs font-medium text-charcoal transition hover:bg-warm-100">
                                    {imageRefFile ? imageRefFile.name : 'Or upload reference'}
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="sr-only"
                                        onChange={(e) => { setImageRefFile(e.target.files?.[0] ?? null); setImageRefUrl(''); }}
                                    />
                                </label>
                                {imageRefFile && (
                                    <button onClick={() => { setImageRefFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="text-xs text-muted hover:text-charcoal">
                                        Remove
                                    </button>
                                )}
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={() => void handleImageGenerate()}
                                    disabled={!!imageActing}
                                    className="flex-1 rounded-lg bg-teal-400 px-3 py-2 text-xs font-semibold text-charcoal transition hover:brightness-110 disabled:opacity-50"
                                >
                                    {imageActing === 'generating' ? 'Generating…' : post.imageUrl ? 'Regenerate' : 'Generate'}
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

                    <div className="rounded-2xl border border-warm-200 bg-white p-6 shadow-sm">
                        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Details</p>
                        <dl className="space-y-2 text-sm">
                            {post.hashtags?.length > 0 && (
                                <div>
                                    <dt className="text-xs text-muted">Hashtags</dt>
                                    <dd className="mt-0.5 text-charcoal">{post.hashtags.join(' ')}</dd>
                                </div>
                            )}
                            {post.callToAction && (
                                <div>
                                    <dt className="text-xs text-muted">Call to action</dt>
                                    <dd className="mt-0.5 text-charcoal">{post.callToAction}</dd>
                                </div>
                            )}
                            {post.contentPillar && (
                                <div>
                                    <dt className="text-xs text-muted">Content pillar</dt>
                                    <dd className="mt-0.5 capitalize text-charcoal">{post.contentPillar.replace(/_/g, ' ')}</dd>
                                </div>
                            )}
                            {post.imageDirection && (
                                <div>
                                    <dt className="text-xs text-muted">Image direction</dt>
                                    <dd className="mt-0.5 text-charcoal">{post.imageDirection}</dd>
                                </div>
                            )}
                            {post.rejectionReason && (
                                <div>
                                    <dt className="text-xs text-muted">Rejection reason</dt>
                                    <dd className="mt-0.5 text-red-600">{post.rejectionReason}</dd>
                                </div>
                            )}
                            <div>
                                <dt className="text-xs text-muted">Created</dt>
                                <dd className="mt-0.5 text-charcoal">{new Date(post.createdAt).toLocaleString()}</dd>
                            </div>
                            {post.publishedAt && (
                                <div>
                                    <dt className="text-xs text-muted">Published</dt>
                                    <dd className="mt-0.5 text-charcoal">{new Date(post.publishedAt).toLocaleString()}</dd>
                                </div>
                            )}
                        </dl>
                    </div>
                </div>
            </div>
        </>
    );
}
