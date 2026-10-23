import { Metadata } from 'next'
import { SITE_NAME, SITE_URL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Contact Us',
  description: 'تواصل مع غاية للاستفسار عن المشاريع والوحدات أو الشراكات والدعم.',
  alternates: { canonical: `${SITE_URL}/contact` },
  openGraph: {
    type: 'website',
    title: 'تواصل مع غاية العقارية | Contact GHAYA',
    description: 'تواصل مع فريق غاية للاستفسار عن العقارات والمشاريع والشراكات.',
    url: `${SITE_URL}/contact`,
    siteName: SITE_NAME,
  },
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
