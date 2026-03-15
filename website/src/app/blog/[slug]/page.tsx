import { getBlogPostBySlug, getAllBlogPosts } from '@/lib/queries'
import { urlFor } from '@/lib/sanity'
import { PortableText } from '@portabletext/react'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const revalidate = 60

export async function generateStaticParams() {
  const posts = await getAllBlogPosts()
  return posts.map((p: any) => ({ slug: p.slug.current }))
}

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = await getBlogPostBySlug(params.slug)
  if (!post) notFound()

  return (
    <article className="blog-post">
      {post.heroImage && (
        <div className="blog-hero">
          <Image
            src={urlFor(post.heroImage).width(1400).height(600).url()}
            alt={post.heroImage.alt || post.title}
            fill
            priority
          />
        </div>
      )}
      <div className="container blog-body">
        <header className="blog-header">
          <div className="blog-meta">
            {post.publishedAt && (
              <time dateTime={post.publishedAt}>
                {new Date(post.publishedAt).toLocaleDateString('en-AU', {
                  day: 'numeric', month: 'long', year: 'numeric'
                })}
              </time>
            )}
            {post.author && <span>by {post.author}</span>}
          </div>
          <h1>{post.title}</h1>
          {post.tags?.length > 0 && (
            <div className="blog-tags">
              {post.tags.map((tag: string) => (
                <span key={tag} className="tag">{tag}</span>
              ))}
            </div>
          )}
        </header>

        <div className="prose">
          <PortableText value={post.body} />
        </div>

        {/* Related Treatments */}
        {post.relatedTreatments?.length > 0 && (
          <div className="related-treatments">
            <h2>Related Treatments</h2>
            <div className="treatment-grid">
              {post.relatedTreatments.map((t: any) => (
                <Link key={t._id} href={`/treatments/${t.slug.current}`} className="treatment-card">
                  {t.heroImage && (
                    <Image
                      src={urlFor(t.heroImage).width(400).height(300).url()}
                      alt={t.title}
                      width={400}
                      height={300}
                    />
                  )}
                  <div className="treatment-card-body">
                    <h3>{t.title}</h3>
                    <p>{t.shortDescription}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </article>
  )
}
