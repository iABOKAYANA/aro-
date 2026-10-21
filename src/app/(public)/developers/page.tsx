import { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { db } from '@/lib/db'
import { PUBLIC_PROJECT_WHERE } from '@/lib/project-visibility'
import { SITE_URL } from '@/lib/site'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'مطورو العقارات في مصر | Real Estate Developers',
  description:
    'دليل شركات تطوير العقارات في مصر الممثلة على غاية — تاريخ كل شركة ومشاريعها وأقل سعر متاح. Verified developers behind every project listed on GHAYA.',
  alternates: { canonical: `${SITE_URL}/developers` },
}

export default async function DevelopersPage() {
  const devs = await db.developerProfile.findMany({
    where: { projects: { some: PUBLIC_PROJECT_WHERE } },
    select: {
      id: true,
      slug: true,
      companyName: true,
      companyNameArabic: true,
      logo: true,
      foundedYear: true,
      headquarters: true,
      isVerified: true,
      projects: {
        where: PUBLIC_PROJECT_WHERE,
        select: { slug: true, name: true, startPrice: true },
      },
    },
    orderBy: { companyName: 'asc' },
  })

  const cards = devs
    .filter((d) => d.slug && d.projects.length > 0)
    .sort((a, b) => b.projects.length - a.projects.length)

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="font-display mb-2 text-3xl font-bold md:text-4xl">
        مطورو العقارات في مصر
      </h1>
      <p className="mb-8 max-w-2xl text-muted-foreground">
        كل شركة تطوير ممثلة على غاية — مشاريعها الشغالة حاليًا وأقل سعر فيها.
        الداتا من الكاتالوج الفعلي، مش من إعلانات.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((d) => {
          const minPrice = Math.min(
            ...d.projects.map((p) => p.startPrice ?? Infinity).filter(Number.isFinite)
          )
          return (
            <Link key={d.id} href={`/developers/${d.slug}`} className="group">
              <Card className="h-full border-estate-gold/15 transition-colors group-hover:border-estate-gold/40">
                <CardContent className="flex h-full items-center gap-4 p-5">
                  {d.logo && (
                    <Image
                      src={d.logo}
                      alt={d.companyName}
                      width={56}
                      height={56}
                      className="h-14 w-14 shrink-0 rounded-xl border border-border object-contain p-1"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-display mb-1 flex items-center gap-2 truncate text-lg font-semibold">
                      <span className="truncate">{d.companyNameArabic || d.companyName}</span>
                      {d.isVerified && <Badge variant="gold" className="shrink-0 px-1.5 py-0 text-[10px]">موثّق</Badge>}
                    </p>
                    <p className="mb-1 text-xs text-muted-foreground">
                      {d.projects.length} {d.projects.length === 1 ? 'مشروع' : 'مشاريع'} معروضين
                      {Number.isFinite(minPrice) && <> · يبدأ من {new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(minPrice)} ج</>}
                    </p>
                    <p className="truncate text-xs text-estate-gold group-hover:underline">شوف المشاريع ←</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      {cards.length === 0 && (
        <p className="text-muted-foreground">لا يوجد مطورون معروضون حاليًا.</p>
      )}
    </div>
  )
}
