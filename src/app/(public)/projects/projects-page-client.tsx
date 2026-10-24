'use client'

import { Suspense, useState } from 'react'
import dynamic from 'next/dynamic'
import { List, Map as MapIcon } from 'lucide-react'
import { ProjectsResults } from '@/components/projects/projects-results'
// Map widget loads only when the user switches to map view (default is list).
// Browser-only (Leaflet CDN injection via document/window), so ssr:false.
const ProjectsListingMap = dynamic(
  () => import('@/components/projects/projects-listing-map').then((mod) => mod.ProjectsListingMap),
  { ssr: false }
)
import { QuickFilters } from '@/components/search/quick-filters'
import { SearchProvider } from '@/components/search/search-context'
import { useLanguage } from '@/lib/language-context'
import { cn } from '@/lib/utils'
import SaveSearchButton from '@/components/saved-searches/save-search-button'
import { NlSearchBox } from '@/components/projects/nl-search-box'

interface ProjectItem {
  id: string
  name: string
  nameArabic?: string | null
  slug: string
  coverImage?: string | null
  tagline?: string | null
  status: string
  startPrice?: number | null
  endPrice?: number | null
  propertyTypes: string
  completionPercent?: number | null
  viewCount: number
  favoriteCount: number
  governorate?: { name: string; nameArabic?: string | null } | null
  city?: { name: string; nameArabic?: string | null } | null
  district?: { name: string; nameArabic?: string | null } | null
  developer?: { companyName: string; logo?: string | null; isVerified: boolean } | null
  units?: { price: number; area: number; bedrooms?: number | null }[]
  amenities?: { amenity: { name: string; icon?: string | null } }[]
}

interface ProjectsPageClientProps {
  results: {
    items: ProjectItem[]
    total: number
    page: number
    limit: number
    totalPages: number
  }
  searchParams: Record<string, string | undefined>
  q?: string
}

export function ProjectsPageClient({ results, searchParams, q }: ProjectsPageClientProps) {
  const { lang } = useLanguage()
  const [view, setView] = useState<'list' | 'map'>('list')
  const ar = lang === 'ar'

  return (
    <SearchProvider>
      <div className="min-h-screen bg-gray-50 dark:bg-black">
        {/* Hero */}
        <div className="relative bg-estate-navy dark:bg-black">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(212,168,67,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.08) 0%, transparent 40%)' }} />
          </div>
          <div className="container relative px-4 py-10 md:py-14">
            <div className="mx-auto max-w-2xl text-center">
              <p className="mb-2 text-xs font-medium uppercase tracking-widest text-white/50">
                GHAYA REAL ESTATE
              </p>
              <h1 className="break-words text-3xl font-bold text-white md:text-4xl">
                {q ? (
                  ar ? (
                    <>نتائج البحث عن <span className="text-estate-gold">&ldquo;{q}&rdquo;</span></>
                  ) : (
                    <>Search results for <span className="text-estate-gold">&ldquo;{q}&rdquo;</span></>
                  )
                ) : (
                  ar ? 'اكتشف العقار المناسب لك' : 'Find Your Perfect Home'
                )}
              </h1>
              <p className="mt-3 text-sm text-white/60">
                {ar ? 'تصفّح المشاريع والوحدات المنشورة في مختلف أنحاء مصر.' : 'Browse projects and units currently listed across Egypt.'}
              </p>
              <div className="mt-4">
                <NlSearchBox />
              </div>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-b from-transparent to-gray-50 dark:to-black" />
        </div>

        {/* Content */}
        <div className="container px-4 py-6">
          <Suspense fallback={
            <div className="flex items-center justify-center py-24">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-estate-gold border-t-transparent" />
                <p className="text-sm text-muted-foreground">{ar ? 'جارٍ تحميل المشاريع...' : 'Loading projects...'}</p>
              </div>
            </div>
          }>
            <div className="space-y-0">
              {/* Toggle row wraps on narrow phones so the save-search action never squeezes off-screen. */}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                {/* List/Map toggle — same toggle as the mobile Explore tab */}
                <div className="flex items-center gap-1 rounded-2xl border border-gray-200 bg-white p-0.5 dark:border-[#262626] dark:bg-[#0A0A0A]">
                  <button
                    onClick={() => setView('list')}
                    className={cn(
                      'flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors md:min-h-0 md:h-7',
                      view === 'list' ? 'bg-gray-100 text-gray-900 dark:bg-black dark:text-white' : 'text-gray-400'
                    )}
                  >
                    <List className="h-3.5 w-3.5" />
                    {ar ? 'قايمة' : 'List'}
                  </button>
                  <button
                    onClick={() => setView('map')}
                    className={cn(
                      'flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors md:min-h-0 md:h-7',
                      view === 'map' ? 'bg-gray-100 text-gray-900 dark:bg-black dark:text-white' : 'text-gray-400'
                    )}
                  >
                    <MapIcon className="h-3.5 w-3.5" />
                    {ar ? 'خريطة' : 'Map'}
                  </button>
                </div>
                <SaveSearchButton searchParams={searchParams} />
              </div>
              <QuickFilters total={results.total} resultCount={results.items.length} />
              {view === 'map' ? (
                <ProjectsListingMap searchParams={searchParams} />
              ) : (
                <ProjectsResults results={results} searchParams={searchParams} />
              )}
            </div>
          </Suspense>
        </div>
      </div>
    </SearchProvider>
  )
}
