'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowUpRight, Building2 } from 'lucide-react'
import { useLanguage } from '@/lib/language-context'
import { Reveal } from '@/components/design'
import { formatEGP } from '@/lib/utils'
import { LANDMARK_IMAGES, coverChain, landmarkForSlug } from '@/lib/landmarks'

interface ProjectItem {
  coverImage?: string | null
  city?: { name: string; nameArabic?: string | null; nameSlug?: string } | null
}

interface AreaSummary {
  city: { name: string; nameArabic?: string | null; nameSlug: string }
  projectCount: number
  minPrice: number | null
  image?: string | null
}

interface RegionSummary {
  key: string
  name: string
  nameArabic?: string | null
  projectCount: number
  minPrice: number | null
  image?: string | null
  citySlugs: string[]
}

interface LocationCard {
  name: string
  nameArabic?: string | null
  slug: string
  count: number
  minPrice: number | null
  image?: string | null
  /** Donated project cover — third step in the display chain when set. */
  cover?: string | null
}

interface RegionCard {
  key: string
  name: string
  nameArabic?: string | null
  count: number
  minPrice: number | null
  image?: string | null
  citySlugs: string[]
}

function money(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return formatEGP(value)
}

function LocationCardItem({ card, index }: { card: LocationCard; index: number }) {
  const { t, lang } = useLanguage()
  // Display chain: api image → landmark → donated project cover → placeholder.
  const sources = coverChain(card.image, landmarkForSlug(card.slug), card.cover)
  const [stage, setStage] = useState(0)

  useEffect(() => {
    setStage(0)
  }, [card.image, card.slug, card.cover])
  const imgSrc = sources[Math.min(stage, sources.length - 1)]

  const title = lang === 'ar' && card.nameArabic ? card.nameArabic : card.name
  const label = lang === 'ar'
    ? t('home.listingAvailable')
    : card.count === 1
      ? t('home.listingAvailable')
      : t('home.listingsAvailable')

  return (
    <div className="group relative overflow-hidden rounded-2xl bg-muted">
      <Link
        href={`/projects?city=${card.slug}`}
        className="block"
      >
        <div className="relative h-72 w-full overflow-hidden md:h-80">
          <Image
            src={imgSrc}
            alt={title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-700 group-hover:scale-105"
            onError={() => setStage((s) => (s < sources.length - 1 ? s + 1 : s))}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/20 to-black/65" />

          {/* Number */}
          <span className="absolute start-4 top-4 text-sm font-semibold tracking-widest text-white/80">
            {String(index + 1).padStart(2, '0')}
          </span>

          {/* Title + count + min price */}
          <div className="absolute inset-0 flex items-center px-5">
            <div className="flex w-full flex-col gap-1.5">
              <div className="flex w-full min-w-0 items-center justify-between gap-3">
                <h3 className="font-display min-w-0 break-words text-xl text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.45)] md:text-2xl">
                  {title}
                </h3>
                {card.count > 0 && (
                  <span className="shrink-0 whitespace-nowrap text-[11px] max-sm:text-xs text-white/70">{card.count} {label}</span>
                )}
              </div>
              <p className="break-words text-sm text-white/80">
                {lang === 'ar' ? 'الأسعار بتبدأ من' : 'Starting from'}{' '}
                <span className="font-bold text-estate-gold">
                  {card.minPrice !== null
                    ? money(card.minPrice)
                    : lang === 'ar'
                      ? 'لسه مفيش سعر معلن'
                      : 'No price info yet'}
                </span>
              </p>
            </div>
          </div>

          {/* Arrow */}
          <span className="absolute bottom-4 end-4 flex h-8 w-8 items-center justify-center text-white/80 transition-colors duration-300 group-hover:text-estate-gold">
            <ArrowUpRight className="h-5 w-5" />
          </span>
        </div>
      </Link>
    </div>
  )
}

function RegionStripItem({
  region,
  selected,
  onToggle,
}: {
  region: RegionCard
  selected: boolean
  onToggle: () => void
}) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  // Display chain: api image → landmark → placeholder, stepped onError.
  const sources = coverChain(region.image, landmarkForSlug(region.key))
  const [stage, setStage] = useState(0)

  useEffect(() => {
    setStage(0)
  }, [region.image, region.key])
  const imgSrc = sources[Math.min(stage, sources.length - 1)]

  const title = ar && region.nameArabic ? region.nameArabic : region.name

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={`group w-40 shrink-0 overflow-hidden rounded-2xl border text-start transition-colors hover:border-estate-gold/40 ${
        selected
          ? 'border-estate-gold ring-1 ring-estate-gold'
          : 'border-gray-200 dark:border-[#262626]'
      } bg-muted`}
    >
      <span className="relative block h-20 w-full overflow-hidden">
        <Image
          src={imgSrc}
          alt={title}
          fill
          sizes="160px"
          className="object-cover transition-transform duration-700 group-hover:scale-105"
          onError={() => setStage((s) => (s < sources.length - 1 ? s + 1 : s))}
        />
        <span className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/50" />
      </span>
      <span className="block px-3 pb-3 pt-2">
        <span className="block truncate text-sm font-bold">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {region.count} {ar ? 'مشروع' : region.count === 1 ? 'listing' : 'listings'}
          {' · '}
          {region.minPrice !== null ? money(region.minPrice) : '—'}
        </span>
      </span>
    </button>
  )
}

