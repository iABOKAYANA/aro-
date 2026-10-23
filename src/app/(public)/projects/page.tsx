import { Suspense } from 'react'
import { Metadata } from 'next'
import { ProjectsPageClient } from './projects-page-client'
import { searchProjects } from '@/lib/search'
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

  const results = await searchProjects(filters)
  return results
}

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const q = searchParams.q
  const results = await ProjectsData({ searchParams })

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
      <ProjectsPageClient results={results} searchParams={searchParams} q={q} />
    </Suspense>
  )
}
