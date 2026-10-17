'use client'

import { useCallback, useEffect, useState } from 'react'
import { Search, Loader2, Inbox, RefreshCw, Handshake, X, AlertTriangle, Plus, CheckCircle2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatEGP, cn } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import { statusLabel } from '@/components/ceo/ceo-charts'

interface DealRow {
  id: string
  status: string
  dealValue: number | null
  currency: string
  source: string
  reservationDate: string | null
  contractDate: string | null
  saleDate: string | null
  createdAt: string
  lead: { id: string; leadCode: string | null; name: string; status: string; brokerId: string | null } | null
  broker: { id: string; user: { name: string | null } } | null
  developer: { id: string; companyName: string } | null
  project: { id: string; name: string } | null
  unit: { id: string; name: string } | null
  commissions: Array<{ id: string; status: string; totalAmount: number; brokerAmount: number; estateaiAmount: number }>
}

const DEAL_STATUSES = ['RESERVATION', 'CONTRACT', 'SOLD', 'CANCELLED', 'LOST']
const DEAL_COLORS: Record<string, string> = {
  RESERVATION: 'border-orange-500/30 bg-orange-500/10 text-orange-400',
  CONTRACT: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-400',
  SOLD: 'border-green-500/30 bg-green-500/10 text-green-400',
  CANCELLED: 'border-red-500/30 bg-red-500/10 text-red-400',
  LOST: 'border-red-500/30 bg-red-500/10 text-red-400',
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

const COMMISSION_AR: Record<string, string> = {
  PENDING: 'مستنية',
  APPROVED: 'متوافق عليها',
  INVOICED: 'اتفوترت',
  DUE: 'مستحقة',
  PAID: 'مدفوعة',
  CANCELLED: 'ملغية',
  DISPUTED: 'متنازع عليها',
}

export default function DealsTab() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [deals, setDeals] = useState<DealRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [confirm, setConfirm] = useState<{ deal: DealRow; to: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [showClose, setShowClose] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (statusFilter) params.set('status', statusFilter)
    fetch(`/api/deals?${params.toString()}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || 'Failed')
        return r.json()
      })
      .then((data) => setDeals(data.deals || []))
      .catch((e) => {
        console.error('Failed to load deals:', e)
        setError(ar ? 'معرفناش نجيب الصفقات — حاول تاني.' : 'Failed to load deals')
      })
      .finally(() => setLoading(false))
  }, [search, statusFilter, ar])

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [load, search])

  const applyStatus = async () => {
    if (!confirm) return
    setBusy(true)
    try {
      const res = await fetch(`/api/deals/${confirm.deal.id}`, {
        method: 'PATCH',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: confirm.to }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        console.error('Failed to update deal:', data)
        setError(ar ? 'معرفناش نحدّث الصفقة — حاول تاني.' : 'Failed to update deal')
      } else {
        setConfirm(null)
        load()
      }
    } catch (err) {
      console.error('Network error updating deal:', err)
      setError(ar ? 'مشكلة في الشبكة — حاول تاني.' : 'Network error')
    } finally {
      setBusy(false)
    }
  }

  const selectCls = 'rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-gray-300 outline-none'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            placeholder={ar ? 'دوّر بكود الليد أو العميل أو المشروع…' : 'Search lead code, client, project...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] py-2 pl-9 pr-3 text-sm text-gray-300 outline-none placeholder:text-muted-foreground"
          />
        </div>
        <select className={selectCls} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">{ar ? 'كل الحالات' : 'All statuses'}</option>
          {DEAL_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s, ar)}</option>)}
        </select>
        <Button variant="outline" size="sm" className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]" onClick={load}>
          <RefreshCw className="mr-1 h-4 w-4" />{ar ? 'حدّث' : 'Refresh'}
        </Button>
        <Button size="sm" className="gold-shimmer bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold-dark" onClick={() => setShowClose(true)}>
          <Plus className="mr-1 h-4 w-4" />{ar ? 'اقفل صفقة' : 'Close deal'}
        </Button>
        <span className="ml-auto text-xs text-gray-500">{deals.length} {ar ? 'صفقة' : 'deals'}</span>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          <span>{error}</span>
          <Button variant="outline" size="sm" className="border-border dark:border-[#262626] text-gray-300" onClick={load}>{ar ? 'حاول تاني' : 'Retry'}</Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" /> {ar ? 'بيحمّل الصفقات…' : 'Loading deals...'}
        </div>
      ) : deals.length === 0 ? (
        <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-black py-14 text-center">
          <Inbox className="mx-auto h-12 w-12 text-gray-700" />
          <p className="mt-3 text-sm text-gray-500">{ar ? 'مفيش صفقات.' : 'No deals found.'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-black">
          <table className="w-full text-sm">
            <thead className="border-b border-border dark:border-[#262626] text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">{ar ? 'الليد' : 'Lead'}</th>
                <th className="px-4 py-3">{ar ? 'البروكر' : 'Broker'}</th>
                <th className="px-4 py-3">{ar ? 'المطوّر / المشروع' : 'Developer / Project'}</th>
                <th className="px-4 py-3">{ar ? 'المرحلة' : 'Stage'}</th>
                <th className="px-4 py-3">{ar ? 'القيمة' : 'Value'}</th>
                <th className="px-4 py-3">{ar ? 'العمولة' : 'Commission'}</th>
                <th className="px-4 py-3 text-right">{ar ? 'غيّر المرحلة' : 'Update stage'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border dark:divide-[#262626]">
              {deals.map((deal) => {
                const commission = deal.commissions[0] || null
                return (
                  <tr key={deal.id} className="transition hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-200">{deal.lead?.name || '—'}</p>
                      <p className="text-xs text-gray-500">
                        {deal.lead?.leadCode && <span className="font-mono text-estate-gold">{deal.lead.leadCode}</span>}
                        {deal.lead?.leadCode && ' · '}
                        {new Date(deal.createdAt).toLocaleDateString(ar ? 'ar-EG' : 'en-US')}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{deal.broker?.user?.name || '—'}</td>
                    <td className="px-4 py-3">
                      <p className="text-gray-300">{deal.developer?.companyName || '—'}</p>
                      <p className="text-xs text-gray-500">
                        {deal.project?.name || ''}{deal.unit ? ` · ${deal.unit.name}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={cn('border', DEAL_COLORS[deal.status] || 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-400')}>
                        {statusLabel(deal.status, ar)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {deal.dealValue ? formatEGP(deal.dealValue) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {commission ? (
                        <div>
                          <Badge className={cn('border', COMMISSION_COLORS[commission.status] || 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-400')}>
                            {ar ? COMMISSION_AR[commission.status] || commission.status : commission.status}
                          </Badge>
                          <p className="mt-1 text-xs text-gray-500">
                            {ar ? 'الكل' : 'Total'} {formatEGP(commission.totalAmount)} · {ar ? 'البروكر' : 'Broker'} {formatEGP(commission.brokerAmount)}
                          </p>
                        </div>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <select
                        className="rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-2 py-1.5 text-xs text-gray-300 outline-none"
                        value=""
                        onChange={(e) => {
                          if (e.target.value) setConfirm({ deal, to: e.target.value })
                        }}
                      >
                        <option value="">{ar ? 'غيّر…' : 'Change…'}</option>
                        {DEAL_STATUSES.filter((s) => s !== deal.status).map((s) => (
                          <option key={s} value={s}>{statusLabel(s, ar)}</option>
                        ))}
                      </select>
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
              <AlertTriangle className="h-5 w-5 text-estate-gold" />
              <h3 className="font-semibold">{ar ? 'أكّد تغيير مرحلة الصفقة' : 'Confirm deal stage change'}</h3>
            </div>
            <p className="text-sm text-gray-400">
              {ar ? 'انقل' : 'Move'} <span className="font-mono text-estate-gold">{confirm.deal.lead?.leadCode || confirm.deal.id.slice(0, 8)}</span>{' '}
              {ar ? 'من' : 'from'} <strong>{statusLabel(confirm.deal.status, ar)}</strong> {ar ? 'لـ' : 'to'} <strong className="text-estate-gold">{statusLabel(confirm.to, ar)}</strong>؟
            </p>
            <p className="mt-2 text-xs text-gray-500">
              {ar
                ? 'حالة الليد المرتبطة هتتعكس والعمولة بتفضل متدارة من السيرفر. الحركة دي متسجلة في التدقيق.'
                : 'The linked lead status will be mirrored and commission stays server-managed. This action is audit-logged.'}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" className="border-border dark:border-[#262626] text-gray-300" onClick={() => setConfirm(null)} disabled={busy}>
                <X className="mr-1 h-4 w-4" />{ar ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button size="sm" className="gold-shimmer bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold-dark" onClick={applyStatus} disabled={busy}>
                {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Handshake className="mr-1 h-4 w-4" />}
                {ar ? 'أكّد' : 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showClose && (
        <CloseDealModal
          onClose={() => setShowClose(false)}
          onClosed={() => {
            setShowClose(false)
            load()
          }}
        />
      )}
    </div>
  )
}

/* ─── Close deal dialog (POST /api/ceo/deals) ────────────
   Standalone closer with a lead picker: lead + broker + value +
   stage + dates + rule override + notes. Commission is always
   server-computed — the returned commission.brokerAmount is shown. */

const CLOSE_STAGES = ['RESERVATION', 'CONTRACT', 'SOLD'] as const

type CloseLead = {
  id: string
  leadCode: string | null
  name: string
  phone: string
  status: string
  projectId: string | null
  brokerId: string | null
  project?: { id: string; name: string } | null
}

type CloseBroker = { id: string; user: { name: string | null; email: string | null } }
type CloseProject = {
  id: string
  name: string
  developerId: string
  developer: { id: string; companyName: string }
}
type CloseUnit = { id: string; name: string; projectId: string }
type CloseRule = {
  id: string
  name: string
  isActive: boolean
  project?: { id: string; name: string } | null
  developer?: { id: string; companyName: string } | null
}

function CloseDealModal({ onClose, onClosed }: { onClose: () => void; onClosed: () => void }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [leads, setLeads] = useState<CloseLead[] | null>(null)
  const [brokers, setBrokers] = useState<CloseBroker[] | null>(null)
  const [projects, setProjects] = useState<CloseProject[] | null>(null)
  const [units, setUnits] = useState<CloseUnit[] | null>(null)
  const [rules, setRules] = useState<CloseRule[] | null>(null)
  const [unitsLoading, setUnitsLoading] = useState(false)

  const [leadQuery, setLeadQuery] = useState('')
  const [leadId, setLeadId] = useState('')
  const [brokerId, setBrokerId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [unitId, setUnitId] = useState('')
  const [dealValue, setDealValue] = useState('')
  const [stage, setStage] = useState<string>('SOLD')
  const [reservationDate, setReservationDate] = useState('')
  const [contractDate, setContractDate] = useState('')
  const [saleDate, setSaleDate] = useState('')
  const [source, setSource] = useState('PLATFORM')
  const [ruleId, setRuleId] = useState('')
  const [notes, setNotes] = useState('')

  const [errors, setErrors] = useState<string[]>([])
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{
    created: boolean
    status: string
    value: number
    brokerAmount: number | null
    currency: string | null
    leadCode: string | null
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [leadRes, brokerRes, projRes, cfgRes] = await Promise.all([
          fetch('/api/ceo/leads'),
          fetch('/api/ceo/brokers'),
          fetch('/api/ceo/projects-all?limit=100'),
          fetch('/api/ceo/growth-config'),
        ])
        if (cancelled) return
        if (leadRes.ok) {
          const data = await leadRes.json()
          setLeads(data.leads || [])
        } else setLeads([])
        if (brokerRes.ok) {
          const data = await brokerRes.json()
          setBrokers(data.brokers || [])
        } else setBrokers([])
        if (projRes.ok) {
          const data = await projRes.json()
          setProjects(data.items || [])
        } else setProjects([])
        if (cfgRes.ok) {
          const data = await cfgRes.json()
          setRules((data.rules || []).filter((r: CloseRule) => r.isActive))
        } else setRules([])
      } catch {
        if (!cancelled) {
          setLeads([])
          setBrokers([])
          setProjects([])
          setRules([])
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Units follow the chosen project — the unit must belong to it.
  useEffect(() => {
    if (!projectId) {
      setUnits(null)
      return
    }
    let cancelled = false
    setUnitsLoading(true)
    fetch(`/api/ceo/units?projectId=${encodeURIComponent(projectId)}`)
      .then(async (r) => {
        if (cancelled) return
        if (!r.ok) throw new Error('units failed')
        const data = await r.json()
        if (!cancelled) setUnits(data.units || [])
      })
      .catch(() => {
        if (!cancelled) setUnits([])
      })
      .finally(() => {
        if (!cancelled) setUnitsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  const pickedLead = (leads || []).find((l) => l.id === leadId) || null

  const pickLead = (id: string) => {
    setLeadId(id)
    const lead = (leads || []).find((l) => l.id === id)
    if (lead) {
      if (lead.projectId && !projectId) setProjectId(lead.projectId)
      if (lead.brokerId && !brokerId) setBrokerId(lead.brokerId)
    }
  }

  const visibleLeads = (() => {
    if (!leads) return []
    const q = leadQuery.trim().toLowerCase()
    if (!q) return leads.slice(0, 50)
    return leads
      .filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.phone.includes(q) ||
          (l.leadCode || '').toLowerCase().includes(q)
      )
      .slice(0, 50)
  })()

  const submit = async () => {
    const errs: string[] = []
    if (!leadId) errs.push(ar ? 'اختار الليد اللي هتتقفل عليه الصفقة.' : 'Pick the lead to close the deal on.')
    if (!brokerId) errs.push(ar ? 'اختار البروكر اللي الصفقة هتتحسب له.' : 'Pick the broker the deal is attributed to.')
    const value = Number(dealValue)
    if (!dealValue.trim() || !Number.isFinite(value) || value <= 0) {
      errs.push(ar ? 'اكتب قيمة الصفقة (رقم أكبر من صفر).' : 'Enter the deal value (a number greater than zero).')
    }
    if (!projectId && !pickedLead?.projectId) {
      errs.push(ar ? 'الليد ده ملهوش مشروع — اختار مشروع.' : 'This lead has no project — pick one.')
    }
    if (notes.length > 4000) {
      errs.push(ar ? 'الملاحظات طويلة أوي (آخرها ٤٠٠٠ حرف).' : 'Notes are too long (max 4000 characters).')
    }
    setErrors(errs)
    setServerError(null)
    if (errs.length > 0) return

    setSaving(true)
    try {
      const toISO = (d: string) => (d ? new Date(`${d}T12:00:00`).toISOString() : undefined)
      const payload: Record<string, unknown> = {
        leadId,
        brokerId,
        dealValue: value,
        status: stage,
        source,
      }
      if (projectId) payload.projectId = projectId
      if (unitId) payload.unitId = unitId
      const rd = toISO(reservationDate)
      const cd = toISO(contractDate)
      const sd = toISO(saleDate)
      if (rd) payload.reservationDate = rd
      if (cd) payload.contractDate = cd
      if (sd) payload.saleDate = sd
      if (ruleId) payload.ruleId = ruleId
      if (notes) payload.notes = notes

      const res = await fetch('/api/ceo/deals', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to close deal')
      }
      setResult({
        created: data.created !== false,
        status: data.deal?.status || stage,
        value: data.deal?.dealValue ?? value,
        brokerAmount: data.commission?.brokerAmount ?? null,
        currency: data.commission?.currency ?? null,
        leadCode: data.deal?.lead?.leadCode ?? pickedLead?.leadCode ?? null,
      })
      setErrors([])
    } catch (err) {
      console.error('Failed to close deal:', err)
      setServerError(
        ar
          ? `معرفناش نقفل الصفقة — ${err instanceof Error ? err.message : 'حاول تاني.'}`
          : `Could not close the deal — ${err instanceof Error ? err.message : 'try again.'}`
      )
    } finally {
      setSaving(false)
    }
  }

  const fieldCls =
    'w-full rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-gray-300 outline-none placeholder:text-muted-foreground focus:border-estate-gold/50'
  const labelCls = 'mb-1 block text-xs text-gray-500'

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-2xl rounded-3xl border border-border dark:border-[#262626] bg-card dark:bg-black p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <Handshake className="h-5 w-5 text-estate-gold" />
            {ar ? 'اقفل صفقة' : 'Close a deal'}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-foreground" aria-label={ar ? 'اقفل' : 'Close'}>
            <X className="h-5 w-5" />
          </button>
        </div>

        {result ? (
          /* Computed commission result — amounts came from the server. */
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-2xl border border-green-500/30 bg-green-500/10 p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-400" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-green-300">
                  {ar ? 'الصفقة اتقفلت' : 'Deal closed'} · {statusLabel(result.status, ar)}
                  {result.leadCode && (
                    <span className="ml-2 font-mono text-xs text-estate-gold">{result.leadCode}</span>
                  )}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl border border-border dark:border-[#262626] bg-white/[0.03] p-2.5">
                    <p className="text-[11px] text-gray-500">{ar ? 'قيمة الصفقة' : 'Deal value'}</p>
                    <p className="font-semibold text-foreground">{formatEGP(result.value)}</p>
                  </div>
                  <div className="rounded-xl border border-estate-gold/30 bg-estate-gold/[0.07] p-2.5">
                    <p className="text-[11px] text-gray-500">{ar ? 'عمولة البروكر (من السيرفر)' : 'Broker commission (server-computed)'}</p>
                    <p className="font-semibold text-estate-gold">
                      {result.brokerAmount != null
                        ? `${formatEGP(result.brokerAmount)}${result.currency ? ` ${result.currency}` : ''}`
                        : '—'}
                    </p>
                  </div>
                </div>
                {!result.created && (
                  <p className="mt-2 text-xs text-gray-400">
                    {ar
                      ? 'الليد ده كان عنده صفقة مفتوحة أوريدي — اتقفلت عليها بدل ما تتعمل واحدة جديدة.'
                      : 'This lead already had an open deal — it was closed in place instead of creating a new one.'}
                  </p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  {ar
                    ? 'حالة الليد اتعكست والحركة متسجلة في التدقيق.'
                    : 'The lead stage was mirrored and the move is audit-logged.'}
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" className="gold-shimmer bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold-dark" onClick={onClosed}>
                {ar ? 'تمام' : 'Done'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {errors.length > 0 && (
              <div className="flex items-start gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <ul className="list-disc space-y-0.5 pl-5">
                  {errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            {serverError && (
              <div className="flex items-start gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{serverError}</span>
              </div>
            )}

            {/* Lead picker */}
            <div>
              <label className={labelCls}>{ar ? 'الليد *' : 'Lead *'}</label>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input
                  value={leadQuery}
                  onChange={(e) => setLeadQuery(e.target.value)}
                  placeholder={ar ? 'دوّر بالاسم أو التليفون أو الكود…' : 'Search name, phone or code...'}
                  className={cn(fieldCls, 'pl-9')}
                />
              </div>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-2xl border border-border dark:border-[#262626] bg-white/[0.02] p-2">
                {leads === null ? (
                  <p className="flex items-center justify-center gap-2 py-4 text-xs text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {ar ? 'بيحمّل الليدز…' : 'Loading leads...'}
                  </p>
                ) : visibleLeads.length === 0 ? (
                  <p className="py-4 text-center text-xs text-gray-500">{ar ? 'مفيش ليدز مطابقة.' : 'No matching leads.'}</p>
                ) : (
                  visibleLeads.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => pickLead(l.id)}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-left text-sm transition-colors',
                        leadId === l.id
                          ? 'bg-estate-gold/15 text-estate-gold'
                          : 'text-gray-300 hover:bg-white/[0.05]'
                      )}
                    >
                      <span className="min-w-0 truncate">
                        {l.name}
                        {l.leadCode && <span className="ml-2 font-mono text-[11px] text-gray-500">{l.leadCode}</span>}
                      </span>
                      <span className="shrink-0 text-[11px] text-gray-500">{statusLabel(l.status, ar)}</span>
                    </button>
                  ))
                )}
              </div>
              {pickedLead && (
                <p className="mt-1 text-[11px] text-gray-500">
                  {ar ? 'المشروع بتاع الليد:' : 'Lead project:'} {pickedLead.project?.name || (ar ? 'مفيش — اختار واحد تحت' : 'none — pick one below')}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>{ar ? 'البروكر (بتتحسب له) *' : 'Broker (attributed) *'}</label>
                <select className={fieldCls} value={brokerId} onChange={(e) => setBrokerId(e.target.value)}>
                  <option value="">{ar ? 'اختار بروكر…' : 'Select broker...'}</option>
                  {(brokers || []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.user.name || b.user.email}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>{ar ? 'قيمة الصفقة (جنيه) *' : 'Deal value (EGP) *'}</label>
                <input
                  type="number"
                  min={0}
                  dir="ltr"
                  value={dealValue}
                  onChange={(e) => setDealValue(e.target.value)}
                  placeholder="0"
                  className={cn(fieldCls, 'text-left')}
                />
              </div>
              <div>
                <label className={labelCls}>{ar ? 'المرحلة' : 'Stage'}</label>
                <select className={fieldCls} value={stage} onChange={(e) => setStage(e.target.value)}>
                  {CLOSE_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {statusLabel(s, ar)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>{ar ? 'المصدر' : 'Source'}</label>
                <select className={fieldCls} value={source} onChange={(e) => setSource(e.target.value)}>
                  <option value="PLATFORM">{ar ? 'من المنصة' : 'Platform'}</option>
                  <option value="OFF_PLATFORM_REPORT">{ar ? 'بلاغ خارج المنصة' : 'Off-platform report'}</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>{ar ? 'المشروع' : 'Project'}</label>
                <select
                  className={fieldCls}
                  value={projectId}
                  onChange={(e) => {
                    setProjectId(e.target.value)
                    setUnitId('')
                  }}
                >
                  <option value="">
                    {pickedLead?.projectId
                      ? (ar ? 'مشروع الليد (الافتراضي)' : "Lead's project (default)")
                      : (ar ? 'اختار مشروع…' : 'Select project...')}
                  </option>
                  {(projects || []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.developer.companyName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>{ar ? 'الوحدة' : 'Unit'}</label>
                <select className={fieldCls} value={unitId} onChange={(e) => setUnitId(e.target.value)} disabled={!projectId || unitsLoading}>
                  <option value="">
                    {!projectId
                      ? (ar ? 'اختار مشروع الأول' : 'Pick a project first')
                      : unitsLoading
                        ? (ar ? 'بيحمّل…' : 'Loading...')
                        : (ar ? 'من غير تحديد' : 'Not specified')}
                  </option>
                  {(units || []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>{ar ? 'تاريخ الحجز' : 'Reservation date'}</label>
                <input type="date" className={fieldCls} value={reservationDate} onChange={(e) => setReservationDate(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>{ar ? 'تاريخ التعاقد' : 'Contract date'}</label>
                <input type="date" className={fieldCls} value={contractDate} onChange={(e) => setContractDate(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>{ar ? 'تاريخ البيع' : 'Sale date'}</label>
                <input type="date" className={fieldCls} value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>{ar ? 'قاعدة عمولة مخصوصة' : 'Commission rule override'}</label>
                <select className={fieldCls} value={ruleId} onChange={(e) => setRuleId(e.target.value)}>
                  <option value="">{ar ? 'تلقائي (حسب المشروع/المطوّر)' : 'Automatic (project/developer match)'}</option>
                  {(rules || []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.project ? ` · ${r.project.name}` : r.developer ? ` · ${r.developer.companyName}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>{ar ? 'ملاحظات' : 'Notes'}</label>
                <textarea
                  rows={2}
                  maxLength={4000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={cn(fieldCls, 'min-h-[56px] resize-y leading-relaxed')}
                  placeholder={ar ? 'أي تفاصيل عن الصفقة…' : 'Anything about this deal...'}
                />
              </div>
            </div>

            <p className="text-xs text-gray-500">
              {ar
                ? 'النسبة بتتحسب على السيرفر — اللي هتشوفه بعد القفل هو الرقم النهائي. التواريخ الفاضية بتتختم تلقائي.'
                : 'The split is computed server-side — what you see after closing is final. Empty dates are auto-stamped.'}
            </p>

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" className="border-border dark:border-[#262626] text-gray-300" onClick={onClose} disabled={saving}>
                <X className="mr-1 h-4 w-4" />
                {ar ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button size="sm" className="gold-shimmer bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold-dark" onClick={submit} disabled={saving}>
                {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Handshake className="mr-1 h-4 w-4" />}
                {ar ? 'اقفل الصفقة' : 'Close deal'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
