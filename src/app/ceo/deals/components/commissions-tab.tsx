'use client'

import { useCallback, useEffect, useState } from 'react'
import { DollarSign, Loader2, Inbox, RefreshCw, CheckCircle2, X, AlertTriangle, Ban } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatEGP, cn } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import { statusLabel } from '@/components/ceo/ceo-charts'

interface CommissionRow {
  id: string
  status: string
  dealValue: number | null
  currency: string
  totalPct: number
  estateaiPct: number
  brokerPct: number
  otherPct: number
  otherLabel: string | null
  totalAmount: number
  estateaiAmount: number
  brokerAmount: number
  otherAmount: number
  dueDate: string | null
  paidDate: string | null
  notes: string | null
  createdAt: string
  deal: {
    id: string
    status: string
    dealValue: number | null
    lead: { id: string; leadCode: string | null; name: string } | null
    broker: { id: string; user: { name: string | null } } | null
    developer: { id: string; companyName: string } | null
    project: { id: string; name: string } | null
    unit: { id: string; name: string } | null
  }
  rule: { id: string; name: string } | null
}

// Mirror of the server-side transition map — the server still enforces it.
const ALLOWED: Record<string, string[]> = {
  PENDING: ['APPROVED', 'CANCELLED', 'DISPUTED'],
  APPROVED: ['INVOICED', 'DISPUTED', 'CANCELLED'],
  INVOICED: ['DUE', 'DISPUTED'],
  DUE: ['PAID', 'DISPUTED'],
  DISPUTED: ['PENDING', 'APPROVED'],
  PAID: [],
  CANCELLED: ['PENDING'],
}

const COMMISSION_COLORS: Record<string, string> = {
  PENDING: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  APPROVED: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400',
  INVOICED: 'border-purple-500/30 bg-purple-500/10 text-purple-400',
  DUE: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  PAID: 'border-green-500/30 bg-green-500/10 text-green-400',
  CANCELLED: 'border-gray-500/30 bg-gray-500/10 text-gray-400',
  DISPUTED: 'border-red-500/30 bg-red-500/10 text-red-400',
}

const FILTERS = ['', 'PENDING', 'APPROVED', 'INVOICED', 'DUE', 'PAID', 'DISPUTED', 'CANCELLED']

const COMMISSION_AR: Record<string, string> = {
  PENDING: 'مستنية',
  APPROVED: 'متوافق عليها',
  INVOICED: 'اتفوترت',
  DUE: 'مستحقة',
  PAID: 'مدفوعة',
  CANCELLED: 'ملغية',
  DISPUTED: 'متنازع عليها',
}

