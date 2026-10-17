'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { BadgePercent, MapPin } from 'lucide-react'
import { useLanguage } from '@/lib/language-context'
import { Reveal } from '@/components/design'
import { formatEGP } from '@/lib/utils'

type OfferPlan = {
  id: string
  name: string
  nameArabic?: string | null
  downPaymentPct: number
  installmentYears: number
  cashDiscountPct: number
  priceBefore: number | null
  priceAfter: number | null
  savings: number | null
}

type Offer = {
  project: {
    id: string
    slug: string
    name: string
    nameArabic?: string | null
    coverImage?: string | null
    city?: { name: string; nameArabic?: string | null } | null
    district?: { name: string; nameArabic?: string | null } | null
    governorate?: { name: string; nameArabic?: string | null } | null
    developer?: { companyName: string } | null
  }
  plans: OfferPlan[]
  // Highest cashDiscountPct across plans (null when no plan discounts).
  // Older cached responses may omit it — the card guards accordingly.
  maxDiscount?: number | null
}

function money(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return formatEGP(value)
}

export default function OffersView() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'

  const [offers, setOffers] = useState<Offer[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    let cancelled = false
    setError(null)
    fetch('/api/offers?limit=24')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load'))))
      .then((d) => {
        if (!cancelled) setOffers(d.offers || [])
      })
      .catch(() => {
        if (!cancelled) setError(ar ? 'معرفناش نجيب العروض — جرب تاني.' : 'Could not load the offers — try again.')
      })
    return () => {
      cancelled = true
    }
  }, [ar])

  useEffect(() => load(), [load])

  if (offers === null && !error) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-estate-gold border-t-transparent" />
          <p className="text-sm text-muted-foreground">
            {ar ? 'بنجمّع العروض…' : 'Collecting the offers…'}
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900 dark:bg-red-950">
        <p className="text-sm text-red-600 dark:text-red-300">{error}</p>
        <button
          onClick={() => {
            setOffers(null)
            load()
          }}
          className="mt-4 min-h-[44px] inline-flex items-center rounded-full bg-estate-gold px-4 py-2 text-sm font-medium text-[#0F1A2C] md:min-h-0"
        >
          {ar ? 'جرب تاني' : 'Try again'}
        </button>
      </div>
    )
  }

  if (offers!.length === 0) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-dashed border-gray-300 p-6 text-center md:p-10 dark:border-[#262626]">
        <BadgePercent className="mx-auto h-10 w-10 text-estate-gold" />
        <h2 className="mt-4 text-xl font-bold">
          {ar ? 'مفيش عروض كاش دلوقتي' : 'No cash offers right now'}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {ar
            ? 'المطورين لسه منزلوش أي خصومات كاش — عدّي علينا كمان شوية، أو اتفرج على كل المشاريع لحد ما ينزلوا.'
            : 'Developers have not dropped any cash discounts yet — check back soon, or browse every project in the meantime.'}
        </p>
        <Link
          href="/projects"
          className="mt-6 inline-flex min-h-[44px] items-center rounded-full bg-estate-gold px-5 py-2.5 text-sm font-medium text-[#0F1A2C] md:min-h-0"
        >
          {ar ? 'اتفرج على المشاريع' : 'Browse projects'}
        </Link>
      </div>
    )
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {offers!.map((offer, index) => {
        const name = ar && offer.project.nameArabic ? offer.project.nameArabic : offer.project.name
        const place = [
          ar ? offer.project.district?.nameArabic || offer.project.district?.name : offer.project.district?.name,
          ar ? offer.project.city?.nameArabic || offer.project.city?.name : offer.project.city?.name,
        ]
          .filter(Boolean)
          .join(ar ? '، ' : ', ')
        return (
          <Reveal key={offer.project.id} delay={Math.min(index % 2, 1) * 80}>
          <article
            className="h-full overflow-hidden rounded-2xl border border-estate-gold/15 bg-white shadow-sm transition-colors hover:border-estate-gold/40 hover:shadow-lg hover:shadow-estate-gold/10 dark:border-[#D4A843]/15 dark:bg-[#0A0A0A]"
          >
            {offer.project.coverImage ? (
              <Image src={offer.project.coverImage} alt={name} width={800} height={350} className="h-44 w-full object-cover" />
            ) : null}
            <div className="space-y-4 p-5">
              <div>
                <Link href={`/projects/${offer.project.slug}`} className="font-display break-words text-lg hover:text-estate-gold">
                  {name}
                </Link>
                <p className="mt-1 flex min-w-0 items-center gap-1 break-words text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {[place, offer.project.developer?.companyName].filter(Boolean).join(' · ')}
                </p>
                {typeof offer.maxDiscount === 'number' && offer.maxDiscount > 0 && (
                  <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-estate-gold/10 px-2.5 py-0.5 text-xs font-semibold text-estate-gold">
                    <BadgePercent className="h-3 w-3" />
                    {ar ? `خصم لحد ${Math.round(offer.maxDiscount)}%` : `Up to ${Math.round(offer.maxDiscount)}% discount`}
                  </p>
                )}
              </div>
              {offer.plans.map((plan) => (
                <div key={plan.id} className="rounded-2xl border border-dashed p-4 dark:border-[#262626]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 break-words font-medium">{ar && plan.nameArabic ? plan.nameArabic : plan.name}</p>
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-950 dark:text-green-300">
                      <BadgePercent className="h-3 w-3" />
                      {ar ? `خصم ${Math.round(plan.cashDiscountPct)}%` : `Discount ${Math.round(plan.cashDiscountPct)}%`}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {ar
                      ? `المقدم ${plan.downPaymentPct}% · ${plan.installmentYears} سنين`
                      : `Down ${plan.downPaymentPct}% · ${plan.installmentYears} years`}
                  </p>
                  {/* Mobile stacks the three figures (base = 1 col); sm+ keeps the 3-col row. */}
                  <div className="mt-3 grid grid-cols-1 gap-2 text-center min-[480px]:grid-cols-3">
                    <div>
                      <p className="text-xs text-muted-foreground">{ar ? 'قبل الخصم' : 'Before'}</p>
                      <p className="break-words font-semibold text-muted-foreground line-through">{money(plan.priceBefore)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{ar ? 'بعد الخصم' : 'After discount'}</p>
                      <p className="break-words font-bold text-estate-gold">{money(plan.priceAfter)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{ar ? 'هتوفر' : 'You save'}</p>
                      <p className="break-words font-bold text-green-600">{money(plan.savings)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </article>
          </Reveal>
        )
      })}
    </div>
  )
}
