'use client'

import Link from 'next/link'
import { ChevronLeft, ChevronRight, LayoutGrid, List } from 'lucide-react'
import { ProjectCard } from '@/components/projects/project-card'
import { Reveal } from '@/components/design'
import { useLanguage } from '@/lib/language-context'
import { cn } from '@/lib/utils'
import { useState } from 'react'

interface ProjectsResultsProps {
  results: {
    items: any[]
    total: number
    page: number
    limit: number
    totalPages: number
  }
  searchParams: Record<string, string | undefined>
}

export function ProjectsResults({ results, searchParams }: ProjectsResultsProps) {
  const { t, lang } = useLanguage()
  const [view, setView] = useState<'grid' | 'list'>('grid')

  const buildPageUrl = (page: number) => {
    const params = new URLSearchParams()
    // Preserve every filter the listing honors so paging never drops them.
    for (const key of ['q', 'city', 'governorate', 'district', 'propertyType', 'listingType', 'bedrooms', 'bathrooms', 'minPrice', 'maxPrice', 'minArea', 'maxArea', 'developer', 'status', 'amenities', 'limit'] as const) {
      if (searchParams[key]) params.set(key, searchParams[key]!)
    }
    if (searchParams.sortBy && searchParams.sortBy !== 'newest') params.set('sortBy', searchParams.sortBy)
    params.set('page', String(page))
    return `/projects?${params.toString()}`
  }

  if (results.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-[#0A0A0A] dark:border dark:border-[#262626]">
          <svg className="h-7 w-7 text-gray-300 dark:text-[#737373]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </div>
        <h3 className="font-display mb-1 text-lg font-semibold text-gray-900 dark:text-white">{t('projects.noResults')}</h3>
        <p className="mb-4 max-w-sm text-sm text-gray-500">{t('projects.noResultsHint')}</p>
        <Link href="/projects" className="gold-shimmer inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-estate-gold px-4 py-2 text-sm font-medium text-[#0F1A2C] hover:bg-estate-gold-dark md:min-h-0 dark:bg-estate-gold dark:hover:bg-estate-gold-dark">
          {t('projects.clearFilters')}
        </Link>
      </div>
    )
  }

  return (
    <div>
      {/* Results header */}
      <div className="mb-5 flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          <span className="font-display text-base font-bold text-gray-900 dark:text-white">{results.total}</span> {t('projects.projects')}
        </p>
        <div className="flex items-center gap-1 rounded-2xl border border-gray-200 bg-white p-0.5 dark:border-[#262626] dark:bg-[#0A0A0A]">
          <button
            onClick={() => setView('grid')}
            aria-label={lang === 'ar' ? 'عرض شبكي' : 'Grid view'}
            className={cn('flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-colors md:min-h-0 md:min-w-0 md:h-7 md:w-7', view === 'grid' ? 'bg-gray-100 text-gray-900 dark:bg-black dark:text-white' : 'text-gray-400')}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setView('list')}
            aria-label={lang === 'ar' ? 'عرض قايمة' : 'List view'}
            className={cn('flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-colors md:min-h-0 md:min-w-0 md:h-7 md:w-7', view === 'list' ? 'bg-gray-100 text-gray-900 dark:bg-black dark:text-white' : 'text-gray-400')}
          >
            <List className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Fogg prompt: one inline nudge when the set is small enough to compare */}
      {results.total >= 2 && results.total <= 6 && results.items.length > 1 && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-estate-gold/50 bg-estate-gold/5 px-4 py-2.5">
          <p className="text-xs text-muted-foreground">
            {lang === 'ar'
              ? `المقارنة هتوضح الفروق — قارن الـ${results.items.length} دول جنب بعض`
              : `Comparing clears up the differences — see these ${results.items.length} side by side`}
          </p>
          <Link
            href={`/compare?ids=${results.items.map((p) => p.slug || p.id).filter(Boolean).join(',')}`}
            className="inline-flex min-h-[44px] items-center rounded-full bg-estate-gold px-3.5 py-1.5 text-xs font-semibold text-[#0F1A2C] transition-colors hover:bg-estate-gold-dark md:min-h-0"
          >
            {lang === 'ar' ? 'قارن دلوقتي' : 'Compare now'}
          </Link>
        </div>
      )}

      {/* Grid */}
      <div className={cn(
        'gap-5',
        view === 'grid'
          ? 'grid sm:grid-cols-2 lg:grid-cols-3'
          : 'flex flex-col'
      )}>
        {results.items.map((project, i) => (
          <Reveal key={project.id} delay={(i % 3) * 80}>
            <ProjectCard project={project} />
          </Reveal>
        ))}
      </div>

      {/* Pagination — wraps on phones so 7 numbered links never force page-level sideways scroll. */}
      {results.totalPages > 1 && (
        <div className="mt-10 flex flex-wrap items-center justify-center gap-1.5">
          {results.page > 1 && (
            <Link
              href={buildPageUrl(results.page - 1)}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-full border border-gray-200 bg-white px-3 text-sm font-medium text-gray-600 transition-all hover:border-estate-gold hover:text-estate-navy md:min-h-0 md:min-w-0 md:h-9 dark:border-[#262626] dark:bg-[#0A0A0A] dark:text-gray-300 dark:hover:border-estate-gold dark:hover:text-estate-gold"
            >
              <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
              <span className="hidden sm:inline">{lang === 'ar' ? 'السابق' : 'Prev'}</span>
            </Link>
          )}

          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(results.totalPages, 7) }, (_, i) => {
              let page: number
              if (results.totalPages <= 7) {
                page = i + 1
              } else if (results.page <= 4) {
                page = i + 1
              } else if (results.page >= results.totalPages - 3) {
                page = results.totalPages - 6 + i
              } else {
                page = results.page - 3 + i
              }
              return (
                <Link
                  key={page}
                  href={buildPageUrl(page)}
                  className={cn(
                    'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-sm font-medium transition-all md:min-h-0 md:min-w-0 md:h-9 md:w-9',
                    page === results.page
                      ? 'bg-estate-gold text-[#0F1A2C] shadow-sm dark:bg-estate-gold'
                      : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-black'
                  )}
                >
                  {page}
                </Link>
              )
            })}
          </div>

          {results.page < results.totalPages && (
            <Link
              href={buildPageUrl(results.page + 1)}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-full border border-gray-200 bg-white px-3 text-sm font-medium text-gray-600 transition-all hover:border-estate-gold hover:text-estate-navy md:min-h-0 md:min-w-0 md:h-9 dark:border-[#262626] dark:bg-[#0A0A0A] dark:text-gray-300 dark:hover:border-estate-gold dark:hover:text-estate-gold"
            >
              <span className="hidden sm:inline">{lang === 'ar' ? 'التالي' : 'Next'}</span>
              <ChevronRight className="h-4 w-4 rtl:rotate-180" />
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
