'use client'

import { useCallback, useEffect, useState } from 'react'
import { Route, Loader2, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'

/* ─── Lead-routing config ──────────────────────────────────
   GET|POST /api/ceo/routing ↔ { mode: 'off'|'round-robin',
     weights: {brokerProfileId: n}, whitelist: string[],
     fallback: 'unassigned'|'first-active' }. POST replaces the full doc. */

interface RoutingDoc {
  mode: 'off' | 'round-robin'
  weights: Record<string, number>
  whitelist: string[]
  fallback: 'unassigned' | 'first-active'
}

interface BrokerOpt {
  id: string
  user?: { name?: string | null; email?: string | null } | null
  name?: string
  email?: string
  isActive?: boolean
}

const field = 'w-full rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-gray-300 outline-none'

export default function RoutingPanel() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [doc, setDoc] = useState<RoutingDoc | null>(null)
  const [brokers, setBrokers] = useState<BrokerOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [weightDraft, setWeightDraft] = useState<Record<string, string>>({})

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      fetch('/api/ceo/routing').then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || 'Failed')
        return r.json()
      }),
      fetch('/api/ceo/brokers').then((r) => (r.ok ? r.json() : { brokers: [] })).catch(() => ({ brokers: [] })),
    ])
      .then(([cfg, b]) => {
        const d = cfg as RoutingDoc
        setDoc({ mode: d.mode, weights: d.weights || {}, whitelist: d.whitelist || [], fallback: d.fallback })
        const drafts: Record<string, string> = {}
        for (const [k, v] of Object.entries(d.weights || {})) drafts[k] = String(v)
        setWeightDraft(drafts)
        setBrokers(b.brokers || [])
      })
      .catch((e) => {
        console.error('Failed to load routing config:', e)
        setError(ar ? 'معرفناش نجيب إعدادات التوزيع — حاول تاني.' : 'Failed to load routing settings')
      })
      .finally(() => setLoading(false))
  }, [ar])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-black py-10 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" /> {ar ? 'بيحمّل التوزيع…' : 'Loading routing…'}
      </div>
    )
  }

  if (!doc) {
    return (
      <div className="flex items-center justify-between rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
        <span>{error || (ar ? 'معرفناش نجيب إعدادات التوزيع.' : 'Failed to load routing settings.')}</span>
        <Button variant="outline" size="sm" className="border-border dark:border-[#262626] text-gray-300" onClick={load}>
          {ar ? 'حاول تاني' : 'Retry'}
        </Button>
      </div>
    )
  }

  const brokerName = (b: BrokerOpt) => b.user?.name || b.name || b.user?.email || b.email || b.id.slice(0, 8)

  const setWhite = (id: string, checked: boolean) => {
    setDoc((prev) => {
      if (!prev) return prev
      // Empty whitelist = everyone eligible. Unchecking one broker while in
      // "everyone" mode materializes the list as everyone-except-that-one.
      if (prev.whitelist.length === 0) {
        if (checked) return prev
        return { ...prev, whitelist: brokers.map((x) => x.id).filter((x) => x !== id) }
      }
      const has = prev.whitelist.includes(id)
      if (checked && !has) return { ...prev, whitelist: [...prev.whitelist, id] }
      if (!checked && has) return { ...prev, whitelist: prev.whitelist.filter((x) => x !== id) }
      return prev
    })
  }

  const save = async () => {
    setError(null)
    setMessage(null)
    // Weights: integers ≥ 0 (0 = never gets auto-assigned). Blank = default 1 → omitted.
    const weights: Record<string, number> = {}
    for (const [k, raw] of Object.entries(weightDraft)) {
      const t = raw.trim()
      if (t === '') continue
      const n = Number(t)
      if (!Number.isInteger(n) || n < 0 || n > 1000) {
        setError(ar ? 'الأوزان لازم تبقى أرقام صحيحة من ٠ لـ ١٠٠٠ (٠ = مبياخدش توزيع تلقائي).' : 'Weights must be whole numbers 0–1000 (0 = never auto-assigned).')
        return
      }
      if (n !== 1) weights[k] = n
    }
    setBusy(true)
    try {
      const res = await fetch('/api/ceo/routing', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: doc.mode, weights, whitelist: doc.whitelist, fallback: doc.fallback }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        console.error('Failed to save routing:', data)
        setError(ar ? 'معرفناش نحفظ التوزيع — حاول تاني.' : 'Failed to save routing')
        return
      }
      setMessage(ar ? 'إعدادات التوزيع اتحفظت' : 'Routing settings saved')
      load()
    } catch (err) {
      console.error('Routing network error:', err)
      setError(ar ? 'مشكلة في الشبكة — حاول تاني.' : 'Network error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-black">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border dark:border-[#262626] px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Route className="h-4 w-4 text-estate-gold" /> {ar ? 'التوزيع التلقائي لليدز' : 'Automatic lead routing'}
        </h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300" onClick={load}>
            <RefreshCw className="mr-1 h-4 w-4" />{ar ? 'حدّث' : 'Refresh'}
          </Button>
          <Button size="sm" className="gold-shimmer bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold-dark" disabled={busy} onClick={save}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}{ar ? 'احفظ التوزيع' : 'Save routing'}
          </Button>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {error && <div className="flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}
        {message && <div className="flex items-center gap-2 rounded-2xl border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400"><CheckCircle2 className="h-4 w-4 shrink-0" />{message}</div>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-gray-500">{ar ? 'وضع التوزيع' : 'Routing mode'}</label>
            <select className={field} value={doc.mode} onChange={(e) => setDoc({ ...doc, mode: e.target.value as RoutingDoc['mode'] })}>
              <option value="off">{ar ? 'مقفول (يدوي)' : 'Off (manual)'}</option>
              <option value="round-robin">{ar ? 'بالدور (round-robin)' : 'Round-robin'}</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">{ar ? 'لو مفيش بروكر متاح' : 'Fallback'}</label>
            <select className={field} value={doc.fallback} onChange={(e) => setDoc({ ...doc, fallback: e.target.value as RoutingDoc['fallback'] })}>
              <option value="unassigned">{ar ? 'يفضل مش متوزع' : 'Stay unassigned'}</option>
              <option value="first-active">{ar ? 'أول بروكر نشط' : 'First active broker'}</option>
            </select>
          </div>
          <div className="flex items-end">
            <p className="text-xs text-gray-500">
              {doc.whitelist.length === 0
                ? (ar ? 'القايمة البيضا فاضية = كل البروكرز النشطين مؤهلين.' : 'Empty whitelist = every active broker is eligible.')
                : (ar ? `${doc.whitelist.length} بروكر في القايمة البيضا.` : `${doc.whitelist.length} broker(s) whitelisted.`)}
            </p>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-gray-400">{ar ? 'البروكرز المؤهلين والأوزان (الوزن ٠ = مبياخدش)' : 'Eligible brokers & weights (0 = never)'}</p>
            {doc.whitelist.length > 0 && (
              <button onClick={() => setDoc({ ...doc, whitelist: [] })} className="text-xs text-gray-500 hover:text-foreground">
                {ar ? 'فضّي القايمة (الكل مؤهل)' : 'Clear (everyone eligible)'}
              </button>
            )}
          </div>
          {brokers.length === 0 ? (
            <p className="text-sm text-gray-500">{ar ? 'مفيش بروكرز.' : 'No brokers.'}</p>
          ) : (
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-2xl border border-border dark:border-[#262626] bg-white/[0.02] p-2">
              {brokers.map((b) => {
                const inWhite = doc.whitelist.includes(b.id)
                const w = weightDraft[b.id] ?? (doc.weights[b.id] !== undefined ? String(doc.weights[b.id]) : '1')
                return (
                  <div key={b.id} className={cn('flex items-center gap-3 rounded-xl px-2.5 py-1.5 text-sm', inWhite && 'bg-estate-gold/[0.07]')}>
                    <input
                      type="checkbox"
                      checked={doc.whitelist.length === 0 || inWhite}
                      onChange={(e) => setWhite(b.id, e.target.checked)}
                      aria-label={ar ? `أهّل ${brokerName(b)}` : `Eligible ${brokerName(b)}`}
                      className="h-4 w-4 accent-[#D4A843]"
                    />
                    <span className="min-w-0 flex-1 truncate text-gray-300">{brokerName(b)}</span>
                    {b.isActive === false && <span className="text-[11px] text-gray-600">{ar ? 'موقوف' : 'suspended'}</span>}
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      step={1}
                      dir="ltr"
                      value={w}
                      onChange={(e) => setWeightDraft({ ...weightDraft, [b.id]: e.target.value })}
                      className="w-20 rounded-lg border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-2 py-1 text-left text-xs text-gray-300 outline-none"
                      title={ar ? 'الوزن' : 'Weight'}
                    />
                  </div>
                )
              })}
            </div>
          )}
          <p className="mt-1 text-[11px] text-gray-600">
            {ar
              ? 'علّم على البروكرز اللي يدخلوا التوزيع التلقائي، والوزن الأعلى ياخد ليدز أكتر.'
              : 'Tick the brokers in automatic rotation — a higher weight takes proportionally more leads.'}
          </p>
        </div>
      </div>
    </div>
  )
}
