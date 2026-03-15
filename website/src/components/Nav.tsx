'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { urlFor } from '@/lib/sanity'

export default function Nav({ settings }: { settings: any }) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="nav">
      <div className="nav-inner container">
        {/* Logo */}
        <Link href="/" className="nav-logo">
          {settings?.logo ? (
            <Image
              src={urlFor(settings.logo).height(60).url()}
              alt={settings.businessName || 'Bodyspace Recovery Studio'}
              width={160}
              height={40}
            />
          ) : (
            <span className="nav-logo-text">{settings?.businessName || 'Bodyspace'}</span>
          )}
        </Link>

        {/* Desktop nav */}
        <nav className="nav-links" aria-label="Main navigation">
          <Link href="/about">About</Link>
          <div className="nav-dropdown">
            <button className="nav-dropdown-trigger">Treatments ▾</button>
            <div className="nav-dropdown-menu">
              <div className="nav-dropdown-group">
                <span className="nav-dropdown-label">Massage Therapy</span>
                <Link href="/treatments/relaxation-massage">Relaxation Massage</Link>
                <Link href="/treatments/remedial-massage">Remedial Massage</Link>
                <Link href="/treatments/pregnancy-massage">Pregnancy Massage</Link>
              </div>
              <div className="nav-dropdown-group">
                <span className="nav-dropdown-label">Natural Healing</span>
                <Link href="/treatments/natural-healing-reiki">Reiki</Link>
                <Link href="/treatments/natural-healing-chakra-balance">Chakra Balance</Link>
                <Link href="/treatments/natural-healing-aromatouch-technique">AromaTouch</Link>
                <Link href="/treatments/natural-healing-ayurvedic-foot-massage">Ayurvedic Foot Massage</Link>
                <Link href="/treatments/natural-healing-energy-healing-for-children">Energy Healing for Children</Link>
              </div>
              <div className="nav-dropdown-group">
                <span className="nav-dropdown-label">Wellness & Recovery</span>
                <Link href="/treatments/infrared-wellness-sauna-pod">Infrared Sauna POD</Link>
                <Link href="/treatments/bodyroll">BodyROLL Machine</Link>
                <Link href="/treatments/normatec-recovery-boots">NormaTec Boots</Link>
              </div>
              <Link href="/treatments" className="nav-dropdown-all">View All Treatments →</Link>
            </div>
          </div>
          <Link href="/pricing">Pricing</Link>
          <Link href="/blog">Wellness Blog</Link>
          <Link href="/contact">Contact</Link>
        </nav>

        {/* CTAs */}
        <div className="nav-ctas">
          <Link
            href={settings?.fresha?.vouchersUrl || '#'}
            className="btn btn-ghost"
            target="_blank"
          >
            Vouchers
          </Link>
          <Link
            href={settings?.fresha?.bookNowUrl || '#'}
            className="btn btn-primary"
            target="_blank"
          >
            Book Now
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="nav-hamburger"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="nav-mobile">
          <Link href="/about" onClick={() => setMenuOpen(false)}>About</Link>
          <Link href="/treatments" onClick={() => setMenuOpen(false)}>All Treatments</Link>
          <Link href="/pricing" onClick={() => setMenuOpen(false)}>Pricing</Link>
          <Link href="/blog" onClick={() => setMenuOpen(false)}>Wellness Blog</Link>
          <Link href="/contact" onClick={() => setMenuOpen(false)}>Contact</Link>
          <Link href={settings?.fresha?.bookNowUrl || '#'} className="btn btn-primary" target="_blank">
            Book Now
          </Link>
        </div>
      )}
    </header>
  )
}