export default function LocationsView() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'

  const [cards, setCards] = useState<LocationCard[] | null>(null)
  const [regions, setRegions] = useState<RegionCard[] | null>(null)
  const [unassignedCount, setUnassignedCount] = useState(0)
  const [regionKey, setRegionKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setCards(null)
    setRegions(null)
    setUnassignedCount(0)
    setRegionKey(null)
    setError(null)

    // Counts + min prices come from the uncapped `/api/areas` grouping; the
    // projects page only donates one cover image per city (api image wins,
    // then landmark art), so a capped page here never drops a city.
    Promise.all([
      fetch('/api/areas').then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load')))),
      fetch('/api/projects?limit=50')
        .then((r) => (r.ok ? r.json() : { projects: [] }))
        .catch(() => ({ projects: [] })),
    ])
      .then(([a, p]) => {
        if (cancelled) return
        const covers = new Map<string, string>()
        for (const project of (p.projects || []) as ProjectItem[]) {
          const city = project.city
          if (!city?.name) continue
          const slug = city.nameSlug || city.name.toLowerCase().replace(/\s+/g, '-')
          if (covers.has(slug) || !project.coverImage) continue
          covers.set(slug, project.coverImage)
        }
        const list: LocationCard[] = ((a.areas || []) as AreaSummary[]).map((area) => ({
          name: area.city.name,
          nameArabic: area.city.nameArabic,
          slug: area.city.nameSlug,
          count: area.projectCount,
          minPrice: area.minPrice,
          image: area.image || LANDMARK_IMAGES[area.city.nameSlug] || null,
          cover: covers.get(area.city.nameSlug) || null,
        }))
        setCards(list)
        const regionList: RegionCard[] = ((a.regions ?? []) as RegionSummary[]).map((region) => ({
          key: region.key,
          name: region.name,
          nameArabic: region.nameArabic,
          count: region.projectCount,
          minPrice: region.minPrice,
          image: region.image || LANDMARK_IMAGES[region.key] || null,
          citySlugs: region.citySlugs ?? [],
        }))
        setRegions(regionList)
        setUnassignedCount(typeof a.unassigned?.count === 'number' ? a.unassigned.count : 0)
      })
      .catch(() => {
        if (!cancelled) setError(ar ? 'معرفناش نجيب المناطق — جرب تاني.' : 'Could not load the areas — try again.')
      })

    return () => {
      cancelled = true
    }
  }, [ar, attempt])

  if (cards === null && !error) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-72 animate-pulse rounded-2xl bg-muted md:h-80" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900 dark:bg-red-950">
        <p className="text-sm text-red-600 dark:text-red-300">{error}</p>
        <button
          onClick={() => setAttempt((a) => a + 1)}
          className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-full bg-estate-gold px-4 py-2 text-sm font-medium text-[#0F1A2C] sm:min-h-0"
        >
          {ar ? 'جرب تاني' : 'Try again'}
        </button>
      </div>
    )
  }

  const activeRegion = (regions ?? []).find((r) => r.key === regionKey) ?? null
  const slugSet = new Set(activeRegion?.citySlugs ?? [])
  const visible = activeRegion ? cards!.filter((c) => slugSet.has(c.slug)) : cards!

  if (cards!.length === 0) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-dashed border-gray-300 p-6 text-center md:p-10 dark:border-[#262626]">
        <Building2 className="mx-auto h-10 w-10 text-estate-gold" />
        <h2 className="mt-4 text-xl font-bold">
          {ar ? 'لسه مفيش مناطق' : 'No areas yet'}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {ar
            ? 'المناطق هتظهر هنا أول ما يبقى فيه مشاريع معروضة.'
            : 'Areas show up here once projects are listed.'}
        </p>
        <Link
          href="/projects"
          className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-full bg-estate-gold px-5 py-2.5 text-sm font-medium text-[#0F1A2C] sm:min-h-0"
        >
          {ar ? 'اتفرج على المشاريع' : 'Browse projects'}
        </Link>
      </div>
    )
  }

  return (
    <div>
      {(regions ?? []).length > 0 ? (
        <div className="mb-6">
          <h2 className="font-display mb-3 text-base">
            {ar ? 'دوّر حسب المنطقة' : 'Browse by region'}
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {regions!.map((region) => (
              <RegionStripItem
                key={region.key}
                region={region}
                selected={region.key === regionKey}
                onToggle={() => setRegionKey((prev) => (prev === region.key ? null : region.key))}
              />
            ))}
          </div>
          {activeRegion ? (
            <button
              type="button"
              onClick={() => setRegionKey(null)}
              className="mt-2 inline-flex min-h-[44px] items-center text-sm font-medium text-estate-gold hover:underline sm:min-h-0"
            >
              {ar ? 'اعرض كل المدن' : 'Show all cities'}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((card, i) => (
          <Reveal key={card.slug} delay={Math.min(i % 3, 2) * 80}>
            <LocationCardItem card={card} index={i} />
          </Reveal>
        ))}
      </div>
      {unassignedCount > 0 ? (
        <p className="mx-auto mt-6 max-w-2xl text-center text-xs text-muted-foreground">
          {ar
            ? `مشروع ${unassignedCount} بره المناطق المصنفة`
            : `${unassignedCount} projects outside classified areas`}
        </p>
      ) : null}
      <p className="mx-auto mt-8 max-w-2xl text-center text-xs text-muted-foreground">
        {ar
          ? 'عايز تفاصيل أكتر عن خدمات كل منطقة؟ شوف دليل المناطق.'
          : 'Want service details per area? See the area guide.'}{' '}
        <Link href="/areas" className="font-medium text-estate-gold hover:underline">
          {ar ? 'دليل المناطق' : 'Area guide'}
        </Link>
      </p>
    </div>
  )
}
