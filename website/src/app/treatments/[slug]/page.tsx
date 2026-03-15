import {
  getTreatmentBySlug,
  getAllTreatments,
  getSiteSettings,
} from "@/lib/queries";
import { urlFor } from "@/lib/sanity";
import { PortableText } from "@portabletext/react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

export const revalidate = 60;

export async function generateStaticParams() {
  const treatments = await getAllTreatments();
  return treatments.map((t: any) => ({ slug: t.slug.current }));
}

export default async function TreatmentPage({
  params,
}: {
  params: { slug: string };
}) {
  const [treatment, settings] = await Promise.all([
    getTreatmentBySlug(params.slug),
    getSiteSettings(),
  ]);

  if (!treatment) notFound();

  const bookingUrl = treatment.freshaUrl || settings?.fresha?.bookNowUrl;
  const containerClass = "mx-auto w-full max-w-[1180px] px-6";
  const btnBase =
    "inline-flex items-center justify-center whitespace-nowrap rounded-sm border border-transparent px-7 py-3 text-[0.875rem] font-medium uppercase tracking-[0.06em] transition-all duration-200";

  return (
    <article>
      {/* Hero */}
      <section className="relative flex h-[60vh] items-end">
        {treatment.heroImage && (
          <Image
            src={urlFor(treatment.heroImage).width(1400).height(600).url()}
            alt={treatment.title}
            fill
            priority
            className="object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[rgba(28,20,16,0.75)] to-[rgba(28,20,16,0.1)]" />
        <div className={`${containerClass} relative z-[1] pb-12 text-white`}>
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-white/70">
            {treatment.category?.name}
          </span>
          <h1 className="my-2 font-display text-[clamp(2.5rem,5vw,4rem)] leading-[1.2] text-white">
            {treatment.title}
          </h1>
          {bookingUrl && (
            <Link
              href={bookingUrl}
              className={`${btnBase} bg-primary text-white hover:bg-primary-hover`}
              target="_blank"
            >
              Book This Treatment
            </Link>
          )}
        </div>
      </section>

      <div
        className={`${containerClass} grid gap-12 pb-20 pt-12 md:grid-cols-[1fr_320px]`}
      >
        <div>
          {/* Body content */}
          {treatment.body && (
            <div className="max-w-[72ch] [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:font-display [&_h2]:text-[clamp(1.8rem,3.5vw,2.8rem)] [&_h2]:leading-[1.2] [&_h2]:text-text [&_h3]:mt-8 [&_h3]:mb-2 [&_h3]:font-display [&_h3]:text-[clamp(1.2rem,2vw,1.6rem)] [&_h3]:leading-[1.2] [&_h3]:text-text [&_img]:my-8 [&_img]:rounded [&_li]:mb-1.5 [&_ol]:my-4 [&_ol]:ml-6 [&_ol]:text-text-muted [&_p]:mb-5 [&_p]:text-text-muted [&_ul]:my-4 [&_ul]:ml-6 [&_ul]:text-text-muted">
              <PortableText value={treatment.body} />
            </div>
          )}

          {/* FAQs */}
          {treatment.faqs?.length > 0 && (
            <div className="mt-12">
              <h2 className="mb-6 font-display text-[clamp(1.8rem,3.5vw,2.8rem)] leading-[1.2] text-text">
                Frequently Asked Questions
              </h2>
              {treatment.faqs.map((faq: any, i: number) => (
                <details key={i} className="border-b border-border py-4">
                  <summary className="cursor-pointer list-none text-[1rem] font-medium text-text marker:content-none">
                    {faq.question}
                  </summary>
                  <p className="mt-3 text-[0.9rem] text-text-muted">
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          )}
        </div>

        <aside>
          {/* Pricing */}
          {treatment.duration?.length > 0 && (
            <div className="mb-6 rounded border border-border bg-bg-alt p-6">
              <h3 className="mb-4 font-display text-[1.1rem] leading-[1.2] text-text">
                Pricing
              </h3>
              <ul className="mb-6 list-none">
                {treatment.duration.map((d: any, i: number) => (
                  <li
                    key={i}
                    className="flex justify-between border-b border-border py-2.5 text-[0.9rem] last:border-b-0"
                  >
                    <span>{d.minutes} min</span>
                    <span>${d.price}</span>
                  </li>
                ))}
              </ul>
              {bookingUrl && (
                <Link
                  href={bookingUrl}
                  className={`${btnBase} w-full bg-primary text-white hover:bg-primary-hover`}
                  target="_blank"
                >
                  Book Now
                </Link>
              )}
            </div>
          )}

          {/* Benefits */}
          {treatment.benefits?.length > 0 && (
            <div className="rounded border border-border bg-bg-alt p-6">
              <h3 className="mb-4 font-display text-[1.1rem] leading-[1.2] text-text">
                Benefits
              </h3>
              <ul className="flex list-none flex-col gap-2">
                {treatment.benefits.map((b: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-[0.875rem] text-text-muted">
                    <span className="font-bold text-primary">✓</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </article>
  );
}
