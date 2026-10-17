'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Bell, BellOff, Check, Loader2 } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { useLanguage } from '@/lib/language-context'
import { AppAccountPanel } from '@/components/app-account-panel'
import { useAppType } from '@/lib/use-app-type'

const STRING_KEYS = ['q', 'governorate', 'city', 'district', 'propertyType', 'listingType'] as const
const NUMBER_KEYS = ['minPrice', 'maxPrice', 'bedrooms', 'bathrooms', 'minArea', 'maxArea'] as const

function buildFilters(searchParams: Record<string, string | undefined>) {
  const filters: Record<string, string | number> = {}
  for (const key of STRING_KEYS) {
    const v = searchParams[key]
    if (v && v.trim()) filters[key] = v.trim()
  }
  for (const key of NUMBER_KEYS) {
    const v = Number(searchParams[key])
    if (Number.isFinite(v) && v > 0) filters[key] = v
  }
  return filters
}

/**
 * "Save this search" — persisted against the current URL filters and alerted
 * via /api/saved-searches whenever a new project matches.
 */
export default function SaveSearchButton({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>
}) {
  const { data: session, status } = useSession()
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  // Public host: zero login — no dead link to the removed login page.
  const isPublic = useAppType() === 'public'
  const filters = useMemo(() => buildFilters(searchParams), [searchParams])
  const hasFilters = Object.keys(filters).length > 0
  const projectsHref = useMemo(() => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(filters)) qs.set(k, String(v))
    const s = qs.toString()
    return s ? `/projects?${s}` : '/projects'
  }, [filters])

  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  // Is this exact filter set already saved?
  useEffect(() => {
    setJustSaved(false)
    if (!session) return
    let cancelled = false
    fetch('/api/saved-searches')
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => {
        if (cancelled || !Array.isArray(d.items)) return
        const already = d.items.some(
          (item: { filters: Record<string, string | number> }) =>
            JSON.stringify(item.filters) === JSON.stringify(filters)
        )
        setSaved(already)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [session, filters])

  async function save() {
    if (!session) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/saved-searches', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters, notifyNew: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not save this search')
      setSaved(true)
      setJustSaved(true)
      setMessage(ar ? 'اتحفظ — هنبعتلك أول ما تنزل حاجة مناسبة.' : 'Saved — we\'ll alert you about new matches.')
    } catch (e) {
      console.error('Save search failed:', e)
      setMessage(ar ? 'معرفناش نحفظ البحث ده' : 'Could not save this search')
    } finally {
      setBusy(false)
    }
  }

  if (!hasFilters) return null

  if (status === 'loading') {
    return (
      <div className="h-9 w-32 animate-pulse rounded-full bg-muted" aria-hidden />
    )
  }

  if (!session) {
    // Public buyer site: app-forward note instead of a dead login link.
    // Console/`all` keep the sign-in flow (login still exists there).
    if (isPublic) {
      return (
        <div className="flex flex-col items-end gap-1" title={ar ? 'الحسابات والتنبيهات في تطبيق غاية' : 'Accounts & alerts live in the Ghaya app'}>
          <span className="inline-flex cursor-default items-center gap-2 rounded-full border border-estate-gold/40 bg-estate-gold/10 px-3.5 py-2 text-xs font-semibold text-estate-gold">
            <Bell className="h-3.5 w-3.5" />
            {ar ? 'احفظ البحث ده' : 'Save this search'}
          </span>
          <AppAccountPanel compact />
        </div>
      )
    }
    return (
      <Link
        href={`/auth/login?callbackUrl=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/projects')}`}
        className="inline-flex items-center gap-2 rounded-full border border-estate-gold/40 bg-estate-gold/10 px-3.5 py-2 text-xs font-semibold text-estate-gold transition-colors hover:bg-estate-gold hover:text-[#0F1A2C]"
        title={ar ? 'سجل الدخول عشان تحفظ البحث وتجيلك تنبيهات' : 'Sign in to save this search and get alerts'}
      >
        <Bell className="h-3.5 w-3.5" />
        {ar ? 'احفظ البحث ده' : 'Save this search'}
      </Link>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={save}
        disabled={busy}
        className={
          saved
            ? 'inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3.5 py-2 text-xs font-semibold text-emerald-500 transition-colors hover:bg-emerald-500/25'
            : 'inline-flex items-center gap-2 rounded-full border border-estate-gold/40 bg-estate-gold/10 px-3.5 py-2 text-xs font-semibold text-estate-gold transition-colors hover:bg-estate-gold hover:text-[#0F1A2C]'
        }
        aria-live="polite"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : saved ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Bell className="h-3.5 w-3.5" />
        )}
        {saved ? (ar ? 'البحث اتحفظ' : 'Search saved') : (ar ? 'احفظ البحث ده' : 'Save this search')}
      </button>

      {saved && (
        <Link
          href="/saved-searches"
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-estate-gold"
        >
          <BellOff className="h-3 w-3" />
          {ar ? 'تحكم في التنبيهات' : 'Manage alerts'}
        </Link>
      )}

      {message && <p className="text-[11px] text-muted-foreground">{message}</p>}

      {justSaved && (
        <Link
          href={projectsHref}
          className="text-[11px] font-medium text-estate-gold hover:underline"
        >
          {ar ? 'شوف المشاريع المشابهة دلوقتي' : 'See similar projects now'}
        </Link>
      )}
    </div>
  )
}
