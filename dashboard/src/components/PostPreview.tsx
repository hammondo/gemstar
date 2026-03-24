import type { SocialPost } from '../api/appApi';
import logo from '../assets/logo.png';

const INSTAGRAM_HANDLE = 'bodyspacerecovery';
const FACEBOOK_NAME = 'BodySpace Recovery Studio';

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ size = 32 }: { size?: number }) {
    return (
        <img
            src={logo}
            alt="BodySpace"
            style={{ width: size, height: size }}
            className="shrink-0 rounded-full object-cover"
        />
    );
}

// ── Instagram Feed ────────────────────────────────────────────────────────────

function InstagramFeed({ post }: { post: SocialPost }) {
    const copy = post.ownerEdit ?? post.copy;
    return (
        <div className="w-full max-w-[360px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm font-['system-ui']">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-2">
                    <div className="rounded-full ring-2 ring-pink-500 ring-offset-1">
                        <Avatar size={32} />
                    </div>
                    <div>
                        <p className="text-[12px] font-semibold text-gray-900 leading-tight">{INSTAGRAM_HANDLE}</p>
                        <p className="text-[10px] text-gray-400 leading-tight">Sponsored</p>
                    </div>
                </div>
                <svg className="h-4 w-4 text-gray-600" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
                </svg>
            </div>

            {/* Image — 1:1 square */}
            <div className="relative w-full" style={{ paddingBottom: '100%' }}>
                {post.imageUrl ? (
                    <img src={post.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                        <span className="text-xs text-gray-400">No image yet</span>
                    </div>
                )}
            </div>

            {/* Action bar */}
            <div className="flex items-center justify-between px-3 pt-2.5">
                <div className="flex gap-3">
                    <svg className="h-5 w-5 text-gray-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                    </svg>
                    <svg className="h-5 w-5 text-gray-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    <svg className="h-5 w-5 text-gray-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                </div>
                <svg className="h-5 w-5 text-gray-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                </svg>
            </div>

            {/* Caption */}
            <div className="px-3 pb-3 pt-1.5">
                <p className="text-[12px] leading-relaxed text-gray-900 line-clamp-4">
                    <span className="font-semibold">{INSTAGRAM_HANDLE}</span>{' '}
                    {copy}
                </p>
                {post.hashtags.length > 0 && (
                    <p className="mt-1 text-[11px] text-blue-500 leading-relaxed line-clamp-2">
                        {post.hashtags.join(' ')}
                    </p>
                )}
            </div>
        </div>
    );
}

// ── Instagram Story / Reel ────────────────────────────────────────────────────

function InstagramStory({ post }: { post: SocialPost }) {
    const copy = post.ownerEdit ?? post.copy;
    const isReel = post.postType === 'reel';
    return (
        <div
            className="relative w-full max-w-[220px] overflow-hidden rounded-2xl bg-gray-900 shadow-sm"
            style={{ aspectRatio: '9/16' }}
        >
            {/* Background image */}
            {post.imageUrl ? (
                <img src={post.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-teal-600 to-teal-900" />
            )}

            {/* Dark overlay for readability */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />

            {/* Top: progress bar + header */}
            <div className="absolute left-0 right-0 top-0 px-2 pt-2">
                <div className="mb-2 flex gap-0.5">
                    <div className="h-0.5 flex-1 rounded-full bg-white" />
                </div>
                <div className="flex items-center gap-1.5">
                    <Avatar size={24} />
                    <span className="text-[11px] font-semibold text-white">{INSTAGRAM_HANDLE}</span>
                    <span className="text-[10px] text-white/70">· 1h</span>
                    {isReel && (
                        <span className="ml-auto rounded bg-white/20 px-1 py-0.5 text-[9px] font-bold text-white">REEL</span>
                    )}
                </div>
            </div>

            {/* Bottom: caption */}
            <div className="absolute bottom-0 left-0 right-0 px-3 pb-4">
                <p className="text-[11px] leading-relaxed text-white line-clamp-4 drop-shadow">{copy}</p>
                {post.hashtags.length > 0 && (
                    <p className="mt-1 text-[10px] text-white/80 line-clamp-1">{post.hashtags.slice(0, 3).join(' ')}</p>
                )}
                {/* Reply bar */}
                <div className="mt-2 flex items-center gap-2 rounded-full border border-white/40 px-3 py-1.5">
                    <span className="flex-1 text-[10px] text-white/60">Reply…</span>
                    <svg className="h-3.5 w-3.5 text-white/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                    </svg>
                </div>
            </div>
        </div>
    );
}

// ── Facebook Feed ─────────────────────────────────────────────────────────────

function FacebookFeed({ post }: { post: SocialPost }) {
    const copy = post.ownerEdit ?? post.copy;
    return (
        <div className="w-full max-w-[400px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm font-['system-ui']">
            {/* Header */}
            <div className="flex items-center justify-between px-3.5 py-3">
                <div className="flex items-center gap-2.5">
                    <Avatar size={36} />
                    <div>
                        <p className="text-[13px] font-semibold text-gray-900 leading-tight">{FACEBOOK_NAME}</p>
                        <div className="flex items-center gap-1">
                            <span className="text-[11px] text-gray-500">Just now ·</span>
                            <svg className="h-3 w-3 text-gray-500" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                            </svg>
                        </div>
                    </div>
                </div>
                <svg className="h-4 w-4 text-gray-500" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
                </svg>
            </div>

            {/* Post text */}
            <div className="px-3.5 pb-2">
                <p className="text-[13px] leading-relaxed text-gray-900 line-clamp-5">{copy}</p>
                {post.hashtags.length > 0 && (
                    <p className="mt-1 text-[12px] text-blue-600 line-clamp-1">{post.hashtags.join(' ')}</p>
                )}
            </div>

            {/* Image — 1.91:1 landscape */}
            <div className="relative w-full" style={{ paddingBottom: '52.36%' }}>
                {post.imageUrl ? (
                    <img src={post.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                        <span className="text-xs text-gray-400">No image yet</span>
                    </div>
                )}
            </div>

            {/* Reaction counts */}
            <div className="flex items-center justify-between px-3.5 py-1.5 text-[11px] text-gray-500 border-b border-gray-100">
                <div className="flex items-center gap-0.5">
                    <span className="text-base">👍❤️</span>
                    <span className="ml-1">Be the first to react</span>
                </div>
            </div>

            {/* Action bar */}
            <div className="flex divide-x divide-gray-100">
                {[
                    { label: 'Like', icon: '👍' },
                    { label: 'Comment', icon: '💬' },
                    { label: 'Share', icon: '↗' },
                ].map(({ label, icon }) => (
                    <button
                        key={label}
                        className="flex flex-1 items-center justify-center gap-1.5 py-2 text-[12px] font-semibold text-gray-600 hover:bg-gray-50"
                    >
                        <span>{icon}</span> {label}
                    </button>
                ))}
            </div>
        </div>
    );
}

// ── Facebook Story ────────────────────────────────────────────────────────────

function FacebookStory({ post }: { post: SocialPost }) {
    const copy = post.ownerEdit ?? post.copy;
    return (
        <div
            className="relative w-full max-w-[220px] overflow-hidden rounded-2xl bg-gray-900 shadow-sm"
            style={{ aspectRatio: '9/16' }}
        >
            {post.imageUrl ? (
                <img src={post.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-blue-900" />
            )}

            <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/60" />

            {/* Top bar */}
            <div className="absolute left-0 right-0 top-0 px-2 pt-2">
                <div className="mb-2 h-0.5 w-full rounded-full bg-white" />
                <div className="flex items-center gap-1.5">
                    <div className="rounded-full ring-2 ring-blue-500 ring-offset-1">
                        <Avatar size={26} />
                    </div>
                    <div>
                        <p className="text-[11px] font-semibold text-white leading-tight">{FACEBOOK_NAME}</p>
                        <p className="text-[9px] text-white/70">Just now</p>
                    </div>
                </div>
            </div>

            {/* Bottom caption */}
            <div className="absolute bottom-0 left-0 right-0 px-3 pb-4">
                <p className="text-[11px] leading-relaxed text-white line-clamp-4 drop-shadow">{copy}</p>
                <div className="mt-2 flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 backdrop-blur-sm">
                    <span className="flex-1 text-[10px] text-white/70">Reply to story…</span>
                    <span className="text-sm">👍</span>
                </div>
            </div>
        </div>
    );
}

// ── Public component ──────────────────────────────────────────────────────────

export default function PostPreview({ post }: { post: SocialPost }) {
    if (post.platform === 'instagram') {
        if (post.postType === 'feed') return <InstagramFeed post={post} />;
        return <InstagramStory post={post} />;
    }
    if (post.platform === 'facebook') {
        if (post.postType === 'story') return <FacebookStory post={post} />;
        return <FacebookFeed post={post} />;
    }
    return null;
}
