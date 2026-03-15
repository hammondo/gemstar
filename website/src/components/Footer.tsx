import Link from 'next/link'

export default function Footer({ settings }: { settings: any }) {
  return (
    <footer className="footer">
      <div className="container footer-inner">

        <div className="footer-brand">
          <p className="footer-name">{settings?.businessName || 'Bodyspace Recovery Studio'}</p>
          <p className="footer-tagline">{settings?.tagline || 'Relax. Recharge. Recover.'}</p>
          <div className="footer-social">
            {settings?.social?.instagram && (
              <a href={settings.social.instagram} target="_blank" rel="noopener noreferrer">Instagram</a>
            )}
            {settings?.social?.facebook && (
              <a href={settings.social.facebook} target="_blank" rel="noopener noreferrer">Facebook</a>
            )}
          </div>
        </div>

        <div className="footer-nav">
          <h4>Treatments</h4>
          <Link href="/treatments/relaxation-massage">Relaxation Massage</Link>
          <Link href="/treatments/remedial-massage">Remedial Massage</Link>
          <Link href="/treatments/infrared-wellness-sauna-pod">Infrared Sauna POD</Link>
          <Link href="/treatments/bodyroll">BodyROLL Machine</Link>
          <Link href="/treatments/normatec-recovery-boots">NormaTec Boots</Link>
          <Link href="/treatments">All Treatments →</Link>
        </div>

        <div className="footer-nav">
          <h4>Studio</h4>
          <Link href="/about">About Us</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/blog">Wellness Blog</Link>
          <Link href="/contact">Contact</Link>
        </div>

        <div className="footer-contact">
          <h4>Visit Us</h4>
          {settings?.address && (
            <a
              href={settings.address.googleMapsUrl || '#'}
              target="_blank"
              rel="noopener noreferrer"
            >
              {settings.address.street && <span>{settings.address.street}</span>}
              {settings.address.suburb && (
                <span>{settings.address.suburb}, {settings.address.state} {settings.address.postcode}</span>
              )}
            </a>
          )}
          {settings?.hours && <p>{settings.hours}</p>}
          {settings?.phone && <a href={`tel:${settings.phone}`}>{settings.phone}</a>}
          {settings?.email && <a href={`mailto:${settings.email}`}>{settings.email}</a>}
          <div className="footer-ctas">
            <Link href={settings?.fresha?.bookNowUrl || '#'} className="btn btn-primary btn-sm" target="_blank">
              Book Now
            </Link>
            <Link href={settings?.fresha?.vouchersUrl || '#'} className="btn btn-outline btn-sm" target="_blank">
              Gift Vouchers
            </Link>
          </div>
        </div>

      </div>
      <div className="footer-bottom">
        <p>© {new Date().getFullYear()} {settings?.businessName || 'Bodyspace Recovery Studio'}. All rights reserved.</p>
      </div>
    </footer>
  )
}
