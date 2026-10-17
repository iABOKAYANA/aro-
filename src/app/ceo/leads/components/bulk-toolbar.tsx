'use client'

import { useState } from 'react'
import { Loader2, AlertTriangle, CheckCircle2, X, Trash2, UserPlus, ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/lib/language-context'

/* ─── Bulk lead actions ────────────────────────────────────
   POST /api/ceo/leads/bulk ← { ids[], action: 'assign'|'status'|'delete',
     brokerId?, status?, reason? } → { updated, failed: [{ id, error }] } */

interface BrokerLite {
  id: string
  user?: { name?: string | null; email?: string | null } | null
}

const BULK_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'VIEWING', 'INTERESTED', 'RESERVATION', 'CONTRACT', 'SOLD', 'LOST']

export default function BulkToolbar({
  selectedIds,
  brokers,
  onDone,
  onClear,
}: {
  selectedIds: string[]
  brokers: BrokerLite[]
  onDone: () => void
  onClear: () => void
}) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [action, setAction] = useState<'assign' | 'status' | 'delete'>('assign')
  const [brokerId, setBrokerId] = useState('')
  const [status, setStatus] = useState('CONTACTED')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ updated: number; failed: Array<{ id: string; error: string }> } | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (selectedIds.length === 0) return null

  const field = 'rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-1.5 text-sm text-gray-300 outline-none'

  const apply = async () => {
    setError(null)
    setResult(null)
    if (action === 'assign' && !brokerId) {
      setError(ar ? 'اختار البروكر اللي الليدز هتتوزع عليه.' : 'Pick the broker to assign the leads to.')
      return
    }
    if (action === 'delete') {
      const ok = window.confirm(
        ar
          ? `امسح ${selectedIds.length} ليد نهائيًا؟ الليدز اللي عليها صفقات مش هتتمسح. الحركة دي مبتترجعش.`
          : `Permanently delete ${selectedIds.length} lead(s)? Leads with linked deals are skipped. This cannot be undone.`
      )
      if (!ok) return
    }
    setBusy(true)
    try {
      const body: Record<string, unknown> = { ids: selectedIds, action }
      if (action === 'assign') body.brokerId = brokerId
      if (action === 'status') body.status = status
      if (reason.trim()) body.reason = reason.trim()
      const res = await fetch('/api/ceo/leads/bulk', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Bulk action failed')
      setResult({ updated: data.updated || 0, failed: data.failed || [] })
      onDone()
    } catch (err) {
      console.error('Bulk action failed:', err)
      setError(ar ? 'الحركة الجماعية فشلت — حاول تاني.' : 'Bulk action failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border border-estate-gold/30 bg-estate-gold/[0.06] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-estate-gold/15 px-2.5 py-1 text-xs font-semibold text-estate-gold">
          {ar ? `${selectedIds.length} متعلّم عليهم` : `${selectedIds.length} selected`}
        </span>
        <select className={field} value={action} onChange={(e) => setAction(e.target.value as typeof action)}>
          <option value="assign">{ar ? 'وزّع على بروكر' : 'Assign to broker'}</option>
          <option value="status">{ar ? 'غيّر الحالة' : 'Change status'}</option>
          <option value="delete">{ar ? 'امسح' : 'Delete'}</option>
        </select>
        {action === 'assign' && (
          <select className={field} value={brokerId} onChange={(e) => setBrokerId(e.target.value)}>
            <option value="">{ar ? 'اختار بروكر…' : 'Select broker…'}</option>
            {brokers.map((b) => (
              <option key={b.id} value={b.id}>{b.user?.name || b.user?.email || b.id.slice(0, 8)}</option>
            ))}
          </select>
        )}
        {action === 'status' && (
          <select className={field} value={status} onChange={(e) => setStatus(e.target.value)}>
            {BULK_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={ar ? 'السبب (للتدقيق، اختياري)' : 'Reason (audit, optional)'}
          className={`${field} min-w-[160px] flex-1`}
        />
        <Button
          size="sm"
          onClick={apply}
          disabled={busy}
          className={action === 'delete' ? 'bg-red-600 text-white hover:bg-red-700' : 'gold-shimmer bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold/90'}
        >
          {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : action === 'delete' ? <Trash2 className="mr-1 h-4 w-4" /> : action === 'assign' ? <UserPlus className="mr-1 h-4 w-4" /> : <ArrowUpDown className="mr-1 h-4 w-4" />}
          {ar ? 'نفّذ' : 'Apply'}
        </Button>
        <button onClick={onClear} className="rounded-full p-1.5 text-gray-500 hover:text-foreground" title={ar ? 'شيل التحديد' : 'Clear selection'}>
          <X className="h-4 w-4" />
        </button>
      </div>

      {error && (
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-2.5 text-sm text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}
      {result && (
        <div className="mt-2 rounded-xl border border-green-500/30 bg-green-500/10 p-2.5 text-sm">
          <p className="flex items-center gap-2 text-green-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {ar ? `اتنفّذ على ${result.updated} ليد` : `Applied to ${result.updated} lead(s)`}
            {result.failed.length > 0 && (
              <span className="text-amber-400">{ar ? `· ${result.failed.length} فشلوا` : `· ${result.failed.length} failed`}</span>
            )}
          </p>
          {result.failed.length > 0 && (
            <ul className="mt-1 max-h-24 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-amber-300">
              {result.failed.map((f) => <li key={f.id}>{f.id.slice(0, 8)} — {f.error}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
