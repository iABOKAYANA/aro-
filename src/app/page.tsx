import { Suspense } from 'react'
import { HomePage } from '@/app/home-page'
import { organizationJsonLd } from '@/lib/seo'

export const dynamic = 'force-dynamic'

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
