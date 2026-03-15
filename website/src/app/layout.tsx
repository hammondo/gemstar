import type { Metadata } from 'next'
import { getSiteSettings } from '@/lib/queries'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import './globals.css'

export const metadata: Metadata = {
  title: 'Bodyspace Recovery Studio | Wellness Studio & Spa | Jandakot, Perth',
  description: 'Relax, Recharge, Recover. Perth\'s premium wellness studio offering infrared therapy, massage, and natural healing in Jandakot.',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const settings = await getSiteSettings()

  return (
    <html lang="en">
      <body>
        <Nav settings={settings} />
        <main>{children}</main>
        <Footer settings={settings} />
      </body>
    </html>
  )
}
