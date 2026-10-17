'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Building2, MapPin } from 'lucide-react'
import { useLanguage } from '@/lib/language-context'
import { Reveal } from '@/components/design'
import { formatEGP } from '@/lib/utils'

type AreaSummary = {
  city: { name: string; nameArabic?: string | null; nameSlug: string }
  projectCount: number
  minPrice: number | null
  categories: {
    schools: number
    hospitals: number
    transport: number
    malls: number
    other: number
  }
}

function money(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return formatEGP(value)
}

export default function AreasView() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'

  const [areas, setAreas] = useState<AreaSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    let cancelled = false
    setError(null)
    fetch('/api/areas')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load'))))
      .then((d) => {
        if (!cancelled) setAreas(d.areas || [])
      })
      .catch(() => {
        if (!cancelled) setError(ar ? 'معرفناش نجيب المناطق — جرب تاني.' : 'Could not load the areas — try again.')
      })
    return () => {
      cancelled = true
    }
  }, [ar])

  useEffect(() => load(), [load])

  if (areas === null && !error) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-estate-gold border-t-transparent" />
          <p className="text-sm text-muted-foreground">
            {ar ? 'بنحمّل المناطق…' : 'Loading areas…'}
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
            setAreas(null)
            load()
          }}
          className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-full bg-estate-gold px-4 py-2 text-sm font-medium text-[#0F1A2C] sm:min-h-0"
        >
          {ar ? 'جرب تاني' : 'Try again'}
        </button>
      </div>
    )
  }

  if (areas!.length === 0) {
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

  const labels = ar
    ? { schools: 'مدارس', hospitals: 'مستشفيات', transport: 'مواصلات', malls: 'مولات', other: 'أماكن تانية' }
    : { schools: 'Schools', hospitals: 'Hospitals', transport: 'Transport', malls: 'Malls', other: 'Other places' }

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
        {areas!.map((area, index) => {
          const name = ar && area.city.nameArabic ? area.city.nameArabic : area.city.name
          const cats = area.categories ?? { schools: 0, hospitals: 0, transport: 0, malls: 0, other: 0 }
          const cells = [
            { label: labels.schools, value: cats.schools },
            { label: labels.hospitals, value: cats.hospitals },
            { label: labels.transport, value: cats.transport },
            { label: labels.malls, value: cats.malls },
          ]
          const hasServices =
            cats.schools + cats.hospitals + cats.transport + cats.malls + cats.other > 0
          return (
            <Reveal key={area.city.nameSlug} delay={Math.min(index % 2, 1) * 80}>
            <article
              className="h-full rounded-2xl border border-estate-gold/15 bg-white p-4 shadow-sm transition-colors hover:border-estate-gold/40 hover:shadow-lg hover:shadow-estate-gold/10 sm:p-5 dark:border-[#D4A843]/15 dark:bg-[#0A0A0A]"
            >
              <div>
                <h2 className="font-display break-words text-lg">{name}</h2>
                <p className="mt-1 flex min-w-0 items-center gap-1 break-words text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {ar
                    ? `${area.projectCount} مشاريع`
                    : `${area.projectCount} project${area.projectCount === 1 ? '' : 's'}`}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {ar ? 'الأسعار بتبدأ من' : 'Starting from'}{' '}
                  <span className="font-bold text-estate-gold">
                    {area.minPrice !== null
                      ? money(area.minPrice)
                      : ar
                        ? 'لسه مفيش سعر معلن'
                        : 'No price info yet'}
                  </span>
                </p>
              </div>

              {hasServices ? (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {cells.map((c) => (
                    <div
                      key={c.label}
                      className="rounded-2xl bg-muted/50 px-3 py-2.5 text-center dark:bg-[#0A0A0A]"
                    >
                      <p className="text-lg font-extrabold">{c.value.toLocaleString('en-US')}</p>
                      <p className="text-xs text-muted-foreground">{c.label}</p>
                    </div>
                  ))}
                  {cats.other > 0 ? (
                    <div className="rounded-2xl bg-muted/50 px-3 py-2.5 text-center dark:bg-[#0A0A0A]">
                      <p className="text-lg font-extrabold">{cats.other.toLocaleString('en-US')}</p>
                      <p className="text-xs text-muted-foreground">{labels.other}</p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  {ar
                    ? 'لسه مفيش معلومات عن خدمات المنطقة دي'
                    : 'No service info yet for this area'}
                </p>
              )}

              <Link
                href={`/projects?city=${area.city.nameSlug}`}
                className="mt-4 inline-flex min-h-[44px] items-center text-sm font-medium text-estate-gold hover:underline sm:min-h-0"
              >
                {ar ? 'شوف مشاريع المنطقة' : 'View projects'}
              </Link>
            </article>
            </Reveal>
          )
        })}
      </div>

      <p className="mx-auto mt-8 max-w-2xl text-center text-xs text-muted-foreground">
        {ar
          ? 'أرقام بس — من المشاريع المعروضة فعلا، من غير أي تقييمات.'
          : 'Counts only — straight from listed projects, no ratings.'}
      </p>
    </div>
  )
}
