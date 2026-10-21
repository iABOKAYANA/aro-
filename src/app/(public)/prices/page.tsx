import { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db'
import { getFeatureFlags } from '@/lib/feature-flags'
import { PUBLIC_APPROVAL_STATUSES } from '@/lib/project-visibility'
import { formatEGP } from '@/lib/utils'
import { SITE_URL, languageAlternates } from '@/lib/site'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'أسعار المتر في مصر | اكتشف السوق ببيانات حقيقية',
  description:
    'متوسط وأقل سعر متر حسب المنطقة ونوع الوحدة — محسوبة من مخزون غاية الحقيقي (مش تقديرات). Price-per-sqm explorer computed from our real catalog.',
  alternates: languageAlternates('/prices'),
  openGraph: {
    title: 'أسعار المتر في مصر | GHAYA REAL ESTATE',
    description: 'أسعار المتر حسب المنطقة والنوع من كتالوج حقيقي موثّق.',
    url: `${SITE_URL}/prices`,
  },
}

const TYPE_AR: Record<string, string> = {
  APARTMENT: 'شقة',
  VILLA: 'فيلا',
  TOWNHOUSE: 'تاون هاوس',
  PENTHOUSE: 'بنتهاوس',
  STUDIO: 'استوديو',
  DUPLEX: 'دوبلكس',
  CHALET: 'شاليه',
  LAND: 'أرض',
  COMMERCIAL: 'تجاري',
  ADMINISTRATIVE: 'إداري',
  MEDICAL: 'طبي',
  UNKNOWN: 'غير محدد',
}

interface AreaStat {
  city: string
  type: string
  count: number
  minPsm: number
  maxPsm: number
  avgPsm: number
}

async function notEnabled() {
  return (
    <div className="mx-auto max-w-xl p-10 text-center text-sm text-muted-foreground" dir="rtl" lang="ar">
      الخدمة دي مقفولة حاليًا.
    </div>
  )
}

export default async function PricesPage() {
  const flags = await getFeatureFlags()
  if (!flags.price_explorer) return notEnabled()

  // Real inventory only: AVAILABLE, not showroom samples, positive price+area.
  const units = await db.unit.findMany({
    where: {
      status: 'AVAILABLE',
      isSample: false,
      price: { gt: 0 },
      area: { gt: 0 },
      project: { isActive: true, approvalStatus: { in: PUBLIC_APPROVAL_STATUSES } },
    },
    select: {
      unitType: true,
      price: true,
      area: true,
      project: { select: { city: { select: { name: true } }, name: true } },
    },
  })

  // Aggregate price/m² by (city, type).
  const buckets = new Map<string, AreaStat>()
  for (const u of units) {
    const city = u.project.city?.name || 'غير محدد'
    const type = u.unitType || 'UNKNOWN'
    const psm = u.price / u.area
    if (!Number.isFinite(psm) || psm <= 0) continue
    const key = `${city}|${type}`
    const b = buckets.get(key) || { city, type, count: 0, minPsm: psm, maxPsm: psm, avgPsm: 0 }
    b.count += 1
    b.minPsm = Math.min(b.minPsm, psm)
    b.maxPsm = Math.max(b.maxPsm, psm)
    b.avgPsm += psm
    buckets.set(key, b)
  }
  const stats: AreaStat[] = [...buckets.values()]
    .map((b) => ({ ...b, avgPsm: Math.round(b.avgPsm / b.count) }))
    .sort((a, b) => b.count - a.count)

  // Group stats by city, most-quoted regions first.
  const byCity = new Map<string, AreaStat[]>()
  for (const s of stats) {
    const list = byCity.get(s.city) || []
    list.push(s)
    byCity.set(s.city, list)
  }
  const cities = [...byCity.entries()].sort((a, b) => {
    const ca = a[1].reduce((t, s) => t + s.count, 0)
    const cb = b[1].reduce((t, s) => t + s.count, 0)
    return cb - ca
  })

  const totalUnits = units.length

  return (
    <div dir="rtl" lang="ar" className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold">أسعار المتر في السوق</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        محسوبة من <b>{totalUnits}</b> وحدة حقيقية في كتالوج غاية (متاح حاليًا) — أقل وأعلى ومتوسط سعر المتر لكل منطقة ونوع. مش تقديرات ولا دعاية.
      </p>

      {cities.length === 0 && (
        <p className="mt-8 text-sm text-muted-foreground">لسه مفيش بيانات كفاية — ترجع تاني بعد التحديث القادم.</p>
      )}

      <div className="mt-6 space-y-6">
        {cities.map(([city, list]) => (
          <Card key={city}>
            <CardContent className="p-5">
              <h2 className="mb-3 flex items-center justify-between text-lg font-bold">
                {city}
                <Badge variant="outline">{list.reduce((t, s) => t + s.count, 0)} وحدة</Badge>
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-start text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-1.5 text-start font-medium">النوع</th>
                      <th className="py-1.5 text-start font-medium">عدد الوحدات</th>
                      <th className="py-1.5 text-start font-medium">أقل سعر متر</th>
                      <th className="py-1.5 text-start font-medium">متوسط سعر المتر</th>
                      <th className="py-1.5 text-start font-medium">أعلى سعر متر</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((s) => (
                      <tr key={s.type} className="border-t">
                        <td className="py-2 font-medium">{TYPE_AR[s.type] || s.type}</td>
                        <td className="py-2 text-muted-foreground">{s.count}</td>
                        <td className="py-2">{formatEGP(Math.round(s.minPsm))}</td>
                        <td className="py-2 font-bold text-estate-gold">{formatEGP(s.avgPsm)}</td>
                        <td className="py-2 text-muted-foreground">{formatEGP(Math.round(s.maxPsm))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="mt-8 text-sm text-muted-foreground">
        عايز تشوف الوحدات نفسها؟{' '}
        <Link href="/ai-tools/affordability" className="text-estate-gold hover:underline">
          جرّب حاسبة «قد إيه أقدر أدفع»
        </Link>{' '}
        أو{' '}
        <Link href="/projects" className="text-estate-gold hover:underline">
          تصفح المشاريع
        </Link>
        .
      </p>
    </div>
  )
}
