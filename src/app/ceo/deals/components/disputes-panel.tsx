'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Scale, Loader2, RefreshCw, Plus, X, CheckCircle2, AlertTriangle, Inbox,
  FileWarning,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatEGP, cn } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import { statusLabel } from '@/components/ceo/ceo-charts'

/* ─── Deal-attribution disputes ────────────────────────────
   GET /api/ceo/disputes → { disputes: [{ id, dealId, dealValue, dealStatus,
     currentBroker, project, lead, claimant, reason, evidence, status,
     resolution, createdAt, updatedAt, ... }] }
   POST ← { dealId, claimantId?, reason, evidence? }
     (CEO files on a broker's behalf → claimantId is the claimant's USER id)
   PATCH ← { id, decision: 'APPROVED'|'REJECTED', resolution? } */

interface Dispute {
  id: string
  dealId: string
  dealValue: number | null
  dealStatus: string
  currentBroker: { brokerId: string; name: string; email: string } | null
  project: { id: string; name: string } | null
  lead: { id: string; leadCode: string | null; name: string } | null
  claimant: { id: string; name: string; email: string } | null
  reason: string
  evidence: string | null
  status: string
  resolution: string | null
  createdAt: string
  updatedAt: string
}

interface DealOpt {
  id: string
  dealValue: number | null
  status: string
  lead?: { id: string; leadCode: string | null; name: string } | null
}

interface BrokerOpt {
  id: string
  userId?: string
  user?: { id?: string; name?: string | null; email?: string | null } | null
}

const STATUS_CLS: Record<string, string> = {
  OPEN: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  APPROVED: 'border-green-500/30 bg-green-500/10 text-green-400',
  REJECTED: 'border-gray-500/30 bg-gray-500/10 text-gray-400',
}

