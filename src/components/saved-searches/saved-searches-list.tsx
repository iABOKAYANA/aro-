'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Bell, BellOff, Trash2, Search, Loader2, ArrowRight } from 'lucide-react'
import { useLanguage } from '@/lib/language-context'
import { AppAccountPanel } from '@/components/app-account-panel'
import { useAppType } from '@/lib/use-app-type'

type Item = {
  id: string
  name: string
  filters: Record<string, string | number>
  notifyNew: boolean
  createdAt: string
  matchCount: number
}

const LABELS: Record<string, string> = {
  q: 'Keyword',
  governorate: 'Governorate',
  city: 'City',
  district: 'District',
  propertyType: 'Type',
  listingType: 'Listing',
  minPrice: 'Min price',
  maxPrice: 'Max price',
  bedrooms: 'Bedrooms',
  bathrooms: 'Bathrooms',
  minArea: 'Min area',
  maxArea: 'Max area',
}

const LABELS_AR: Record<string, string> = {
  q: 'كلمة',
  governorate: 'المحافظة',
  city: 'المدينة',
  district: 'المنطقة',
  propertyType: 'النوع',
  listingType: 'الإعلان',
  minPrice: 'أقل سعر',
  maxPrice: 'أعلى سعر',
  bedrooms: 'الأوض',
  bathrooms: 'الحمامات',
  minArea: 'أقل مساحة',
  maxArea: 'أكبر مساحة',
}

function toQuery(filters: Record<string, string | number>): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) if (v !== '' && v != null) params.set(k, String(v))
  const qs = params.toString()
  return qs ? `/projects?${qs}` : '/projects'
}

