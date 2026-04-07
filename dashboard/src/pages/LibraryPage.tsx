import { BookOpen, ImagePlus, LayoutGrid, List, RefreshCw, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    clonePost,
    getPosts,
    getServices,
    getSignals,
    schedulePost,
    streamGenerateLibraryImages,
    streamGenerateLibraryPosts,
    type LibraryProgress,
    type PostStatus,
    type ServiceAvailability,
    type ServiceInfo,
    type SocialPost,
    type VariantTag,
} from '../api/appApi';
import Badge from '../components/Badge';
import PageHeader from '../components/PageHeader';
import PostGrid from '../components/PostGrid';
import ServiceSelector from '../components/ServiceSelector';

const ALL_STATUSES: Array<PostStatus | 'all'> = [
    'all',
    'pending_review',
    'approved',
    'scheduled',
    'published',
    'rejected',
];

const VARIANT_TAGS: Array<VariantTag | 'all'> = ['all', 'promotional', 'educational', 'seasonal', 'community'];

const statusLabel: Record<string, string> = {
    all: 'All statuses',
    pending_review: 'Pending review',
    approved: 'Approved',
    scheduled: 'Scheduled',
    published: 'Published',
    rejected: 'Rejected',
};

const variantLabel: Record<string, string> = {
    all: 'All types',
    promotional: 'Promotional',
    educational: 'Educational',
    seasonal: 'Seasonal',
    community: 'Community',
};

const platformLabel: Record<string, string> = {
    instagram: 'IG',
    facebook: 'FB',
};

function GenerateProgressLog({ entries, state }: { entries: string[]; state: 'idle' | 'running' | 'done' | 'error' }) {
    const bottomRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [entries]);

    return (
        <div className="border-warm-200 bg-warm-50 mt-2 max-h-48 overflow-y-auto rounded-xl border px-4 py-3 font-mono text-xs">
            {entries.map((line, i) => (
                <p key={i} className="text-muted leading-relaxed">
                    {line}
                </p>
            ))}
            {state === 'running' && <p className="animate-pulse text-teal-700">Running…</p>}
            {state === 'done' && <p className="font-semibold text-green-600">✓ Done</p>}
            <div ref={bottomRef} />
        </div>
    );
}

