'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, ArrowUpRight, Brain, Phone } from 'lucide-react'
import { HeroSearch } from '@/components/search/hero-search'
import { ProjectCard } from '@/components/projects/project-card'
// Booking modal + next-auth graph splits out; button shell still SSR'd.
const BookingButton = dynamic(
  () => import('@/components/viewings/booking-modal').then((mod) => mod.BookingButton)
)
import { useCompare } from '@/lib/compare'
// Below-fold locations section (+ next-auth graph) splits out; SSR kept.
const ExploreLocations = dynamic(
  () => import('@/components/locations/explore-locations').then((mod) => mod.ExploreLocations)
)
import { NewLaunchesSection } from '@/components/projects/new-launches-section'
import { Button } from '@/components/ui/button'
import { Reveal, SectionHeader } from '@/components/design'
import { useLanguage } from '@/lib/language-context'
import { formatEGP } from '@/lib/utils'
import { getRecentProjects, type SavedProject } from '@/lib/saved-projects'

const developerLogos = [
  'SODIC', 'Mountain View', 'Emaar', 'Palm Hills', 'Talaat Moustafa Group',
  'Dar Al-Mimar', 'Coldwell Banker', 'Reef Development',
]

function recentLabel(savedAt: number, ar: boolean): string {
  const days = Math.floor((Date.now() - savedAt) / 86_400_000)
  if (ar) {
    if (days <= 0) return 'شفتها النهاردة'
    if (days === 1) return 'شفتها امبارح'
    return `شفتها من ${days} أيام`
  }
  if (days <= 0) return 'Seen today'
  if (days === 1) return 'Seen yesterday'
  return `Seen ${days}d ago`
}

