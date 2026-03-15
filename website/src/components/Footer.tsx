import Link from "next/link";

export default function Footer({ settings }: { settings: any }) {
  const containerClass = "mx-auto w-full max-w-[1180px] px-6";
  const btnBase =
    "inline-flex items-center justify-center whitespace-nowrap rounded-sm border border-transparent px-7 py-3 text-[0.875rem] font-medium uppercase tracking-[0.06em] transition-all duration-200";

  return (
    <footer className="bg-text pt-16 text-white/75">
      <div
        className={`${containerClass} grid gap-12 pb-12 md:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1.5fr]`}
      >
        <div>
          <p className="mb-2 font-display text-[1.4rem] text-white">
            {settings?.businessName || "Bodyspace Recovery Studio"}
          </p>
          <p className="mb-5 font-display italic">
            {settings?.tagline || "Relax. Recharge. Recover."}
          </p>
          <div className="flex gap-4">
            {settings?.social?.instagram && (
              <a
                href={settings.social.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[0.8rem] uppercase tracking-[0.08em] transition-colors hover:text-white"
              >
                Instagram
              </a>
            )}
            {settings?.social?.facebook && (
              <a
                href={settings.social.facebook}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[0.8rem] uppercase tracking-[0.08em] transition-colors hover:text-white"
              >
                Facebook
              </a>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h4 className="mb-2 text-[0.75rem] uppercase tracking-[0.12em] text-white">
            Treatments
          </h4>
          <Link
            href="/treatments/relaxation-massage"
            className="text-[0.875rem] transition-colors hover:text-white"
          >
            Relaxation Massage
          </Link>
          <Link
            href="/treatments/remedial-massage"
            className="text-[0.875rem] transition-colors hover:text-white"
          >
            Remedial Massage
          </Link>
          <Link
            href="/treatments/infrared-wellness-sauna-pod"
            className="text-[0.875rem] transition-colors hover:text-white"
          >
            Infrared Sauna POD
          </Link>
          <Link
            href="/treatments/bodyroll"
            className="text-[0.875rem] transition-colors hover:text-white"
          >
            BodyROLL Machine
          </Link>
          <Link
            href="/treatments/normatec-recovery-boots"
            className="text-[0.875rem] transition-colors hover:text-white"
          >
            NormaTec Boots
          </Link>
          <Link
            href="/treatments"
            className="text-[0.875rem] transition-colors hover:text-white"
          >
            All Treatments →
          </Link>
        </div>

        <div className="flex flex-col gap-2">
          <h4 className="mb-2 text-[0.75rem] uppercase tracking-[0.12em] text-white">
            Studio
          </h4>
          <Link
            href="/about"
            className="text-[0.875rem] transition-colors hover:text-white"
          >
            About Us
          </Link>
          <Link
            href="/pricing"
            className="text-[0.875rem] transition-colors hover:text-white"
          >
            Pricing
          </Link>
          <Link
            href="/blog"
            className="text-[0.875rem] transition-colors hover:text-white"
          >
            Wellness Blog
          </Link>
          <Link
            href="/contact"
            className="text-[0.875rem] transition-colors hover:text-white"
          >
            Contact
          </Link>
        </div>

        <div className="flex flex-col gap-1.5">
          <h4 className="mb-2 text-[0.75rem] uppercase tracking-[0.12em] text-white">
            Visit Us
          </h4>
          {settings?.address && (
            <a
              href={settings.address.googleMapsUrl || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[0.875rem] transition-colors hover:text-white"
            >
              {settings.address.street && (
                <span>{settings.address.street}</span>
              )}
              {settings.address.suburb && (
                <span>
                  {settings.address.suburb}, {settings.address.state}{" "}
                  {settings.address.postcode}
                </span>
              )}
            </a>
          )}
          {settings?.hours && (
            <p className="text-[0.875rem]">{settings.hours}</p>
          )}
          {settings?.phone && (
            <a
              href={`tel:${settings.phone}`}
              className="text-[0.875rem] transition-colors hover:text-white"
            >
              {settings.phone}
            </a>
          )}
          {settings?.email && (
            <a
              href={`mailto:${settings.email}`}
              className="text-[0.875rem] transition-colors hover:text-white"
            >
              {settings.email}
            </a>
          )}
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href={settings?.fresha?.bookNowUrl || "#"}
              className={`${btnBase} px-5 py-2.5 text-[0.8rem] bg-primary text-white hover:bg-primary-hover`}
              target="_blank"
            >
              Book Now
            </Link>
            <Link
              href={settings?.fresha?.vouchersUrl || "#"}
              className={`${btnBase} px-5 py-2.5 text-[0.8rem] border-[1.5px] border-primary text-primary hover:bg-primary hover:text-white`}
              target="_blank"
            >
              Gift Vouchers
            </Link>
          </div>
        </div>
      </div>
      <div className="border-t border-white/10 py-5 text-center text-[0.8rem] text-white/40">
        <p>
          © {new Date().getFullYear()}{" "}
          {settings?.businessName || "Bodyspace Recovery Studio"}. All rights
          reserved.
        </p>
      </div>
    </footer>
  );
}
