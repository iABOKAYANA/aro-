'use client'

import { useCallback, useEffect, useState } from 'react'
import { Trophy, Target, Loader2, RefreshCw, Pencil, Medal, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatEGP, cn } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import { ceoApi, Toast, type ToastState, Modal, Field, fieldInputCls } from '../../components/manager-ui'

/* ─── Contracts ────────────────────────────────────────────
   GET /api/ceo/targets?month= → { month, targets: [{ brokerId (profile id),
     name, month, targetDeals, targetValue, actualDeals, actualValue,
     pctDeals, pctValue, hasTarget }] }
   POST /api/ceo/targets ← { brokerId, month, targetDeals?, targetValue? }
   GET /api/ceo/leaderboard?month= → { month, leaderboard: [{ brokerId, name,
     deals, value, commission, leads, conversionPct }] } */

interface TargetRow {
  brokerId: string
  name: string
  month: string
  targetDeals: number
  targetValue: number
  actualDeals: number
  actualValue: number
  pctDeals: number
  pctValue: number
  hasTarget: boolean
}

interface BoardRow {
  brokerId: string
  name: string
  deals: number
  value: number
  commission: number
  leads: number
  conversionPct: number
}

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function PctBar({ pct }: { pct: number }) {
  const safe = Number.isFinite(pct) ? Math.max(0, Math.min(999, pct)) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 min-w-[64px] flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full',
            safe >= 100 ? 'bg-gradient-to-r from-green-500 to-emerald-400' : 'bg-gradient-to-r from-estate-gold to-amber-400'
          )}
          style={{ width: `${Math.min(100, safe)}%` }}
        />
      </div>
      <span className="w-12 shrink-0 text-right text-[11px] font-medium text-gray-400">{Math.round(safe)}%</span>
    </div>
  )
}

