'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  GitCompareArrows,
  MapPin,
  Star,
  Trash2,
  Check,
  Minus,
  Plus,
  Search,
} from 'lucide-react'
import { formatEGP } from '@/lib/utils'
import { COMPARE_MAX, useCompare } from '@/lib/compare'
import { useLanguage } from '@/lib/language-context'
import { Reveal } from '@/components/design'
import ShareButton from './share-button'

type Item = {
  id: string
  slug: string
  name: string
  nameArabic?: string | null
  tagline?: string | null
  coverImage?: string | null
  status: string
  startPrice?: number | null
  endPrice?: number | null
  pricePerSqm?: number | null
  downPaymentMin?: number | null
  installmentYears?: number | null
  totalUnits?: number | null
  totalArea?: number | null
  compoundArea?: number | null
  completionPercent?: number | null
  deliveryDate?: string | null
  propertyTypes: string[]
  listingTypes: string[]
  isFeatured: boolean
  isVerified: boolean
  viewCount: number
  favoriteCount: number
  developer?: {
    id: string
    companyName: string
    logo?: string | null
    isVerified: boolean
    rating?: number
    reviewCount?: number
  } | null
  location?: string | null
  amenities: { name: string; icon?: string | null; category: string; isPremium: boolean }[]
  paymentPlans: {
    id: string
    name: string
    downPaymentPct: number
    installmentYears: number
    cashDiscount?: number | null
    isDefault: boolean
  }[]
}

const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: 'Available',
  UNDER_CONSTRUCTION: 'Under construction',
  COMING_SOON: 'Coming soon',
  DELIVERED: 'Delivered',
  SOLD_OUT: 'Sold out',
}

const STATUS_LABEL_AR: Record<string, string> = {
  AVAILABLE: 'متاح',
  UNDER_CONSTRUCTION: 'تحت الإنشاء',
  COMING_SOON: 'قريباً',
  DELIVERED: 'تم التسليم',
  SOLD_OUT: 'نفدت',
}

