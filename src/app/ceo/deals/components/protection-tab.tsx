'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Shield, ShieldAlert, ShieldOff, Loader2, Inbox, RefreshCw, X, AlertTriangle,
  ArrowRightLeft, CalendarPlus, CalendarX, CheckCircle2, Wrench, Search,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import { statusLabel } from '@/components/ceo/ceo-charts'

interface LeadRow {
  id: string
  leadCode: string | null
  name: string
  status: string
  reviewStatus: string
  createdAt: string
  protectionStartsAt: string | null
  protectionExpiresAt: string | null
  protectionDays: number | null
  duplicateNote: string | null
  duplicateOfId: string | null
  protectionStatus: 'PROTECTED' | 'EXPIRING_SOON' | 'EXPIRED' | 'NONE'
  broker: { id: string; user: { name: string | null } } | null
  project: { id: string; name: string } | null
}

type Panel = 'expiring' | 'expired' | 'duplicates'

export default function ProtectionTab() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [panel, setPanel] = useState<Panel>('expiring')
  const [rows, setRows] = useState<LeadRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [brokers, setBrokers] = useState<Array<{ id: string; user: { name: string | null } }>>([])
  const [modal, setModal] = useState<{ kind: 'extend' | 'expire' | 'transfer' | 'resolve'; lead: LeadRow } | null>(null)
  const [maintBusy, setMaintBusy] = useState(false)
  const [maintResult, setMaintResult] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    if (panel === 'expiring') params.set('protection', 'expiring')
    if (panel === 'expired') params.set('protection', 'expired')
    if (panel === 'duplicates') params.set('reviewStatus', 'DUPLICATE_REVIEW')
    if (search) params.set('search', search)
    params.set('limit', '50')
    fetch(`/api/leads?${params.toString()}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || 'Failed')
        return r.json()
      })
      .then((data) => setRows(data.leads || []))
      .catch((e) => {
        console.error('Failed to load protection leads:', e)
        setError(ar ? 'معرفناش نجيب الليدز — حاول تاني.' : 'Failed to load leads')
      })
      .finally(() => setLoading(false))
  }, [panel, search, ar])

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [load, search])

  useEffect(() => {
    fetch('/api/ceo/brokers')
      .then((r) => (r.ok ? r.json() : { brokers: [] }))
      .then((data) => setBrokers(data.brokers || []))
      .catch(() => setBrokers([]))
  }, [])

  const runMaintenance = async () => {
    setMaintBusy(true)
    setMaintResult(null)
    try {
      const res = await fetch('/api/ceo/maintenance', { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        console.error('Maintenance failed:', data)
        setMaintResult(ar ? 'الصيانة فشلت — حاول تاني.' : 'Failed')
      } else {
        const s = data.summary
        setMaintResult(
          ar
            ? `أكواد: ${s.backfilledCodes} · اتنبهوا بالقرب: ${s.expiringNotified} · اتنبهوا بالانتهاء: ${s.expiredNotified} · انتهوا تلقائي: ${s.autoExpired} · الخمول: ${s.inactivityNotified} · إيقاف تلقائي: ${s.autoSuspended ?? 0} · تذكير متابعة: ${s.followUpReminded ?? 0}`
            : `Codes: ${s.backfilledCodes} · Expiring notified: ${s.expiringNotified} · Expired notified: ${s.expiredNotified} · Auto-expired: ${s.autoExpired} · Inactivity: ${s.inactivityNotified} · Auto-suspended: ${s.autoSuspended ?? 0} · Follow-up reminded: ${s.followUpReminded ?? 0}`
        )
        load()
      }
    } catch (err) {
      console.error('Maintenance network error:', err)
      setMaintResult(ar ? 'مشكلة في الشبكة — حاول تاني.' : 'Network error')
    } finally {
      setMaintBusy(false)
    }
  }

  const panels: Array<{ key: Panel; label: string; labelAr: string; icon: any; accent: string }> = [
    { key: 'expiring', label: 'Expiring soon', labelAr: 'هيخلصوا قريب', icon: ShieldAlert, accent: 'text-amber-400' },
    { key: 'expired', label: 'Expired', labelAr: 'خلصوا', icon: ShieldOff, accent: 'text-red-400' },
    { key: 'duplicates', label: 'Duplicate review', labelAr: 'مراجعة التكرار', icon: AlertTriangle, accent: 'text-orange-400' },
  ]

  return (
    <div className="space-y-4">
      {/* Panel switch + maintenance */}
      <div className="flex flex-wrap items-center gap-2">
        {panels.map((p) => (
          <button
            key={p.key}
            onClick={() => setPanel(p.key)}
            className={cn(
              'flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition',
              panel === p.key
                ? 'border-estate-gold/40 bg-estate-gold/15 text-estate-gold'
                : 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-400 hover:bg-card dark:hover:bg-[#0A0A0A]'
            )}
          >
            <p.icon className={cn('h-4 w-4', panel === p.key ? '' : p.accent)} />
            {ar ? p.labelAr : p.label}
          </button>
        ))}
        <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            placeholder={ar ? 'دوّر بالكود / الاسم…' : 'Search code / name...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] py-2 pl-9 pr-3 text-sm text-gray-300 outline-none placeholder:text-muted-foreground"
          />
        </div>
        <Button variant="outline" size="sm" className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]" onClick={load}>
          <RefreshCw className="mr-1 h-4 w-4" />{ar ? 'حدّث' : 'Refresh'}
        </Button>
        <Button
          size="sm"
          className="ml-auto gold-shimmer bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold-dark"
          onClick={runMaintenance}
          disabled={maintBusy}
          title={ar ? 'شغّل المسّاح بتاع السيرفر دلوقتي' : 'Run server-side sweeper now'}
        >
          {maintBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Wrench className="mr-1 h-4 w-4" />}
          {ar ? 'شغّل الصيانة دلوقتي' : 'Run maintenance now'}
        </Button>
      </div>

      {maintResult && (
        <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-4 py-2.5 text-xs text-gray-400">
          {ar ? 'نتيجة المسح:' : 'Sweeper result:'} {maintResult}
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          <span>{error}</span>
          <Button variant="outline" size="sm" className="border-border dark:border-[#262626] text-gray-300" onClick={load}>{ar ? 'حاول تاني' : 'Retry'}</Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" /> {ar ? 'بيحمّل…' : 'Loading...'}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-black py-14 text-center">
          <Inbox className="mx-auto h-12 w-12 text-gray-700" />
          <p className="mt-3 text-sm text-gray-500">
            {panel === 'expiring' && (ar ? 'مفيش حاجة بتخلص في المدة المتظبطة.' : 'Nothing expiring in the configured window.')}
            {panel === 'expired' && (ar ? 'مفيش سجلات حماية خلصت.' : 'No expired protection records.')}
            {panel === 'duplicates' && (ar ? 'مفيش نزاعات ملكية مستنية المراجعة.' : 'No ownership disputes waiting for review.')}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-black">
          <table className="w-full text-sm">
            <thead className="border-b border-border dark:border-[#262626] text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">{ar ? 'الليد' : 'Lead'}</th>
                <th className="px-4 py-3">{ar ? 'البروكر المالك' : 'Owner broker'}</th>
                <th className="px-4 py-3">{ar ? 'المشروع' : 'Project'}</th>
                <th className="px-4 py-3">{ar ? 'الحماية' : 'Protection'}</th>
                <th className="px-4 py-3">{ar ? 'الحالة' : 'Status'}</th>
                <th className="px-4 py-3 text-right">{ar ? 'إجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border dark:divide-[#262626]">
              {rows.map((lead) => (
                <tr key={lead.id} className="transition hover:bg-white/[0.03]">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-200">{lead.name}</p>
                    <p className="text-xs text-gray-500">
                      {lead.leadCode && <span className="font-mono text-estate-gold">{lead.leadCode}</span>}
                      {lead.leadCode && ' · '}{ar ? 'متسجل' : 'registered'} {new Date(lead.createdAt).toLocaleDateString(ar ? 'ar-EG' : 'en-US')}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{lead.broker?.user?.name || (ar ? 'مش متوزع' : 'Unassigned')}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{lead.project?.name || '—'}</td>
                  <td className="px-4 py-3">
                    {lead.protectionStatus === 'PROTECTED' && (
                      <Badge className="border border-green-500/30 bg-green-500/10 text-green-400">
                        <Shield className="mr-1 h-3 w-3" />{ar ? 'محمي' : 'Protected'}
                      </Badge>
                    )}
                    {lead.protectionStatus === 'EXPIRING_SOON' && (
                      <Badge className="border border-amber-500/30 bg-amber-500/10 text-amber-400">
                        <ShieldAlert className="mr-1 h-3 w-3" />{ar ? 'بيخلص' : 'Expiring'}
                      </Badge>
                    )}
                    {lead.protectionStatus === 'EXPIRED' && (
                      <Badge className="border border-red-500/30 bg-red-500/10 text-red-400">
                        <ShieldOff className="mr-1 h-3 w-3" />{ar ? 'خلص' : 'Expired'}
                      </Badge>
                    )}
                    <p className="mt-1 text-xs text-gray-500">
                      {lead.protectionStartsAt && lead.protectionExpiresAt
                        ? `${new Date(lead.protectionStartsAt).toLocaleDateString(ar ? 'ar-EG' : 'en-US')} → ${new Date(lead.protectionExpiresAt).toLocaleDateString(ar ? 'ar-EG' : 'en-US')}`
                        : '—'}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className="border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-400">{statusLabel(lead.status, ar)}</Badge>
                    {lead.reviewStatus !== 'ACTIVE' && (
                      <Badge className="ml-1 border border-orange-500/30 bg-orange-500/10 text-orange-400">{ar && lead.reviewStatus === 'DUPLICATE_REVIEW' ? 'مراجعة تكرار' : lead.reviewStatus}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      {panel === 'duplicates' ? (
                        <button
                          onClick={() => setModal({ kind: 'resolve', lead })}
                          className="inline-flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-xs text-orange-400 hover:bg-orange-500/20"
                        >
                          <CheckCircle2 className="h-3 w-3" />{ar ? 'حلّها' : 'Resolve'}
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => setModal({ kind: 'extend', lead })}
                            className="inline-flex items-center gap-1 rounded-full border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-2 py-1 text-xs text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]"
                          >
                            <CalendarPlus className="h-3 w-3" />{ar ? 'مدّد' : 'Extend'}
                          </button>
                          <button
                            onClick={() => setModal({ kind: 'transfer', lead })}
                            className="inline-flex items-center gap-1 rounded-full border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-2 py-1 text-xs text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]"
                          >
                            <ArrowRightLeft className="h-3 w-3" />{ar ? 'انقل' : 'Transfer'}
                          </button>
                          <button
                            onClick={() => setModal({ kind: 'expire', lead })}
                            className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-400 hover:bg-red-500/20"
                          >
                            <CalendarX className="h-3 w-3" />{ar ? 'انهيها' : 'Expire'}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <ActionModal
          kind={modal.kind}
          lead={modal.lead}
          brokers={brokers}
          ar={ar}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); load() }}
        />
      )}
    </div>
  )
}

// ─── Action Modal ─────────────────────────────────────────
function ActionModal({
  kind, lead, brokers, ar, onClose, onDone,
}: {
  kind: 'extend' | 'expire' | 'transfer' | 'resolve'
  lead: LeadRow
  brokers: Array<{ id: string; user: { name: string | null } }>
  ar: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [days, setDays] = useState(90)
  const [brokerId, setBrokerId] = useState('')
  const [resolution, setResolution] = useState<'ORIGINAL_WINS' | 'CHALLENGER_WINS'>('ORIGINAL_WINS')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const titles = {
    extend: ar ? 'مدّد الحماية' : 'Extend protection',
    expire: ar ? 'انهي الحماية دلوقتي' : 'Expire protection now',
    transfer: ar ? 'انقل الملكية' : 'Transfer ownership',
    resolve: ar ? 'حل نزاع التكرار' : 'Resolve duplicate dispute',
  }

  const submit = async () => {
    setError(null)
    const body: Record<string, unknown> = { action: kind.toUpperCase(), leadId: lead.id, reason: reason || undefined }
    if (kind === 'extend') body.days = days
    if (kind === 'transfer') {
      if (!brokerId) { setError(ar ? 'اختار البروكر المالك الجديد' : 'Select the new owner broker'); return }
      body.toBrokerId = brokerId
    }
    if (kind === 'resolve') body.resolution = resolution

    setBusy(true)
    try {
      const res = await fetch('/api/ceo/leads/actions', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        console.error('Lead action failed:', data)
        setError(ar ? 'الحركة فشلت — حاول تاني.' : 'Action failed')
        return
      }
      onDone()
    } catch (err) {
      console.error('Lead action network error:', err)
      setError(ar ? 'مشكلة في الشبكة — حاول تاني.' : 'Network error')
    } finally {
      setBusy(false)
    }
  }

  const field = 'w-full rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-gray-300 outline-none'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl border border-border dark:border-[#262626] bg-card dark:bg-black p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <Shield className="h-5 w-5 text-estate-gold" />{titles[kind]}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <p className="mb-3 text-sm text-gray-400">
          <span className="font-mono text-estate-gold">{lead.leadCode || lead.id.slice(0, 8)}</span> — {lead.name}
          {' '}· {ar ? 'المالك:' : 'owner:'} {lead.broker?.user?.name || (ar ? 'مش متوزع' : 'Unassigned')}
        </p>

        <div className="space-y-3">
          {kind === 'extend' && (
            <div>
              <label className="mb-1 block text-xs text-gray-500">{ar ? 'أيام زيادة' : 'Extra days'}</label>
              <input type="number" min={1} max={730} className={field} value={days} onChange={(e) => setDays(Number(e.target.value))} />
            </div>
          )}

          {kind === 'transfer' && (
            <div>
              <label className="mb-1 block text-xs text-gray-500">{ar ? 'البروكر المالك الجديد' : 'New owner broker'}</label>
              <select className={field} value={brokerId} onChange={(e) => setBrokerId(e.target.value)}>
                <option value="">{ar ? '— اختار بروكر —' : '— Select broker —'}</option>
                {brokers.map((b) => <option key={b.id} value={b.id}>{b.user?.name || b.id}</option>)}
              </select>
            </div>
          )}

          {kind === 'resolve' && (
            <div>
              <label className="mb-1 block text-xs text-gray-500">{ar ? 'الحل' : 'Resolution'}</label>
              <select className={field} value={resolution} onChange={(e) => setResolution(e.target.value as any)}>
                <option value="ORIGINAL_WINS">{ar ? 'المسجل الأول يكسب (أول تسجيل بيحتفظ بالليد)' : 'Original registrant wins (first registration keeps lead)'}</option>
                <option value="CHALLENGER_WINS">{ar ? 'المعترض يكسب (الملكية بتتنقل للحايز الحالي)' : 'Challenger wins (ownership moves to current holder)'}</option>
              </select>
              <p className="mt-1 text-[11px] text-gray-500">
                {ar
                  ? 'الحماية بتتربط تاني بأقدم تاريخ تسجيل. البروكرز الاتنين بيتنبهوا؛ والقرار متسجل في التدقيق.'
                  : 'Protection is re-anchored to the earliest registration date. Both brokers are notified; decision is audit-logged.'}
              </p>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs text-gray-500">{ar ? 'السبب (سجل التدقيق)' : 'Reason (audit log)'}</label>
            <input className={field} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>

          {kind === 'expire' && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
              {ar
                ? `ده بيقفل نافذة الحماية فورًا لـ${lead.leadCode || lead.id.slice(0, 8)} وبينبّه البروكر المالك.`
                : `This immediately closes the protection window for ${lead.leadCode || lead.id.slice(0, 8)} and notifies the owner broker.`}
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" className="border-border dark:border-[#262626] text-gray-300" onClick={onClose} disabled={busy}>
              <X className="mr-1 h-4 w-4" />{ar ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button size="sm" className="gold-shimmer bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold-dark" onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
              {ar ? 'أكّد' : 'Confirm'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
