'use client'

import Image from 'next/image'
import Link from 'next/link'
import { MapPin, Bed, Bath, Maximize, Building2, ArrowRight, MessageCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BookingButton } from '@/components/viewings/booking-modal'
import { UnitGallery } from '@/components/units/unit-gallery'
import { FavoriteButton } from '@/components/units/favorite-button'
import { UnitShareButton } from '@/components/units/unit-share-button'
import { UnitCardPdfLink } from '@/components/units/unit-card-pdf-link'
import { WatchButton } from '@/components/projects/project-transparency'
import { useLanguage } from '@/lib/language-context'
import { useFeatureFlag } from '@/components/flags/flags-provider'
import { Reveal } from '@/components/design'
import { formatEGP, formatSQM } from '@/lib/utils'

export type UnitDetail = {
  id: string
  name: string
  listingType: string
  unitType: string
  status: string | null
  isSample?: boolean | null
  slug?: string | null
  finishingType: string | null
  bedrooms: number | null
  bathrooms: number | null
  area: number
  floor: number | null
  deliveryTerms: string | null
  hasBalcony: boolean
  hasParking: boolean
  isCorner: boolean
  view: string | null
  unitNumber: string | null
  floorPlan: string | null
  price: number
  pricePerSqm: number | null
  downPayment: number | null
  monthlyInstallment: number | null
  installmentYears: number | null
  project: {
    id: string
    name: string
    slug: string
    city: { name: string } | null
  }
}

const LISTING_TYPE_AR: Record<string, string> = {
  SALE: 'بيع',
  RENT: 'إيجار',
  RESALE: 'إعادة بيع',
  INSTALLMENT: 'تقسيط',
}

const UNIT_TYPE_AR: Record<string, string> = {
  APARTMENT: 'شقة',
  VILLA: 'فيلا',
  TOWNHOUSE: 'تاون هاوس',
  PENTHOUSE: 'بنتهاوس',
  STUDIO: 'استوديو',
  DUPLEX: 'دوبلكس',
  TWIN_HOUSE: 'توين هاوس',
  CHALET: 'شاليه',
  LAND: 'أرض',
  COMMERCIAL: 'تجاري',
  ADMINISTRATIVE: 'إداري',
  MEDICAL: 'طبي',
}

const STATUS_AR: Record<string, string> = {
  AVAILABLE: 'متاح',
  RESERVED: 'محجوز',
  SOLD: 'متباع',
  UNDER_CONSTRUCTION: 'تحت الإنشاء',
  COMING_SOON: 'قريباً',
  DELIVERED: 'تم التسليم',
  SOLD_OUT: 'نفدت',
}

const FINISHING_AR: Record<string, string> = {
  'fully finished': 'تشطيب كامل',
  finished: 'متشطب',
  'semi-finished': 'نص تشطيب',
  'semi finished': 'نص تشطيب',
  unfinished: 'طوب أحمر',
  'core and shell': 'طوب أحمر',
  'core & shell': 'طوب أحمر',
}