export default function CompareView({ ids }: { ids?: string }) {
  const { lang, dir } = useLanguage()
  const ar = lang === 'ar'
  const { items: picked, remove, clear } = useCompare()
  const urlIds = useMemo(
    () => (ids || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, COMPARE_MAX),
    [ids]
  )
  const activeIds = urlIds.length > 0 ? urlIds : picked.map((p) => p.slug)
  const activeKey = activeIds.join(',')

  const [data, setData] = useState<Item[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picks, setPicks] = useState<Item[]>([])
  const [query, setQuery] = useState('')
  const router = useRouter()

  useEffect(() => {
    const wanted = activeKey.split(',').filter(Boolean)
    if (wanted.length === 0) {
      setData([])
      return
    }
    let cancelled = false
    setError(null)
    fetch(`/api/compare?ids=${encodeURIComponent(wanted.join(','))}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load'))))
      .then((d) => !cancelled && setData(d.items || []))
      .catch((e) => {
        console.error('Compare load failed:', e)
        if (!cancelled) setError(ar ? 'معرفناش نجيب المقارنة — جرب تاني.' : 'Could not load the comparison — try again.')
      })
    return () => {
      cancelled = true
    }
  }, [activeKey, ar])

  // Empty state: let the visitor pick projects to compare.
  useEffect(() => {
    if (data !== null && data.length > 0) return
    let cancelled = false
    fetch('/api/projects?limit=40')
      .then((r) => (r.ok ? r.json() : { projects: [] }))
      .then((d) => !cancelled && setPicks(d.projects || []))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [data])

  const amenityUnion = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of data || [])
      for (const a of item.amenities) if (!map.has(a.name)) map.set(a.name, a.category)
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [data])

  const filteredPicks = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return picks
    return picks.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.developer?.companyName || '').toLowerCase().includes(q)
    )
  }, [picks, query])

  const cheapestId = useMemo(() => {
    const withPrice = (data || []).filter((i) => typeof i.startPrice === 'number')
    if (withPrice.length < 2) return null
    return [...withPrice].sort((a, b) => (a.startPrice || 0) - (b.startPrice || 0))[0].id
  }, [data])

  const bestRatedId = useMemo(() => {
    const rated = (data || []).filter((i) => (i.developer?.rating || 0) > 0)
    if (rated.length < 2) return null
    return [...rated].sort((a, b) => (b.developer?.rating || 0) - (a.developer?.rating || 0))[0].id
  }, [data])

  /* ── Empty state ─────────────────────────────────── */
  if (data && data.length === 0) {
    return (
      <Reveal>
      <div className="rounded-2xl border border-white/10 dark:border-[#262626] bg-white/[0.04] dark:bg-[#0A0A0A] p-4 sm:p-8" dir={dir}>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display flex items-center gap-2 text-xl font-semibold text-white">
              <GitCompareArrows className="h-5 w-5 text-estate-gold" /> {ar ? `اختار لحد ${COMPARE_MAX} مشاريع` : `Pick up to ${COMPARE_MAX} projects`}
            </h2>
            <p className="mt-1 text-sm text-gray-400">
              {ar
                ? 'قارن الأسعار وخطط السداد والمرافق ومعاد التسليم جنب بعض.'
                : 'Compare prices, payment plans, amenities and delivery side by side.'}
            </p>
          </div>
          <label className="relative block w-full sm:w-auto">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={ar ? 'دور على مشروع أو مطور...' : 'Search projects or developers…'}
              className="w-full rounded-xl border border-white/10 dark:border-[#262626] bg-black/30 py-2.5 pe-3 ps-9 text-base text-white placeholder:text-gray-500 focus:border-estate-gold/60 focus:outline-none sm:w-72"
            />
          </label>
        </div>

        {picks.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500">{ar ? 'بنجيب المشاريع...' : 'Loading projects…'}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* Explicit 1fr column (not implicit auto) so long nowrap names
                truncate inside the viewport instead of sizing the track to
                their max-content and scrolling the whole page. */}
            {filteredPicks.slice(0, 30).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() =>
                  router.push(`/compare?ids=${encodeURIComponent([...activeKey.split(','), p.slug].filter(Boolean).join(','))}`)
                }
                className="flex items-center gap-3 rounded-2xl border border-white/10 dark:border-[#262626] bg-white/[0.03] dark:bg-[#0A0A0A] p-3 text-start transition-colors hover:border-estate-gold/50 hover:bg-white/[0.06]"
              >
                <div className="relative h-12 w-16 flex-shrink-0 overflow-hidden rounded-2xl bg-white/10">
                  {p.coverImage && (
                    <Image src={p.coverImage} alt="" fill sizes="64px" className="object-cover" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{p.name}</p>
                  <p className="truncate text-xs text-gray-500">
                    {p.developer?.companyName}
                    {typeof p.startPrice === 'number' ? (ar ? ` · من ${formatEGP(p.startPrice)}` : ` · from ${formatEGP(p.startPrice)}`) : ''}
                  </p>
                </div>
                <Plus className="ms-auto h-4 w-4 flex-shrink-0 text-estate-gold" />
              </button>
            ))}
          </div>
        )}
      </div>
      </Reveal>
    )
  }

  if (!data) {
    return <p className="py-16 text-center text-sm text-gray-500">{ar ? 'بنجيب المقارنة...' : 'Loading comparison…'}</p>
  }

  /* ── Comparison table ────────────────────────────── */
  const rows: { label: string; labelAr: string; render: (i: Item) => React.ReactNode }[] = [
    {
      label: 'Developer',
      labelAr: 'المطور',
      render: (i) => (
        <span className="flex items-center justify-center gap-1.5">
          {i.developer?.companyName || '—'}
          {i.developer?.isVerified && <Check className="h-3.5 w-3.5 text-blue-500" />}
        </span>
      ),
    },
    {
      label: 'Rating',
      labelAr: 'التقييم',
      render: (i) =>
        i.developer?.rating ? (
          <span className="flex items-center justify-center gap-1">
            <Star className="h-3.5 w-3.5 fill-estate-gold text-estate-gold" />
            {i.developer.rating.toFixed(1)}
            <span className="text-xs text-gray-500">({i.developer.reviewCount || 0})</span>
          </span>
        ) : (
          '—'
        ),
    },
    { label: 'Location', labelAr: 'الموقع', render: (i) => i.location || '—' },
    { label: 'Status', labelAr: 'الحالة', render: (i) => (ar ? STATUS_LABEL_AR[i.status] : STATUS_LABEL[i.status]) || i.status },
    {
      label: 'Starting price',
      labelAr: 'أقل سعر',
      render: (i) =>
        typeof i.startPrice === 'number' ? (
          <span className={i.id === cheapestId ? 'font-bold text-emerald-400' : 'text-white'}>
            {formatEGP(i.startPrice)}
            {i.id === cheapestId && <span className="ml-1 text-[10px] font-bold">{ar ? 'أقل سعر معروض' : 'Lowest price here'}</span>}
          </span>
        ) : (
          '—'
        ),
    },
    {
      label: 'Highest price',
      labelAr: 'أعلى سعر',
      render: (i) => (typeof i.endPrice === 'number' ? formatEGP(i.endPrice) : '—'),
    },
    {
      label: 'Price / m²',
      labelAr: 'سعر المتر',
      render: (i) => (typeof i.pricePerSqm === 'number' ? `${formatEGP(i.pricePerSqm)}` : '—'),
    },
    {
      label: 'Min. down payment',
      labelAr: 'أقل مقدم',
      render: (i) =>
        typeof i.downPaymentMin === 'number' ? `${i.downPaymentMin}%` : '—',
    },
    { label: 'Installments', labelAr: 'التقسيط', render: (i) => (i.installmentYears ? (ar ? `${i.installmentYears} سنة` : `${i.installmentYears} years`) : '—') },
    { label: 'Delivery', labelAr: 'التسليم', render: (i) => (i.deliveryDate ? new Date(i.deliveryDate).toLocaleDateString(ar ? 'ar-EG' : 'en-GB', { month: 'short', year: 'numeric' }) : '—') },
    { label: 'Completion', labelAr: 'الإنجاز', render: (i) => (i.completionPercent != null ? `${i.completionPercent}%` : '—') },
    { label: 'Total units', labelAr: 'إجمالي الوحدات', render: (i) => (i.totalUnits != null ? i.totalUnits.toLocaleString() : '—') },
    {
      label: 'Area',
      labelAr: 'المساحة',
      render: (i) => (i.totalArea || i.compoundArea ? `${(i.totalArea || i.compoundArea)!.toLocaleString()} ${ar ? 'م²' : 'm²'}` : '—'),
    },
    { label: 'Property types', labelAr: 'أنواع الوحدات', render: (i) => (i.propertyTypes.length ? i.propertyTypes.map((t) => t.replace(/_/g, ' ')).join(', ') : '—') },
    {
      label: 'Payment plan',
      labelAr: 'خطة السداد',
      render: (i) => {
        const plan = i.paymentPlans.find((p) => p.isDefault) || i.paymentPlans[0]
        return plan
          ? (ar ? `${plan.downPaymentPct}% مقدم · ${plan.installmentYears} سنة` : `${plan.downPaymentPct}% down · ${plan.installmentYears} yrs`)
          : '—'
      },
    },
    {
      label: 'Views',
      labelAr: 'الزيارات',
      render: (i) => i.viewCount.toLocaleString(),
    },
  ]

  return (
    <div className="space-y-6" dir={dir}>
      <Reveal>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="cine-kicker">Side by side</p>
          <p className="font-display mt-3 text-2xl font-bold text-white">
            {ar ? (
              <>بتقارن <span className="font-display font-semibold text-white">{data.length}</span> من {COMPARE_MAX} مشاريع</>
            ) : (
              <>Comparing <span className="font-display font-semibold text-white">{data.length}</span> of {COMPARE_MAX} projects</>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 max-sm:[&>*]:flex-1 max-sm:[&>*]:text-center">
          {data.length > 0 && <ShareButton ids={data.map((i) => i.id)} />}
          <button
            type="button"
            onClick={clear}
            className="min-h-[44px] rounded-full border border-white/15 px-4 py-2 text-xs text-gray-300 transition-colors hover:bg-white/10 sm:min-h-0"
          >
            {ar ? 'امسح الكل' : 'Clear all'}
          </button>
          <Link
            href="/projects"
            className="gold-shimmer inline-flex min-h-[44px] items-center justify-center rounded-full bg-estate-gold px-4 py-2 text-xs font-semibold text-[#0F1A2C] transition-colors hover:brightness-110 sm:min-h-0"
          >
            {ar ? 'اتفرج على مشاريع أكتر' : 'Browse more projects'}
          </Link>
        </div>
      </div>
      </Reveal>

      {error && (
        <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error} — <button type="button" className="underline" onClick={() => setData(null)}>{ar ? 'حاول تاني' : 'retry'}</button>
        </p>
      )}

      <Reveal>
        <div className="overflow-x-auto rounded-2xl border border-white/10 [-webkit-overflow-scrolling:touch] dark:border-[#262626]">
        <table className={`w-full border-collapse text-sm ${data.length > 1 ? 'min-w-[48rem]' : ''}`}>
          <thead>
            <tr>
              <th className="w-44 border-b border-white/10 bg-white/[0.05] p-4 text-left align-bottom text-xs font-medium uppercase tracking-wide text-gray-400 max-sm:sticky max-sm:start-0 max-sm:z-10 max-sm:bg-[#14141b] max-sm:dark:bg-black max-sm:shadow-[1px_0_0_0_rgba(255,255,255,0.1)] dark:border-[#262626] dark:bg-[#0A0A0A]">
                {ar ? 'المشروع' : 'Project'}
              </th>
              {data.map((item) => (
                <th key={item.id} className="border-b border-l border-white/10 dark:border-[#262626] bg-white/[0.05] dark:bg-[#0A0A0A] p-4 align-bottom">
                  <div className="space-y-2">
                    <div className="arch relative aspect-[16/9] w-full overflow-hidden bg-white/10">
                      {item.coverImage && (
                        <Image src={item.coverImage} alt={item.name} fill sizes="240px" className="object-cover" />
                      )}
                    </div>
                    <Link
                      href={`/projects/${item.slug}`}
                      className="font-display block break-words text-base font-semibold leading-snug text-white hover:text-estate-gold"
                    >
                      {item.name}
                    </Link>
                    {item.tagline && (
                      <p className="line-clamp-2 text-xs font-normal text-gray-500">{item.tagline}</p>
                    )}
                    <button
                      type="button"
                      onClick={() => remove(item.id)}
                      className="inline-flex min-h-[44px] items-center gap-1 px-1 py-2 text-[11px] text-gray-500 transition-colors hover:text-red-400 sm:min-h-0 sm:px-0 sm:py-0"
                    >
                      <Trash2 className="h-3 w-3" /> {ar ? 'شيل' : 'Remove'}
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.label} className={idx % 2 ? 'bg-white/[0.02]' : ''}>
                <th className="border-b border-white/10 p-4 text-left align-middle text-xs font-medium uppercase tracking-wide text-gray-400 max-sm:sticky max-sm:start-0 max-sm:z-10 max-sm:bg-[#14141b] max-sm:dark:bg-black max-sm:shadow-[1px_0_0_0_rgba(255,255,255,0.1)] dark:border-[#262626]">
                  {ar ? row.labelAr : row.label}
                </th>
                {data.map((item) => (
                  <td
                    key={item.id}
                    className="break-words border-b border-l border-white/10 dark:border-[#262626] p-4 text-center text-gray-200"
                  >
                    {row.render(item)}
                    {row.label === 'Rating' && item.id === bestRatedId && (
                      <span className="ml-1 text-[10px] font-bold text-estate-gold">{ar ? 'أعلى تقييم مطوّر' : 'Top-rated developer'}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}

            {/* Amenities: union header, per-project ✓ / — */}
            <tr className="bg-estate-gold/[0.06]">
              <th className="p-4 text-left align-middle text-xs font-semibold uppercase tracking-wide text-estate-gold max-sm:sticky max-sm:start-0 max-sm:z-10 max-sm:bg-[#14141b] max-sm:dark:bg-black max-sm:shadow-[1px_0_0_0_rgba(255,255,255,0.1)]">
                {ar ? `المرافق (${amenityUnion.length})` : `Amenities (${amenityUnion.length})`}
              </th>
              {data.map((item) => (
                <td key={item.id} className="border-l border-white/10 dark:border-[#262626] p-4 text-center text-xs text-gray-300">
                  {item.amenities.length} {ar ? 'متوفر' : 'included'}
                </td>
              ))}
            </tr>
            {amenityUnion.map(([name]) => (
              <tr key={name}>
                <th className="border-b border-white/10 p-3 text-left text-xs font-normal text-gray-400 max-sm:sticky max-sm:start-0 max-sm:z-10 max-sm:bg-[#14141b] max-sm:dark:bg-black max-sm:shadow-[1px_0_0_0_rgba(255,255,255,0.1)] dark:border-[#262626]">
                  {name}
                </th>
                {data.map((item) => {
                  const has = item.amenities.some((a) => a.name === name)
                  return (
                    <td key={item.id} className="border-b border-l border-white/10 dark:border-[#262626] p-3 text-center">
                      {has ? (
                        <Check className="mx-auto h-4 w-4 text-emerald-400" />
                      ) : (
                        <Minus className="mx-auto h-4 w-4 text-gray-600" />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Reveal>

      {/* Phone affordance: the table scrolls sideways; say so, plainly. */}
      <p className="flex items-center gap-2 text-xs leading-relaxed text-gray-500 max-sm:rounded-2xl max-sm:border max-sm:border-estate-gold/25 max-sm:bg-estate-gold/5 max-sm:px-4 max-sm:py-3 max-sm:text-sm max-sm:text-estate-gold">
        <MapPin className="h-3.5 w-3.5 shrink-0" />
        <span>
          {ar ? 'الأسعار متسجلة بالجنيه المصري. عملة العرض اللي مختارها بتتطبق تلقائياً.' : 'Prices are stored in EGP. Your active display currency applies automatically.'}
        </span>
      </p>
      <p className="sr-only">{ar ? 'اسحب الجدول يمين وشمال لمشاهدة كل الأعمدة كاملة.' : 'Swipe the table sideways to see all columns.'}</p>
      <p aria-hidden="true" className="max-sm:flex max-sm:items-center max-sm:gap-2 max-sm:pb-1 text-xs text-gray-500 lg:hidden">
        {ar ? '↔ اسحب الجدول يمين وشمال لكل الأعمدة' : '↔ Swipe to see all columns'}
      </p>
    </div>
  )
}
