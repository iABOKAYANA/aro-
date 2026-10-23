'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useFeatureFlag } from '@/components/flags/flags-provider'

/**
 * Natural-language search box on /projects: "عايز شقة 3 غرف في التجمع تحت 8
 * مليون" → POST /api/ai/parse-query → filters mapped to the projects URL
 * params we actually support (q / city / governorate / district). Any unmatched
 * tokens ride along in `q` so the catalog text-search still applies them.
 */

type Filters = {
  q?: string
  governorate?: string
  city?: string
  district?: string
  propertyType?: string
  minPrice?: number
  maxPrice?: number
  bedrooms?: number
}

export function NlSearchBox() {
  const enabled = useFeatureFlag('nl_search')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  if (!enabled) return null

  async function go() {
    if (!q.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/parse-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q.trim() }),
      })
      const d = await res.json().catch(() => null)
      // Degrade to a keyword search instead of dead-ending: whether the
      // endpoint hiccuped (edge/rate-limit) or the request had nothing we
      // could map confidently, the visitor gets RESULTS, not an apology.
      if (!res.ok || !d?.filters || (d.confidence === 0 && (d.summary?.length ?? 0) === 0)) {
        router.push(`/projects?q=${encodeURIComponent(q.trim())}`)
        return
      }
      const f = d.filters as Filters
      const params = new URLSearchParams()
      if (f.governorate) params.set('governorate', f.governorate)
      if (f.city) params.set('city', f.city)
      if (f.district) params.set('district', f.district)
      if (f.minPrice) params.set('minPrice', String(f.minPrice))
      if (f.maxPrice) params.set('maxPrice', String(f.maxPrice))
      if (f.bedrooms) params.set('bedrooms', String(f.bedrooms))
      if (f.propertyType) params.set('propertyType', f.propertyType)
      if (f.q) params.set('q', f.q)
      router.push(`/projects${params.toString() ? `?${params.toString()}` : ''}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Sparkles className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-estate-gold" />
          <Input
            dir="rtl"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && go()}
            placeholder="اكتب طلبك بالعربي: شقة 3 غرف في التجمع تحت 8 مليون…"
            className="ps-9"
          />
        </div>
        <Button onClick={go} disabled={busy} className="shrink-0 bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold-dark">
          {busy ? '…' : 'دوّر'}
        </Button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