export default function LibraryPage() {
    const [posts, setPosts] = useState<SocialPost[]>([]);
    const [services, setServices] = useState<ServiceInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

    // Filters
    const [serviceFilter, setServiceFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<PostStatus | 'all'>('all');
    const [variantFilter, setVariantFilter] = useState<VariantTag | 'all'>('all');

    // Schedule modal
    const [schedulingPostId, setSchedulingPostId] = useState<string | null>(null);
    const [scheduledFor, setScheduledFor] = useState('');
    const [scheduling, setScheduling] = useState(false);

    const [signals, setSignals] = useState<Record<string, ServiceAvailability>>({});

    // Generate panel
    const [showGenerate, setShowGenerate] = useState(false);
    const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
    const [postsPerService, setPostsPerService] = useState(6);
    const [generateState, setGenerateState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
    const [generateLog, setGenerateLog] = useState<string[]>([]);
    const [generateError, setGenerateError] = useState<string | null>(null);
    const stopGenerateRef = useRef<(() => void) | null>(null);

    // Fill missing images
    const [imageState, setImageState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
    const [imageLog, setImageLog] = useState<string[]>([]);
    const stopImageRef = useRef<(() => void) | null>(null);

    // Per-post acting state
    const [acting, setActing] = useState<Record<string, string>>({});

    useEffect(() => {
        void Promise.all([loadPosts(), loadServices()]);
        getSignals()
            .then(({ signals: s }) => setSignals(s))
            .catch(() => {});
    }, []);

    async function loadPosts() {
        setLoading(true);
        setError(null);
        try {
            const { posts: p } = await getPosts();
            setPosts(p);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load posts');
        } finally {
            setLoading(false);
        }
    }

    async function loadServices() {
        try {
            const { services: s } = await getServices();
            setServices(s);
        } catch {
            // non-fatal
        }
    }

    function serviceName(id: string) {
        return services.find((s) => s.id === id)?.name ?? id;
    }

    // Apply filters client-side
    const filtered = posts.filter((p) => {
        if (serviceFilter !== 'all' && p.serviceId !== serviceFilter) return false;
        if (statusFilter !== 'all' && p.status !== statusFilter) return false;
        if (variantFilter !== 'all' && p.variantTag !== variantFilter) return false;
        return true;
    });

    // Group by service for display (posts with no serviceId go under 'campaign')
    const grouped = filtered.reduce<Record<string, SocialPost[]>>((acc, post) => {
        const key = post.serviceId ?? '_campaign';
        (acc[key] ??= []).push(post);
        return acc;
    }, {});

    function groupLabel(key: string) {
        if (key === '_campaign') return 'Campaign posts';
        return serviceName(key);
    }

    async function handleSchedule() {
        if (!schedulingPostId || !scheduledFor) return;
        setScheduling(true);
        try {
            const iso = new Date(scheduledFor).toISOString();
            const { post } = await schedulePost(schedulingPostId, iso);
            setPosts((prev) => prev.map((p) => (p.id === post.id ? post : p)));
            setSchedulingPostId(null);
            setScheduledFor('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to schedule');
        } finally {
            setScheduling(false);
        }
    }

    async function handleClone(postId: string) {
        setActing((a) => ({ ...a, [postId]: 'cloning' }));
        try {
            const { post } = await clonePost(postId);
            setPosts((prev) => [post, ...prev]);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to clone post');
        } finally {
            setActing((a) => {
                const n = { ...a };
                delete n[postId];
                return n;
            });
        }
    }

    function handleGenerate() {
        if (selectedServices.size === 0) return;
        setGenerateState('running');
        setGenerateLog([]);
        setGenerateError(null);
        const stop = streamGenerateLibraryPosts([...selectedServices], postsPerService, {
            onProgress(data: LibraryProgress) {
                setGenerateLog((prev) => [...prev, data.message]);
            },
            onComplete() {
                setGenerateState('done');
                stopGenerateRef.current = null;
                void loadPosts();
            },
            onError(err: string) {
                setGenerateState('error');
                setGenerateError(err);
                stopGenerateRef.current = null;
            },
        });
        stopGenerateRef.current = stop;
    }

    function closeGeneratePanel() {
        stopGenerateRef.current?.();
        stopGenerateRef.current = null;
        setShowGenerate(false);
        setGenerateState('idle');
        setGenerateLog([]);
        setGenerateError(null);
        setSelectedServices(new Set());
    }

    function handleFillImages() {
        setImageState('running');
        setImageLog([]);
        const stop = streamGenerateLibraryImages({
            onProgress(data: LibraryProgress) {
                setImageLog((prev) => [...prev, data.message]);
            },
            onComplete() {
                setImageState('done');
                stopImageRef.current = null;
                void loadPosts();
            },
            onError(err: string) {
                setImageState('error');
                stopImageRef.current = null;
                setImageLog((prev) => [...prev, `Error: ${err}`]);
            },
        });
        stopImageRef.current = stop;
    }

    function toggleService(id: string) {
        setSelectedServices((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    const canSchedule = (p: SocialPost) =>
        (p.status === 'approved' || p.status === 'pending_review') && p.imageStatus === 'approved';

    return (
        <>
            <PageHeader title="Posts" subtitle={`${posts.length} post${posts.length !== 1 ? 's' : ''}`} />

            {error && (
                <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* ── Toolbar ── */}
            <div className="mb-5 flex flex-wrap items-center gap-3">
                {/* Service filter */}
                <select
                    value={serviceFilter}
                    onChange={(e) => setServiceFilter(e.target.value)}
                    className="border-warm-200 text-charcoal rounded-lg border bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-teal-400 focus:outline-none"
                >
                    <option value="all">All services</option>
                    {services.map((s) => (
                        <option key={s.id} value={s.id}>
                            {s.name}
                        </option>
                    ))}
                </select>

                {/* Status filter */}
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as PostStatus | 'all')}
                    className="border-warm-200 text-charcoal rounded-lg border bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-teal-400 focus:outline-none"
                >
                    {ALL_STATUSES.map((s) => (
                        <option key={s} value={s}>
                            {statusLabel[s]}
                        </option>
                    ))}
                </select>

                {/* Variant filter */}
                <select
                    value={variantFilter}
                    onChange={(e) => setVariantFilter(e.target.value as VariantTag | 'all')}
                    className="border-warm-200 text-charcoal rounded-lg border bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-teal-400 focus:outline-none"
                >
                    {VARIANT_TAGS.map((t) => (
                        <option key={t} value={t}>
                            {variantLabel[t]}
                        </option>
                    ))}
                </select>

                <div className="ml-auto flex gap-2">
                    <div className="border-warm-200 flex overflow-hidden rounded-lg border bg-white">
                        <button
                            onClick={() => setViewMode('table')}
                            title="Table view"
                            className={`flex items-center px-3 py-2 text-sm transition ${viewMode === 'table' ? 'bg-warm-100 text-charcoal' : 'text-muted hover:bg-warm-50'}`}
                        >
                            <List size={15} />
                        </button>
                        <button
                            onClick={() => setViewMode('grid')}
                            title="Preview grid"
                            className={`border-warm-200 flex items-center border-l px-3 py-2 text-sm transition ${viewMode === 'grid' ? 'bg-warm-100 text-charcoal' : 'text-muted hover:bg-warm-50'}`}
                        >
                            <LayoutGrid size={15} />
                        </button>
                    </div>
                    <button
                        onClick={() => void loadPosts()}
                        className="border-warm-200 text-charcoal hover:bg-warm-100 flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-sm transition"
                    >
                        <RefreshCw size={14} />
                        Refresh
                    </button>
                    {posts.some((p) => p.imageStatus === 'needed') && (
                        <button
                            onClick={handleFillImages}
                            disabled={imageState === 'running'}
                            title="Generate missing images"
                            className="border-warm-200 text-charcoal hover:bg-warm-100 flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-sm transition disabled:opacity-50"
                        >
                            <ImagePlus size={14} />
                            Fill images
                        </button>
                    )}
                    <button
                        onClick={() => setShowGenerate(true)}
                        className="text-charcoal flex items-center gap-1.5 rounded-lg bg-teal-400 px-4 py-2 text-sm font-semibold transition hover:brightness-110"
                    >
                        <Sparkles size={14} />
                        Generate posts
                    </button>
                </div>
            </div>

            {/* ── Fill images progress ── */}
            {(imageState === 'running' || imageState === 'done' || imageState === 'error') && imageLog.length > 0 && (
                <div className="border-warm-200 mb-5 rounded-2xl border bg-white p-4 shadow-sm">
                    <div className="mb-2 flex items-center justify-between">
                        <p className="text-charcoal text-xs font-semibold">Generating missing images</p>
                        {imageState !== 'running' && (
                            <button
                                onClick={() => {
                                    stopImageRef.current?.();
                                    setImageState('idle');
                                    setImageLog([]);
                                }}
                                className="text-muted hover:text-charcoal text-xs"
                            >
                                Dismiss
                            </button>
                        )}
                    </div>
                    <GenerateProgressLog entries={imageLog} state={imageState} />
                </div>
            )}

            {/* ── Generate panel ── */}
            {showGenerate && (
                <div className="border-warm-200 mb-6 rounded-2xl border bg-white p-6 shadow-sm">
                    <h3 className="text-charcoal mb-4 text-sm font-semibold">Generate standalone posts</h3>

                    {generateState !== 'running' && generateState !== 'done' && (
                        <>
                            <div className="mb-4">
                                <ServiceSelector
                                    services={services}
                                    selected={selectedServices}
                                    signals={signals}
                                    label="Services to generate posts for"
                                    onToggle={toggleService}
                                    onToggleGroup={(ids, allSelected) => {
                                        setSelectedServices((prev) => {
                                            const next = new Set(prev);
                                            if (allSelected) ids.forEach((id) => next.delete(id));
                                            else ids.forEach((id) => next.add(id));
                                            return next;
                                        });
                                    }}
                                    onClear={() => setSelectedServices(new Set())}
                                />
                            </div>

                            <div className="mb-4 flex items-center gap-3">
                                <label className="text-muted text-xs whitespace-nowrap">Posts per service:</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={12}
                                    value={postsPerService}
                                    onChange={(e) => setPostsPerService(Number(e.target.value))}
                                    className="border-warm-200 text-charcoal w-20 rounded-lg border px-3 py-1.5 text-sm focus:ring-2 focus:ring-teal-400 focus:outline-none"
                                />
                            </div>
                        </>
                    )}

                    {(generateState === 'running' || generateLog.length > 0) && (
                        <GenerateProgressLog entries={generateLog} state={generateState} />
                    )}

                    {generateError && <p className="mt-3 text-xs text-red-600">{generateError}</p>}

                    <div className="mt-4 flex gap-2">
                        {generateState !== 'running' && generateState !== 'done' && (
                            <button
                                onClick={handleGenerate}
                                disabled={selectedServices.size === 0}
                                className="text-charcoal flex items-center gap-1.5 rounded-lg bg-teal-400 px-4 py-2 text-sm font-semibold transition hover:brightness-110 disabled:opacity-50"
                            >
                                <Sparkles size={14} />
                                Generate{' '}
                                {selectedServices.size > 0 ? `${selectedServices.size * postsPerService} posts` : ''}
                            </button>
                        )}
                        <button
                            onClick={closeGeneratePanel}
                            className="border-warm-200 text-muted hover:bg-warm-100 rounded-lg border px-4 py-2 text-sm transition"
                        >
                            {generateState === 'done' ? 'Close' : 'Cancel'}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Content ── */}
            {loading ? (
                <div className="text-muted py-16 text-center text-sm">Loading…</div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-20 text-center">
                    <BookOpen size={32} className="text-warm-300" />
                    <p className="text-muted text-sm">
                        {posts.length === 0
                            ? 'No posts yet. Generate some or create a campaign to get started.'
                            : 'No posts match the current filters.'}
                    </p>
                </div>
            ) : viewMode === 'grid' ? (
                <div className="space-y-8">
                    {Object.entries(grouped).map(([key, groupPosts]) => (
                        <section key={key}>
                            <h2 className="text-muted mb-3 text-xs font-semibold tracking-wider uppercase">
                                {groupLabel(key)}
                                <span className="ml-2 font-normal normal-case">({groupPosts.length})</span>
                            </h2>
                            <PostGrid
                                posts={groupPosts}
                                renderFooter={(post) => {
                                    const postActing = acting[post.id];
                                    return (
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <Badge value={post.status} />
                                                {post.imageStatus && post.imageStatus !== 'approved' && (
                                                    <Badge value={post.imageStatus} />
                                                )}
                                                {post.campaigns?.map((c) => (
                                                    <Link
                                                        key={c.id}
                                                        to={`/campaigns/${c.id}`}
                                                        className="rounded-full bg-teal-400/15 px-2 py-0.5 text-[10px] font-semibold text-teal-700 transition hover:bg-teal-400/25"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        {c.name}
                                                    </Link>
                                                ))}
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                {canSchedule(post) && !post.scheduledFor && (
                                                    <button
                                                        onClick={() => {
                                                            setSchedulingPostId(post.id);
                                                            setScheduledFor('');
                                                        }}
                                                        className="text-charcoal rounded-lg bg-teal-400 px-2.5 py-1 text-xs font-semibold transition hover:brightness-110"
                                                    >
                                                        Schedule
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => void handleClone(post.id)}
                                                    disabled={!!postActing}
                                                    className="border-warm-200 text-charcoal hover:bg-warm-100 rounded-lg border px-2.5 py-1 text-xs font-medium transition disabled:opacity-50"
                                                >
                                                    {postActing === 'cloning' ? 'Cloning…' : 'Clone'}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                }}
                            />
                        </section>
                    ))}
                </div>
            ) : (
                <div className="space-y-8">
                    {Object.entries(grouped).map(([key, groupPosts]) => (
                        <section key={key}>
                            <h2 className="text-muted mb-3 text-xs font-semibold tracking-wider uppercase">
                                {groupLabel(key)}
                                <span className="ml-2 font-normal normal-case">({groupPosts.length})</span>
                            </h2>

                            <div className="border-warm-200 overflow-hidden rounded-2xl border bg-white shadow-sm">
                                <table className="w-full border-collapse text-sm">
                                    <thead>
                                        <tr className="border-warm-200 bg-warm-100 text-muted border-b text-left text-xs font-semibold tracking-wider uppercase">
                                            <th className="px-5 py-3">Copy</th>
                                            <th className="px-5 py-3">Platform</th>
                                            <th className="px-5 py-3">Type</th>
                                            <th className="px-5 py-3">Campaigns</th>
                                            <th className="px-5 py-3">Status</th>
                                            <th className="px-5 py-3">Image</th>
                                            <th className="px-5 py-3">Scheduled</th>
                                            <th className="px-5 py-3" />
                                        </tr>
                                    </thead>
                                    <tbody className="divide-warm-200 divide-y">
                                        {groupPosts.map((post) => {
                                            const postActing = acting[post.id];
                                            return (
                                                <tr key={post.id} className="hover:bg-warm-100 transition-colors">
                                                    <td className="max-w-xs px-5 py-3.5">
                                                        <Link to={`/posts/${post.id}`} className="block">
                                                            <p className="text-charcoal truncate text-xs">
                                                                {post.ownerEdit ?? post.copy}
                                                            </p>
                                                        </Link>
                                                    </td>
                                                    <td className="px-5 py-3.5">
                                                        <span className="bg-warm-100 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider text-teal-700 uppercase">
                                                            {platformLabel[post.platform] ?? post.platform}
                                                            {' · '}
                                                            {post.postType}
                                                        </span>
                                                    </td>
                                                    <td className="text-muted px-5 py-3.5 text-xs capitalize">
                                                        {post.variantTag ?? post.contentPillar ?? '—'}
                                                    </td>
                                                    <td className="px-5 py-3.5">
                                                        <div className="flex flex-wrap gap-1">
                                                            {post.campaigns?.length ? (
                                                                post.campaigns!.map((c) => (
                                                                    <Link
                                                                        key={c.id}
                                                                        to={`/campaigns/${c.id}`}
                                                                        className="rounded-full bg-teal-400/15 px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-teal-700 transition hover:bg-teal-400/25"
                                                                    >
                                                                        {c.name}
                                                                    </Link>
                                                                ))
                                                            ) : (
                                                                <span className="text-muted text-xs">—</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-5 py-3.5">
                                                        <Badge value={post.status} />
                                                    </td>
                                                    <td className="px-5 py-3.5">
                                                        {post.imageStatus && <Badge value={post.imageStatus} />}
                                                    </td>
                                                    <td className="text-muted px-5 py-3.5 text-xs">
                                                        {post.scheduledFor
                                                            ? new Date(post.scheduledFor).toLocaleDateString('en-AU', {
                                                                  day: 'numeric',
                                                                  month: 'short',
                                                                  year: 'numeric',
                                                              })
                                                            : '—'}
                                                    </td>
                                                    <td className="px-5 py-3.5">
                                                        <div className="flex items-center justify-end gap-2">
                                                            {canSchedule(post) && !post.scheduledFor && (
                                                                <button
                                                                    onClick={() => {
                                                                        setSchedulingPostId(post.id);
                                                                        setScheduledFor('');
                                                                    }}
                                                                    className="text-charcoal rounded-lg bg-teal-400 px-3 py-1 text-xs font-semibold transition hover:brightness-110"
                                                                >
                                                                    Schedule
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => void handleClone(post.id)}
                                                                disabled={!!postActing}
                                                                className="border-warm-200 text-charcoal hover:bg-warm-100 rounded-lg border px-3 py-1 text-xs font-medium transition disabled:opacity-50"
                                                            >
                                                                {postActing === 'cloning' ? 'Cloning…' : 'Clone'}
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    ))}
                </div>
            )}

            {/* ── Schedule modal ── */}
            {schedulingPostId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
                        <h3 className="text-charcoal mb-4 text-sm font-semibold">Schedule post</h3>
                        <input
                            type="datetime-local"
                            value={scheduledFor}
                            onChange={(e) => setScheduledFor(e.target.value)}
                            className="border-warm-200 text-charcoal mb-4 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-teal-400 focus:outline-none"
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={() => void handleSchedule()}
                                disabled={scheduling || !scheduledFor}
                                className="text-charcoal flex-1 rounded-lg bg-teal-400 py-2 text-sm font-semibold transition hover:brightness-110 disabled:opacity-50"
                            >
                                {scheduling ? 'Scheduling…' : 'Confirm'}
                            </button>
                            <button
                                onClick={() => {
                                    setSchedulingPostId(null);
                                    setScheduledFor('');
                                }}
                                className="border-warm-200 text-muted hover:bg-warm-100 flex-1 rounded-lg border py-2 text-sm transition"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
