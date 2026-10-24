'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState, useEffect } from 'react'
import { MapPin, ArrowRight, CalendarDays } from 'lucide-react'
import { formatEGP } from '@/lib/utils'
import { coverChain, landmarkForCity } from '@/lib/landmarks'
import { useLanguage } from '@/lib/language-context'
import { Reveal, SectionHeader } from '@/components/design'

interface NewLaunchesSectionProps {
  /** Pre-filtered list from /api/new-launches (CEO window/limit/pin/hide applied server-side). */
  projects: any[]
}

/**
 * "New Launches" — a full-width navy band with wide horizontal cards,
 * visually distinct from the standard project-card grid.
 * The list is computed on the server from the CEO's configuration
 * (/api/new-launches): pinned first, then projects inside the window,
 * hidden ones removed. Renders only when the list is non-empty.
 */
export function NewLaunchesSection({ projects }: NewLaunchesSectionProps) {
  const { lang } = useLanguage()
  const isRtl = lang === 'ar'

  const items = projects || []

  // Hover-reveal backdrop: id of the card under the pointer (null = idle).
  // (Declared before the early return to keep hook order stable.)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  if (items.length === 0) return null

  const activeIndex =
    hoveredId != null ? Math.max(0, items.findIndex((p: any) => p.id === hoveredId)) : 0

  return (
    <section className="relative overflow-hidden bg-estate-navy py-16 text-white dark:bg-black">
      {/* Hover-reveal backdrop (Awwwards-style): ONE full-bleed layer showing
          the hovered project's cover, dimmed so content stays readable. Idle
          (no hover, incl. touch devices) shows the first project's image —
          never empty. Stacked covers crossfade via opacity; motion-safe so
          prefers-reduced-motion swaps instantly. Sources reuse the cards'
          cover resolution (coverImage → placeholder); images are already in
          the DOM via the cards, so no preloading is needed. Symmetric
          full-bleed (object-cover, centered) keeps it RTL-safe. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {items.map((project: any, i: number) => (
          <Image
            key={project.id}
            src={project.coverImage || '/images/placeholder.jpg'}
            alt=""
            fill
            sizes="100vw"
            className={`h-full w-full object-cover motion-safe:transition-opacity motion-safe:duration-500 ${
              i === activeIndex ? 'opacity-25' : 'opacity-0'
            }`}
            onError={(e) => {
              const target = e.target as HTMLImageElement
              target.style.display = 'none'
            }}
          />
        ))}
      </div>
      <div className="cine-scrim" aria-hidden="true" />
      <div className="cine-vignette" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
      <div aria-hidden="true" className="mashrabiya pointer-events-none absolute inset-0 opacity-60" />
      <div className="container relative px-4">
        {/* Header — kicker/description keep the exact prior copy; the kicker
            reads as a cine-kicker (light gold, tracked, soft shadow) on the dark band. */}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4 [&_.section-kicker]:!text-[#E8C56D] [&_.section-kicker]:tracking-[0.3em] rtl:[&_.section-kicker]:tracking-normal [&_.section-kicker]:[text-shadow:0_1px_12px_rgba(0,0,0,0.6)]">
          <SectionHeader
            kicker={isRtl ? 'جديد دلوقتي' : 'Just launched'}
            title={
              isRtl ? (
                <>إطلاقات <span className="text-estate-gold">جديدة</span></>
              ) : (
                <>New <span className="text-estate-gold">Launches</span></>
              )
            }
            description={
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>
                {isRtl
                  ? 'أحدث المشاريع اللي اتضافت على المنصة في آخر 30 يوم'
                  : 'Projects added to the platform in the last 30 days'}
              </span>
            }
          />

          <Link
            href="/projects?sortBy=newest"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-estate-gold px-5 py-2.5 text-sm font-semibold text-estate-gold transition-colors hover:bg-estate-gold hover:text-[#0F1A2C] md:min-h-0"
          >
            {isRtl ? 'شوف الكل' : 'View all'}
            <ArrowRight className={isRtl ? 'h-4 w-4 rotate-180' : 'h-4 w-4'} />
          </Link>
        </div>

        {/* Wide cards — hovering a card sets the backdrop to that project;
            leaving the grid returns to the idle (first-project) backdrop.
            Focus/blur mirror this so keyboard users get the same reveal;
            touch taps still just navigate via the card links. */}
        <div className="grid gap-5 md:grid-cols-2" onMouseLeave={() => setHoveredId(null)}>
          {items.map((project: any, i: number) => (
            <div
              key={project.id}
              onMouseEnter={() => setHoveredId(project.id)}
              onFocus={() => setHoveredId(project.id)}
            >
              <Reveal delay={(i % 2) * 80}>
                <LaunchCard project={project} isRtl={isRtl} />
              </Reveal>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function LaunchCard({ project, isRtl }: { project: any; isRtl: boolean }) {
  // Same display chain as ProjectCard: cover → city landmark → placeholder.
  const sources = coverChain(project.coverImage, landmarkForCity(project.city))
  const [stage, setStage] = useState(0)
  useEffect(() => { setStage(0) }, [project.coverImage, project.city?.nameSlug, project.city?.name])
  const imgSrc = sources[Math.min(stage, sources.length - 1)]

  const name = isRtl && project.nameArabic ? project.nameArabic : project.name
  const location = [project.district?.name, project.city?.name].filter(Boolean).join(', ')
  const addedAt = new Date(project.createdAt).toLocaleDateString(isRtl ? 'ar-EG' : 'en-GB', {
    day: 'numeric',
    month: 'short',
  })

  return (
    // Mobile stacks image-over-content (base = flex-col); ≥480px restores the
    // wide horizontal card (row / row-reverse in RTL) — desktop untouched.
    <Link
      href={`/projects/${project.slug}`}
      className={`group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition-all duration-300 hover:border-estate-gold/60 hover:bg-white/10 min-[480px]:flex-row ${
        isRtl ? 'min-[480px]:flex-row-reverse' : ''
      }`}
    >
      {/* Image — wipe reveal on the square inner box (card rounding lives on the outer Link, so no squared corners). */}
      <Reveal variant="wipe" className="relative h-44 w-full shrink-0 overflow-hidden min-[480px]:h-auto min-[480px]:w-[42%]">
        <Image
          src={imgSrc}
          alt={name}
          fill
          sizes="(max-width: 768px) 100vw, 40vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          onError={() => setStage((s) => (s < sources.length - 1 ? s + 1 : s))}
        />
        <div
          className={`absolute inset-0 bg-gradient-to-t from-black/40 to-transparent ${
            isRtl ? 'bg-gradient-to-l' : 'bg-gradient-to-r'
          }`}
        />
        <span className="absolute left-3 top-3 rounded-full bg-estate-gold px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[#0F1A2C] shadow">
          {isRtl ? 'جديد' : 'New'}
        </span>
      </Reveal>

      {/* Content */}
      <div className={`flex flex-1 flex-col justify-between p-4 sm:p-5 ${isRtl ? 'text-right' : ''}`}>
        <div className="min-w-0">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-estate-gold/90">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            {isRtl ? `اتضاف ${addedAt}` : `Added ${addedAt}`}
          </div>
          <h3 className="mb-1 truncate text-lg font-semibold transition-colors group-hover:text-estate-gold">
            {name}
          </h3>
          {location && (
            <p className="flex min-w-0 items-center gap-1 text-sm text-white/60">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 truncate">{location}</span>
            </p>
          )}
        </div>

        <div className="mt-3 flex items-end justify-between gap-2">
          {project.startPrice != null && (
            <div>
              <p className="text-[11px] text-white/50">{isRtl ? 'يبدأ من' : 'Starting at'}</p>
              <p className="text-lg font-bold text-estate-gold">{formatEGP(project.startPrice)}</p>
            </div>
          )}
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
            {isRtl ? 'اكتشف' : 'Explore'}
            <ArrowRight className={isRtl ? 'h-3.5 w-3.5 rotate-180' : 'h-3.5 w-3.5'} />
          </span>
        </div>
      </div>
    </Link>
  )
}
