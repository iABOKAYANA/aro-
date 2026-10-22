'use client'

import { useState, useEffect, Fragment, type RefObject, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  MapPin, Bed, Bath, Maximize, Heart, Share2, Phone, Mail,
  ChevronRight, Building2, Calendar, CheckCircle2, Globe, ExternalLink, X, Check, Star,
  Copy, MessageCircle, Home, Store, Stethoscope, Layers, Warehouse, Tent, Briefcase
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatEGP, formatSQM } from '@/lib/utils'
import { CompareToggle } from '@/lib/compare'
import { coverChain, landmarkForCity } from '@/lib/landmarks'
import { useLanguage } from '@/lib/language-context'
import { unitCategoryRows, type UnitsByTypeRow } from '@/lib/units-by-type'

/** Tiny blueprint glyphs for the category units cards (beds count / twin homes / shop…). */
const CAT_GLYPH: Record<string, () => ReactNode> = {
  BED_1: () => <Bed className="h-3.5 w-3.5" />,
  BED_2: () => (<><Bed className="h-3.5 w-3.5" /><Bed className="h-3.5 w-3.5" /></>),
  BED_2_N: () => (<><Bed className="h-3.5 w-3.5" /><Bed className="h-3.5 w-3.5" /><span className="text-[10px] font-bold leading-none">+N</span></>),
  BED_3: () => (<><Bed className="h-3.5 w-3.5" /><Bed className="h-3.5 w-3.5" /><Bed className="h-3.5 w-3.5" /></>),
  BED_3_N: () => (<><Bed className="h-3.5 w-3.5" /><Bed className="h-3.5 w-3.5" /><Bed className="h-3.5 w-3.5" /><span className="text-[10px] font-bold leading-none">+N</span></>),
  BED_4: () => (<><Bed className="h-3.5 w-3.5" /><Bed className="h-3.5 w-3.5" /><Bed className="h-3.5 w-3.5" /><Bed className="h-3.5 w-3.5" /></>),
  BED_4_N: () => (<><Bed className="h-3.5 w-3.5" /><Bed className="h-3.5 w-3.5" /><Bed className="h-3.5 w-3.5" /><Bed className="h-3.5 w-3.5" /><span className="text-[10px] font-bold leading-none">+N</span></>),
  BED_5: () => (<><Bed className="h-3.5 w-3.5" /><span className="text-[10px] font-bold leading-none">+</span></>),
  BED_NULL: () => <Home className="h-3.5 w-3.5" />,
  STUDIO: () => <Bed className="h-3.5 w-3.5" />,
  DUPLEX: () => <Layers className="h-3.5 w-3.5" />,
  PENTHOUSE: () => <Building2 className="h-3.5 w-3.5" />,
  VILLA: () => <Home className="h-3.5 w-3.5" />,
  VILLA_TWIN: () => (<><Home className="h-3.5 w-3.5" /><Home className="h-3.5 w-3.5 -ms-2" /></>),
  TOWNHOUSE: () => <Warehouse className="h-3.5 w-3.5" />,
  CHALET: () => <Tent className="h-3.5 w-3.5" />,
  COMMERCIAL: () => <Store className="h-3.5 w-3.5" />,
  ADMINISTRATIVE: () => <Briefcase className="h-3.5 w-3.5" />,
  MEDICAL: () => <Stethoscope className="h-3.5 w-3.5" />,
}
import { Reveal, SectionHeader, useParallax } from '@/components/design'
import { UnitCard } from '@/components/units/unit-card'
// Booking modal (533-line form + next-auth) splits into its own chunk; the
// button shell still server-renders via default SSR.
const BookingButton = dynamic(
  () => import('@/components/viewings/booking-modal').then((mod) => mod.BookingButton)
)
import { isProjectSaved, toggleSaved, pushRecentProject, type SavedProject } from '@/lib/saved-projects'
import { WatchButton, JourneyViewTracker } from '@/components/projects/project-transparency'
// Below-fold tab widgets (transparency + next-auth graph) split out; default
// SSR keeps their text server-rendered for crawlers.
const ProjectTrust = dynamic(
  () => import('@/components/projects/project-transparency').then((mod) => mod.ProjectTrust)
)
const ProjectTimeline = dynamic(
  () => import('@/components/projects/project-transparency').then((mod) => mod.ProjectTimeline)
)

interface ProjectDetailProps {
  project: any
  // Server-computed per-type inventory summary (same helper + semantics as
  // GET /api/projects/[slug]). Optional so other callers (developer preview)
  // keep working — the client falls back to grouping the loaded units.
  unitsByType?: UnitsByTypeRow[] // legacy shape (mobile/API contract) — unused by the units tab now
}