export default function TargetsBoard() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [month, setMonth] = useState(currentMonth())
  const [targets, setTargets] = useState<TargetRow[]>([])
  const [board, setBoard] = useState<BoardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState>(null)
  const [editing, setEditing] = useState<TargetRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [t, l] = await Promise.all([
        ceoApi<{ month: string; targets: TargetRow[] }>(`/api/ceo/targets?month=${encodeURIComponent(month)}`),
        ceoApi<{ month: string; leaderboard: BoardRow[] }>(`/api/ceo/leaderboard?month=${encodeURIComponent(month)}`),
      ])
      setTargets(t.targets || [])
      setBoard(l.leaderboard || [])
    } catch (err) {
      console.error('Failed to load targets/leaderboard:', err)
      setError(ar ? 'معرفناش نجيب التارجت والترتيب — حاول تاني.' : 'Failed to load targets and leaderboard')
    } finally {
      setLoading(false)
    }
  }, [month, ar])

  useEffect(() => {
    load()
  }, [load])

  const medal = (i: number) =>
    i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-amber-600' : 'text-gray-600'

  return (
    <div className="space-y-3">
      <Toast toast={toast} onClose={() => setToast(null)} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display flex items-center gap-2 text-lg font-semibold text-foreground">
            <Target className="h-5 w-5 text-estate-gold" />
            {ar ? 'التارجت الشهري وترتيب البروكرز' : 'Monthly targets & leaderboard'}
          </h2>
          <p className="text-xs text-gray-500">
            {ar ? 'حدّد تارجت لكل بروكر وتابع تحقيقه قصاد الترتيب الشهري' : 'Set a target per broker and track attainment against the monthly ranking'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-1.5 text-sm text-gray-300 outline-none"
          />
          <Button
            onClick={load}
            variant="outline"
            size="sm"
            className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300"
          >
            <RefreshCw className={cn('mr-1 h-4 w-4', loading && 'animate-spin')} />
            {ar ? 'حدّث' : 'Refresh'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <Button variant="ghost" size="sm" className="ml-auto text-red-400 hover:text-red-300" onClick={load}>
            {ar ? 'حاول تاني' : 'Retry'}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" /> {ar ? 'بيحمّل التارجت…' : 'Loading targets…'}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-5">
          {/* Targets */}
          <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] xl:col-span-3">
            <div className="border-b border-border dark:border-[#262626] px-4 py-3 text-sm font-semibold text-foreground">
              {ar ? `تارجت شهر ${month}` : `Targets · ${month}`}
              <span className="ml-2 text-xs font-normal text-gray-500">
                {ar
                  ? `${targets.filter((t) => t.hasTarget).length} من ${targets.length} متحددلهم`
                  : `${targets.filter((t) => t.hasTarget).length} of ${targets.length} set`}
              </span>
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              {targets.length === 0 ? (
                <p className="p-4 text-sm text-gray-500">{ar ? 'مفيش بروكرز.' : 'No brokers.'}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card dark:bg-[#0A0A0A] text-left text-xs uppercase text-gray-500">
                    <tr className="border-b border-border dark:border-[#262626]">
                      <th className="px-4 py-2.5">{ar ? 'البروكر' : 'Broker'}</th>
                      <th className="px-4 py-2.5">{ar ? 'الصفقات (فعلي / مستهدف)' : 'Deals (actual / target)'}</th>
                      <th className="px-4 py-2.5">{ar ? 'القيمة (فعلي / مستهدف)' : 'Value (actual / target)'}</th>
                      <th className="px-4 py-2.5 text-right">{ar ? 'ظبط' : 'Set'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border dark:divide-[#262626]">
                    {targets.map((t) => (
                      <tr key={t.brokerId} className="transition hover:bg-white/[0.03]">
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-gray-200">{t.name}</p>
                          {!t.hasTarget && (
                            <p className="text-[11px] text-gray-600">{ar ? 'من غير تارجت' : 'No target set'}</p>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="text-xs text-gray-300">
                            {t.actualDeals} / {t.hasTarget ? t.targetDeals : '—'}
                          </p>
                          <PctBar pct={t.pctDeals} />
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="text-xs text-gray-300">
                            {formatEGP(t.actualValue)} / {t.hasTarget ? formatEGP(t.targetValue) : '—'}
                          </p>
                          <PctBar pct={t.pctValue} />
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => setEditing(t)}
                            className="rounded-full p-1.5 text-gray-400 hover:bg-white/[0.06] hover:text-estate-gold"
                            title={ar ? 'ظبط التارجت' : 'Set target'}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Leaderboard */}
          <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] xl:col-span-2">
            <div className="border-b border-border dark:border-[#262626] px-4 py-3 text-sm font-semibold text-foreground">
              <span className="inline-flex items-center gap-2">
                <Trophy className="h-4 w-4 text-estate-gold" />
                {ar ? `ترتيب شهر ${month}` : `Leaderboard · ${month}`}
              </span>
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              {board.length === 0 ? (
                <p className="p-4 text-sm text-gray-500">{ar ? 'مفيش حركة الشهر ده لسه.' : 'No activity this month yet.'}</p>
              ) : (
                <ol className="divide-y divide-border dark:divide-[#262626]">
                  {board.map((b, i) => (
                    <li key={b.brokerId} className="flex items-center gap-3 px-4 py-2.5">
                      <Medal className={cn('h-4 w-4 shrink-0', medal(i))} />
                      <span className="w-6 shrink-0 text-xs font-bold text-gray-500">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-200">{b.name}</p>
                        <p className="text-[11px] text-gray-500">
                          {b.deals} {ar ? 'صفقات' : 'deals'} · {formatEGP(b.value)} · {b.leads} {ar ? 'ليدز' : 'leads'} ·{' '}
                          {ar ? 'تحويل' : 'conv.'} {b.conversionPct}%
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-estate-gold">{formatEGP(b.commission)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}

      {editing && (
        <TargetModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            setToast({ msg: ar ? 'التارجت اتحفظ' : 'Target saved', tone: 'ok' })
            load()
          }}
          onError={() => setToast({ msg: ar ? 'معرفناش نحفظ التارجت — حاول تاني.' : 'Failed to save target', tone: 'err' })}
        />
      )}
    </div>
  )
}

/* ─── Set-target modal (POST /api/ceo/targets upsert) ───── */

function TargetModal({
  row,
  onClose,
  onSaved,
  onError,
}: {
  row: TargetRow
  onClose: () => void
  onSaved: () => void
  onError: () => void
}) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deals, setDeals] = useState(row.hasTarget ? String(row.targetDeals) : '')
  const [value, setValue] = useState(row.hasTarget ? String(row.targetValue) : '')

  const submit = async () => {
    setFormError(null)
    const d = deals.trim() === '' ? 0 : Number(deals)
    const v = value.trim() === '' ? 0 : Number(value)
    if (!Number.isInteger(d) || d < 0) {
      setFormError(ar ? 'تارجت الصفقات لازم يبقى رقم صحيح موجب.' : 'Target deals must be a whole number ≥ 0.')
      return
    }
    if (!Number.isFinite(v) || v < 0) {
      setFormError(ar ? 'تارجت القيمة لازم يبقى رقم موجب.' : 'Target value must be a number ≥ 0.')
      return
    }
    setSaving(true)
    try {
      await ceoApi('/api/ceo/targets', 'POST', { brokerId: row.brokerId, month: row.month, targetDeals: d, targetValue: v })
      onSaved()
    } catch (err) {
      console.error('Failed to save target:', err)
      onError()
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={ar ? `تارجت ${row.name}` : `Target · ${row.name}`}
      subtitle={row.month}
      footer={
        <>
          <Button
            variant="outline"
            onClick={onClose}
            className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300"
          >
            {ar ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button onClick={submit} disabled={saving} className="gold-shimmer bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold/90">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {ar ? 'احفظ التارجت' : 'Save target'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={ar ? 'تارجت الصفقات (عدد)' : 'Target deals (count)'} hint="≥ 0">
          <input type="number" min={0} step={1} dir="ltr" className={fieldInputCls} value={deals} onChange={(e) => setDeals(e.target.value)} placeholder="0" />
        </Field>
        <Field label={ar ? 'تارجت القيمة (جنيه)' : 'Target value (EGP)'} hint="≥ 0">
          <input type="number" min={0} dir="ltr" className={fieldInputCls} value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" />
        </Field>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        {ar ? `الفعلي دلوقتي: ${row.actualDeals} صفقات · ${formatEGP(row.actualValue)}` : `Currently: ${row.actualDeals} deals · ${formatEGP(row.actualValue)}`}
      </p>
      {formError && (
        <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{formError}</div>
      )}
    </Modal>
  )
}
