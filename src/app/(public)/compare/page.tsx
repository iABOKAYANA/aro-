import { Metadata } from 'next'
import dynamicImport from 'next/dynamic'
import { GitCompareArrows } from 'lucide-react'
// Interactive 451-line comparison table splits out; server H1/description
// above stay static and the table still server-renders via default SSR.
const CompareView = dynamicImport(() => import('./compare-view'))
import { SITE_URL, languageAlternates } from '@/lib/site'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'قارن المشاريع | Compare Projects',
  description:
    'حط لحد ٤ مشاريع جنب بعض — السعر وخطط السداد والمساحات والاستلام والمطور. Compare up to 4 Egyptian projects side by side: prices, payment plans, areas, delivery and developers.',
  alternates: languageAlternates('/compare'),
  openGraph: {
    title: 'قارن المشاريع | GHAYA REAL ESTATE',
    description:
      'حط لحد ٤ مشاريع جنب بعض — السعر وخطط السداد والمساحات والاستلام والمطور.',
    url: `${SITE_URL}/compare`,
    images: [
      {
        url: `${SITE_URL}/og?t=${encodeURIComponent('Compare Projects')}&s=${encodeURIComponent('Price, area and payment plans side by side')}`,
        width: 1200,
        height: 630,
        alt: 'GHAYA REAL ESTATE — Compare Projects',
      },
    ],
  },
}

export default function ComparePage({
  searchParams,
}: {
  searchParams: { ids?: string }
}) {
  return (
    <div className="container px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 text-center sm:mb-8">
          <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-estate-gold/10 px-3 py-1 text-xs font-medium text-estate-gold">
            <GitCompareArrows className="h-3 w-3" /> Side by side
          </span>
          <h1 className="text-2xl font-bold sm:text-4xl">Compare Projects</h1>
          <p className="mx-auto mt-3 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Put up to four projects next to each other and see how they really stack up — price,
            payment plan, amenities, delivery and the developer behind them.
          </p>
        </div>

        <CompareView ids={searchParams.ids} />
      </div>
    </div>
  )
}