function describe(filters: Record<string, string | number>, ar: boolean): { key: string; text: string }[] {
  const labels = ar ? LABELS_AR : LABELS
  return Object.entries(filters).map(([key, value]) => {
    let text = String(value)
    if (key === 'minPrice' || key === 'maxPrice') {
      const n = Number(value)
      text = n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M ${ar ? 'جنيه' : 'EGP'}` : `${n.toLocaleString()} ${ar ? 'جنيه' : 'EGP'}`
    }
    if (key === 'minArea' || key === 'maxArea') text = ar ? `${value} م²` : `${value} m²`
    if (key === 'propertyType' || key === 'listingType') text = String(value).replace(/_/g, ' ')
    return { key, text: `${labels[key] || key}: ${text}` }
  })
}

export default function SavedSearchesList() {
  const { lang, dir } = useLanguage()
  const ar = lang === 'ar'
  const { data: session, status } = useSession()
  // Public host has zero login (middleware also 307s this page to `/`
  // there); this panel is defense-in-depth + the console/all logged-out UI.
  const appType = useAppType()
  const isPublic = appType === 'public'
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/saved-searches')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Could not load'))))
      .then((d) => setItems(d.items || []))
      .catch((e) => {
        console.error('Saved searches load failed:', e)
        setError(ar ? 'معرفناش نجيب عمليات البحث المحفوظة — جرب تاني.' : 'Could not load your saved searches — try again.')
        setItems([])
      })
  }, [ar])

  useEffect(() => {
    if (session) load()
  }, [session, load])

  async function remove(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/saved-searches?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      if (res.ok) setItems((prev) => (prev || []).filter((i) => i.id !== id))
      else {
        console.error('Saved search delete failed')
        setError(ar ? 'معرفناش نمسح البحث ده' : 'Could not delete this search')
      }
    } finally {
      setBusyId(null)
    }
  }

  async function toggleNotify(item: Item) {
    setBusyId(item.id)
    try {
      const res = await fetch('/api/saved-searches', {
        method: 'PATCH',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, notifyNew: !item.notifyNew }),
      })
      if (res.ok) {
        setItems((prev) =>
          (prev || []).map((i) => (i.id === item.id ? { ...i, notifyNew: !i.notifyNew } : i))
        )
      } else {
        console.error('Saved search alert update failed')
        setError(ar ? 'معرفناش نحدث التنبيهات' : 'Could not update alerts')
      }
    } finally {
      setBusyId(null)
    }
  }

  // Logged-out visitors skip the fetch entirely (`load` only runs with a
  // session), so only wait on `items` when signed in — otherwise logged-out
  // visitors would spin on the loader forever and never see the panel below.
  if (status === 'loading' || (session && items === null)) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground" dir={dir}>
        <Loader2 className="h-4 w-4 animate-spin" /> {ar ? 'بنجيب عمليات البحث المحفوظة...' : 'Loading your saved searches…'}
      </div>
    )
  }

  if (!session) {
    // Public buyer site: no dead login button — app-forward panel instead.
    if (isPublic) {
      return (
        <div dir={dir}>
          <AppAccountPanel />
        </div>
      )
    }
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-10 text-center" dir={dir}>
        <p className="text-sm text-muted-foreground">{ar ? 'سجل الدخول عشان تشوف عمليات البحث المحفوظة.' : 'Sign in to see your saved searches.'}</p>
        <Link
          href="/auth/login?callbackUrl=/saved-searches"
          className="mt-4 inline-block rounded-full bg-estate-gold px-5 py-2.5 text-sm font-semibold text-[#0F1A2C] hover:brightness-110"
        >
          {ar ? 'سجل الدخول' : 'Sign in'}
        </Link>
      </div>
    )
  }

  if (items === null) {
    // Signed-in but the fetch hasn't landed yet (logged-out returned above).
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground" dir={dir}>
        <Loader2 className="h-4 w-4 animate-spin" /> {ar ? 'بنجيب عمليات البحث المحفوظة...' : 'Loading your saved searches…'}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-12 text-center" dir={dir}>
        <Search className="mx-auto h-8 w-8 text-estate-gold" />
        <p className="mt-4 text-base font-medium text-white">{ar ? 'لسه محفظتش أي بحث' : 'No saved searches yet'}</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          {ar ? (
            <>اظبط الفلاتر في صفحة المشاريع وبعدين دوس <strong>احفظ البحث ده</strong>. وهنبعتلك أول ما ينزل مشروع مناسب.</>
          ) : (
            <>Set your filters on the projects page, then hit <strong>Save this search</strong>. We&apos;ll notify you the moment a matching project goes live.</>
          )}
        </p>
        <Link
          href="/projects"
          className="mt-5 inline-block rounded-full bg-estate-gold px-5 py-2.5 text-sm font-semibold text-[#0F1A2C] hover:brightness-110"
        >
          {ar ? 'اتفرج على المشاريع' : 'Browse projects'}
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4" dir={dir}>
      {error && (
        <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition-colors hover:border-estate-gold/30"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-white">{item.name}</h2>
                <span className="rounded-full bg-estate-gold/10 px-2 py-0.5 text-[11px] font-semibold text-estate-gold">
                  {item.matchCount} {ar ? (item.matchCount === 1 ? 'نتيجة' : 'نتائج') : (item.matchCount === 1 ? 'match' : 'matches')}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {describe(item.filters, ar).map((chip) => (
                  <span
                    key={chip.key}
                    className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-gray-400"
                  >
                    {chip.text}
                  </span>
                ))}
              </div>

              <p className="mt-2 text-[11px] text-muted-foreground">
                {ar ? 'اتحفظ ' : 'Saved '}{new Date(item.createdAt).toLocaleDateString(ar ? 'ar-EG' : 'en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => toggleNotify(item)}
                disabled={busyId === item.id}
                className={
                  item.notifyNew
                    ? 'inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-2 text-xs font-medium text-emerald-500 hover:bg-emerald-500/25'
                    : 'inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-white/10'
                }
                title={item.notifyNew ? (ar ? 'التنبيهات شغالة' : 'Alerts on') : (ar ? 'التنبيهات مطفية' : 'Alerts off')}
              >
                {item.notifyNew ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                {item.notifyNew ? (ar ? 'التنبيهات شغالة' : 'Alerts on') : (ar ? 'التنبيهات مطفية' : 'Alerts off')}
              </button>

              <Link
                href={toQuery(item.filters)}
                className="inline-flex items-center gap-1.5 rounded-full bg-estate-gold px-3 py-2 text-xs font-semibold text-[#0F1A2C] hover:brightness-110"
              >
                {ar ? 'شوف النتائج' : 'View results'} <ArrowRight className="h-3.5 w-3.5" />
              </Link>

              <button
                type="button"
                onClick={() => remove(item.id)}
                disabled={busyId === item.id}
                aria-label={`Delete ${item.name}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/15"
              >
                {busyId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                {ar ? 'امسح' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