// Reviews summary for the sidebar proof line, the payment-tab summary, and
// the reviews tab label. Same public endpoint the ProjectReviews section
// already fetches — approved reviews only, average + count.
function useReviewsSummary(projectId: string) {
  const [average, setAverage] = useState<number | null>(null)
  const [count, setCount] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/reviews?projectId=${encodeURIComponent(projectId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        setAverage(typeof data.average === 'number' ? data.average : null)
        setCount(Number(data.count) || 0)
        setLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  return { average, count, loaded, failed }
}

// Cash-first anchor for a payment plan: cash price first, then the monthly
// equivalent, plus a per-m² secondary anchor. Renders nothing unless the plan
// has a real cash discount and the project has a starting price.
function PlanAnchorLine({ basePrice, plan, pricePerSqm }: { basePrice: number; plan: any; pricePerSqm?: number | null }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const discount = Number(plan?.cashDiscount) || 0
  const years = Number(plan?.installmentYears) || 0
  const downPct = Number(plan?.downPaymentPct) || 0
  if (!(basePrice > 0) || !(discount > 0) || !(years > 0)) return null
  const cashPrice = Math.round(basePrice * (1 - discount / 100))
  const monthly = Math.round((basePrice * (1 - downPct / 100)) / (years * 12))
  if (!(cashPrice > 0) || !(monthly > 0)) return null
  return (
    <p className="text-[12px] leading-relaxed text-muted-foreground">
      {ar ? (
        <>كاش <span className="font-semibold text-foreground">{formatEGP(cashPrice)}</span> (خصم كاش {discount}% حقيقي) — ولا {formatEGP(monthly)}/شهر على {years} {years === 1 ? 'سنة' : 'سنين'}؟</>
      ) : (
        <>Cash <span className="font-semibold text-foreground">{formatEGP(cashPrice)}</span> ({discount}% real cash discount) — or {formatEGP(monthly)}/month over {years} {years === 1 ? 'year' : 'yrs'}?</>
      )}
      {pricePerSqm ? (
        <span> · ~{formatEGP(pricePerSqm)}{ar ? '/م²' : '/sqm'}</span>
      ) : null}
    </p>
  )
}

// Plan-driven installment calculator for the payment tab: runs on the
// project's REAL payment plans, not generic inputs. A native select picks
// one of the published plans; down payment + years baseline from that plan
// (locked by default). "Custom numbers" is a secondary manual override —
// baselined from the plan, one tap resets back. Monthly = equal
// installments on the remainder after down, no interest (developer plans
// carry 0% interest — same math as PlanAnchorLine + the sidebar
// estimator). Returns null when there are no plans (the caller renders the
// honest "no published plans" line instead and hides the calculator).
function PlanCalculator({ plans, basePrice }: { plans: any[]; basePrice: number }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const list = Array.isArray(plans) ? plans.filter((p) => p && typeof p === 'object') : []
  const defaultPlan = list.find((p) => p?.isDefault) ?? list[0] ?? null
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [manual, setManual] = useState(false)
  const [customDp, setCustomDp] = useState<number | null>(null)
  const [customYears, setCustomYears] = useState<number | null>(null)
  const selected = list.find((p) => p?.id === selectedId) ?? defaultPlan
  if (!selected) return null

  const planDp = Number(selected?.downPaymentPct) || 0
  const planYears = Number(selected?.installmentYears) || 0
  const dp = manual && customDp !== null ? customDp : planDp
  const years = manual && customYears !== null ? customYears : planYears
  const discount = Number(selected?.cashDiscount) || 0
  const maint = Number(selected?.maintenanceFeePct) || 0

  const priced = basePrice > 0
  const downAmount = priced ? Math.round((basePrice * dp) / 100) : 0
  const remainder = priced ? Math.max(0, basePrice - downAmount) : 0
  const monthly = priced && years > 0 ? Math.round(remainder / (years * 12)) : 0
  const cashPrice = priced && discount > 0 ? Math.round(basePrice * (1 - discount / 100)) : null
  const savings = cashPrice !== null ? basePrice - cashPrice : 0
  const maintAmount = priced && maint > 0 ? Math.round((basePrice * maint) / 100) : 0
  const yearWord = years === 1 ? (ar ? 'سنة' : 'year') : (ar ? 'سنين' : 'years')

  const pickPlan = (id: string) => {
    setSelectedId(id)
    setManual(false)
    setCustomDp(null)
    setCustomYears(null)
  }

  return (
    <Card className="border-estate-gold/30">
      <CardHeader>
        <CardTitle as="h2" className="font-display flex items-center gap-2 text-xl">
          {ar ? 'حاسبة القسط — على خطة حقيقية' : 'Installment calculator — real plan'}
          {manual && (
            <Badge variant="secondary">{ar ? 'أرقام مخصصة' : 'Custom'}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4">
        <label className="block min-w-0">
          <span className="mb-1 block text-xs text-muted-foreground">{ar ? 'اختار خطة السداد' : 'Choose a payment plan'}</span>
          <select
            value={selected?.id ?? ''}
            onChange={(e) => pickPlan(e.target.value)}
            aria-label={ar ? 'اختار خطة السداد' : 'Choose a payment plan'}
            className="min-h-[44px] w-full rounded-xl border border-border bg-background px-3 py-2.5 text-base md:py-2 md:text-sm"
          >
            {list.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name} — {Number(p?.downPaymentPct) || 0}% · {Number(p?.installmentYears) || 0} {ar ? 'سنين' : 'yrs'}
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-2xl border border-estate-gold/30 bg-estate-gold/5 p-3 text-center">
          <p className="break-words text-2xl font-bold text-estate-gold">{monthly > 0 ? formatEGP(monthly) : '—'}</p>
          <p className="mt-1 break-words text-xs text-muted-foreground">
            {ar
              ? `في الشهر · مقدم ${dp}% · على ${years} ${yearWord}`
              : `per month · ${dp}% down · over ${years} ${yearWord}`}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 [&>*]:min-w-0">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{ar ? 'المقدم' : 'Down payment'}</p>
            <p className="break-words text-lg font-bold">{priced ? formatEGP(downAmount) : '—'}</p>
            <p className="text-xs text-muted-foreground">{dp}%</p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{ar ? 'إجمالي التقسيط' : 'Installment total'}</p>
            <p className="break-words text-lg font-bold">{priced ? formatEGP(basePrice) : '—'}</p>
            {maint > 0 && (
              <p className="break-words text-xs text-muted-foreground">
                {ar ? `+ صيانة ${maint}% (≈${formatEGP(maintAmount)})` : `+ ${maint}% maintenance (≈${formatEGP(maintAmount)})`}
              </p>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{ar ? 'خصم الكاش' : 'Cash discount'}</p>
            {cashPrice !== null ? (
              <>
                <p className="break-words text-lg font-bold text-green-600">{formatEGP(cashPrice)}</p>
                <p className="break-words text-xs text-muted-foreground">
                  {ar ? `وفر ${formatEGP(savings)} (${discount}%)` : `Save ${formatEGP(savings)} (${discount}%)`}
                </p>
              </>
            ) : (
              <p className="text-lg font-bold">—</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (manual) {
                setCustomDp(null)
                setCustomYears(null)
              }
              setManual((v) => !v)
            }}
            aria-expanded={manual}
            className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-border px-4 py-1.5 text-sm font-medium transition-colors hover:border-estate-gold/60 hover:text-estate-gold md:min-h-0"
          >
            {manual
              ? (ar ? 'ارجع لأرقام الخطة' : 'Back to plan numbers')
              : (ar ? 'جرّب أرقام مختلفة' : 'Try custom numbers')}
          </button>
        </div>

        {manual && (
          <div className="min-w-0 space-y-3 rounded-2xl border border-dashed p-3">
            <div className="min-w-0">
              <label className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{ar ? 'المقدم' : 'Down payment'}</span>
                <span className="font-semibold text-foreground">{dp}%</span>
              </label>
              <input
                type="range"
                aria-label={ar ? 'المقدم' : 'Down payment'}
                min={0}
                max={90}
                step={1}
                value={dp}
                onChange={(e) => setCustomDp(Number(e.target.value))}
                className="h-11 w-full accent-[#D4A843] md:h-auto"
              />
            </div>
            <div className="min-w-0">
              <label className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{ar ? 'المدة' : 'Duration'}</span>
                <span className="font-semibold text-foreground">{years} {yearWord}</span>
              </label>
              <input
                type="range"
                aria-label={ar ? 'المدة' : 'Duration'}
                min={1}
                max={15}
                step={1}
                value={Math.min(15, Math.max(1, years || 1))}
                onChange={(e) => setCustomYears(Number(e.target.value))}
                className="h-11 w-full accent-[#D4A843] md:h-auto"
              />
            </div>
          </div>
        )}

        {!priced && (
          <p className="break-words text-[12px] leading-relaxed text-muted-foreground">
            {ar ? 'الحاسبة محتاجة سعر بداية للمشروع عشان تحسب القسط.' : 'The calculator needs a project starting price to estimate installments.'}
          </p>
        )}
        <p className="break-words text-[11px] leading-relaxed text-muted-foreground">
          {ar
            ? 'حسبة على سعر البداية من غير فوائد — الشروط الفعلية حسب الخطة والعقد.'
            : 'Based on the starting price, no interest — actual terms follow the plan and contract.'}
        </p>
      </CardContent>
    </Card>
  )
}

// Overview body — presentation-only structuring of the overview copy.
// Same text, same fallback chain (caller passes `overviewText` through).
// Blank lines become real paragraphs, single line-breaks stay inline via
// <br/>, and runs of list-like lines (dashes/•/numbered, Latin or
// Arabic-Indic digits) become a proper list. No headings invented, no
// truncation. Dir-aware: inherits the page `dir`, logical `text-start`,
// flex rows flip automatically in RTL; inline content (numbers/LTR spans)
// is never altered so the bidi algorithm keeps it intact.
const OVERVIEW_LIST_MARKER_RE = /^\s*(?:[-–—•*]|\d{1,2}[.)\-:]|[٠-٩]{1,2}[.)\-:])\s+/

function OverviewBody({ text }: { text: unknown }) {
  if (typeof text !== 'string') return null
  const blocks = text
    .split(/\r?\n\s*\r?\n/)
    .map((b) => b.replace(/[ \t]+\r?\n/g, '\n').trim())
    .filter((b) => b.length > 0)
  if (blocks.length === 0) return null
  return (
    <div className="mt-4 max-w-3xl space-y-5 text-start text-base leading-8 text-muted-foreground">
      {blocks.map((block, i) => {
        const lines = block.split(/\r?\n/).filter((l) => l.trim().length > 0)
        const isList = lines.length >= 2 && lines.every((l) => OVERVIEW_LIST_MARKER_RE.test(l))
        if (isList) {
          return (
            <ul key={i} className="space-y-3">
              {lines.map((line, j) => (
                <li key={j} className="flex items-start gap-3">
                  <span aria-hidden="true" className="mt-[0.9em] h-1.5 w-1.5 shrink-0 rounded-full bg-estate-gold" />
                  <span className="min-w-0 flex-1">{line.replace(OVERVIEW_LIST_MARKER_RE, '')}</span>
                </li>
              ))}
            </ul>
          )
        }
        return (
          <p key={i}>
            {lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {line}
              </Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}

// Showcase photo with the same display chain as the hero: gallery[0] →
// project cover → city landmark → placeholder, stepped onError.
function ShowcasePhoto({ photo, cover, landmark, name }: { photo?: string | null; cover?: string | null; landmark?: string | null; name: string }) {
  const sources = coverChain(photo, cover, landmark ?? undefined)
  const [stage, setStage] = useState(0)
  useEffect(() => { setStage(0) }, [photo, cover, landmark])
  return (
    <Image
      src={sources[Math.min(stage, sources.length - 1)]}
      alt={name}
      fill
      className="object-cover"
      sizes="(max-width: 768px) 100vw, 50vw"
      loading="lazy"
      onError={() => setStage((s) => (s < sources.length - 1 ? s + 1 : s))}
    />
  )
}

export function ProjectDetail({ project }: ProjectDetailProps) {
  const { lang, dir } = useLanguage()
  const ar = lang === 'ar'
  const [showPhone, setShowPhone] = useState(false)
  const [planOpen, setPlanOpen] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [calcDp, setCalcDp] = useState(20)
  const [calcYears, setCalcYears] = useState(5)
  // Hero display chain: cover → city landmark → placeholder. A dead (403)
  // cover steps to the landmark onError instead of rendering grey/broken.
  const heroSources = coverChain(project.coverImage, landmarkForCity(project.city))
  const [heroStage, setHeroStage] = useState(0)
  useEffect(() => { setHeroStage(0) }, [project.coverImage, project.city?.nameSlug, project.city?.name])
  const heroSrc = heroSources[Math.min(heroStage, heroSources.length - 1)]
  // Cinematic hero drift — attached to the .kenburns layer via data-parallax.
  const heroParallax = useParallax<HTMLDivElement>(0.25)

  const projectSnapshot = (): SavedProject => ({
    id: project.id,
    slug: project.slug,
    name: project.name,
    nameArabic: project.nameArabic,
    coverImage: project.coverImage,
    startPrice: project.startPrice,
    status: project.status,
    savedAt: Date.now(),
  })

  useEffect(() => {
    setSaved(isProjectSaved(project.id))
    setCalcDp(Math.min(50, Math.max(10, Math.round((project.downPaymentMin ?? 20) / 5) * 5)))
    setCalcYears(Math.min(15, Math.max(1, project.installmentYears ?? 5)))
    pushRecentProject(projectSnapshot())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id])

  const basePrice = Number(project.startPrice) || 0
  const monthlyPayment = basePrice > 0 ? Math.round((basePrice * (1 - calcDp / 100)) / (calcYears * 12)) : 0

  // Egyptian-dialect text that reads well inside a WhatsApp bubble.
  const shareText = ar ? `بص على المشروع ده على غاية: ${project.name}` : `Check out this project on GHAYA: ${project.name}`

  // Same flow as the compare share-button: native sheet (which on phones
  // already lists WhatsApp) → copy + explicit WhatsApp fallbacks, because
  // desktop browsers have no share sheet at all.
  async function onShare() {
    const url = window.location.href
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ title: project.name, text: shareText, url })
        return
      } catch {
        // Dismissed the sheet — fall through to the copy/WhatsApp panel.
      }
    }
    setShareOpen((v) => !v)
  }

  async function onCopyShare() {
    const payload = `${shareText}\n${window.location.href}`
    try {
      await navigator.clipboard.writeText(payload)
      setCopied(true)
    } catch {
      // Clipboard API needs a secure context — fall back to a manual select.
      const ta = document.createElement('textarea')
      ta.value = payload
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
        setCopied(true)
      } catch {
        /* user can copy from the visible input */
      }
      document.body.removeChild(ta)
    }
    setTimeout(() => setCopied(false), 1600)
  }

  const waHref = typeof window !== 'undefined'
    ? `https://wa.me/?text=${encodeURIComponent(`${shareText}\n${window.location.href}`)}`
    : ''

  const location = [
    project.district?.name,
    project.city?.name,
    project.governorate?.name,
  ]
    .filter(Boolean)
    .join(ar ? '، ' : ', ')

  // Showcase model units (isSample) are illustrative only — they never mix
  // into buyable inventory (counts, units tab, booking). The "models" section
  // below renders them; everything else on this page uses `listedUnits`.
  const allUnits: any[] = Array.isArray(project.units) ? project.units : []
  const sampleUnits = allUnits.filter((u) => u?.isSample === true)
  const listedUnits = allUnits.filter((u) => u?.isSample !== true)
  // Bookable inventory: non-sample rows whose status is actually reservable
  // (AVAILABLE + legacy 'Vacant' — same rule the CEO project page uses).
  const listedCount = listedUnits.length
  const availableCount = listedUnits.filter((u) => u?.status === 'AVAILABLE' || u?.status === 'Vacant').length
  // Per-TYPE buyable-inventory summary (old server prop shape, kept for the
  // mobile/API contract) is no longer what the units tab renders — the tab
  // now shows ONE summary row per offered category (1BR/2BR/3BR/4BR/5BR+/
  // بناني/شاليه/…) computed from the loaded units with the same buyable
  // rule, so a 500-unit compound reads as a short type list, not a flood of
  // unit cards. Individual unit cards only render for small inventories.
  const categoryRows = unitCategoryRows(listedUnits)
  // Individual cards only for SMALL inventories (at most 12) — big compounds
  // (500+ units) read as the category summary alone, never a flood of cards,
  // and never a cheapest-12 skew (buyable inventory is price-ascending).
  // Aggregate brochure/category rows have no unit code and should each remain
  // visible as a card even when a project has >12 categories. Real inventories
  // keep the compact category-ticket view to avoid flooding the project page.
  const showUnitCards = listedUnits.length > 0 && (
    listedUnits.length <= 12 || listedUnits.every((unit: any) => !unit.unitNumber)
  )
  // Highest cash-discount percent across the project's payment plans (the
  // "up to X%" headline for the payment tab) — null when no plan discounts.
  const maxPlanDiscount = (() => {
    const discounts = (Array.isArray(project.paymentPlans) ? project.paymentPlans : [])
      .map((p: any) => Number(p?.cashDiscount))
      .filter((d: number) => Number.isFinite(d) && d > 0)
    return discounts.length > 0 ? Math.max(...discounts) : null
  })()
  // Overview copy: Arabic when the visitor reads Arabic and Arabic copy
  // exists, otherwise English. `overview`/`overviewAr` are the mobile-contract
  // aliases of `description`/`descriptionArabic` (see lib/search.ts).
  const overviewText = ar
    ? (project.overviewAr ?? project.descriptionArabic ?? project.overview ?? project.description)
    : (project.overview ?? project.description)
  const soldOut = project.status === 'SOLD_OUT' || (listedCount > 0 && availableCount === 0)
  const planCount = Array.isArray(project.paymentPlans) ? project.paymentPlans.length : 0
  const masterCount = Array.isArray(project.masterPlanImages) ? project.masterPlanImages.length : 0
  // Phases section: EVERY phase of the project lives here (owner rule: a
  // phase is always inside its parent project) — even pre-launch ones with
  // no units yet; the units badge only appears when there is inventory.
  const phaseRows = (Array.isArray(project.phases) ? project.phases : []).filter((ph: any) => typeof ph === 'object' && ph.name)
  const childProjectRows = (Array.isArray(project.childProjects) ? project.childProjects : []).filter((child: any) => typeof child === 'object' && child.name)
  const nestedCount = phaseRows.length + childProjectRows.length
  const favCount = Number(project.favoriteCount) || 0
  const { average: revAvg, count: revCount, loaded: revLoaded, failed: revFailed } = useReviewsSummary(project.id)
  const searchParams = useSearchParams()
  // Deep link from the dashboard viewings page (?review=<viewingId>) lands
  // straight on the reviews tab so the rating form is visible.
  const initialTab = searchParams.get('review') ? 'reviews' : 'overview'

  function parseUnitGallery(gallery: unknown): string[] {
    try {
      const parsed = typeof gallery === 'string' ? JSON.parse(gallery) : gallery
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string' && x.length > 0) : []
    } catch {
      return []
    }
  }

  return (
    <div dir={dir}>
      {/* F6: journey view tracking (fire-and-forget) */}
      <JourneyViewTracker type="PROJECT_VIEW" entityId={project.id} />
      {/* Breadcrumb — wraps on phones; long project names truncate instead of forcing sideways scroll. */}
      <div className="container min-w-0 px-4 pt-8">
        <nav className="mb-6 flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Link href="/" className="shrink-0 hover:text-foreground">{ar ? 'الرئيسية' : 'Home'}</Link>
          <ChevronRight className="h-3 w-3 shrink-0 rtl:rotate-180" />
          <Link href="/projects" className="shrink-0 hover:text-foreground">{ar ? 'المشاريع' : 'Projects'}</Link>
          <ChevronRight className="h-3 w-3 shrink-0 rtl:rotate-180" />
          <span className="min-w-0 max-w-full truncate text-foreground">{project.name}</span>
        </nav>
      </div>

      {/* Cinematic hero — full-bleed Ken Burns cover, scrim + vignette + grain,
          kicker = location, cine-title = project name, price + booking CTA
          overlaid on the scrim (readable in both themes). Same text/data. */}
      <section className="cine-hero" aria-label={project.name}>
        <div ref={heroParallax.ref as unknown as RefObject<HTMLDivElement>} style={heroParallax.style} data-parallax className="kenburns absolute inset-0">
          <Image
            src={heroSrc}
            alt={project.name}
            fill
            sizes="100vw"
            className="h-full w-full object-cover animate-kenburns"
            priority
            onError={() => setHeroStage((s) => (s < heroSources.length - 1 ? s + 1 : s))}
          />
        </div>
        <div className="cine-scrim" aria-hidden="true" />
        <div className="cine-vignette" aria-hidden="true" />
        <div className="grain" aria-hidden="true" />
        <div className="absolute inset-x-0 bottom-0 z-10">
          <div className="container px-4 pb-8 sm:pb-10">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <div className="mb-3 flex items-center gap-2">
                  {project.developer?.logo && (
                    <Image src={project.developer.logo} alt="" width={24} height={24} className="rounded-full" />
                  )}
                  <span className="text-sm text-white/80">{project.developer?.companyName}</span>
                </div>
                {location && (
                  <p className="cine-kicker">{location}</p>
                )}
                <h1 className="cine-title mt-4">{project.name}</h1>
              </div>
              {project.startPrice && (
                <div className="shrink-0">
                  <p className="text-sm text-white/80">{ar ? 'يبدأ من' : 'Starting from'}</p>
                  <p className="font-display mt-1 break-words text-3xl font-bold text-estate-gold [text-shadow:0_1px_12px_rgba(0,0,0,0.6)]">{formatEGP(project.startPrice)}</p>
                  <BookingButton
                    projectId={project.id}
                    propertyName={project.name}
                    className="gold-shimmer mt-3"
                    size="lg"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="container px-4 py-8">

      {/* Project video — direct file or YouTube embed; nothing when absent */}
      {!!project.videoUrl && (
        <section aria-label={ar ? 'فيديو المشروع' : 'Project video'} className="mb-8 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#262626] dark:bg-[#0A0A0A]">
          <div className="border-b px-4 py-3">
            <SectionHeader kicker={project.developer?.companyName || (ar ? 'المشروع' : 'Project')} title={ar ? 'فيديو المشروع' : 'Project video'} />
          </div>
          <ProjectVideo url={project.videoUrl} name={project.name} />
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Main Content — min-w-0 lets long nowrap tab labels wrap instead of blowing out the grid on phones. */}
        <div className="min-w-0 space-y-8 lg:col-span-2">
          <Tabs defaultValue={initialTab}>
            <TabsList className="h-auto max-w-full min-h-10 flex-wrap justify-start">
              <TabsTrigger value="overview" className="max-w-full whitespace-normal text-center min-h-[44px] md:min-h-0 md:whitespace-nowrap">{ar ? 'نظرة عامة' : 'Overview'}</TabsTrigger>
              <TabsTrigger value="units" className="max-w-full whitespace-normal text-center min-h-[44px] md:min-h-0 md:whitespace-nowrap">{ar ? 'الوحدات المتاحة' : 'Available units'}</TabsTrigger>
              <TabsTrigger value="payment" className="max-w-full whitespace-normal text-center min-h-[44px] md:min-h-0 md:whitespace-nowrap">{ar ? `السداد (${planCount} خطط)` : `Payment (${planCount} plans)`}</TabsTrigger>
              <TabsTrigger value="reviews" className="max-w-full whitespace-normal text-center min-h-[44px] md:min-h-0 md:whitespace-nowrap">
                {ar
                  ? (!revLoaded || revFailed
                      ? 'التقييمات'
                      : revCount > 0 && revAvg !== null
                        ? `التقييمات ★${revAvg} (${revCount})`
                        : `التقييمات (${revCount})`)
                  : (!revLoaded || revFailed
                      ? 'Reviews'
                      : revCount > 0 && revAvg !== null
                        ? `Reviews ★${revAvg} (${revCount})`
                        : `Reviews (${revCount})`)}
              </TabsTrigger>
              {project.masterPlanImages?.length > 0 && (
                <TabsTrigger value="masterplan" className="max-w-full whitespace-normal text-center min-h-[44px] md:min-h-0 md:whitespace-nowrap">{ar ? `المستر بلان (${masterCount})` : `Master Plan (${masterCount})`}</TabsTrigger>
              )}
              {nestedCount > 0 && (
                <TabsTrigger value="phases" className="max-w-full whitespace-normal text-center min-h-[44px] md:min-h-0 md:whitespace-nowrap">
                  {ar ? `المراحل والمشاريع التابعة (${nestedCount})` : `Phases & sub-projects (${nestedCount})`}
                </TabsTrigger>
              )}
              <TabsTrigger value="amenities" className="max-w-full whitespace-normal text-center min-h-[44px] md:min-h-0 md:whitespace-nowrap">{ar ? 'المرافق' : 'Amenities'}</TabsTrigger>
              <TabsTrigger value="location" className="max-w-full whitespace-normal text-center min-h-[44px] md:min-h-0 md:whitespace-nowrap">{ar ? 'الموقع' : 'Location'}</TabsTrigger>
              <TabsTrigger value="timeline" className="max-w-full whitespace-normal text-center min-h-[44px] md:min-h-0 md:whitespace-nowrap">{ar ? 'الجدول الزمني' : 'Timeline'}</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              {/* Quick Stats — 2-col on phones; min-w-0 + break-words keep long EGP figures inside their card. */}
              <Reveal>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4 [&>*]:min-w-0">
                {project.startPrice && (
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-xs text-muted-foreground">{ar ? 'يبدأ من' : 'Starting From'}</p>
                      <p className="font-display break-words text-lg font-bold text-estate-gold">{formatEGP(project.startPrice)}</p>
                    </CardContent>
                  </Card>
                )}
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">{ar ? 'وحدات معروضة' : 'Units listed'}</p>
                    <p className="font-display text-lg font-bold">{listedUnits.length}</p>
                  </CardContent>
                </Card>
                {project.totalUnits != null && (
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-xs text-muted-foreground">{ar ? 'حجم المشروع' : 'Project size'}</p>
                      <p className="font-display text-lg font-bold">{project.totalUnits}</p>
                    </CardContent>
                  </Card>
                )}
                {project.totalArea && (
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-xs text-muted-foreground">{ar ? 'المساحة الكلية' : 'Total Area'}</p>
                      <p className="font-display text-lg font-bold">{formatSQM(project.totalArea)}</p>
                    </CardContent>
                  </Card>
                )}
                {project.completionPercent !== null && (
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-xs text-muted-foreground">{ar ? 'نسبة الإنجاز' : 'Completion'}</p>
                      <p className="font-display text-lg font-bold">{project.completionPercent}%</p>
                    </CardContent>
                  </Card>
                )}
                </div>
              </Reveal>

              <hr className="gold-hairline" />

              {/* Overview trio — three labeled Cards reusing the neighbor Card
                  tokens (Card/CardHeader/CardTitle/CardContent) and the
                  amenities/location row classes from their tabs. Each card
                  hides when its data is empty; nothing invented. Card 1 keeps
                  the OverviewBody rendering + `overviewText` fallback chain
                  untouched. */}
              {(overviewText || project.deliveryDate) && (
                <Reveal>
                  <Card>
                    <CardHeader>
                      <CardTitle as="h2" className="font-display flex items-center gap-2 text-xl">
                        <Building2 className="h-5 w-5 shrink-0 text-estate-gold" />
                        {ar ? `عن ${project.name}` : `About ${project.name}`}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <OverviewBody text={overviewText} />
                      {project.deliveryDate && (
                        <div className="flex items-center gap-3 rounded-2xl border p-4">
                          <Calendar className="h-5 w-5 shrink-0 text-estate-gold" />
                          <div>
                            <p className="font-semibold">{ar ? 'معاد التسليم المتوقع' : 'Expected Delivery'}</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(project.deliveryDate).toLocaleDateString(ar ? 'ar-EG' : 'en-US', { month: 'long', year: 'numeric' })}
                            </p>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Reveal>
              )}

              {(() => {
                const rawTypes = typeof project.propertyTypes === 'string' ? JSON.parse(project.propertyTypes) : project.propertyTypes
                const typeList: string[] = Array.isArray(rawTypes) ? rawTypes : []
                const hasTypes = typeList.length > 0
                const hasAmenities = Array.isArray(project.amenities) && project.amenities.length > 0
                if (!hasTypes && !hasAmenities) return null
                return (
                  <Reveal>
                    <Card>
                      <CardHeader>
                        <CardTitle as="h2" className="font-display flex items-center gap-2 text-xl">
                          <CheckCircle2 className="h-5 w-5 shrink-0 text-estate-gold" />
                          {ar ? 'المميزات والمرافق' : 'Features & amenities'}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {hasTypes && (
                          <div>
                            <h3 className="font-display mb-2 text-lg font-semibold">{ar ? 'أنواع الوحدات المتاحة' : 'Available Property Types'}</h3>
                            <div className="flex flex-wrap gap-2">
                              {typeList.map((type: string) => (
                                <Badge key={type} variant="secondary">{type.replace(/_/g, ' ')}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {hasAmenities && (
                          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 [&>*]:min-w-0">
                            {project.amenities.map((pa: any) => (
                              <div key={pa.id} className="flex min-w-0 items-center gap-3 rounded-2xl border p-3">
                                <CheckCircle2 className="h-5 w-5 shrink-0 text-estate-gold" />
                                <span className="min-w-0 break-words text-sm font-medium">{pa.amenity.name}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </Reveal>
                )
              })()}

              {(location || project.googleMapsUrl || project.nearbyPlaces?.length > 0) && (
                <Reveal>
                  <Card>
                    <CardHeader>
                      <CardTitle as="h2" className="font-display flex items-center gap-2 text-xl">
                        <MapPin className="h-5 w-5 shrink-0 text-estate-gold" />
                        {ar ? 'الموقع' : 'Location'}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {location && (
                        <div className="flex items-center gap-2">
                          <MapPin className="h-5 w-5 shrink-0 text-estate-gold" />
                          <span className="font-display text-lg font-medium">{location}</span>
                        </div>
                      )}
                      {project.googleMapsUrl && (
                        <a href={project.googleMapsUrl} target="_blank" rel="noopener noreferrer"
                          className="text-sm text-estate-gold hover:underline">
                          {ar ? 'شوفه على جوجل مابس' : 'View on Google Maps'} <ExternalLink className="inline h-3 w-3" />
                        </a>
                      )}
                      {project.nearbyPlaces?.length > 0 && (
                        <div className="space-y-2">
                          {project.nearbyPlaces.map((place: any) => (
                            <div key={place.id} className="flex items-center justify-between gap-3 rounded-2xl border p-3">
                              <span className="min-w-0 flex-1 font-medium">{place.name}</span>
                              <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 text-sm text-muted-foreground">
                                {place.distance && <span>{place.distance} {ar ? 'كم' : 'km'}</span>}
                                {place.driveTime && <span>{place.driveTime} {ar ? 'دقيقة بالعربية' : 'min drive'}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Reveal>
              )}
            </TabsContent>

            <TabsContent value="units">
              {/* "Blueprint ticket" cards — one per offered category, a design
                  the market hasn't seen: faint architect-grid backdrop, gold
                  side rail, room glyphs (beds count / twin homes / shop),
                  hero area numeral, perforated divider, gold starting price.
                  No counts, no codes, no flood. */}
              {categoryRows.length > 0 ? (
                <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {categoryRows.map((row) => (
                    <div
                      key={row.key}
                      className="group relative overflow-hidden rounded-2xl border border-border/70 bg-background/80 p-4 pt-5 transition-all duration-300 hover:-translate-y-1 hover:border-estate-gold/50 hover:shadow-[0_12px_40px_-12px_rgba(212,168,67,0.35)]"
                      style={{
                        backgroundImage:
                          'linear-gradient(rgba(212,168,67,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(212,168,67,0.05) 1px, transparent 1px)',
                        backgroundSize: '18px 18px',
                      }}
                    >
                      <span
                        aria-hidden
                        className="absolute inset-y-0 start-0 w-[3px] rounded-full bg-gradient-to-b from-estate-gold via-estate-gold/40 to-transparent"
                      />
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-display font-semibold">{ar ? row.labelAr : row.labelEn}</p>
                        <div aria-hidden className="flex shrink-0 items-center gap-1 text-estate-gold/75">
                          {CAT_GLYPH[row.key]?.() ?? <Building2 className="h-3.5 w-3.5" />}
                        </div>
                      </div>
                      {row.minArea !== null && (
                        <div className="mt-3 flex flex-wrap items-baseline gap-2">
                          <span className="font-display text-3xl font-extrabold tracking-tight">
                            {row.minArea.toLocaleString('en-US')}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {row.areaLabel === 'average'
                              ? ar ? 'م² متوسط المساحة' : 'sqm average area'
                              : ar ? 'م² المساحة الأولية' : 'sqm primary area'}
                          </span>
                        </div>
                      )}
                      <div aria-hidden className="my-3 border-t border-dashed border-border/50" />
                      {row.startingPrice !== null && (
                        <div>
                          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                            {ar ? 'يبدأ من' : 'Starting from'}
                          </p>
                          <p className="font-display text-lg font-bold text-estate-gold">{formatEGP(row.startingPrice)}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-4 text-center text-muted-foreground">
                  {ar ? 'لسه مفيش وحدات معروضة.' : 'No units listed yet.'}
                </p>
              )}
              {showUnitCards ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {listedUnits.map((unit: any) => (
                    <UnitCard key={unit.id} unit={unit} projectName={project.name} projectSlug={project.slug} projectCoverImage={project.coverImage} />
                  ))}
                </div>
              ) : (
                <p className="text-center text-xs text-muted-foreground">
                  {ar
                    ? 'اللي فوق مخزون متاح فعليًا حاليًا — اسأل عين عن أي نوع أو مواصفة بالتحديد.'
                    : 'The list above reflects live available inventory — ask Ayn for any exact unit or spec.'}
                </p>
              )}
            </TabsContent>

            <TabsContent value="payment" className="space-y-6">
              {/* F10: verification status of key facts — above the payment milestones */}
              <ProjectTrust projectId={project.id} />
              {!revFailed && revLoaded && (
                revCount > 0 && revAvg !== null ? (
                  <p className="text-[12px] leading-relaxed text-muted-foreground">
                    <span className="text-estate-gold">★</span>{' '}
                    {ar ? `${revAvg} من ${revCount} تقييم بعد معاينة فعلية` : `${revAvg} from ${revCount} post-viewing reviews`}
                  </p>
                ) : (
                  <p className="text-[12px] leading-relaxed text-muted-foreground">
                    {ar ? 'لسه مفيش تقييمات معتمدة — كن أول اللي يقيّم بعد الزيارة.' : 'No approved reviews yet — be the first to rate after your visit.'}
                  </p>
                )
              )}
              {project.paymentPlans?.length > 0 ? (
                <>
                  <PlanCalculator key={project.id} plans={project.paymentPlans} basePrice={basePrice} />
                  {/* Headline discount across the plan set ("up to X%"). */}
                  {maxPlanDiscount !== null && (
                    <p className="rounded-2xl border border-green-200 bg-green-50 p-4 text-center text-sm dark:border-green-900 dark:bg-green-950">
                      {ar ? (
                        <>خصم لحد <span className="font-bold text-green-600">{maxPlanDiscount}%</span></>
                      ) : (
                        <>Up to <span className="font-bold text-green-600">{maxPlanDiscount}%</span> discount</>
                      )}
                    </p>
                  )}
                  {project.paymentPlans.map((plan: any, idx: number) => (
                  <Reveal key={plan.id} delay={(idx % 4) * 80}>
                  <Card>
                    <CardHeader>
                      <CardTitle as="h2" className="font-display flex items-center gap-2 text-xl">
                        {plan.name}
                        {plan.isDefault && <Badge variant="gold">{ar ? 'الأساسية' : 'Default'}</Badge>}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <PlanAnchorLine basePrice={basePrice} plan={plan} pricePerSqm={project.pricePerSqm} />
                      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                        <div>
                          <p className="text-xs text-muted-foreground">{ar ? 'المقدم' : 'Down Payment'}</p>
                          <p className="text-lg font-bold">{plan.downPaymentPct}%</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{ar ? 'التقسيط' : 'Installments'}</p>
                          <p className="text-lg font-bold">{plan.installmentYears} {plan.installmentYears === 1 ? (ar ? 'سنة' : 'Year') : (ar ? 'سنين' : 'Years')}</p>
                        </div>
                        {plan.cashDiscount && (
                          <div>
                            <p className="text-xs text-muted-foreground">{ar ? 'خصم' : 'Discount'}</p>
                            <p className="text-lg font-bold text-green-600">{plan.cashDiscount}%</p>
                          </div>
                        )}
                        {plan.maintenanceFeePct && (
                          <div>
                            <p className="text-xs text-muted-foreground">{ar ? 'الصيانة' : 'Maintenance'}</p>
                            <p className="text-lg font-bold">{plan.maintenanceFeePct}%</p>
                          </div>
                        )}
                      </div>
                      {plan.milestones?.length > 0 && (
                        <div className="space-y-2">
                          <h3 className="font-medium">{ar ? 'دفعات السداد' : 'Payment Milestones'}</h3>
                          <div className="space-y-2">
                            {plan.milestones.map((m: any) => (
                              <div key={m.id} className="flex items-center justify-between gap-3 rounded-2xl border p-3">
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium">{m.name}</p>
                                  {m.description && <p className="text-xs text-muted-foreground">{m.description}</p>}
                                </div>
                                <Badge variant="gold">{m.percentage}%</Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  </Reveal>
                ))}
                </>
              ) : (
                <p className="py-8 text-center text-muted-foreground">{ar ? 'لسه مفيش خطط سداد متاحة.' : 'No payment plans available yet.'}</p>
              )}
            </TabsContent>

            <TabsContent value="reviews">
              {/* Visitor reviews — approved ratings from completed viewings */}
              <ProjectReviews projectId={project.id} />
            </TabsContent>

            {project.masterPlanImages?.length > 0 && (
              <TabsContent value="masterplan" className="space-y-4">
                <Reveal>
                  <SectionHeader
                    kicker={ar ? 'المستر بلان' : 'Master Plan'}
                    title={ar ? 'تخطيط الموقع' : 'Site layout'}
                    description={ar
                      ? 'تخطيط الموقع — العمارات وتوزيع الوحدات والمرافق. دوس على أي صورة عشان تكبرها.'
                      : 'Site layout of the project — buildings, unit distribution, and amenities. Click an image to enlarge.'}
                  />
                </Reveal>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {project.masterPlanImages.map((mp: any, idx: number) => (
                    <Reveal key={mp.id} variant="wipe" delay={(idx % 2) * 100}>
                    <button
                      type="button"
                      onClick={() => setPlanOpen(mp.url)}
                      className="group block w-full overflow-hidden rounded-2xl border border-gray-200 bg-white text-start transition-shadow hover:shadow-lg hover:shadow-estate-gold/20 dark:border-[#262626] dark:bg-[#0A0A0A]"
                    >
                      <div className="arch">
                        <Image
                          src={mp.url}
                          alt={mp.caption || (ar ? 'المستر بلان' : 'Master plan')}
                          width={800}
                          height={600}
                          className="max-h-[420px] w-full object-contain"
                          loading="lazy"
                        />
                      </div>
                      {mp.caption && (
                        <p className="border-t px-3 py-2 text-sm text-muted-foreground">{mp.caption}</p>
                      )}
                    </button>
                    </Reveal>
                  ))}
                </div>
              </TabsContent>
            )}

            <TabsContent value="phases" className="space-y-4">
              <Reveal>
                <SectionHeader
                  kicker={ar ? 'المراحل والمشاريع التابعة' : 'Project structure'}
                  title={ar ? 'تفاصيل المشروع من جوّه' : 'Inside this project'}
                  description={ar
                    ? 'المراحل والمشاريع التابعة بتظهر هنا جوه المشروع الأم، مش كصفحات مشاريع مستقلة.'
                    : 'Phases and nested projects live here inside the parent, never as standalone project pages.'}
                />
              </Reveal>
              {phaseRows.length > 0 && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {phaseRows.map((ph: any, idx: number) => (
                  <Reveal key={ph.id} variant="wipe" delay={(idx % 2) * 100}>
                    <div className="h-full rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#262626] dark:bg-[#0A0A0A]">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <h3 className="font-display min-w-0 break-words text-lg font-semibold">{ar ? (ph.nameArabic || ph.name) : ph.name}</h3>
                        <div className="flex shrink-0 items-center gap-2">
                          {ph.isLaunch && (
                            <Badge className="bg-red-500/15 text-red-500 border-red-500/30">
                              🚀 {ar ? (ph.launchDate ? `لونش — ${new Date(ph.launchDate).toLocaleDateString('ar-EG')}` : 'لونش جديد') : (ph.launchDate ? `Launch — ${new Date(ph.launchDate).toLocaleDateString('en-GB')}` : 'New Launch')}
                            </Badge>
                          )}
                          {(ph.totalUnits ?? 0) > 0 && (
                            <Badge variant="gold">{ar ? `${ph.totalUnits} وحدة` : `${ph.totalUnits} units`}</Badge>
                          )}
                        </div>
                      </div>
                      {ph.description && <p className="mb-2 text-sm text-muted-foreground">{ph.description}</p>}
                      {ph.deliveryDate && (
                        <p className="mb-2 text-xs text-muted-foreground">
                          {ar ? 'مواعيد التسليم' : 'Delivery'}: {new Date(ph.deliveryDate).toLocaleDateString(ar ? 'ar-EG' : 'en-GB', { year: 'numeric', month: 'long' })}
                        </p>
                      )}
                      {(ph.startPrice != null || ph.endPrice != null) && (
                        <p className="font-display break-words text-lg font-bold text-estate-gold">
                          {ph.startPrice != null ? `${ar ? 'من' : 'From'} ${formatEGP(ph.startPrice)}` : ''}
                          {ph.startPrice != null && ph.endPrice != null ? ` — ${ar ? 'إلى' : 'to'} ${formatEGP(ph.endPrice)}` : ''}
                        </p>
                      )}
                    </div>
                  </Reveal>
                ))}
              </div>}

              {childProjectRows.length > 0 && (
                <section className="space-y-3" aria-label={ar ? 'المشاريع التابعة' : 'Nested projects'}>
                  <h3 className="font-display text-xl font-semibold">{ar ? 'مشاريع جوه المشروع الأم' : 'Projects inside the parent'}</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {childProjectRows.map((child: any, idx: number) => {
                      const childUnits = Array.isArray(child.units) ? child.units : []
                      const unitPrices = childUnits.map((u: any) => Number(u.price)).filter((n: number) => Number.isFinite(n) && n > 0)
                      const childStart = unitPrices.length ? Math.min(...unitPrices) : child.startPrice
                      let childTypes: string[] = []
                      try {
                        const parsed = typeof child.propertyTypes === 'string' ? JSON.parse(child.propertyTypes) : child.propertyTypes
                        if (Array.isArray(parsed)) childTypes = parsed.filter((type: unknown): type is string => typeof type === 'string' && type !== 'UNKNOWN').slice(0, 4)
                      } catch { childTypes = [] }
                      const childName = ar ? (child.nameArabic || child.name) : child.name
                      const childDescription = ar
                        ? (child.taglineArabic || child.descriptionArabic || child.tagline || child.description)
                        : (child.tagline || child.description)

                      return (
                        <Reveal key={child.id} variant="wipe" delay={(idx % 2) * 100}>
                          <article className="h-full overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#262626] dark:bg-[#0A0A0A]">
                            {child.coverImage && (
                              <div className="relative h-40 w-full bg-muted">
                                <Image src={child.coverImage} alt={childName} fill sizes="(max-width: 640px) 100vw, 50vw" className="object-cover" />
                              </div>
                            )}
                            <div className="p-4">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <h4 className="font-display min-w-0 break-words text-lg font-semibold">{childName}</h4>
                                <Badge variant="secondary">{ar ? 'داخل المشروع الأم' : 'Part of this parent'}</Badge>
                              </div>
                              {(child.city?.nameArabic || child.city?.name || child.address) && (
                                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                                  <MapPin className="h-3 w-3" />{ar ? (child.city?.nameArabic || child.city?.name || child.address) : (child.city?.name || child.address)}
                                </p>
                              )}
                              {childDescription && childDescription !== '.' && <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{childDescription}</p>}
                              {childTypes.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                  {childTypes.map((type) => <Badge key={type} variant="outline">{type.replace(/_/g, ' ')}</Badge>)}
                                </div>
                              )}
                              {childStart != null && childStart > 0 && (
                                <p className="mt-3 font-display text-lg font-bold text-estate-gold">{ar ? 'يبدأ من ' : 'From '}{formatEGP(childStart)}</p>
                              )}
                              {childUnits.length > 0 && (
                                <div className="mt-3 space-y-2 border-t border-border pt-3">
                                  <p className="text-xs font-semibold text-muted-foreground">{ar ? 'نماذج وحدات متاحة' : 'Available unit examples'}</p>
                                  {childUnits.map((unit: any) => (
                                    <div key={unit.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                                      <span className="text-foreground">{unit.unitType?.replace(/_/g, ' ')}{unit.area ? ` · ${formatSQM(unit.area)}` : ''}</span>
                                      <span className="font-semibold text-estate-gold">{formatEGP(unit.price)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </article>
                        </Reveal>
                      )
                    })}
                  </div>
                </section>
              )}
            </TabsContent>

            <TabsContent value="amenities">
              {project.amenities?.length > 0 ? (
                <Reveal>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 [&>*]:min-w-0">
                    {project.amenities.map((pa: any) => (
                      <div key={pa.id} className="flex min-w-0 items-center gap-3 rounded-2xl border p-3">
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-estate-gold" />
                        <span className="min-w-0 break-words text-sm font-medium">{pa.amenity.name}</span>
                      </div>
                    ))}
                  </div>
                </Reveal>
              ) : (
                <p className="py-8 text-center text-muted-foreground">{ar ? 'تفاصيل المرافق لسه هتنزل قريب.' : 'Amenities info coming soon.'}</p>
              )}
            </TabsContent>

            <TabsContent value="location" className="space-y-4">
              {location && (
                <Reveal>
                  <div className="rounded-2xl border p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin className="h-5 w-5 text-estate-gold" />
                      <span className="font-display text-lg font-medium">{location}</span>
                    </div>
                    {project.googleMapsUrl && (
                      <a href={project.googleMapsUrl} target="_blank" rel="noopener noreferrer"
                        className="text-sm text-estate-gold hover:underline">
                        {ar ? 'شوفه على جوجل مابس' : 'View on Google Maps'} <ExternalLink className="inline h-3 w-3" />
                      </a>
                    )}
                  </div>
                </Reveal>
              )}
              <hr className="gold-hairline" />
              {project.nearbyPlaces?.length > 0 && (
                <div>
                  <h3 className="font-display mb-3 text-lg font-semibold">{ar ? 'أماكن قريبة' : 'Nearby Places'}</h3>
                  <div className="space-y-2">
                    {project.nearbyPlaces.map((place: any) => (
                      <div key={place.id} className="flex items-center justify-between gap-3 rounded-2xl border p-3">
                        <span className="min-w-0 flex-1 font-medium">{place.name}</span>
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 text-sm text-muted-foreground">
                          {place.distance && <span>{place.distance} {ar ? 'كم' : 'km'}</span>}
                          {place.driveTime && <span>{place.driveTime} {ar ? 'دقيقة بالعربية' : 'min drive'}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* F8: project timeline (approved milestones only) */}
            <TabsContent value="timeline" className="space-y-4">
              <ProjectTimeline projectId={project.id} />
            </TabsContent>
          </Tabs>

          {/* Showcase model units — REAL owner-uploaded photos/floorplan/area
              only (never invented). Illustrative, non-bookable, inquiry CTA
              only. Hidden when zero samples. */}
          {sampleUnits.length > 0 && (
            <section aria-label={ar ? 'نماذج الوحدات' : 'Model units'} className="space-y-4">
              <Reveal>
                <SectionHeader
                  kicker={ar ? 'استرشادي' : 'Showcase'}
                  title={ar ? 'نماذج الوحدات' : 'Model units'}
                  description={ar
                    ? 'وحدات نموذجية استرشادية من المطوّر — للفرجة بس، مش للحجز. لو عجبتك حاجة ابعت استفسار.'
                    : 'Illustrative model units from the developer — for reference only, not bookable. Send an inquiry if you like one.'}
                />
              </Reveal>
              <div className="grid gap-4 sm:grid-cols-2">
                {sampleUnits.map((unit: any, idx: number) => {
                  const photos = parseUnitGallery(unit.gallery)
                  const photo = photos[0] || null
                  const typeLabel = String(unit.unitType || '').replace(/_/g, ' ')
                  const inquiryText = ar
                    ? `عايز استفسر عن النموذج الاسترشادي (${typeLabel}) في مشروع ${project.name} — ${unit.name}`
                    : `I want to ask about the showcase model (${typeLabel}) in ${project.name} — ${unit.name}`
                  return (
                    <Card key={unit.id} className="overflow-hidden">
                      <Reveal variant="wipe" delay={(idx % 2) * 100}>
                      <div className="relative aspect-[16/10] overflow-hidden">
                        <ShowcasePhoto photo={photo} cover={project.coverImage} landmark={landmarkForCity(project.city)} name={unit.name} />
                        <div className="absolute start-3 top-3 flex flex-wrap gap-2">
                          <Badge variant="gold">{ar ? 'استرشادي' : 'Showcase'}</Badge>
                          {typeLabel && (
                            <Badge className="bg-background/90 text-foreground">{typeLabel}</Badge>
                          )}
                        </div>
                      </div>
                      </Reveal>
                      <CardContent className="space-y-3 p-4">
                        <h3 className="font-display text-lg font-semibold">{unit.name}</h3>
                        <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                          {unit.area != null && (
                            <span className="flex items-center gap-1">
                              <Maximize className="h-4 w-4" />
                              {formatSQM(unit.area)}
                            </span>
                          )}
                          {unit.bedrooms != null && (
                            <span className="flex items-center gap-1">
                              <Bed className="h-4 w-4" />
                              {unit.bedrooms} {unit.bedrooms === 1 ? (ar ? 'أوضة' : 'Bed') : (ar ? 'أوض' : 'Beds')}
                            </span>
                          )}
                          {unit.bathrooms != null && (
                            <span className="flex items-center gap-1">
                              <Bath className="h-4 w-4" />
                              {unit.bathrooms} {unit.bathrooms === 1 ? (ar ? 'حمام' : 'Bath') : (ar ? 'حمامات' : 'Baths')}
                            </span>
                          )}
                        </div>
                        {unit.floorPlan && (
                          <div>
                            <p className="mb-2 text-sm font-medium">{ar ? 'المخطط' : 'Floor plan'}</p>
                            <div className="overflow-hidden rounded-2xl border bg-white dark:border-[#262626] dark:bg-[#0A0A0A]">
                              <Image
                                src={unit.floorPlan}
                                alt={ar ? `المخطط — ${unit.name}` : `Floor plan — ${unit.name}`}
                                width={800}
                                height={600}
                                className="w-full object-contain"
                                loading="lazy"
                              />
                            </div>
                          </div>
                        )}
                        {unit.price != null && (
                          <p className="font-display text-lg font-bold text-estate-gold">{formatEGP(unit.price)}</p>
                        )}
                        <Button asChild variant="outline" className="w-full" size="lg">
                          <Link href={`/contact?message=${encodeURIComponent(inquiryText)}`}>
                            <Mail className="mr-2 h-4 w-4" />
                            {ar ? 'ابعت استفسار' : 'Send Inquiry'}
                          </Link>
                        </Button>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </section>
          )}
        </div>

        {/* Sidebar — sticky only on desktop; on phones it flows normally so it never pins over content. */}
        <div className="min-w-0 space-y-6">
          <Card className="lg:sticky lg:top-20">
            <CardContent className="p-6 space-y-4">
              {project.startPrice && (
                <div>
                  <p className="text-sm text-muted-foreground">{ar ? 'يبدأ من' : 'Starting from'}</p>
                  <p className="font-display break-words text-3xl font-bold text-estate-gold">{formatEGP(project.startPrice)}</p>
                  {project.pricePerSqm && (
                    <p className="text-sm text-muted-foreground">
                      {formatEGP(project.pricePerSqm)}{ar ? '/م²' : '/sqm'}
                    </p>
                  )}
                </div>
              )}

              {!revFailed && revLoaded && (
                revCount > 0 && revAvg !== null ? (
                  <p className="text-[12px] leading-relaxed text-muted-foreground">
                    <span className="text-estate-gold">★</span>{' '}
                    {ar ? `${revAvg} من ${revCount} تقييم بعد معاينة فعلية` : `${revAvg} from ${revCount} post-viewing reviews`}
                    {favCount > 0 && (ar ? ` • حفظه ${favCount} زائر` : ` • saved by ${favCount} visitors`)}
                  </p>
                ) : (
                  <p className="text-[12px] leading-relaxed text-muted-foreground">
                    {ar ? 'لسه مفيش تقييمات معتمدة — كن أول اللي يقيّم بعد الزيارة.' : 'No approved reviews yet — be the first to rate after your visit.'}
                  </p>
                )
              )}

              <BookingButton
                projectId={project.id}
                propertyName={project.name}
                className="gold-shimmer w-full"
                size="lg"
              />

              <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <span className="text-xs text-muted-foreground">
                  {ar ? 'ضيف للمقارنة (لحد 4)' : 'Add to comparison (up to 4)'}
                </span>
                <CompareToggle project={{ id: project.id, slug: project.slug, name: project.name }} />
              </div>
              <Button
                className="gold-shimmer w-full bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold-dark"
                size="lg"
                onClick={() => setShowPhone((v) => !v)}
                aria-expanded={showPhone}
              >
                <Phone className="mr-2 h-4 w-4" />
                {showPhone ? (ar ? 'اخفي بيانات التواصل' : 'Hide Contact Details') : (ar ? 'كلم المطور' : 'Contact Developer')}
              </Button>

              {showPhone && (
                <div className="space-y-2 rounded-2xl border border-estate-gold/30 bg-estate-gold/5 p-4">
                  {project.developer?.contactPhone ? (
                    <a
                      href={`tel:${String(project.developer.contactPhone).replace(/\s+/g, '')}`}
                      className="flex items-center gap-2 text-sm font-medium transition-colors hover:text-estate-gold"
                    >
                      <Phone className="h-4 w-4 shrink-0 text-estate-gold" />
                      <span dir="ltr">{project.developer.contactPhone}</span>
                    </a>
                  ) : null}
                  {project.developer?.contactEmail ? (
                    <a
                      href={`mailto:${project.developer.contactEmail}`}
                      className="flex items-center gap-2 text-sm font-medium transition-colors hover:text-estate-gold"
                    >
                      <Mail className="h-4 w-4 shrink-0 text-estate-gold" />
                      <span dir="ltr">{project.developer.contactEmail}</span>
                    </a>
                  ) : null}
                  {!project.developer?.contactPhone && !project.developer?.contactEmail && (
                    <p className="text-sm text-muted-foreground">
                      {ar ? (
                        <>لسه مفيش تواصل مباشر —{' '}
                          <Link href="/contact" className="text-estate-gold underline">
                            ابعت استفسار
                          </Link>{' '}
                          والفريق هيرد عليك.</>
                      ) : (
                        <>No direct contact yet —{' '}
                          <Link href="/contact" className="text-estate-gold underline">
                            send an inquiry
                          </Link>{' '}
                          and the team will get back to you.</>
                      )}
                    </p>
                  )}
                </div>
              )}

              <Button asChild className="w-full" variant="outline" size="lg">
                <Link href="/contact">
                  <Mail className="mr-2 h-4 w-4" />
                  {ar ? 'ابعت استفسار' : 'Send Inquiry'}
                </Link>
              </Button>

              {basePrice > 0 && (
                <div className="border-t pt-4">
                  <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {ar ? 'حاسبة القسط الشهري' : 'Monthly Installment Estimator'}
                  </p>
                  <div className="mb-3 rounded-2xl border border-estate-gold/30 bg-estate-gold/5 p-3 text-center">
                    <p className="text-2xl font-bold text-estate-gold">{formatEGP(monthlyPayment)}</p>
                    <p className="text-xs text-muted-foreground">{ar ? `في الشهر · على ${calcYears} سنين` : `per month · over ${calcYears} years`}</p>
                  </div>
                  <label className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{ar ? 'المقدم' : 'Down payment'}</span>
                    <span className="font-semibold text-foreground">{calcDp}%</span>
                  </label>
                  <input
                    type="range"
                    aria-label={ar ? 'المقدم' : 'Down payment'}
                    min={10}
                    max={50}
                    step={5}
                    value={calcDp}
                    onChange={(e) => setCalcDp(Number(e.target.value))}
                    className="mb-3 h-11 w-full accent-[#D4A843] md:h-auto"
                  />
                  <label className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{ar ? 'المدة' : 'Duration'}</span>
                    <span className="font-semibold text-foreground">{calcYears} {calcYears === 1 ? (ar ? 'سنة' : 'year') : (ar ? 'سنين' : 'years')}</span>
                  </label>
                  <input
                    type="range"
                    aria-label={ar ? 'المدة' : 'Duration'}
                    min={1}
                    max={15}
                    step={1}
                    value={calcYears}
                    onChange={(e) => setCalcYears(Number(e.target.value))}
                    className="h-11 w-full accent-[#D4A843] md:h-auto"
                  />
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                    {ar
                      ? 'تقدير تقريبي من غير فوائد — الشروط الفعلية حسب خطة سداد المشروع.'
                      : 'Indicative estimate without interest — actual terms follow the project\u2019s payment plan.'}
                  </p>
                </div>
              )}

              {soldOut ? (
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  {ar ? (
                    <>اتباعت —{' '}
                      <Link href="/contact" className="text-estate-gold underline">
                        سيب استفسار لو حاجة رجعت
                      </Link>
                    </>
                  ) : (
                    <>Sold out —{' '}
                      <Link href="/contact" className="text-estate-gold underline">
                        leave an inquiry in case something opens up
                      </Link>
                    </>
                  )}
                </p>
              ) : (
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  {ar ? `${availableCount} وحدات متاحة للحجز` : `${availableCount} units available for booking`}
                  {project.deliveryDate
                    ? (ar
                        ? ` — التسليم ${new Date(project.deliveryDate).toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })}`
                        : ` — delivery ${new Date(project.deliveryDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`)
                    : ''}
                  {project.completionPercent != null
                    ? (ar ? ` • الإنجاز ${project.completionPercent}%` : ` • ${project.completionPercent}% complete`)
                    : ''}
                </p>
              )}

              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[44px] flex-1 md:min-h-0"
                  onClick={() => setSaved(toggleSaved(projectSnapshot()))}
                >
                  <Heart className={saved ? 'mr-2 h-4 w-4 fill-estate-gold text-estate-gold' : 'mr-2 h-4 w-4'} />
                  {saved ? (ar ? 'محفوظ' : 'Saved') : (ar ? 'احفظ' : 'Save')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[44px] flex-1 md:min-h-0"
                  onClick={onShare}
                >
                  <Share2 className="mr-2 h-4 w-4" />
                  {ar ? 'شير' : 'Share'}
                </Button>
              </div>
              <p className="text-[12px] text-muted-foreground">{ar ? 'ابعتها لأهلك وخد رأيهم' : 'Send it to your family and get their take'}</p>

              {shareOpen && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <p className="text-xs font-semibold text-white">{ar ? 'اللينك جاهز! ابعته لصاحبك على واتساب' : 'Link ready! Send it to your friend on WhatsApp'}</p>
                  <input
                    readOnly
                    value={typeof window !== 'undefined' ? window.location.href : ''}
                    onFocus={(e) => e.target.select()}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-2.5 py-1.5 text-base text-gray-300 focus:border-estate-gold/60 focus:outline-none md:text-[11px]"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={onCopyShare}
                      className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-full border border-white/15 px-3 py-1.5 text-xs text-gray-200 transition-colors hover:bg-white/10 md:min-h-0"
                    >
                      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? (ar ? 'اتنسخ!' : 'Copied!') : (ar ? 'انسخ اللينك' : 'Copy link')}
                    </button>
                    <a
                      href={waHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-full bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-[#0b3d20] transition-colors hover:brightness-110 md:min-h-0"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      {ar ? 'واتساب' : 'WhatsApp'}
                    </a>
                  </div>
                </div>
              )}

              {/* F7: price & availability watch */}
              <WatchButton targetType="PROJECT" targetId={project.id} />

              {project.developer && (
                <div className="border-t pt-4">
                  <p className="mb-2 text-xs text-muted-foreground uppercase tracking-wider">{ar ? 'المطور' : 'Developer'}</p>
                  <div className="flex items-center gap-3">
                    {project.developer.logo && (
                      <Image src={project.developer.logo} alt="" width={40} height={40} className="rounded-2xl" />
                    )}
                    <div>
                      <p className="font-medium">{project.developer.companyName}</p>
                      {project.developer.isVerified && (
                        <Badge variant="info" className="text-xs">{ar ? 'موثّق' : 'Verified'}</Badge>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 360° virtual tour — entry to /projects/[slug]/tour when panoramas exist */}
      {(() => {
        let panos: string[] = []
        try {
          const raw = project.panoramaImages
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
          if (Array.isArray(parsed)) {
            panos = parsed.filter((u): u is string => typeof u === 'string' && u.length > 0)
          }
        } catch {
          panos = []
        }
        if (panos.length === 0) return null
        return (
          <section aria-label={ar ? 'جولة افتراضية' : 'Virtual tour'} className="mt-8">
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-estate-gold/10">
                    <Globe className="h-5 w-5 text-estate-gold" />
                  </span>
                  <div>
                    <h2 className="font-display display-3">{ar ? 'جولة افتراضية 360°' : '360° virtual tour'}</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {ar ? 'اتفرج على المشروع من كل حتة — لف وبص حواليك' : 'Look around the project from every angle — drag and explore'}
                      {panos.length > 1 ? (ar ? ` · ${panos.length} مشاهد` : ` · ${panos.length} scenes`) : ''}
                    </p>
                  </div>
                </div>
                <Button asChild size="lg" className="gold-shimmer bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold-dark">
                  <Link href={`/projects/${project.slug}/tour`}>
                    {ar ? 'ابدأ الجولة' : 'Start the tour'}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </section>
        )
      })()}

      </div>

      {planOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 sm:p-10"
          onClick={() => setPlanOpen(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            className="absolute right-4 top-4 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/25 md:min-h-0 md:min-w-0"
            aria-label={ar ? 'اقفل' : 'Close'}
          >
            <X className="h-5 w-5" />
          </button>
          <Image
            src={planOpen}
            alt={ar ? 'المستر بلان' : 'Master plan'}
            width={1600}
            height={1200}
            className="max-h-full max-w-full rounded-2xl bg-white object-contain shadow-2xl"
          />
        </div>
      )}

      {/* Sticky mobile booking bar — same BookingButton modal + WhatsApp entry,
          impossible to miss on small screens. Desktop keeps the sticky side card. */}
      <div className="h-24 lg:hidden" aria-hidden="true" />
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-estate-gold/20 bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <div className="min-w-0 flex-1">
            {project.startPrice ? (
              <p className="truncate text-sm font-bold text-estate-gold">{formatEGP(project.startPrice)}</p>
            ) : null}
            <p className="truncate text-xs text-muted-foreground">
              {ar ? 'احجز معاينة مجانية للمشروع ده' : 'Book a free viewing of this project'}
            </p>
          </div>
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={ar ? 'شير على واتساب' : 'Share on WhatsApp'}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-[#0b3d20] transition-colors hover:brightness-110"
          >
            <MessageCircle className="h-5 w-5" />
          </a>
          <BookingButton
            projectId={project.id}
            propertyName={project.name}
            label={ar ? 'احجز معاينة' : 'Book a viewing'}
            className="gold-shimmer min-w-0 flex-1"
            size="lg"
          />
        </div>
      </div>
    </div>
  )
}

/** YouTube watch / share / embed URL → video id. Direct files return null. */
function youTubeId(url: string): string | null {
  const match = /(?:youtube\.com\/(?:watch\?[^#]*v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/.exec(url)
  return match?.[1] ?? null
}

/**
 * Project promo video — direct files (mp4/HLS, what the Nawy import writes)
 * play in a native `<video>` element; YouTube links get a privacy-enhanced
 * iframe embed. Absent URL renders nothing (caller guards).
 */
function ProjectVideo({ url, name }: { url: string; name: string }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const id = youTubeId(url)
  if (id) {
    return (
      <div className="aspect-video w-full bg-black">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}`}
          title={ar ? `فيديو المشروع — ${name}` : `Project video — ${name}`}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
      </div>
    )
  }
  return (
    <video controls preload="metadata" src={url} className="aspect-video w-full bg-black" aria-label={ar ? `فيديو المشروع — ${name}` : `Project video — ${name}`} />
  )
}

type ReviewRow = {
  id: string
  rating: number
  comment: string | null
  createdAt: string
  user: { id: string; name: string | null } | null
}

type EligibleViewing = {
  id: string
  scheduledAt: string
  status: string
  project?: { id: string } | null
  unit?: { project?: { id: string } | null } | null
}

// Visitor reviews: approved-only public list with average + count, plus a
// minimal submit form for signed-in visitors with a COMPLETED viewing.
// `?review=<viewingId>` (linked from the dashboard viewings page) preselects
// that viewing and opens the form.
function ProjectReviews({ projectId }: { projectId: string }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const searchParams = useSearchParams()
  const preselected = searchParams.get('review')
  const [reviews, setReviews] = useState<ReviewRow[]>([])
  const [average, setAverage] = useState<number | null>(null)
  const [count, setCount] = useState(0)
  const [eligible, setEligible] = useState<EligibleViewing[]>([])
  const [viewingId, setViewingId] = useState('')
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/reviews?projectId=${encodeURIComponent(projectId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        setReviews(data.reviews || [])
        setAverage(data.average)
        setCount(data.count || 0)
      })
      .catch(() => {})
    // Eligible viewings: signed-in caller's COMPLETED viewings on this project.
    // Guests get a 401 here — the form then shows a sign-in hint instead.
    fetch('/api/viewings')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        const list: EligibleViewing[] = (data.viewings || []).filter(
          (v: EligibleViewing) =>
            v.status === 'COMPLETED' &&
            ((v.project?.id ?? null) === projectId ||
              (v as any)?.unit?.project?.id === projectId ||
              // Fallback for viewings booked on a unit whose project id is
              // exposed differently — keep the row if the project slug matches.
              (v as any)?.project?.id === projectId)
        )
        setEligible(list)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [projectId])

  useEffect(() => {
    if (preselected) {
      setViewingId(preselected)
      setFormOpen(true)
    }
  }, [preselected])

  const submit = async () => {
    if (!viewingId || rating < 1 || rating > 5 || sending) return
    setSending(true)
    setNotice(null)
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          viewingId,
          rating,
          comment: comment.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        console.error('Review submit failed:', data?.error)
        throw new Error(ar ? 'معرفناش نبعت التقييم — جرب تاني.' : 'Could not submit your rating — try again.')
      }
      setNotice(ar ? 'شكراً! تقييمك اتبعت وهيظهر بعد المراجعة.' : 'Thanks! Your rating was sent and will appear after review.')
      setRating(0)
      setComment('')
    } catch (err) {
      console.error('Review submit failed:', err)
      setNotice(ar ? 'معرفناش نبعت التقييم — جرب تاني.' : 'Could not submit your rating — try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <section aria-label={ar ? 'تقييمات الزوار' : 'Visitor reviews'}>
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display display-3">{ar ? 'تقييمات الزوار' : 'Visitor reviews'}</h2>
              {count > 0 && average !== null ? (
                <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={
                          s <= Math.round(average)
                            ? 'h-4 w-4 fill-estate-gold text-estate-gold'
                            : 'h-4 w-4 text-muted-foreground/40'
                        }
                      />
                    ))}
                  </span>
                  <span>
                    {ar ? `${average} من 5 · ${count} ${count === 1 ? 'تقييم' : 'تقييمات'}` : `${average} out of 5 · ${count} ${count === 1 ? 'review' : 'reviews'}`}
                  </span>
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  {ar ? 'لسه مفيش تقييمات معتمدة — كن أول اللي يقيّم بعد الزيارة.' : 'No approved reviews yet — be the first to rate after your visit.'}
                </p>
              )}
            </div>
            {eligible.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-[44px] md:min-h-0"
                onClick={() => setFormOpen((v) => !v)}
              >
                <Star className="mr-1.5 h-3.5 w-3.5" />
                {formOpen ? (ar ? 'اقفل التقييم' : 'Close the form') : (ar ? 'قيّم زيارتك' : 'Rate your visit')}
              </Button>
            )}
          </div>

          {reviews.length > 0 ? (
            <ul className="divide-y divide-border">
              {reviews.map((r) => (
                <li key={r.id} className="py-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={
                            s <= r.rating
                              ? 'h-3.5 w-3.5 fill-estate-gold text-estate-gold'
                              : 'h-3.5 w-3.5 text-muted-foreground/40'
                          }
                        />
                      ))}
                    </span>
                    <span className="text-sm font-medium">{r.user?.name || (ar ? 'زائر' : 'Visitor')}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString(ar ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  {r.comment && <p className="mt-1 text-sm text-muted-foreground">{r.comment}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground">
              {ar ? 'مفيش تقييمات ظاهرة دلوقتي.' : 'No reviews to show right now.'}
            </p>
          )}

          {eligible.length > 0 && formOpen && (
            <div className="space-y-3 rounded-2xl border border-estate-gold/30 bg-estate-gold/5 p-4">
              <label className="block text-sm font-medium">
                {ar ? 'اختار الزيارة' : 'Select your visit'}
                <select
                  value={viewingId}
                  onChange={(e) => setViewingId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-base md:py-2 md:text-sm"
                >
                  <option value="">{ar ? 'اختار...' : 'Select...'}</option>
                  {eligible.map((v) => (
                    <option key={v.id} value={v.id}>
                      {new Date(v.scheduledAt).toLocaleDateString(ar ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setRating(s)}
                    aria-label={ar ? `قيّم ${s} من 5` : `Rate ${s} out of 5`}
                    className="min-h-[44px] min-w-[44px] p-1 md:min-h-0 md:min-w-0 md:p-1"
                  >
                    <Star
                      className={
                        s <= rating
                          ? 'h-6 w-6 fill-estate-gold text-estate-gold'
                          : 'h-6 w-6 text-muted-foreground/40 hover:text-estate-gold'
                      }
                    />
                  </button>
                ))}
              </div>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={ar ? 'احكيلنا عن الزيارة (اختياري)...' : 'Tell us about the visit (optional)...'}
                rows={3}
                maxLength={1000}
                className="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-base md:py-2 md:text-sm"
              />
              <Button
                type="button"
                size="sm"
                disabled={!viewingId || rating < 1 || sending}
                onClick={submit}
                className="gold-shimmer min-h-[44px] bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold-dark md:min-h-0"
              >
                {sending ? (ar ? 'بيتبعت...' : 'Sending...') : (ar ? 'ابعت التقييم' : 'Submit review')}
              </Button>
              {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
