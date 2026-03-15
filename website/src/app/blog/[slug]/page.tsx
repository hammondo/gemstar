import { getBlogPostBySlug, getAllBlogPosts } from "@/lib/queries";
import { urlFor } from "@/lib/sanity";
import { PortableText } from "@portabletext/react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

export const revalidate = 60;

export async function generateStaticParams() {
  const posts = await getAllBlogPosts();
  return posts.map((p: any) => ({ slug: p.slug.current }));
}

export default async function BlogPostPage({
  params,
}: {
  params: { slug: string };
}) {
  const post = await getBlogPostBySlug(params.slug);
  if (!post) notFound();
  const containerClass = "mx-auto w-full max-w-[1180px] px-6";

  return (
    <article>
      {post.heroImage && (
        <div className="relative h-[50vh]">
          <Image
            src={urlFor(post.heroImage).width(1400).height(600).url()}
            alt={post.heroImage.alt || post.title}
            fill
            priority
            className="object-cover"
          />
        </div>
      )}
      <div className={`${containerClass} pb-20 pt-12`}>
        <header className="mb-10 max-w-[72ch]">
          <div className="mb-4 flex gap-4 text-[0.8rem] uppercase tracking-[0.05em] text-text-muted">
            {post.publishedAt && (
              <time dateTime={post.publishedAt}>
                {new Date(post.publishedAt).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </time>
            )}
            {post.author && <span>by {post.author}</span>}
          </div>
          <h1 className="font-display text-[clamp(2.5rem,5vw,4rem)] leading-[1.2] text-text">
            {post.title}
          </h1>
          {post.tags?.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {post.tags.map((tag: string) => (
                <span
                  key={tag}
                  className="rounded-full border border-border bg-bg-alt px-3 py-1 text-[0.75rem] text-text-muted"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </header>

        <div className="max-w-[72ch] [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:font-display [&_h2]:text-[clamp(1.8rem,3.5vw,2.8rem)] [&_h2]:leading-[1.2] [&_h2]:text-text [&_h3]:mt-8 [&_h3]:mb-2 [&_h3]:font-display [&_h3]:text-[clamp(1.2rem,2vw,1.6rem)] [&_h3]:leading-[1.2] [&_h3]:text-text [&_img]:my-8 [&_img]:rounded [&_li]:mb-1.5 [&_ol]:my-4 [&_ol]:ml-6 [&_ol]:text-text-muted [&_p]:mb-5 [&_p]:text-text-muted [&_ul]:my-4 [&_ul]:ml-6 [&_ul]:text-text-muted">
          <PortableText value={post.body} />
        </div>

        {/* Related Treatments */}
        {post.relatedTreatments?.length > 0 && (
          <div className="mt-12">
            <h2 className="mb-6 font-display text-[clamp(1.8rem,3.5vw,2.8rem)] leading-[1.2] text-text">
              Related Treatments
            </h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6">
              {post.relatedTreatments.map((t: any) => (
                <Link
                  key={t._id}
                  href={`/treatments/${t.slug.current}`}
                  className="flex flex-col overflow-hidden rounded border border-border bg-surface transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
                >
                  {t.heroImage && (
                    <Image
                      src={urlFor(t.heroImage).width(400).height(300).url()}
                      alt={t.title}
                      width={400}
                      height={300}
                      className="h-[220px] w-full object-cover"
                    />
                  )}
                  <div className="flex flex-1 flex-col px-6 pb-6 pt-5">
                    <h3 className="mb-2 font-display text-[clamp(1.2rem,2vw,1.6rem)] leading-[1.2] text-text">
                      {t.title}
                    </h3>
                    <p className="text-[0.9rem] text-text-muted">
                      {t.shortDescription}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
