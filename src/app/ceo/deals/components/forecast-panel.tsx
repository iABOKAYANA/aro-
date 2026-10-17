'use client'

import { useCallback, useEffect, useState } from 'react'
import { LineChart, Loader2, RefreshCw, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatEGP } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import { statusLabel } from '@/components/ceo/ceo-charts'

/* ─── Revenue forecast ─────────────────────────────────────
   GET /api/ceo/forecast → { stages: [{ stage, count, value, probability,
     weighted }], totalOpen, totalWeighted, generatedAt }
   (+ additive estateai extras: totalEstateaiWeighted, stagesEstateai). */

interface ForecastStage {
  stage: string
  count: number
  value: number
  probability: number
  weighted: number
}

interface ForecastResp {
  stages: ForecastStage[]
  totalOpen: number
  totalWeighted: number
  totalEstateaiWeighted?: number
  generatedAt: string
}

export default function ForecastPanel() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [data, setData] = useState<ForecastResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch('/api/ceo/forecast')
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || 'Failed')
        return r.json()
      })
      .then(setData)
      .catch((e) => {
        console.error('Failed to load forecast:', e)
        setError(ar ? 'معرفناش نجيب التوقعات — حاول تاني.' : 'Failed to load forecast')
      })
      .finally(() => setLoading(false))
  }, [ar])

  useEffect(() => {
    load()
  }, [load])

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-kicker flex items-center gap-2">
          <LineChart className="h-4 w-4" /> {ar ? 'توقعات الإيراد (البايبلاين المفتوح)' : 'Revenue forecast (open pipeline)'}
        </h2>
        <Button variant="outline" size="sm" className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]" onClick={load}>
          <RefreshCw className="mr-1 h-4 w-4" />{ar ? 'حدّث' : 'Refresh'}
        </Button>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          <span className="inline-flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{error}</span>
          <Button variant="outline" size="sm" className="border-border dark:border-[#262626] text-gray-300" onClick={load}>{ar ? 'حاول تاني' : 'Retry'}</Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" /> {ar ? 'بيحسب التوقعات…' : 'Computing forecast…'}
        </div>
      ) : data ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: ar ? 'القيمة المفتوحة' : 'Open value', value: formatEGP(data.totalOpen), accent: 'text-blue-400' },
              { label: ar ? 'الموزونة بالاحتمال' : 'Probability-weighted', value: formatEGP(data.totalWeighted), accent: 'text-estate-gold' },
              ...(data.totalEstateaiWeighted !== undefined
                ? [{ label: ar ? 'المتوقع لإستيت' : 'Expected EstateAI share', value: formatEGP(data.totalEstateaiWeighted), accent: 'text-emerald-400' }]
                : []),
              { label: ar ? 'مراحل نشطة' : 'Active stages', value: String(data.stages.length), accent: 'text-gray-300' },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-black p-4">
                <p className="text-xs text-gray-500">{s.label}</p>
                <p className={`mt-1 truncate text-xl font-bold ${s.accent}`}>{s.value}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-black">
            <table className="w-full text-sm">
              <thead className="border-b border-border dark:border-[#262626] text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">{ar ? 'المرحلة' : 'Stage'}</th>
                  <th className="px-4 py-3">{ar ? 'العدد' : 'Count'}</th>
                  <th className="px-4 py-3">{ar ? 'القيمة' : 'Value'}</th>
                  <th className="px-4 py-3">{ar ? 'الاحتمال' : 'Probability'}</th>
                  <th className="px-4 py-3">{ar ? 'الموزونة' : 'Weighted'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-[#262626]">
                {data.stages.map((s) => (
                  <tr key={s.stage} className="transition hover:bg-white/[0.03]">
                    <td className="px-4 py-2.5 font-medium text-gray-200">{statusLabel(s.stage, ar)}</td>
                    <td className="px-4 py-2.5 text-gray-300">{s.count}</td>
                    <td className="px-4 py-2.5 text-gray-300">{formatEGP(s.value)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-estate-gold to-amber-400"
                            style={{ width: `${Math.min(100, Math.round(s.probability * 100))}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400">{Math.round(s.probability * 100)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-estate-gold">{formatEGP(s.weighted)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-gray-600">
            {ar ? 'اتحسبت:' : 'Generated:'} {new Date(data.generatedAt).toLocaleString(ar ? 'ar-EG' : undefined)}
            {' · '}
            {ar ? 'القيم = قيمة الصفقة الكاملة موزونة باحتمال القفل الثابت لكل مرحلة.' : 'Values = full deal value weighted by each stage’s fixed close probability.'}
          </p>
        </div>
      ) : null}
    </section>
  )
}
