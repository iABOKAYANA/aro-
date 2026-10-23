import type { Metadata } from 'next'
import { Suspense } from 'react'
import { HomePage } from '@/app/home-page'
import { organizationJsonLd } from '@/lib/seo'
import { SITE_NAME, SITE_URL } from '@/lib/site'

export const dynamic = 'force-dynamic'

const homeTitle = 'مشاريع ووحدات عقارية في مصر | GHAYA REAL ESTATE'
const homeDescription = 'استكشف مشاريع ووحدات عقارية في مصر. Compare Egyptian projects, available units, prices, areas and payment plans on GHAYA.'

export const metadata: Metadata = {
  title: { absolute: homeTitle },
  description: homeDescription,
  alternates: { canonical: `${SITE_URL}/` },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: `${SITE_URL}/`,
    siteName: SITE_NAME,
    title: homeTitle,
    description: homeDescription,
    images: [{ url: `${SITE_URL}/og`, width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: { card: 'summary_large_image', title: homeTitle, description: homeDescription, images: [`${SITE_URL}/og`] },
}

export default function Page() {
  // Server-rendered Organization + WebSite (+SearchAction) graph so crawlers
  // see it without JS; the interactive homepage itself stays client-side.
  const jsonLd = organizationJsonLd()
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-estate-gold border-t-transparent" /></div>}>
        <HomePage />
      </Suspense>
    </>
  )
}
