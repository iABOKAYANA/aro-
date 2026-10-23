'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import { ArrowRight, ArrowUpRight, Bell, BellRing, Loader2 } from 'lucide-react'
import { useLanguage } from '@/lib/language-context'
import { Reveal, SectionHeader } from '@/components/design'
import { coverChain, landmarkForSlug } from '@/lib/landmarks'
import { useAppType } from '@/lib/use-app-type'

interface ProjectItem {
  coverImage?: string | null
  city?: { name: string; nameArabic?: string | null; nameSlug?: string } | null
}

interface LocationCard {
  name: string
  nameArabic?: string | null
  slug: string
  count: number
  image?: string | null
}

const FALLBACK_CITIES: LocationCard[] = [
  { name: 'New Cairo', nameArabic: 'القاهرة الجديدة', slug: 'new-cairo', count: 0, image: '/images/projects/eastown-cover.jpg' },
  { name: 'Sheikh Zayed', nameArabic: 'الشيخ زايد', slug: 'sheikh-zayed', count: 0, image: '/images/projects/eastown-1.jpg' },
  { name: 'Fifth Settlement', nameArabic: 'التجمع الخامس', slug: 'fifth-settlement', count: 0, image: '/images/projects/icity-cover.jpg' },
]

function buildCards(projects: ProjectItem[]): LocationCard[] {
  const grouped = new Map<string, LocationCard>()

  for (const project of projects) {
    const city = project.city
    if (!city?.name) continue

    const slug = city.nameSlug || city.name.toLowerCase().replace(/\s+/g, '-')
    const existing = grouped.get(slug)

    if (existing) {
      existing.count += 1
      if (!existing.image && project.coverImage) existing.image = project.coverImage
    } else {
      grouped.set(slug, {
        name: city.name,
        nameArabic: city.nameArabic,
        slug,
        count: 1,
        image: project.coverImage || null,
      })
    }
  }

  const cards = [...grouped.values()].sort((a, b) => b.count - a.count)

  // Top up with fallback cities so we always show a full row
  for (const fallback of FALLBACK_CITIES) {
    if (cards.length >= 3) break
    if (!cards.some(c => c.slug === fallback.slug)) cards.push({ ...fallback })
  }

  return cards.slice(0, 3)
}

function LocationCardItem({ card, index }: { card: LocationCard; index: number }) {
  const { t, lang } = useLanguage()
  // Display chain: project cover → city landmark → placeholder, stepped onError.
  const sources = coverChain(card.image, landmarkForSlug(card.slug))
  const [stage, setStage] = useState(0)

  useEffect(() => {
    setStage(0)
  }, [card.image, card.slug])
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
        {/* Image — wipe reveal on the square inner box (card rounding lives on the outer wrapper). */}
        <Reveal variant="wipe" className="relative h-72 w-full overflow-hidden md:h-80">
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
          <span className="absolute left-4 top-4 text-sm font-semibold tracking-widest text-white/80">
            {String(index + 1).padStart(2, '0')}
          </span>

          {/* Title + count */}
          <div className="absolute inset-0 flex items-center px-5">
            <div className="flex w-full items-center justify-between gap-3">
              <h3 className="font-display text-xl font-bold text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.45)] md:text-2xl">
                {title}
              </h3>
              {card.count > 0 && (
                <span className="text-[11px] text-white/70">{card.count} {label}</span>
              )}
            </div>
          </div>

          {/* Arrow */}
          <span className="absolute bottom-4 right-4 flex h-8 w-8 items-center justify-center text-white/80 transition-colors duration-300 group-hover:text-estate-gold">
            <ArrowUpRight className="h-5 w-5" />
          </span>
        </Reveal>
      </Link>
      <CityFollowButton slug={card.slug} />
    </div>
  )
}

/**
 * Follow / unfollow this city — `POST /api/watch { targetType: 'CITY',
 * targetId: slug }`. Console/`all` visitors who are signed out are sent to
 * login (the same `callbackUrl` convention the favorite / save-search
 * buttons use); only signed-in users ever write a watch row. On the PUBLIC
 * host (zero login) the button is an app-only badge — never a dead link to
 * the removed login page.
 */
