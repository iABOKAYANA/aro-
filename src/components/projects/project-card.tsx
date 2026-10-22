'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { MapPin, Heart, Eye, ArrowUpRight, LayoutGrid, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatEGP } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import { cn } from '@/lib/utils'
import { CompareToggle } from '@/lib/compare'
import { coverChain, landmarkForCity } from '@/lib/landmarks'

interface ProjectCardProps {
  project: {
    id: string
    name: string
    nameArabic?: string | null
    slug: string
    coverImage?: string | null
    tagline?: string | null
    status: string
    startPrice?: number | null
    endPrice?: number | null
    propertyTypes: string
    completionPercent?: number | null
    viewCount: number
    favoriteCount: number
    createdAt?: string
    /** New Launches designation computed server-side by /api/projects (optional). */
    isNewLaunch?: boolean
    governorate?: { name: string; nameArabic?: string | null } | null
    city?: { name: string; nameArabic?: string | null; nameSlug?: string | null } | null
    district?: { name: string; nameArabic?: string | null } | null
    developer?: { companyName: string; logo?: string | null; isVerified: boolean } | null
    units?: { price: number; area: number; bedrooms?: number | null }[]
    amenities?: { amenity: { name: string; icon?: string | null } }[]
    masterPlanImages?: { id?: string; url: string; caption?: string | null }[]
  }
}

const STATUS_MAP: Record<string, { bg: string; text: string; label: string; labelAr: string }> = {
  AVAILABLE: { bg: 'bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400', label: 'Available', labelAr: 'متاح' },
  UNDER_CONSTRUCTION: { bg: 'bg-amber-500/10', text: 'text-amber-700 dark:text-amber-400', label: 'Under Construction', labelAr: 'تحت الإنشاء' },
  COMING_SOON: { bg: 'bg-purple-500/10', text: 'text-purple-700 dark:text-purple-400', label: 'Coming Soon', labelAr: 'قريباً' },
  DELIVERED: { bg: 'bg-blue-500/10', text: 'text-blue-700 dark:text-blue-400', label: 'Delivered', labelAr: 'تم التسليم' },
  SOLD_OUT: { bg: 'bg-red-500/10', text: 'text-red-700 dark:text-red-400', label: 'Sold Out', labelAr: 'نفدت' },
}

