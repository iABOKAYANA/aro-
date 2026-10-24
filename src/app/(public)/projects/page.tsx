import { Suspense } from 'react'
import { Metadata } from 'next'
import { ProjectsPageClient } from './projects-page-client'
import { searchProjects } from '@/lib/search'
import { matchKnownProjectNames } from '@/lib/ai-llm'
import { projectSearchUnderstanding, type AiSearchUnderstanding } from '@/lib/ai-page-search'
import { SITE_URL, languageAlternates } from '@/lib/site'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'مشاريع وكمبوندات مصر | Projects & Compounds',
  description:
    'تصفح مشاريع وكمبوندات مصر — التجمع الخامس والعاصمة الإدارية والشيخ زايد والساحل الشمالي: أسعار حقيقية ومساحات وخطط سداد. Browse verified Egyptian projects and compounds with real prices, areas and payment plans.',
  alternates: languageAlternates('/projects'),
  openGraph: {
    title: 'مشاريع وكمبوندات مصر | Projects & Compounds',
    description:
      'تصفح مشاريع وكمبوندات مصر بأسعار حقيقية ومساحات وخطط سداد — التجمع، العاصمة الإدارية، زايد، الساحل.',
    url: `${SITE_URL}/projects`,
    siteName: 'GHAYA REAL ESTATE',
    images: [
      {
        url: `${SITE_URL}/og?t=${encodeURIComponent('Projects & Compounds in Egypt')}&s=${encodeURIComponent('Real prices, areas and payment plans')}`,
        width: 1200,
        height: 630,
        alt: 'GHAYA REAL ESTATE — Projects',
      },
    ],
  },
}

interface ProjectsPageProps {
  searchParams: Record<string, string | undefined>
}

async function ProjectsData({ searchParams }: ProjectsPageProps) {
  const filters = {
    q: searchParams.q,
    governorate: searchParams.governorate,
    city: searchParams.city,
    district: searchParams.district,
    propertyType: searchParams.propertyType as any,
    listingType: searchParams.listingType as any,
    minPrice: searchParams.minPrice ? Number(searchParams.minPrice) : undefined,
    maxPrice: searchParams.maxPrice ? Number(searchParams.maxPrice) : undefined,
    bedrooms: searchParams.bedrooms ? Number(searchParams.bedrooms) : undefined,
    bathrooms: searchParams.bathrooms ? Number(searchParams.bathrooms) : undefined,
    minArea: searchParams.minArea ? Number(searchParams.minArea) : undefined,
    maxArea: searchParams.maxArea ? Number(searchParams.maxArea) : undefined,
    status: searchParams.status,
    developer: searchParams.developer,
    amenities: searchParams.amenities,
    sortBy: (searchParams.sortBy as any) || 'newest',
    page: searchParams.page ? Math.min(500, Math.max(1, Number(searchParams.page) || 1)) : 1,
    limit: searchParams.limit ? Math.min(50, Math.max(1, Number(searchParams.limit) || 12)) : 12,
  }

  // عين in the listing page, not just the chat: the same understanding the
  // assistant applies to a chat message is applied to the browser search box.
  // URL filter params always beat عين's parsed values, and when عين matched
  // named projects the raw phrase is never IP-impossible-as-substring (whole-
  // phrase ILIKE would match nothing and zero out the page).
  let ai: AiSearchUnderstanding | null = null
  const rawQ = (searchParams.q || '').trim()
  if (rawQ) {
    const matches = await matchKnownProjectNames(rawQ)
    ai = projectSearchUnderstanding(rawQ, searchParams, matches)
    if (ai.ids && ai.ids.length > 0) {
      ;(filters as Record<string, unknown>).ids = ai.ids
      filters.q = undefined
    } else if (ai.dropQ) {
      filters.q = undefined
      Object.assign(filters, ai.patch)
    }
  }

  const results = await searchProjects(filters)
  return { results, ai }
}

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const q = searchParams.q
  const { results, ai } = await ProjectsData({ searchParams })

  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-estate-gold border-t-transparent" />
            <p className="text-sm text-muted-foreground">Loading projects...</p>
          </div>
        </div>
      </div>
    }>
      <ProjectsPageClient results={results} searchParams={searchParams} q={q} ai={ai} />
    </Suspense>
  )
}