function CityFollowButton({ slug }: { slug: string }) {
  const { lang } = useLanguage()
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const isPublic = useAppType() === 'public'
  const [following, setFollowing] = useState(false)
  const [watchId, setWatchId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (status !== 'authenticated') {
      setReady(true)
      return
    }
    let alive = true
    fetch('/api/watch')
      .then((r) => (r.ok ? r.json() : { watches: [] }))
      .then((d) => {
        if (!alive) return
        const match = (d.watches || []).find(
          (w: { targetType: string; targetId: string }) =>
            w.targetType === 'CITY' && String(w.targetId).toLowerCase() === slug.toLowerCase(),
        )
        if (match) {
          setFollowing(true)
          setWatchId(match.id)
        }
        setReady(true)
      })
      .catch(() => setReady(true))
    return () => {
      alive = false
    }
  }, [status, slug])

  const onClick = async (e: { preventDefault(): void; stopPropagation(): void }) => {
    e.preventDefault()
    e.stopPropagation()
    if (status === 'unauthenticated' || !session?.user) {
      // Public host: no login to send anyone to — the badge below already
      // says alerts live in the app, so a tap is a no-op.
      if (isPublic) return
      router.push(`/auth/login?callbackUrl=${encodeURIComponent(pathname || '/')}`)
      return
    }
    if (status !== 'authenticated' || busy) return
    setBusy(true)
    try {
      if (following && watchId) {
        const res = await fetch('/api/watch', {
          method: 'DELETE',
          headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: watchId }),
        })
        if (!res.ok) throw new Error('Failed')
        setFollowing(false)
        setWatchId(null)
      } else {
        const res = await fetch('/api/watch', {
          method: 'POST',
          headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetType: 'CITY', targetId: slug }),
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(d.error || 'Failed')
        setFollowing(true)
        setWatchId(d.watch?.id || null)
      }
    } catch {
      /* network error — keep previous state */
    } finally {
      setBusy(false)
    }
  }

  const label = lang === 'ar'
    ? (!ready || busy ? '…' : following ? 'بتتابعها ✓' : isPublic ? '🔔 التنبيهات في التطبيق' : '+ تابع المدينة')
    : (!ready || busy ? '…' : following ? 'Following ✓' : isPublic ? '🔔 Alerts in the app' : '+ Follow city')

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!ready || busy || status === 'loading'}
      aria-pressed={following}
      title={lang === 'ar' ? (isPublic ? 'الحسابات والتنبيهات في تطبيق غاية — حمّله وتابع من هناك' : 'تابع المدينة عشان توصلك المشاريع الجديدة') : (isPublic ? 'Accounts & alerts live in the Ghaya app — download it and pick up from there' : 'Follow this city for new-project alerts')}
      className={
        following
          ? 'absolute bottom-4 left-4 z-10 inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-estate-gold px-4 text-xs font-semibold text-[#0F1A2C] backdrop-blur transition-colors hover:bg-estate-gold-dark disabled:opacity-70'
          : 'absolute bottom-4 left-4 z-10 inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-black/45 px-4 text-xs font-semibold text-white backdrop-blur transition-colors hover:bg-black/65 disabled:opacity-70'
      }
    >
      {busy || !ready ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : following ? (
        <BellRing className="h-3.5 w-3.5" />
      ) : (
        <Bell className="h-3.5 w-3.5" />
      )}
      {label}
    </button>
  )
}

export function ExploreLocations() {
  const { t, lang } = useLanguage()
  const [cards, setCards] = useState<LocationCard[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    fetch('/api/projects?limit=200')
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        setCards(buildCards(d.projects || []))
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="relative overflow-hidden bg-estate-sand py-16 dark:bg-estate-navy md:py-20">
      <div aria-hidden="true" className="mashrabiya pointer-events-none absolute inset-0 opacity-50" />
      <div className="cine-scrim" aria-hidden="true" />
      <div className="cine-vignette" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
      <div className="container relative px-4">
        {/* Header — same copy and same three links; kicker picks up a soft cinematic shadow (theme-aware). */}
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between [&_.section-kicker]:[text-shadow:0_1px_8px_rgba(184,146,58,0.35)] dark:[&_.section-kicker]:[text-shadow:0_1px_12px_rgba(0,0,0,0.6)]">
          <SectionHeader
            kicker={t('home.exploreSubtitle')}
            title={t('home.exploreHeading')}
          />

          <div className="flex flex-wrap items-end gap-x-4 gap-y-2 min-w-0">
            {/* Real chips — the top 3 cities by project count, once loaded
                (no empty "top 3" claim before data arrives).
                min-w-0 (not shrink-0): the chips strip must wrap inside the
                container — with shrink-0 it overflowed wide and the section's
                overflow-hidden CLIPPED the chips on smaller screens. */}
            {cards.length > 0 && (
              <span className="inline-flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className="shrink-0">{lang === 'ar' ? 'المناطق الأكثر عرضًا —' : 'Areas with most projects —'}</span>
                {cards.map((c) => (
                  <Link
                    key={c.slug}
                    href={`/projects?city=${c.slug}`}
                    className="inline-flex min-h-[36px] items-center rounded-full bg-muted px-3 text-xs font-semibold text-foreground transition-colors hover:bg-estate-gold/15 hover:text-estate-gold dark:bg-black"
                  >
                    {lang === 'ar' && c.nameArabic ? c.nameArabic : c.name}
                    <span className="ms-1.5 text-[10px] font-normal text-muted-foreground">{c.count}</span>
                  </Link>
                ))}
              </span>
            )}
            <Link
              href="/locations"
              className="inline-flex min-h-[44px] shrink-0 items-center gap-2 px-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {lang === 'ar' ? 'كل المناطق' : 'All areas'}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </Link>
            <Link
              href="/areas"
              className="inline-flex min-h-[44px] shrink-0 items-center gap-2 px-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {lang === 'ar' ? 'دليل المناطق' : 'Area guide'}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </Link>
            <Link
              href="/projects"
              className="inline-flex min-h-[44px] shrink-0 items-center gap-2 px-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {t('home.exploreLink')}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </Link>
          </div>
        </div>

        {/* Cards */}
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-72 animate-pulse rounded-2xl bg-muted md:h-80" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((card, i) => (
              <Reveal key={card.slug} delay={(i % 3) * 80}>
                <LocationCardItem card={card} index={i} />
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
