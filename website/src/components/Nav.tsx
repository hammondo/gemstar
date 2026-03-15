"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { urlFor } from "@/lib/sanity";

export default function Nav({ settings }: { settings: any }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const containerClass = "mx-auto w-full max-w-[1180px] px-6";
  const btnBase =
    "inline-flex items-center justify-center whitespace-nowrap rounded-sm border border-transparent px-7 py-3 text-[0.875rem] font-medium uppercase tracking-[0.06em] transition-all duration-200";

  return (
    <header className="sticky top-0 z-[100] border-b border-border bg-[color:rgb(253_248_243_/_0.95)] backdrop-blur-md">
      <div className={`${containerClass} flex h-[70px] items-center gap-8`}>
        {/* Logo */}
        <Link href="/" className="shrink-0">
          {settings?.logo ? (
            <Image
              src={urlFor(settings.logo).height(60).url()}
              alt={settings.businessName || "Bodyspace Recovery Studio"}
              width={160}
              height={40}
            />
          ) : (
            <span className="font-display text-[1.4rem] text-text">
              {settings?.businessName || "Bodyspace"}
            </span>
          )}
        </Link>

        {/* Desktop nav */}
        <nav
          className="hidden flex-1 items-center gap-7 text-[0.875rem] tracking-[0.03em] lg:flex"
          aria-label="Main navigation"
        >
          <Link href="/about" className="transition-colors hover:text-primary">
            About
          </Link>
          <div className="group relative">
            <button className="cursor-pointer border-none bg-transparent text-[0.875rem] tracking-[0.03em] text-text transition-colors hover:text-primary">
              Treatments ▾
            </button>
            <div className="invisible absolute left-1/2 top-[calc(100%+0.75rem)] z-20 grid min-w-[520px] -translate-x-1/2 grid-cols-3 gap-4 rounded bg-surface p-6 opacity-0 shadow-[0_8px_30px_rgba(0,0,0,0.08)] ring-1 ring-border transition-all duration-150 group-hover:visible group-hover:opacity-100">
              <div className="flex flex-col gap-1.5">
                <span className="mb-1 text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-text-muted">
                  Massage Therapy
                </span>
                <Link
                  href="/treatments/relaxation-massage"
                  className="text-[0.875rem] text-text transition-colors hover:text-primary"
                >
                  Relaxation Massage
                </Link>
                <Link
                  href="/treatments/remedial-massage"
                  className="text-[0.875rem] text-text transition-colors hover:text-primary"
                >
                  Remedial Massage
                </Link>
                <Link
                  href="/treatments/pregnancy-massage"
                  className="text-[0.875rem] text-text transition-colors hover:text-primary"
                >
                  Pregnancy Massage
                </Link>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="mb-1 text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-text-muted">
                  Natural Healing
                </span>
                <Link
                  href="/treatments/natural-healing-reiki"
                  className="text-[0.875rem] text-text transition-colors hover:text-primary"
                >
                  Reiki
                </Link>
                <Link
                  href="/treatments/natural-healing-chakra-balance"
                  className="text-[0.875rem] text-text transition-colors hover:text-primary"
                >
                  Chakra Balance
                </Link>
                <Link
                  href="/treatments/natural-healing-aromatouch-technique"
                  className="text-[0.875rem] text-text transition-colors hover:text-primary"
                >
                  AromaTouch
                </Link>
                <Link
                  href="/treatments/natural-healing-ayurvedic-foot-massage"
                  className="text-[0.875rem] text-text transition-colors hover:text-primary"
                >
                  Ayurvedic Foot Massage
                </Link>
                <Link
                  href="/treatments/natural-healing-energy-healing-for-children"
                  className="text-[0.875rem] text-text transition-colors hover:text-primary"
                >
                  Energy Healing for Children
                </Link>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="mb-1 text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-text-muted">
                  Wellness & Recovery
                </span>
                <Link
                  href="/treatments/infrared-wellness-sauna-pod"
                  className="text-[0.875rem] text-text transition-colors hover:text-primary"
                >
                  Infrared Sauna POD
                </Link>
                <Link
                  href="/treatments/bodyroll"
                  className="text-[0.875rem] text-text transition-colors hover:text-primary"
                >
                  BodyROLL Machine
                </Link>
                <Link
                  href="/treatments/normatec-recovery-boots"
                  className="text-[0.875rem] text-text transition-colors hover:text-primary"
                >
                  NormaTec Boots
                </Link>
              </div>
              <Link
                href="/treatments"
                className="col-span-full border-t border-border pt-3 text-[0.8rem] font-medium text-primary"
              >
                View All Treatments →
              </Link>
            </div>
          </div>
          <Link
            href="/pricing"
            className="transition-colors hover:text-primary"
          >
            Pricing
          </Link>
          <Link href="/blog" className="transition-colors hover:text-primary">
            Wellness Blog
          </Link>
          <Link
            href="/contact"
            className="transition-colors hover:text-primary"
          >
            Contact
          </Link>
        </nav>

        {/* CTAs */}
        <div className="ml-auto hidden items-center gap-3 lg:flex">
          <Link
            href={settings?.fresha?.vouchersUrl || "#"}
            className={`${btnBase} text-text hover:text-primary`}
            target="_blank"
          >
            Vouchers
          </Link>
          <Link
            href={settings?.fresha?.bookNowUrl || "#"}
            className={`${btnBase} bg-primary text-white hover:bg-primary-hover`}
            target="_blank"
          >
            Book Now
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="ml-auto flex flex-col gap-[5px] border-none bg-transparent p-1 lg:hidden"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <span className="block h-0.5 w-6 bg-text" />
          <span className="block h-0.5 w-6 bg-text" />
          <span className="block h-0.5 w-6 bg-text" />
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="flex flex-col gap-4 border-t border-border bg-surface p-6 lg:hidden">
          <Link
            href="/about"
            onClick={() => setMenuOpen(false)}
            className="text-base"
          >
            About
          </Link>
          <Link
            href="/treatments"
            onClick={() => setMenuOpen(false)}
            className="text-base"
          >
            All Treatments
          </Link>
          <Link
            href="/pricing"
            onClick={() => setMenuOpen(false)}
            className="text-base"
          >
            Pricing
          </Link>
          <Link
            href="/blog"
            onClick={() => setMenuOpen(false)}
            className="text-base"
          >
            Wellness Blog
          </Link>
          <Link
            href="/contact"
            onClick={() => setMenuOpen(false)}
            className="text-base"
          >
            Contact
          </Link>
          <Link
            href={settings?.fresha?.bookNowUrl || "#"}
            className={`${btnBase} bg-primary text-white hover:bg-primary-hover`}
            target="_blank"
          >
            Book Now
          </Link>
        </div>
      )}
    </header>
  );
}