export default function CommissionsTab() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [rows, setRows] = useState<CommissionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [confirm, setConfirm] = useState<{ row: CommissionRow; to: string } | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    if (statusFilter) params.set('status', statusFilter)
    fetch(`/api/commissions?${params.toString()}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || 'Failed')
        return r.json()
      })
      .then((data) => setRows(data.commissions || []))
      .catch((e) => {
        console.error('Failed to load commissions:', e)
        setError(ar ? 'معرفناش نجيب العمولات — حاول تاني.' : 'Failed to load commissions')
      })
      .finally(() => setLoading(false))
  }, [statusFilter, ar])

  useEffect(() => { load() }, [load])

  const apply = async () => {
    if (!confirm) return
    setBusy(true)
    try {
      const res = await fetch(`/api/commissions/${confirm.row.id}`, {
        method: 'PATCH',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: confirm.to, reason: reason || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        console.error('Failed to update commission:', data)
        setError(ar ? 'معرفناش نحدّث العمولة — حاول تاني.' : 'Failed to update commission')
      } else { setConfirm(null); setReason(''); load() }
    } catch (err) {
      console.error('Network error updating commission:', err)
      setError(ar ? 'مشكلة في الشبكة — حاول تاني.' : 'Network error')
    } finally {
      setBusy(false)
    }
  }

  const totals = rows.reduce(
    (acc, r) => {
      acc.total += r.totalAmount
      acc.estateai += r.estateaiAmount
      acc.broker += r.brokerAmount
      if (r.status === 'PAID') acc.paid += r.totalAmount
      if (r.status === 'DISPUTED') acc.disputed += 1
      if (['PENDING', 'APPROVED', 'INVOICED', 'DUE'].includes(r.status)) acc.pending += r.totalAmount
      return acc
    },
    { total: 0, estateai: 0, broker: 0, paid: 0, pending: 0, disputed: 0 }
  )

  const stat = (label: string, value: string, accent: string) => (
    <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-black p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={cn('mt-0.5 truncate text-lg font-bold', accent)}>{value}</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stat(ar ? 'المتوقع كله' : 'Expected total', formatEGP(totals.total), 'text-foreground')}
        {stat(ar ? 'نصيب إستيت' : 'EstateAI share', formatEGP(totals.estateai), 'text-estate-gold')}
        {stat(ar ? 'نصيب البروكر' : 'Broker share', formatEGP(totals.broker), 'text-blue-400')}
        {stat(ar ? 'المبلغ المستنّي' : 'Pending amount', formatEGP(totals.pending), 'text-amber-400')}
        {stat(ar ? 'المبلغ المدفوع' : 'Paid amount', formatEGP(totals.paid), 'text-green-400')}
        {stat(ar ? 'متنازع عليها' : 'Disputed', String(totals.disputed), 'text-red-400')}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f || 'all'}
            onClick={() => setStatusFilter(f)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition',
              statusFilter === f
                ? 'border-estate-gold/40 bg-estate-gold/15 text-estate-gold'
                : 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-400 hover:bg-card dark:hover:bg-[#0A0A0A]'
            )}
          >
            {!f ? (ar ? 'الكل' : 'All') : (ar ? COMMISSION_AR[f] || f : f)}
          </button>
        ))}
        <Button variant="outline" size="sm" className="ml-auto border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]" onClick={load}>
          <RefreshCw className="mr-1 h-4 w-4" />{ar ? 'حدّث' : 'Refresh'}
        </Button>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          <span>{error}</span>
          <Button variant="outline" size="sm" className="border-border dark:border-[#262626] text-gray-300" onClick={load}>{ar ? 'حاول تاني' : 'Retry'}</Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" /> {ar ? 'بيحمّل العمولات…' : 'Loading commissions...'}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-black py-14 text-center">
          <Inbox className="mx-auto h-12 w-12 text-gray-700" />
          <p className="mt-3 text-sm text-gray-500">{ar ? 'مفيش عمولات بالحالة دي.' : 'No commissions in this state.'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-black">
          <table className="w-full text-sm">
            <thead className="border-b border-border dark:border-[#262626] text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">{ar ? 'الليد / الصفقة' : 'Lead / Deal'}</th>
                <th className="px-4 py-3">{ar ? 'البروكر / المطوّر' : 'Broker / Developer'}</th>
                <th className="px-4 py-3">{ar ? 'التقسيمة (سيرفر)' : 'Split (server)'}</th>
                <th className="px-4 py-3">{ar ? 'المبالغ' : 'Amounts'}</th>
                <th className="px-4 py-3">{ar ? 'الحالة' : 'Status'}</th>
                <th className="px-4 py-3">{ar ? 'التواريخ' : 'Dates'}</th>
                <th className="px-4 py-3 text-right">{ar ? 'إجراء' : 'Action'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border dark:divide-[#262626]">
              {rows.map((row) => {
                const allowed = ALLOWED[row.status] || []
                return (
                  <tr key={row.id} className="transition hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-200">{row.deal.lead?.name || '—'}</p>
                      <p className="text-xs text-gray-500">
                        {row.deal.lead?.leadCode && <span className="font-mono text-estate-gold">{row.deal.lead.leadCode}</span>} · {statusLabel(row.deal.status, ar)}
                      </p>
                      <p className="text-xs text-gray-500">{row.deal.project?.name || ''}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-300">{row.deal.broker?.user?.name || '—'}</p>
                      <p className="text-xs text-gray-500">{row.deal.developer?.companyName || '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      <p>{ar ? 'الكل:' : 'Total:'} <span className="text-foreground">{row.totalPct}%</span></p>
                      <p>EstateAI: <span className="text-estate-gold">{row.estateaiPct}%</span></p>
                      <p>{ar ? 'البروكر:' : 'Broker:'} <span className="text-blue-400">{row.brokerPct}%</span></p>
                      {row.otherPct > 0 && <p>{row.otherLabel || (ar ? 'تاني' : 'Other')}: {row.otherPct}%</p>}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{formatEGP(row.totalAmount)}</p>
                      <p className="text-xs text-estate-gold">EstateAI {formatEGP(row.estateaiAmount)}</p>
                      <p className="text-xs text-blue-400">{ar ? 'البروكر' : 'Broker'} {formatEGP(row.brokerAmount)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={cn('border', COMMISSION_COLORS[row.status] || 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-400')}>
                        {ar ? COMMISSION_AR[row.status] || row.status : row.status}
                      </Badge>
                      {row.notes && <p className="mt-1 max-w-[140px] truncate text-[10px] text-gray-500">{row.notes}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {row.dueDate && <p>{ar ? 'الاستحقاق:' : 'Due:'} {new Date(row.dueDate).toLocaleDateString(ar ? 'ar-EG' : 'en-US')}</p>}
                      {row.paidDate && <p className="text-green-400">{ar ? 'اتدفع:' : 'Paid:'} {new Date(row.paidDate).toLocaleDateString(ar ? 'ar-EG' : 'en-US')}</p>}
                      {!row.dueDate && !row.paidDate && <p>{ar ? 'اتعمل:' : 'Created:'} {new Date(row.createdAt).toLocaleDateString(ar ? 'ar-EG' : 'en-US')}</p>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {allowed.length === 0 ? (
                        <span className="text-xs text-gray-600">{ar ? 'نهائية' : 'Terminal'}</span>
                      ) : (
                        <select
                          className="rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-2 py-1.5 text-xs text-gray-300 outline-none"
                          value=""
                          onChange={(e) => { if (e.target.value) setConfirm({ row, to: e.target.value }) }}
                        >
                          <option value="">{ar ? 'غيّر…' : 'Change…'}</option>
                          {allowed.map((s) => <option key={s} value={s}>{ar ? COMMISSION_AR[s] || s : s}</option>)}
                        </select>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-md rounded-3xl border border-border dark:border-[#262626] bg-card dark:bg-black p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2 text-foreground">
              {confirm.to === 'PAID' ? <CheckCircle2 className="h-5 w-5 text-green-400" />
                : confirm.to === 'DISPUTED' ? <AlertTriangle className="h-5 w-5 text-red-400" />
                : confirm.to === 'CANCELLED' ? <Ban className="h-5 w-5 text-gray-400" />
                : <DollarSign className="h-5 w-5 text-estate-gold" />}
              <h3 className="font-semibold">{ar ? `نثبّت العمولة ← ${COMMISSION_AR[confirm.to] || confirm.to}؟` : `Set commission → ${confirm.to}?`}</h3>
            </div>
            <p className="text-sm text-gray-400">
              {confirm.row.deal.lead?.leadCode && <span className="font-mono text-estate-gold">{confirm.row.deal.lead.leadCode}</span>} —{' '}
              {formatEGP(confirm.row.totalAmount)} ({ar ? 'البروكر' : 'Broker'} {formatEGP(confirm.row.brokerAmount)})
            </p>
            <label className="mt-3 block text-xs text-gray-500">{ar ? 'السبب / ملاحظة (بتتخزن في التدقيق)' : 'Reason / note (stored in audit log)'}</label>
            <textarea
              className="mt-1 w-full rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-gray-300 outline-none"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={confirm.to === 'PAID' ? (ar ? 'مرجع الدفع…' : 'Payment reference…') : (ar ? 'السبب…' : 'Reason…')}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" className="border-border dark:border-[#262626] text-gray-300" onClick={() => setConfirm(null)} disabled={busy}>
                <X className="mr-1 h-4 w-4" />{ar ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button size="sm" className="gold-shimmer bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold-dark" onClick={apply} disabled={busy}>
                {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
                {ar ? 'أكّد' : 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