export function ProjectCard({ project }: ProjectCardProps) {
  // Display chain: cover → city landmark → placeholder. A dead (403/blocked)
  // cover steps to the landmark onError instead of rendering grey/broken —
  // same box every step, so no layout shift.
  const sources = coverChain(project.coverImage, landmarkForCity(project.city))
  const [stage, setStage] = useState(0)
  useEffect(() => { setStage(0) }, [project.coverImage, project.city?.nameSlug, project.city?.name])
  const imgSrc = sources[Math.min(stage, sources.length - 1)]
  const { lang } = useLanguage()
  const plans = project.masterPlanImages || []
  const [planIdx, setPlanIdx] = useState<number | null>(null)
  const [isClient, setIsClient] = useState(false)
  useEffect(() => { setIsClient(true) }, [])

  const location = [
    project.district?.name,
    project.city?.name,
  ].filter(Boolean).join(', ')

  const lowestPrice = project.units?.length
    ? Math.min(...project.units.map(u => u.price))
    : project.startPrice

  const status = STATUS_MAP[project.status] || STATUS_MAP.AVAILABLE
  const projectName = lang === 'ar' && project.nameArabic ? project.nameArabic : project.name
  // Server-computed designation from the New Launches config (/api/projects);
  // falls back to the classic 30-day rule for endpoints that don't send it.
  const isNewLaunch =
    typeof project.isNewLaunch === 'boolean'
      ? project.isNewLaunch
      : !!project.createdAt && Date.now() - new Date(project.createdAt).getTime() < 30 * 24 * 60 * 60 * 1000

  return (
    <div
      className="arch-card group relative overflow-hidden bg-white transition-all duration-300 hover:shadow-lg hover:shadow-estate-gold/20 dark:bg-[#0A0A0A] dark:hover:shadow-black/50"
    >
      {/* Image — Ken Burns drift runs on hover only (no infinite animation in grids — perf) */}
      <div className="arch kenburns relative aspect-[16/10] overflow-hidden">
        <Image
          src={imgSrc}
          alt={projectName}
          fill
          className="object-cover group-hover:animate-kenburns"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          onError={() => setStage((s) => (s < sources.length - 1 ? s + 1 : s))}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/5 to-transparent" />
        <div className="mashrabiya pointer-events-none absolute inset-0" aria-hidden="true" />

        {/* Status badge */}
        <div className="absolute left-3 top-3">
          <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide', status.bg, status.text)}>
            {lang === 'ar' ? status.labelAr : status.label}
          </span>
        </div>

        {/* Master plan chip */}
        {plans.length > 0 && (
          <button
            type="button"
            onClick={() => setPlanIdx(0)}
            className="absolute left-3 top-11 inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm transition-colors hover:bg-estate-gold hover:text-[#0F1A2C] md:min-h-0"
            aria-label={lang === 'ar' ? 'المستر بلان — عرض المستر بلان' : 'MASTER PLAN — View master plan'}
          >
            <LayoutGrid className="h-3 w-3" />
            {lang === 'ar' ? 'المستر بلان' : 'Master Plan'}
          </button>
        )}

        {/* Favorite */}
        <button aria-label="Save to favorites" className="absolute right-3 top-3 flex h-8 w-8 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition-colors hover:bg-white hover:text-red-500 md:min-h-0 md:min-w-0 md:h-8 md:w-8">
          <Heart className="h-4 w-4" />
        </button>

        {/* New launch badge — sits below the 44px phone favorite circle (top-16 base, top-12 desktop). */}
        {isNewLaunch && (
          <span className="absolute right-3 top-16 inline-flex items-center rounded-full bg-estate-gold px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#0F1A2C] shadow-md md:top-12">
            {lang === 'ar' ? 'جديد' : 'New'}
          </span>
        )}

        {/* Progress bar */}
        {project.completionPercent != null && project.completionPercent > 0 && (
          <div className="absolute bottom-0 left-0 right-0 px-3 pb-3">
            <div className="flex items-center justify-between text-[10px] font-medium text-white/80 mb-1">
              <span>{lang === 'ar' ? 'الإنشاء' : 'Construction'}</span>
              <span>{project.completionPercent}%</span>
            </div>
            <div className="h-1 rounded-full bg-white/20">
              <div className="h-full rounded-full bg-estate-gold transition-all duration-500" style={{ width: `${project.completionPercent}%` }} />
            </div>
          </div>
        )}

        {/* Arrow link */}
        <Link
          href={`/projects/${project.slug}`}
          aria-label={lang === 'ar' ? `فتح مشروع ${project.name}` : `Open ${project.name}`}
          className="gold-shimmer absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-white text-gray-900 opacity-0 shadow-lg transition-all duration-300 group-hover:opacity-100 hover:bg-estate-gold hover:text-white"
        >
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Developer */}
        {project.developer && (
          <div className="mb-2 flex min-w-0 items-center gap-2">
            {project.developer.logo && (
              <Image src={project.developer.logo} alt={project.developer.companyName} width={16} height={16} className="h-4 w-4 shrink-0 rounded-full object-cover" />
            )}
            <span className="min-w-0 truncate text-[11px] font-medium text-gray-400 dark:text-gray-500">
              {project.developer.companyName}
            </span>
            {project.developer.isVerified && (
              <svg className="h-3.5 w-3.5 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>
        )}

        {/* Title + Location */}
        <Link href={`/projects/${project.slug}`}>
          <h2 className="font-display mb-1 text-lg font-semibold leading-snug text-gray-900 transition-colors group-hover:text-estate-gold-dark dark:text-white dark:group-hover:text-estate-gold">
            {projectName}
          </h2>
        </Link>
        {location && (
          <div className="mb-3 flex min-w-0 items-center gap-1 text-xs text-gray-400">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="min-w-0 truncate">{location}</span>
          </div>
        )}

        {/* Property types */}
        <div className="mb-3 flex flex-wrap gap-1">
          {(typeof project.propertyTypes === 'string' ? JSON.parse(project.propertyTypes) : project.propertyTypes || []).slice(0, 3).map((type: string) => (
            <span key={type} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-black dark:text-gray-400">
              {type.replace(/_/g, ' ')}
            </span>
          ))}
        </div>

        {/* Price + Stats — wraps on narrow phones so long EGP figures + counters never squeeze. */}
        <hr className="gold-hairline mb-3" />
        <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
              {lang === 'ar' ? 'يبدأ من' : 'Starting from'}
            </p>
            <p className="font-display break-words text-lg font-bold text-estate-navy dark:text-estate-gold">
              {lowestPrice ? formatEGP(lowestPrice) : 'N/A'}
            </p>
          </div>
          <div className="flex items-center gap-2.5 text-gray-400">
            <CompareToggle project={{ id: project.id, slug: project.slug, name: projectName }} />
            {project.viewCount > 0 && (
              <span className="flex items-center gap-1 text-[11px]">
                <Eye className="h-3 w-3" />
                {project.viewCount.toLocaleString('en-US')}
              </span>
            )}
            {project.favoriteCount > 0 && (
              <span className="flex items-center gap-1 text-[11px]">
                <Heart className="h-3 w-3" />
                {project.favoriteCount.toLocaleString('en-US')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Master plan lightbox */}
      {isClient && planIdx !== null && plans[planIdx] && createPortal(
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 p-4"
          onClick={() => setPlanIdx(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => setPlanIdx(null)}
            className="absolute right-4 top-4 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/25 md:min-h-0 md:min-w-0"
            aria-label={lang === 'ar' ? 'إغلاق' : 'Close'}
          >
            <X className="h-5 w-5" />
          </button>

          {plans.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setPlanIdx((planIdx - 1 + plans.length) % plans.length) }}
                className="absolute left-3 top-1/2 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-full bg-white/10 p-2.5 text-white transition-colors hover:bg-white/25 md:min-h-0 md:min-w-0"
                aria-label={lang === 'ar' ? 'السابق' : 'Previous'}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setPlanIdx((planIdx + 1) % plans.length) }}
                className="absolute right-3 top-1/2 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-full bg-white/10 p-2.5 text-white transition-colors hover:bg-white/25 md:min-h-0 md:min-w-0"
                aria-label={lang === 'ar' ? 'التالي' : 'Next'}
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}

          <Image
            src={plans[planIdx].url}
            alt={plans[planIdx].caption || `${projectName} — master plan`}
            width={1600}
            height={1200}
            className="max-h-[80vh] max-w-[92vw] rounded-2xl bg-white object-contain shadow-2xl"
          />
          <div className="mt-3 flex items-center gap-3 text-sm text-white/80">
            {plans[planIdx].caption && <span>{plans[planIdx].caption}</span>}
            <span className="text-white/50">
              {planIdx + 1} / {plans.length}
            </span>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
