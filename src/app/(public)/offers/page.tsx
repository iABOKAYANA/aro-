import { Metadata } from 'next'
import { BadgePercent } from 'lucide-react'
import OffersView from './offers-view'
import { SITE_URL, languageAlternates } from '@/lib/site'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'رادار العروض | Offers Radar',
  description:
    'كل خصومات الكاش الشغالة في مكان واحد — المشروع وخطة السداد ونسبة الخصم والسعر قبل وبعد. Every live cash-discount offer in one radar.',
  alternates: languageAlternates('/offers'),
  openGraph: {
    title: 'عروض عقارية في مصر | Real Estate Offers',
    description:
      'كل خصومات الكاش الشغالة في مكان واحد — المشروع والخطة والسعر قبل وبعد.',
    url: `${SITE_URL}/offers`,
    siteName: 'GHAYA REAL ESTATE',
    images: [
      {
        url: `${SITE_URL}/og?t=${encodeURIComponent('Offers Radar')}&s=${encodeURIComponent('Live cash discounts across Egypt')}`,
        width: 1200,
        height: 630,
        alt: 'GHAYA REAL ESTATE — Offers Radar',
      },
    ],
  },
}

export default function OffersPage() {
  return (
    <div className="container px-4 py-8 md:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 text-center">
          <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-estate-gold/10 px-3 py-1 text-xs font-medium text-estate-gold">
            <BadgePercent className="h-3 w-3" /> رادار العروض · Cash discounts
          </span>
          <h1 className="text-3xl font-bold md:text-4xl">رادار العروض</h1>
          <p className="mx-auto mt-3 max-w-2xl text-base text-muted-foreground md:text-lg">
            كل خصومات الكاش الشغالة في مكان واحد — المشروع وخطة السداد ونسبة
            الخصم والسعر قبل وبعد الخصم.
          </p>
        </div>

        <OffersView />
      </div>
    </div>
  )
}