export default function DisputesPanel() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [rows, setRows] = useState<Dispute[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showFile, setShowFile] = useState(false)
  const [resolving, setResolving] = useState<Dispute | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch('/api/ceo/disputes')
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || 'Failed')
        return r.json()
      })
      .then((data) => setRows(data.disputes || []))
      .catch((e) => {
        console.error('Failed to load disputes:', e)
        setError(ar ? 'معرفناش نجيب النزاعات — حاول تاني.' : 'Failed to load disputes')
      })
      .finally(() => setLoading(false))
  }, [ar])

  useEffect(() => {
    load()
  }, [load])

  const openCount = rows.filter((d) => d.status === 'OPEN').length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-gray-400">
          {openCount > 0
            ? (ar ? `${openCount} نزاع مفتوح` : `${openCount} open dispute(s)`)
            : (ar ? 'مفيش نزاعات مفتوحة' : 'No open disputes')}
        </p>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]" onClick={load}>
            <RefreshCw className="mr-1 h-4 w-4" />{ar ? 'حدّث' : 'Refresh'}
          </Button>
          <Button size="sm" className="gold-shimmer bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold-dark" onClick={() => setShowFile(true)}>
            <Plus className="mr-1 h-4 w-4" />{ar ? 'سجّل نزاع' : 'File dispute'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          <span>{error}</span>
          <Button variant="outline" size="sm" className="border-border dark:border-[#262626] text-gray-300" onClick={load}>{ar ? 'حاول تاني' : 'Retry'}</Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" /> {ar ? 'بيحمّل النزاعات…' : 'Loading disputes...'}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-black py-14 text-center">
          <Inbox className="mx-auto h-12 w-12 text-gray-700" />
          <p className="mt-3 text-sm text-gray-500">{ar ? 'مفيش نزاعات.' : 'No disputes.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((d) => (
            <div key={d.id} className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-black p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Scale className="h-4 w-4 text-estate-gold" />
                <p className="text-sm font-semibold text-foreground">
                  {d.lead?.leadCode && <span className="mr-1 font-mono text-xs text-estate-gold">{d.lead.leadCode}</span>}
                  {d.lead?.name || (ar ? 'صفقة' : 'Deal')} {d.dealId.slice(0, 8)}
                </p>
                <Badge className={cn('border', STATUS_CLS[d.status] || 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-400')}>
                  {ar ? (d.status === 'OPEN' ? 'مفتوح' : d.status === 'APPROVED' ? 'اتقبل' : d.status === 'REJECTED' ? 'اترفض' : d.status) : d.status}
                </Badge>
                <span className="ml-auto text-sm font-semibold text-foreground">
                  {d.dealValue != null ? formatEGP(d.dealValue) : '—'}
                </span>
              </div>

              <div className="mt-2 grid gap-2 text-xs text-gray-400 sm:grid-cols-3">
                <p>{ar ? 'حالة الصفقة:' : 'Deal stage:'} <span className="text-gray-300">{statusLabel(d.dealStatus, ar)}</span></p>
                <p>{ar ? 'البروكر الحالي:' : 'Current broker:'} <span className="text-gray-300">{d.currentBroker?.name || '—'}</span></p>
                <p>{ar ? 'المشروع:' : 'Project:'} <span className="text-gray-300">{d.project?.name || '—'}</span></p>
                <p>{ar ? 'المطالِب:' : 'Claimant:'} <span className="text-gray-300">{d.claimant ? `${d.claimant.name} (${d.claimant.email})` : '—'}</span></p>
                <p>{ar ? 'اتفتح:' : 'Opened:'} <span className="text-gray-300">{new Date(d.createdAt).toLocaleDateString(ar ? 'ar-EG' : 'en-US')}</span></p>
              </div>

              <div className="mt-2 rounded-xl border border-border dark:border-[#262626] bg-white/[0.02] p-2.5 text-sm text-gray-300">
                <p className="flex items-start gap-2">
                  <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  {d.reason}
                </p>
                {d.evidence && <p className="mt-1 pl-6 text-xs text-gray-500">{ar ? 'الدليل:' : 'Evidence:'} {d.evidence}</p>}
                {d.resolution && (
                  <p className="mt-1 pl-6 text-xs text-green-400">{ar ? 'الحل:' : 'Resolution:'} {d.resolution}</p>
                )}
              </div>

              {d.status === 'OPEN' && (
                <div className="mt-2 flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-estate-gold/30 bg-estate-gold/10 text-estate-gold hover:bg-estate-gold/20"
                    onClick={() => setResolving(d)}
                  >
                    <Scale className="mr-1 h-4 w-4" />{ar ? 'احسم النزاع' : 'Resolve'}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showFile && (
        <FileDisputeModal
          ar={ar}
          onClose={() => setShowFile(false)}
          onFiled={() => {
            setShowFile(false)
            load()
          }}
        />
      )}

      {resolving && (
        <ResolveModal
          dispute={resolving}
          ar={ar}
          onClose={() => setResolving(null)}
          onDone={() => {
            setResolving(null)
            load()
          }}
        />
      )}
    </div>
  )
}

/* ─── File a dispute (POST /api/ceo/disputes) ───────────── */

function FileDisputeModal({ ar, onClose, onFiled }: { ar: boolean; onClose: () => void; onFiled: () => void }) {
  const [deals, setDeals] = useState<DealOpt[] | null>(null)
  const [brokers, setBrokers] = useState<BrokerOpt[] | null>(null)
  const [dealId, setDealId] = useState('')
  const [claimantId, setClaimantId] = useState('')
  const [reason, setReason] = useState('')
  const [evidence, setEvidence] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/deals').then((r) => (r.ok ? r.json() : { deals: [] })).catch(() => ({ deals: [] })),
      fetch('/api/ceo/brokers').then((r) => (r.ok ? r.json() : { brokers: [] })).catch(() => ({ brokers: [] })),
    ]).then(([d, b]) => {
      if (cancelled) return
      setDeals(d.deals || [])
      setBrokers(b.brokers || [])
    })
    return () => {
      cancelled = true
    }
  }, [])

  const field = 'w-full rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-gray-300 outline-none'

  const submit = async () => {
    const errs: string[] = []
    if (!dealId) errs.push(ar ? 'اختار الصفقة المتنازع عليها.' : 'Pick the disputed deal.')
    if (!claimantId) errs.push(ar ? 'اختار البروكر المطالِب.' : 'Pick the claiming broker.')
    if (!reason.trim()) errs.push(ar ? 'اكتب سبب النزاع.' : 'Write the dispute reason.')
    if (reason.length > 2000) errs.push(ar ? 'السبب طويل أوي (آخره ٢٠٠٠ حرف).' : 'Reason is too long (max 2000 characters).')
    if (evidence.length > 4000) errs.push(ar ? 'الدليل طويل أوي (آخره ٤٠٠٠ حرف).' : 'Evidence is too long (max 4000 characters).')
    setErrors(errs)
    if (errs.length > 0) return
    setSaving(true)
    try {
      const res = await fetch('/api/ceo/disputes', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId, claimantId, reason: reason.trim(), evidence: evidence.trim() || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to file dispute')
      onFiled()
    } catch (err) {
      console.error('Failed to file dispute:', err)
      setErrors([ar ? `معرفناش نسجّل النزاع — ${err instanceof Error ? err.message : 'حاول تاني.'}` : `Could not file the dispute — ${err instanceof Error ? err.message : 'try again.'}`])
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4" onClick={onClose}>
      <div className="my-8 w-full max-w-lg rounded-3xl border border-border dark:border-[#262626] bg-card dark:bg-black p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <Scale className="h-5 w-5 text-estate-gold" />{ar ? 'سجّل نزاع على صفقة' : 'File a deal dispute'}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-foreground" aria-label={ar ? 'اقفل' : 'Close'}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          {errors.length > 0 && (
            <div className="flex items-start gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <ul className="list-disc space-y-0.5 pl-5">
                {errors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs text-gray-500">{ar ? 'الصفقة *' : 'Deal *'}</label>
            <select className={field} value={dealId} onChange={(e) => setDealId(e.target.value)}>
              <option value="">{deals === null ? (ar ? 'بيحمّل…' : 'Loading…') : (ar ? 'اختار صفقة…' : 'Select deal…')}</option>
              {(deals || []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.lead?.leadCode || d.id.slice(0, 8)} · {d.lead?.name || ''} · {d.dealValue != null ? formatEGP(d.dealValue) : '—'} · {statusLabel(d.status, ar)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">{ar ? 'البروكر المطالِب *' : 'Claiming broker *'}</label>
            <select className={field} value={claimantId} onChange={(e) => setClaimantId(e.target.value)}>
              <option value="">{brokers === null ? (ar ? 'بيحمّل…' : 'Loading…') : (ar ? 'اختار بروكر…' : 'Select broker…')}</option>
              {(brokers || []).map((b) => (
                <option key={b.id} value={b.userId || b.user?.id || b.id}>
                  {b.user?.name || b.user?.email || b.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">{ar ? 'السبب *' : 'Reason *'}</label>
            <textarea rows={3} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} className={field} placeholder={ar ? 'ليه البروكر ده شايف الصفقة بتاعته؟' : 'Why does this broker claim the deal?'} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">{ar ? 'الدليل (اختياري)' : 'Evidence (optional)'}</label>
            <textarea rows={2} maxLength={4000} value={evidence} onChange={(e) => setEvidence(e.target.value)} className={field} placeholder={ar ? 'أي تفاصيل تدعم المطالبة…' : 'Anything backing the claim…'} />
          </div>
          <p className="text-xs text-gray-500">
            {ar ? 'التسجيل بيجمّد العمولات المستنية على الصفقة لحد الحسم.' : 'Filing freezes the deal’s pending commissions until resolved.'}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" className="border-border dark:border-[#262626] text-gray-300" onClick={onClose} disabled={saving}>
              <X className="mr-1 h-4 w-4" />{ar ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button size="sm" className="gold-shimmer bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold-dark" onClick={submit} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}{ar ? 'سجّل النزاع' : 'File dispute'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Resolve a dispute (PATCH decision) ─────────────────── */

function ResolveModal({ dispute, ar, onClose, onDone }: { dispute: Dispute; ar: boolean; onClose: () => void; onDone: () => void }) {
  const [resolution, setResolution] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const decide = async (decision: 'APPROVED' | 'REJECTED') => {
    const ok = window.confirm(
      decision === 'APPROVED'
        ? (ar
          ? `تقبل مطالبة ${dispute.claimant?.name || ''} وتنقل الصفقة ${formatEGP(dispute.dealValue || 0)} ليه؟ العمولة هتتحسب من جديد.`
          : `Approve ${dispute.claimant?.name || ''}'s claim and move the ${formatEGP(dispute.dealValue || 0)} deal to them? Commission will be recomputed.`)
        : (ar ? 'ترفض المطالبة دي وترجّع العمولات لوضعها؟' : 'Reject this claim and restore commissions?')
    )
    if (!ok) return
    if (resolution.length > 2000) {
      setError(ar ? 'الحل طويل أوي (آخره ٢٠٠٠ حرف).' : 'Resolution is too long (max 2000 characters).')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/ceo/disputes', {
        method: 'PATCH',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: dispute.id, decision, resolution: resolution.trim() || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to resolve dispute')
      onDone()
    } catch (err) {
      console.error('Failed to resolve dispute:', err)
      setError(ar ? 'معرفناش نحسم النزاع — حاول تاني.' : 'Failed to resolve dispute')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl border border-border dark:border-[#262626] bg-card dark:bg-black p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <Scale className="h-5 w-5 text-estate-gold" />{ar ? 'احسم النزاع' : 'Resolve dispute'}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <p className="text-sm text-gray-400">
          {dispute.lead?.leadCode && <span className="font-mono text-estate-gold">{dispute.lead.leadCode}</span>}{' '}
          {dispute.lead?.name} · {dispute.dealValue != null ? formatEGP(dispute.dealValue) : '—'}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {ar ? 'القبول بينقل الصفقة للمطالِب وبيعيد حساب العمولة. الرفض بيرجّع العمولات لوضعها.' : 'Approving moves the deal to the claimant and recomputes commission. Rejecting restores commissions.'}
        </p>
        <label className="mt-3 block text-xs text-gray-500">{ar ? 'الحل / ملاحظة (بتتخزن في التدقيق)' : 'Resolution / note (stored in audit log)'}</label>
        <textarea
          className="mt-1 w-full rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-gray-300 outline-none"
          rows={2}
          maxLength={2000}
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          placeholder={ar ? 'اكتب الحل…' : 'Write the resolution…'}
        />
        {error && <div className="mt-2 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" className="border-border dark:border-[#262626] text-gray-300" onClick={onClose} disabled={busy}>
            <X className="mr-1 h-4 w-4" />{ar ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button size="sm" variant="outline" className="border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20" onClick={() => decide('REJECTED')} disabled={busy}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <X className="mr-1 h-4 w-4" />}{ar ? 'ارفض' : 'Reject'}
          </Button>
          <Button size="sm" className="bg-green-600 text-white hover:bg-green-700" onClick={() => decide('APPROVED')} disabled={busy}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}{ar ? 'اقبل' : 'Approve'}
          </Button>
        </div>
      </div>
    </div>
  )
}
