import { Metadata } from 'next'
import { db } from '@/lib/db'
import { PUBLIC_PROJECT_WHERE } from '@/lib/project-visibility'
import { SITE_URL } from '@/lib/site'
import ProjectsMapView from './map-view'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'خريطة المشاريع | Projects Map',
  description:
    'كل مشاريع غاية على خريطة مصر تفاعلية — من الساحل الشمالي للقاهرة الجديدة والعاصمة الإدارية. Interactive map of every project listed on GHAYA.',
  alternates: { canonical: `${SITE_URL}/projects/map` },
}

export default async function ProjectsMapPage() {
  const projects = await db.project.findMany({
    where: { ...PUBLIC_PROJECT_WHERE, latitude: { not: null }, longitude: { not: null } },
    select: {
      id: true,
      slug: true,
      name: true,
      nameArabic: true,
      status: true,
      startPrice: true,
      latitude: true,
      longitude: true,
      city: { select: { name: true, nameArabic: true } },
    },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="font-display mb-2 text-3xl font-bold md:text-4xl">خريطة المشاريع</h1>
      <p className="mb-6 text-muted-foreground">
        {projects.length} مشروع بتوقيتهم الحقيقي على الخريطة — دوس على أي نقطة تفتح المشروع.
        المصدر إحداثيات المشاريع نفسها، مش تقديرات.
      </p>
      <ProjectsMapView
        projects={projects.map((p) => ({
          slug: p.slug,
          name: p.nameArabic || p.name,
          status: p.status,
          startPrice: p.startPrice,
          lat: p.latitude as number,
          lng: p.longitude as number,
          city: (p.city?.nameArabic || p.city?.name) ?? null,
        }))}
      />
    </div>
  )
}
