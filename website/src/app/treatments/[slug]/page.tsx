import { getTreatmentBySlug, getAllTreatments, getSiteSettings } from '@/lib/queries'
import { urlFor } from '@/lib/sanity'
import { PortableText } from '@portabletext/react'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const revalidate = 60

export async function generateStaticParams() {
  const treatments = await getAllTreatments()
  return treatments.map((t: any) => ({ slug: t.slug.current }))
}

export default async function TreatmentPage({ params }: { params: { slug: string } }) {
  const [treatment, settings] = await Promise.all([
    getTreatmentBySlug(params.slug),
    getSiteSettings(),
  ])

  if (!treatment) notFound()

  const bookingUrl = treatment.freshaUrl || settings?.fresha?.bookNowUrl

  return (
    <article className="treatment-page">
      {/* Hero */}
      <section className="treatment-hero">
        {treatment.heroImage && (
          <Image
            src={urlFor(treatment.heroImage).width(1400).height(600).url()}
            alt={treatment.title}
            fill
            priority
            className="treatment-hero-bg"
          />
        )}
        <div className="treatment-hero-overlay" />
        <div className="treatment-hero-content container">
          <span className="treatment-category">{treatment.category?.name}</span>
          <h1>{treatment.title}</h1>
          {bookingUrl && (
            <Link href={bookingUrl} className="btn btn-primary" target="_blank">
              Book This Treatment
            </Link>
          )}
        </div>
      </section>

      <div className="container treatment-body">
        <div className="treatment-main">
          {/* Body content */}
          {treatment.body && (
            <div className="prose">
              <PortableText value={treatment.body} />
            </div>
          )}

          {/* FAQs */}
          {treatment.faqs?.length > 0 && (
            <div className="faqs">
              <h2>Frequently Asked Questions</h2>
              {treatment.faqs.map((faq: any, i: number) => (
                <details key={i} className="faq-item">
                  <summary>{faq.question}</summary>
                  <p>{faq.answer}</p>
                </details>
              ))}
            </div>
          )}
        </div>

        <aside className="treatment-sidebar">
          {/* Pricing */}
          {treatment.duration?.length > 0 && (
            <div className="sidebar-card">
              <h3>Pricing</h3>
              <ul className="pricing-list">
                {treatment.duration.map((d: any, i: number) => (
                  <li key={i}>
                    <span>{d.minutes} min</span>
                    <span>${d.price}</span>
                  </li>
                ))}
              </ul>
              {bookingUrl && (
                <Link href={bookingUrl} className="btn btn-primary btn-full" target="_blank">
                  Book Now
                </Link>
              )}
            </div>
          )}

          {/* Benefits */}
          {treatment.benefits?.length > 0 && (
            <div className="sidebar-card">
              <h3>Benefits</h3>
              <ul className="benefits-list">
                {treatment.benefits.map((b: string, i: number) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </article>
  )
}
