import { getHomePage, getSiteSettings } from "@/lib/queries";
import { urlFor } from "@/lib/sanity";
import Link from "next/link";
import Image from "next/image";

export const revalidate = 60; // ISR: revalidate every 60 seconds

export default async function HomePage() {
  const [page, settings] = await Promise.all([
    getHomePage(),
    getSiteSettings(),
  ]);
  const containerClass = "mx-auto w-full max-w-[1180px] px-6";
  const btnBase =
    "inline-flex items-center justify-center whitespace-nowrap rounded-sm border border-transparent px-7 py-3 text-[0.875rem] font-medium uppercase tracking-[0.06em] transition-all duration-200";

  return (
    <>
      {/* ── Hero ── */}
      <section className="relative flex min-h-[88vh] items-center justify-center overflow-hidden text-center">
        {page?.hero?.image && (
          <Image
            src={urlFor(page.hero.image).width(1600).height(900).url()}
            alt="Bodyspace Recovery Studio"
            fill
            priority
            className="object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-[rgba(28,20,16,0.3)] to-[rgba(28,20,16,0.55)]" />
        <div className="relative z-[1] max-w-[700px] px-6 text-white">
          <p className="mb-4 text-[0.8rem] uppercase tracking-[0.2em] text-white/75">
            Perth Wellness Studio & Spa
          </p>
          <h1 className="mb-4 font-display text-[clamp(3rem,6vw,5rem)] leading-[1.1] text-white">
            {page?.hero?.headline || "Relax, Recharge, Recover"}
          </h1>
          <p className="mb-10 font-display text-[1.2rem] italic text-white/85">
            {page?.hero?.subheading || "A little something for mind & body"}
          </p>
          <Link
            href={settings?.fresha?.bookNowUrl || "#"}
            className={`${btnBase} bg-primary text-white hover:bg-primary-hover`}
            target="_blank"
          >
            {page?.hero?.ctaText || "Book Now"}
          </Link>
        </div>
      </section>

      {/* ── Intro ── */}
      {page?.introText && (
        <section className="bg-bg-alt py-20 text-center">
          <div className={containerClass}>
            <h2 className="mb-5 font-display text-[clamp(1.8rem,3.5vw,2.8rem)] leading-[1.2] text-text">
              {page.introHeading || "Experience the Bodyspace Difference"}
            </h2>
            <p className="mx-auto max-w-[720px] text-[1.1rem] leading-[1.8] text-text-muted">
              {page.introText}
            </p>
          </div>
        </section>
      )}

      {/* ── Featured Treatments ── */}
      {page?.featuredTreatments?.length > 0 && (
        <section className="bg-bg py-20">
          <div className={containerClass}>
            <h2 className="text-center font-display text-[clamp(1.8rem,3.5vw,2.8rem)] leading-[1.2] text-text">
              Our Treatments
            </h2>
            <div className="mt-10 grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6">
              {page.featuredTreatments.map((treatment: any) => (
                <Link
                  key={treatment._id}
                  href={`/treatments/${treatment.slug.current}`}
                  className="group flex flex-col overflow-hidden rounded border border-border bg-surface transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
                >
                  {treatment.heroImage && (
                    <div className="relative h-[220px] overflow-hidden">
                      <Image
                        src={urlFor(treatment.heroImage)
                          .width(600)
                          .height(400)
                          .url()}
                        alt={treatment.title}
                        fill
                        className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col px-6 pb-6 pt-5">
                    <span className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-primary">
                      {treatment.category}
                    </span>
                    <h3 className="mb-2 font-display text-[clamp(1.2rem,2vw,1.6rem)] leading-[1.2] text-text">
                      {treatment.title}
                    </h3>
                    <p className="flex-1 text-[0.9rem] text-text-muted">
                      {treatment.shortDescription}
                    </p>
                    {treatment.duration?.[0] && (
                      <span className="mt-4 inline-block text-[0.85rem] font-semibold text-accent">
                        from ${treatment.duration[0].price}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
            <div className="mt-12 text-center">
              <Link
                href="/treatments"
                className={`${btnBase} border-[1.5px] border-primary text-primary hover:bg-primary hover:text-white`}
              >
                View All Treatments
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ── Wellness Goals ── */}
      {page?.wellnessGoals?.length > 0 && (
        <section className="bg-bg-alt py-20 text-center">
          <div className={containerClass}>
            <h2 className="font-display text-[clamp(1.8rem,3.5vw,2.8rem)] leading-[1.2] text-text">
              Hit Your Wellness Goals
            </h2>
            <div className="mt-10 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-8">
              {page.wellnessGoals.map((goal: any, i: number) => (
                <div key={i}>
                  {goal.icon && (
                    <Image
                      src={urlFor(goal.icon).width(80).height(80).url()}
                      alt={goal.label}
                      width={64}
                      height={64}
                      className="mx-auto mb-4"
                    />
                  )}
                  <p className="mb-1 text-[0.75rem] uppercase tracking-[0.1em] text-text-muted">
                    {goal.tagline}
                  </p>
                  <h3 className="mb-2 font-display text-[1.3rem] leading-[1.2] text-text">
                    {goal.label}
                  </h3>
                  <p className="text-[0.875rem] text-text-muted">
                    {goal.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Book CTA ── */}
      <section className="bg-text py-20 text-center text-white">
        <div className={containerClass}>
          <h2 className="font-display text-[clamp(1.8rem,3.5vw,2.8rem)] leading-[1.2] text-white">
            Ready to feel transformed?
          </h2>
          <p className="mb-8 text-[1.1rem] text-white/70">
            Book your session online in minutes via Fresha.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href={settings?.fresha?.bookNowUrl || "#"}
              className={`${btnBase} bg-primary text-white hover:bg-primary-hover`}
              target="_blank"
            >
              Book Now
            </Link>
            <Link
              href={settings?.fresha?.vouchersUrl || "#"}
              className={`${btnBase} border-[1.5px] border-white/60 text-white hover:bg-white/15`}
              target="_blank"
            >
              Buy a Gift Voucher
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
