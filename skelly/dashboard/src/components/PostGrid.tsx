import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { SocialPost } from '../api/appApi';
import PostPreview from './PostPreview';

interface PostGridProps {
    posts: SocialPost[];
    getHref?: (post: SocialPost) => string;
    renderFooter?: (post: SocialPost) => ReactNode;
    dimmed?: (post: SocialPost) => boolean;
    emptyMessage?: string;
}

export default function PostGrid({
    posts,
    getHref = (p) => `/posts/${p.id}`,
    renderFooter,
    dimmed,
    emptyMessage = 'No posts to display.',
}: PostGridProps) {
    if (posts.length === 0) {
        return <p className="py-8 text-sm text-muted">{emptyMessage}</p>;
    }

    return (
        <div className="flex flex-wrap gap-6">
            {posts.map((post) => (
                <div
                    key={post.id}
                    className={`flex flex-col gap-2 ${dimmed?.(post) ? 'opacity-50' : ''}`}
                >
                    <Link
                        to={getHref(post)}
                        className="group block shrink-0 transition"
                    >
                        <div className="rounded-2xl transition group-hover:opacity-90 group-hover:ring-2 group-hover:ring-teal-400 group-hover:ring-offset-2">
                            <PostPreview post={post} />
                        </div>
                    </Link>
                    {renderFooter && (
                        <div className="px-1">
                            {renderFooter(post)}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
