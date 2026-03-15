import { getHomePage, getSiteSettings } from '@/lib/queries'
import { urlFor } from '@/lib/sanity'
import Link from 'next/link'
import Image from 'next/image'

export const revalidate = 60 // ISR: revalidate every 60 seconds

export default async function HomePage() {
  const [page, settings] = await Promise.all([getHomePage(), getSiteSettings()])

  return (
    <>
      {/* ── Hero ── */}
      <section className="hero">
        {page?.hero?.image && (
          <Image
            src={urlFor(page.hero.image).width(1600).height(900).url()}
            alt="Bodyspace Recovery Studio"
            fill
            priority
            className="hero-bg"
          />
        )}
        <div className="hero-overlay" />
        <div className="hero-content">
          <p className="hero-eyebrow">Perth Wellness Studio & Spa</p>
          <h1>{page?.hero?.headline || 'Relax, Recharge, Recover'}</h1>
          <p className="hero-sub">{page?.hero?.subheading || 'A little something for mind & body'}</p>
          <Link href={settings?.fresha?.bookNowUrl || '#'} className="btn btn-primary" target="_blank">
            {page?.hero?.ctaText || 'Book Now'}
          </Link>
        </div>
      </section>

      {/* ── Intro ── */}
      {page?.introText && (
        <section className="section section-intro">
          <div className="container">
            <h2>{page.introHeading || 'Experience the Bodyspace Difference'}</h2>
            <p className="intro-text">{page.introText}</p>
          </div>
        </section>
      )}

      {/* ── Featured Treatments ── */}
      {page?.featuredTreatments?.length > 0 && (
        <section className="section section-treatments">
          <div className="container">
            <h2>Our Treatments</h2>
            <div className="treatment-grid">
              {page.featuredTreatments.map((treatment: any) => (
                <Link key={treatment._id} href={`/treatments/${treatment.slug.current}`} className="treatment-card">
                  {treatment.heroImage && (
                    <div className="treatment-card-image">
                      <Image
                        src={urlFor(treatment.heroImage).width(600).height(400).url()}
                        alt={treatment.title}
                        fill
                      />
                    </div>
                  )}
                  <div className="treatment-card-body">
                    <span className="treatment-category">{treatment.category}</span>
                    <h3>{treatment.title}</h3>
                    <p>{treatment.shortDescription}</p>
                    {treatment.duration?.[0] && (
                      <span className="treatment-price">from ${treatment.duration[0].price}</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
            <div className="section-cta">
              <Link href="/treatments" className="btn btn-outline">View All Treatments</Link>
            </div>
          </div>
        </section>
      )}

      {/* ── Wellness Goals ── */}
      {page?.wellnessGoals?.length > 0 && (
        <section className="section section-goals">
          <div className="container">
            <h2>Hit Your Wellness Goals</h2>
            <div className="goals-grid">
              {page.wellnessGoals.map((goal: any, i: number) => (
                <div key={i} className="goal-tile">
                  {goal.icon && (
                    <Image
                      src={urlFor(goal.icon).width(80).height(80).url()}
                      alt={goal.label}
                      width={64}
                      height={64}
                    />
                  )}
                  <p className="goal-tagline">{goal.tagline}</p>
                  <h3>{goal.label}</h3>
                  <p>{goal.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Book CTA ── */}
      <section className="section section-book-cta">
        <div className="container">
          <h2>Ready to feel transformed?</h2>
          <p>Book your session online in minutes via Fresha.</p>
          <div className="cta-buttons">
            <Link href={settings?.fresha?.bookNowUrl || '#'} className="btn btn-primary" target="_blank">
              Book Now
            </Link>
            <Link href={settings?.fresha?.vouchersUrl || '#'} className="btn btn-outline-light" target="_blank">
              Buy a Gift Voucher
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