/** Inline SVG trend of recorded price changes — pure markup, zero deps. */
function PriceTrend({ history, ar }: { history: Array<{ price: number; recordedAt: Date }>; ar: boolean }) {
  if (history.length < 2) return null
  const prices = history.map((h) => h.price)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  if (max === min) return null
  const W = 260
  const H = 64
  const pts = history.map((h, i) => {
    const x = (i / (history.length - 1)) * (W - 4) + 2
    const y = H - 6 - ((h.price - min) / (max - min)) * (H - 14)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const first = history[0].price
  const last = history[history.length - 1].price
  const down = last < first
  return (
    <div className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full" aria-hidden>
        <polyline
          points={pts.join(' ')}
          fill="none"
          stroke={down ? '#16a34a' : '#d97706'}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <p className={`text-xs ${down ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
        {down ? '▼' : '▲'}{' '}
        {ar
          ? (down ? 'السعر نزل' : 'السعر زاد') + ` بمقدار ${Math.abs(Math.round(((last - first) / first) * 100))}% عبر ${history.length} تسجيلات`
          : (down ? 'Price dropped' : 'Price increased') + ` by ${Math.abs(Math.round(((last - first) / first) * 100))}% across ${history.length} records`}
      </p>
    </div>
  )
}

export default function UnitView({ unit, gallery, priceHistory = [] }: { unit: UnitDetail; gallery: string[]; priceHistory?: Array<{ price: number; recordedAt: Date }> }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const shareOn = useFeatureFlag('share_whatsapp')

  // Same WhatsApp-share pattern as the project detail sidebar.
  const shareText = ar ? `بص على الوحدة دي على غاية: ${unit.name}` : `Check out this unit on GHAYA: ${unit.name}`
  const waHref = typeof window !== 'undefined'
    ? `https://wa.me/?text=${encodeURIComponent(`${shareText}\n${window.location.href}`)}`
    : ''

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      <div className="container px-4 py-8">
        <div className="mb-6 flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Link href="/projects" className="-my-1.5 shrink-0 py-1.5 hover:text-estate-gold">{ar ? 'المشاريع' : 'Projects'}</Link>
          <span className="shrink-0">/</span>
          <Link href={`/projects/${unit.project.slug}`} className="-my-1.5 min-w-0 max-w-full shrink-0 truncate py-1.5 hover:text-estate-gold">{unit.project.name}</Link>
          <span className="shrink-0">/</span>
          <span className="min-w-0 max-w-full truncate text-foreground">{unit.name}</span>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Reveal>
            <Card className="border-estate-gold/20 dark:border-[#D4A843]/20 dark:bg-[#0A0A0A]">
              <CardContent className="p-6">
                <div className="mb-4 flex flex-wrap gap-2">
                  <Badge variant="gold">{ar ? (LISTING_TYPE_AR[unit.listingType] || unit.listingType.replace(/_/g, ' ')) : unit.listingType.replace(/_/g, ' ')}</Badge>
                  <Badge variant="secondary">{ar ? (UNIT_TYPE_AR[unit.unitType] || unit.unitType.replace(/_/g, ' ')) : unit.unitType.replace(/_/g, ' ')}</Badge>
                  {unit.status && <Badge>{ar ? (STATUS_AR[unit.status] || unit.status) : unit.status}</Badge>}
                  {unit.isSample && <Badge variant="gold">{ar ? 'استرشادي — للفرجة بس' : 'Showcase — not bookable'}</Badge>}
                  {unit.finishingType && <Badge variant="info">{ar ? (FINISHING_AR[unit.finishingType.toLowerCase()] || unit.finishingType) : unit.finishingType}</Badge>}
                </div>

                <h1 className="font-display display-3 mb-2 break-words">{unit.name}</h1>
                <p className="mb-1 break-words text-lg text-muted-foreground">{unit.project.name}</p>
                {unit.project.city && (
                  <div className="mb-6 flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    {unit.project.city.name}
                  </div>
                )}

                <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {unit.bedrooms != null && (
                    <div className="rounded-2xl border border-estate-gold/15 bg-gray-50 p-3 text-center dark:border-[#D4A843]/15 dark:bg-[#0A0A0A]">
                      <Bed className="mx-auto mb-1 h-5 w-5 text-estate-gold" />
                      <p className="text-sm font-medium">{unit.bedrooms} {ar ? (unit.bedrooms === 1 ? 'أوضة' : 'أوض') : (unit.bedrooms === 1 ? 'Bed' : 'Beds')}</p>
                    </div>
                  )}
                  {unit.bathrooms != null && (
                    <div className="rounded-2xl border border-estate-gold/15 bg-gray-50 p-3 text-center dark:border-[#D4A843]/15 dark:bg-[#0A0A0A]">
                      <Bath className="mx-auto mb-1 h-5 w-5 text-estate-gold" />
                      <p className="text-sm font-medium">{unit.bathrooms} {ar ? (unit.bathrooms === 1 ? 'حمام' : 'حمامات') : (unit.bathrooms === 1 ? 'Bath' : 'Baths')}</p>
                    </div>
                  )}
                  {unit.area > 0 && (
                    <div className="rounded-2xl border border-estate-gold/15 bg-gray-50 p-3 text-center dark:border-[#D4A843]/15 dark:bg-[#0A0A0A]">
                      <Maximize className="mx-auto mb-1 h-5 w-5 text-estate-gold" />
                      <p className="text-sm font-medium">{formatSQM(unit.area)}</p>
                    </div>
                  )}
                  {unit.floor != null && (
                    <div className="rounded-2xl border border-estate-gold/15 bg-gray-50 p-3 text-center dark:border-[#D4A843]/15 dark:bg-[#0A0A0A]">
                      <Building2 className="mx-auto mb-1 h-5 w-5 text-estate-gold" />
                      <p className="text-sm font-medium">{ar ? `الدور ${unit.floor}` : `Floor ${unit.floor}`}</p>
                    </div>
                  )}
                </div>

                <UnitGallery images={gallery} name={unit.name} />

                {unit.deliveryTerms && (
                  <div className="mt-6">
                <h3 className="font-display text-lg">{ar ? 'شروط الاستلام' : 'Delivery Terms'}</h3>
                    <p className="text-muted-foreground">{unit.deliveryTerms}</p>
                  </div>
                )}

                <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 [&>*]:min-w-0 [&>*]:break-words">
                  {unit.hasBalcony && <Badge variant="secondary">{ar ? 'بلكونة' : 'Balcony'}</Badge>}
                  {unit.hasParking && <Badge variant="secondary">{ar ? 'باركينج' : 'Parking'}</Badge>}
                  {unit.isCorner && <Badge variant="secondary">{ar ? 'وحدة ناصية' : 'Corner Unit'}</Badge>}
                  {unit.view && <Badge variant="secondary">{ar ? `الفيو: ${unit.view}` : `View: ${unit.view}`}</Badge>}
                  {unit.unitNumber && <Badge variant="secondary">{ar ? `وحدة رقم ${unit.unitNumber}` : `Unit #${unit.unitNumber}`}</Badge>}
                </div>

                {unit.floorPlan && (
                  <div className="mt-6">
                    <h3 className="font-display mb-3 text-lg">{ar ? 'المخطط' : 'Floor Plan'}</h3>
                    <div className="overflow-hidden rounded-2xl border bg-white dark:border-[#262626] dark:bg-[#0A0A0A]">
                      <Image
                        src={unit.floorPlan}
                        alt={ar ? `المخطط — ${unit.name}` : `Floor plan — ${unit.name}`}
                        width={1200}
                        height={800}
                        className="w-full object-contain"
                        loading="lazy"
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            </Reveal>
          </div>

          <div>
            <Reveal delay={120}>
            <Card className="lg:sticky lg:top-24 border-estate-gold/20 dark:border-[#D4A843]/20 dark:bg-[#0A0A0A]">
              <CardContent className="p-6">
                <p className="section-kicker mb-1">{ar ? 'السعر' : 'Price'}</p>
                <p className="font-display mb-4 break-words text-3xl tabular-nums text-estate-gold">{formatEGP(unit.price)}</p>
                {unit.pricePerSqm && (
                  <p className="mb-4 text-sm text-muted-foreground">{formatEGP(unit.pricePerSqm)}{ar ? '/للمتر' : '/sqm'}</p>
                )}

                {/* Recorded price history trend (F-watch companion) */}
                <PriceTrend history={priceHistory} ar={ar} />

                {unit.downPayment != null && (
                  <div className="mb-3 flex justify-between gap-3 text-sm">
                    <span className="min-w-0 text-muted-foreground">{ar ? 'المقدم' : 'Down Payment'}</span>
                    <span className="shrink-0 text-end font-medium">{formatEGP(unit.downPayment)}</span>
                  </div>
                )}
                {unit.monthlyInstallment != null && (
                  <div className="mb-3 flex justify-between gap-3 text-sm">
                    <span className="min-w-0 text-muted-foreground">{ar ? 'القسط الشهري' : 'Monthly'}</span>
                    <span className="shrink-0 text-end font-medium">{formatEGP(unit.monthlyInstallment)}</span>
                  </div>
                )}
                {unit.installmentYears != null && (
                  <div className="mb-4 flex justify-between gap-3 text-sm">
                    <span className="min-w-0 text-muted-foreground">{ar ? 'المدة' : 'Duration'}</span>
                    <span className="shrink-0 text-end font-medium">{ar ? `${unit.installmentYears} سنين` : `${unit.installmentYears} years`}</span>
                  </div>
                )}

                <FavoriteButton unitId={unit.id} />

                {/* F7: price & availability watch */}
                <WatchButton targetType="UNIT" targetId={unit.id} className="mb-3" />

                <UnitShareButton name={unit.name} />

                <UnitCardPdfLink slug={unit.slug || unit.id} />

                <Button asChild className="mb-3 min-h-[44px] w-full bg-estate-gold hover:bg-estate-gold-dark md:min-h-0">
                  <Link href={`/projects/${unit.project.slug}`}>
                    {ar ? 'شوف المشروع' : 'View Project'} <ArrowRight className="ms-2 h-4 w-4" />
                  </Link>
                </Button>
                {/* Showcase samples are illustrative — inquiry CTA only, never booking. */}
                {!unit.isSample && (
                  <BookingButton
                    projectId={unit.project.id}
                    unitId={unit.id}
                    propertyName={unit.name}
                    className="mb-3 w-full"
                    size="lg"
                  />
                )}
                <Button asChild variant="outline" className="min-h-[44px] w-full hover:border-estate-gold/50 md:min-h-0">
                  <Link href="/contact">
                    {ar ? 'استفسر دلوقتي' : 'Inquire Now'}
                  </Link>
                </Button>
              </CardContent>
            </Card>
            </Reveal>
          </div>
        </div>
      </div>

      {/* Sticky mobile booking bar — same BookingButton modal + WhatsApp entry,
          impossible to miss on small screens. Desktop keeps the sticky side card. */}
      <div className="h-24 lg:hidden" aria-hidden="true" />
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-estate-gold/20 bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-estate-gold">{formatEGP(unit.price)}</p>
            <p className="truncate text-xs text-muted-foreground">
              {ar ? 'احجز معاينة مجانية للوحدة دي' : 'Book a free viewing of this unit'}
            </p>
          </div>
          {shareOn && (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={ar ? 'شير على واتساب' : 'Share on WhatsApp'}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-[#0b3d20] transition-colors hover:brightness-110"
            >
              <MessageCircle className="h-5 w-5" />
            </a>
          )}
          {!unit.isSample && (
            <BookingButton
              projectId={unit.project.id}
              unitId={unit.id}
              propertyName={unit.name}
              label={ar ? 'احجز معاينة' : 'Book a viewing'}
              className="mb-0 min-w-0 flex-1"
              size="lg"
            />
          )}
        </div>
      </div>
    </div>
  )
}