export function HomePage() {
  const { t, lang } = useLanguage()
  const [projects, setProjects] = useState<any[]>([])
  const [stats, setStats] = useState({ totalProjects: 0, totalDevelopers: 0, totalCities: 0 })
  const [statsReady, setStatsReady] = useState(false)
  const [recent, setRecent] = useState<SavedProject[]>([])
  const [newLaunches, setNewLaunches] = useState<any[]>([])
  const { toggle: toggleCompare, has: hasCompare } = useCompare()

  useEffect(() => {
    fetch('/api/projects?limit=6')
      .then(r => r.json())
      .then(d => {
        const items = d.projects || d.items || []
        setProjects(items)
        const cities = new Set(items.map((p: any) => p.city?.name).filter(Boolean))
        const devs = new Set(items.map((p: any) => p.developer?.companyName).filter(Boolean))
        setStats({ totalProjects: items.length, totalDevelopers: devs.size, totalCities: cities.size })
        setStatsReady(true)
      })
      .catch(() => {
        // Keep the stats bar hidden on failure — never flash 0+.
        setStatsReady(false)
      })
  }, [])

  useEffect(() => {
    setRecent(getRecentProjects())
  }, [])

  // Featured kicker as a question — only from data already fetched above.
  const installmentTerms = projects
    .map((p: any) => p.installmentYears)
    .filter((y: unknown): y is number => typeof y === 'number' && y > 0)
  const featuredKicker =
    installmentTerms.length > 0
      ? (lang === 'ar'
        ? `${installmentTerms.length} مشاريع فيها تقسيط ${Math.max(...installmentTerms)} سنين — تحب تشوف أنهي؟`
        : `${installmentTerms.length} projects with plans up to ${Math.max(...installmentTerms)} years — which one catches your eye?`)
      : t('home.featuredProjectsCount')

  useEffect(() => {
    // Server-computed: honors the CEO's New Launches window/limit/pin/hide config
    fetch('/api/new-launches')
      .then((r) => r.json())
      .then((d) => setNewLaunches(d.items || []))
      .catch(() => {})
  }, [])

  return (
    <div className="dark:bg-black">
      <HeroSearch />

      {/* Stats bar — hidden until the counts load so it never flashes 0+ */}
      {statsReady && (
      <section className="border-b bg-muted/30 py-6 dark:border-[#262626] dark:bg-black">
        <div className="container px-4">
          <div className="grid grid-cols-3 gap-2 text-center sm:gap-4 [&>*]:min-w-0">
            <Reveal>
              <p className="text-2xl font-bold text-estate-gold">{stats.totalProjects}+</p>
              <p className="break-words text-xs text-muted-foreground">{t('stat.properties')}</p>
            </Reveal>
            <Reveal delay={80}>
              <p className="text-2xl font-bold text-estate-gold">{stats.totalDevelopers}+</p>
              <p className="break-words text-xs text-muted-foreground">{t('stat.developers')}</p>
            </Reveal>
            <Reveal delay={160}>
              <p className="text-2xl font-bold text-estate-gold">{stats.totalCities}+</p>
              <p className="break-words text-xs text-muted-foreground">{t('stat.citiesCovered')}</p>
            </Reveal>
          </div>
        </div>
      </section>
      )}

      {/* Featured Projects — ProjectCard itself is sibling-owned: only the wrapper is styled */}
      <section className="py-16 dark:bg-black">
        <div className="container px-4">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <SectionHeader
              kicker={featuredKicker}
              title={t('home.featuredProjects')}
              description={t('home.featuredSubtitle')}
            />
            <Button asChild variant="outline" className="min-h-[44px] md:min-h-0">
              <Link href="/projects">
                {t('home.viewAll')} <ArrowRight className="ms-2 h-4 w-4" />
              </Link>
            </Button>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project: any, i: number) => (
              <Reveal key={project.id} delay={(i % 3) * 80}>
                <ProjectCard project={project} />
              </Reveal>
            ))}
          </div>
          <hr className="gold-hairline mt-12" />
        </div>
      </section>

      {/* New Launches — distinct navy band (see new-launches-section.tsx) */}
      <NewLaunchesSection projects={newLaunches} />

      {/* Recently viewed */}
      {recent.length > 0 && (
        <section className="pb-14">
          <div className="container px-4">
            <h2 className="mb-4 text-xl font-semibold">
              {lang === 'ar' ? 'كمّل من حيث وقفت' : 'Pick up where you left off'}
            </h2>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {recent.map((p) => {
                const inCompare = hasCompare(p.id)
                return (
                <div
                  key={p.id}
                  className="w-64 shrink-0 rounded-2xl border bg-card p-2.5 transition-all hover:border-estate-gold hover:shadow-md hover:shadow-estate-gold/10 dark:border-[#262626] dark:bg-[#0A0A0A]"
                >
                  <Link
                    href={`/projects/${p.slug}`}
                    className="group flex items-center gap-3"
                  >
                    <div className="h-14 w-20 shrink-0 overflow-hidden rounded-2xl bg-muted">
                      {p.coverImage && (
                        <Image
                          src={p.coverImage}
                          alt={p.name}
                          width={80}
                          height={56}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium transition-colors group-hover:text-estate-gold">
                        {lang === 'ar' && p.nameArabic ? p.nameArabic : p.name}
                      </p>
                      {p.startPrice != null && (
                        <p className="text-xs font-semibold text-estate-gold">{formatEGP(p.startPrice)}+</p>
                      )}
                    </div>
                  </Link>
                  {/* Footer wraps on narrow phones so label + compare + booking never squeeze/overlap. */}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2">
                    <span className="shrink-0 text-[11px] text-muted-foreground">{recentLabel(p.savedAt, lang === 'ar')}</span>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleCompare({ id: p.id, slug: p.slug, name: p.name })}
                        aria-pressed={inCompare}
                        className="inline-flex min-h-[44px] shrink-0 items-center text-[11px] font-medium text-muted-foreground transition-colors hover:text-estate-gold md:min-h-0"
                      >
                        {inCompare ? (lang === 'ar' ? '✓ في المقارنة' : '✓ Comparing') : (lang === 'ar' ? 'قارن' : 'Compare')}
                      </button>
                      <BookingButton
                        projectId={p.id}
                        propertyName={lang === 'ar' && p.nameArabic ? p.nameArabic : p.name}
                        label={lang === 'ar' ? 'احجز معاينة' : 'Book a viewing'}
                        size="sm"
                        className="h-7 min-h-[44px] shrink-0 px-2.5 text-[11px] md:min-h-0"
                      />
                    </div>
                  </div>
                </div>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* Explore Locations */}
      <ExploreLocations />

      {/* Developer Logos - Scrolling Marquee */}
      <section className="border-t border-b py-14 overflow-hidden dark:border-[#262626] dark:bg-black">
        <div className="container px-4">
          <Reveal className="mb-10 text-center">
            <h2 className="font-display display-2">{t('home.trustedDevelopers')}</h2>
            <p className="mt-2 text-muted-foreground">{t('home.trustedSubtitle')}</p>
          </Reveal>
        </div>

        <div className="relative">
          <div className="absolute start-0 top-0 z-10 h-full w-24 bg-gradient-to-r from-background to-transparent" />
          <div className="absolute end-0 top-0 z-10 h-full w-24 bg-gradient-to-l from-background to-transparent" />

          <div className="flex w-max gap-8 animate-marquee">
            {[...developerLogos, ...developerLogos].map((name, i) => (
              <Link
                key={`${name}-${i}`}
                href={`/projects?q=${encodeURIComponent(name)}`}
                className="group flex h-16 items-center gap-3 rounded-full border bg-card px-8 shadow-sm transition-all hover:border-estate-gold hover:shadow-md hover:shadow-estate-gold/10 dark:border-[#262626] dark:bg-[#0A0A0A]"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-estate-gold/10 text-xs font-bold text-estate-gold">
                  {name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                </div>
                <span className="whitespace-nowrap text-sm font-semibold text-muted-foreground transition-colors group-hover:text-foreground">
                  {name}
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link href="/projects" className="inline-flex min-h-[44px] items-center gap-2 px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            {t('home.viewAll')}
            <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          </Link>
        </div>
      </section>

      {/* CTA — cinematic band: scrim + vignette + grain depth over the navy
          gradient (same copy, links, and buttons), wipe entrance. */}
      <section className="relative overflow-hidden bg-gradient-to-r from-estate-bg-dark via-estate-navy to-estate-navy-light py-16 dark:from-black dark:via-black dark:to-[#0A0A0A]">
        <div aria-hidden="true" className="mashrabiya pointer-events-none absolute inset-0 opacity-70" />
        <div className="cine-scrim" aria-hidden="true" />
        <div className="cine-vignette" aria-hidden="true" />
        <div className="grain" aria-hidden="true" />
        <div className="container relative px-4">
          <Reveal variant="wipe" className="mx-auto max-w-3xl text-center">
            <h2 className="font-display display-2 mb-4 text-white">
              {t('home.readyCTA')}
            </h2>
            <p className="mb-8 text-gray-300">
              {t('home.readySubtitle')}
            </p>
            <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
              <Button asChild size="xl" className="gold-shimmer bg-estate-gold hover:bg-estate-gold-dark text-[#0F1A2C] font-semibold">
                <Link href="/ai-tools">
                  <Brain className="me-2 h-5 w-5" />
                  {t('home.tryAiSearch')}
                </Link>
              </Button>
              <Button asChild size="xl" variant="outline" className="border-white text-white hover:bg-white/10">
                <Link href="/contact">
                  <Phone className="me-2 h-5 w-5" />
                  {t('home.contactUs')}
                </Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  )
}
