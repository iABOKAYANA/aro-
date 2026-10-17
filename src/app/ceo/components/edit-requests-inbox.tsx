'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import {
  ceoApi,
  Toast,
  type ToastState,
  ConfirmDialog,
  StatusPill,
  InlineNote,
} from './manager-ui'
import {
  CheckCircle,
  XCircle,
  ExternalLink,
  Inbox,
  ArrowLeft,
  ArrowRight,
  User,
} from 'lucide-react'

/* ─── Types (mirror GET /api/ceo/edit-requests exactly) ─── */

interface EditRequest {
  id: string
  entity: string
  entityId: string
  field: string
  oldValue?: string | null
  newValue: string
  message?: string | null
  status: string
  reason?: string | null
  developer?: {
    id: string
    name: string
    email: string
    profileId: string | null
    companyName: string | null
  } | null
  project?: { id: string; name: string } | null
  unit?: { id: string; name: string }
  plan?: { id: string; name: string }
  createdAt: string
}

const FILTERS = ['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const

const FILTER_AR: Record<string, string> = {
  PENDING: 'مستني',
  APPROVED: 'اتوافق عليه',
  REJECTED: 'مرفوض',
  ALL: 'الكل',
}

/** Best-effort pretty print: stored values are strings (JSON for arrays). */
function fmtVal(field: string, val: string | null | undefined): string {
  if (val === null || val === undefined || val === '') return '—'
  const t = val.trim()
  if ((t.startsWith('[') || t.startsWith('{')) && (t.endsWith(']') || t.endsWith('}'))) {
    try {
      const p = JSON.parse(t) as unknown
      if (Array.isArray(p)) return p.map((x) => String(x)).join('، ') || '—'
      return JSON.stringify(p)
    } catch {
      return val
    }
  }
  if (/price|area|amount|payment|year|percent|count|number/i.test(field) && !Number.isNaN(Number(t))) {
    return Number(t).toLocaleString()
  }
  return val
}

const ENTITY_AR: Record<string, string> = {
  PROJECT: 'مشروع',
  UNIT: 'وحدة',
  PLAN: 'خطة سداد',
}

export function usePendingEditCount(): number | null {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    ceoApi<{ requests: EditRequest[] }>('/api/ceo/edit-requests?status=PENDING')
      .then((d) => {
        if (!cancelled) setCount((d.requests || []).length)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  return count
}

export default function EditRequestsInbox() {
  const router = useRouter()
  const { lang, dir } = useLanguage()
  const ar = lang === 'ar'

  const [filter, setFilter] = useState<string>('PENDING')
  const [requests, setRequests] = useState<EditRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ id: string } | null>(null)
  const [reject, setReject] = useState<{ id: string; reason: string } | null>(null)

  const fetchRequests = useCallback(
    async (f: string, silent = false) => {
      if (!silent) setLoading(true)
      setError(null)
      try {
        const q = f === 'ALL' ? '' : `?status=${f}`
        const data = await ceoApi<{ requests: EditRequest[] }>(`/api/ceo/edit-requests${q}`)
        setRequests(data.requests || [])
      } catch (e) {
        setError(e instanceof Error ? e.message : ar ? 'معرفناش نجيب الطلبات.' : 'Failed to load requests.')
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [ar]
  )

  useEffect(() => {
    fetchRequests(filter)
  }, [filter, fetchRequests])

  const decide = async (id: string, decision: 'APPROVED' | 'REJECTED', reason?: string) => {
    setBusy(id)
    try {
      const body: Record<string, unknown> = { id, decision }
      if (reason?.trim()) body.reason = reason.trim()
      await ceoApi('/api/ceo/edit-requests', 'PATCH', body)
      await fetchRequests(filter, true)
      setToast({
        tone: 'ok',
        msg:
          decision === 'APPROVED'
            ? ar
              ? 'اتوافق على الطلب واتطبق التعديل واتبلّغ المطوّر.'
              : 'Request approved, change applied, developer notified.'
            : ar
              ? 'اترفض الطلب واتبلّغ المطوّر بالسبب.'
              : 'Request rejected, developer notified with the reason.',
      })
    } catch (e) {
      setToast({
        tone: 'err',
        msg: e instanceof Error ? e.message : ar ? 'القرار منفعش.' : 'Decision failed.',
      })
    } finally {
      setBusy(null)
      setConfirm(null)
      setReject(null)
    }
  }

  return (
    <div className="space-y-4">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              filter === f
                ? 'bg-[#D4A843] text-black'
                : 'border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-400 hover:text-foreground'
            )}
          >
            {ar ? FILTER_AR[f] : f}
            {f === 'PENDING' && filter !== 'PENDING' ? '' : ''}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-500">
        {ar ? `${requests.length} طلب` : `${requests.length} request(s)`}
      </p>

      {error && (
        <InlineNote tone="err">
          {error}{' '}
          <button onClick={() => fetchRequests(filter)} className="underline">
            {ar ? 'حاول تاني' : 'Retry'}
          </button>
        </InlineNote>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#D4A843] border-t-transparent" />
        </div>
      ) : requests.length === 0 ? (
        <Card className="border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A]">
          <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
            <Inbox size={36} className="text-gray-600" />
            <p className="text-sm text-gray-400">
              {filter === 'PENDING'
                ? ar
                  ? 'مفيش طلبات تعديل مستنية — كله متنضّف.'
                  : 'No pending edit requests — all clear.'
                : ar
                  ? 'مفيش طلبات في الحالة دي.'
                  : 'No requests in this state.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => {
            const decidable = r.status === 'PENDING'
            const sub = r.entity === 'UNIT' ? r.unit?.name : r.entity === 'PLAN' ? r.plan?.name : null
            return (
              <Card
                key={r.id}
                className="border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A]"
              >
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill
                      tone={r.status === 'PENDING' ? 'yellow' : r.status === 'APPROVED' ? 'green' : 'red'}
                    >
                      {ar
                        ? FILTER_AR[r.status] || r.status
                        : r.status}
                    </StatusPill>
                    <span className="rounded-full border border-border dark:border-[#262626] px-2 py-0.5 text-[11px] text-gray-400">
                      {ar ? ENTITY_AR[r.entity] || r.entity : r.entity}
                      {' · '}
                      <span className="font-mono">{r.field}</span>
                    </span>
                    <span className="ml-auto text-[11px] text-gray-600">
                      {new Date(r.createdAt).toLocaleString(ar ? 'ar-EG' : undefined)}
                    </span>
                  </div>

                  {/* Linked entity context — project at minimum */}
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {r.project ? (
                      <button
                        onClick={() => router.push(`/ceo/projects/${r.project!.id}`)}
                        className="inline-flex items-center gap-1 font-medium text-foreground hover:text-[#D4A843]"
                      >
                        <span dir="auto">{r.project.name}</span>
                        <ExternalLink size={13} className="text-[#D4A843]" />
                      </button>
                    ) : (
                      <span className="text-xs text-gray-600">
                        {ar ? 'الكيان المرتبط اتمسح' : 'Linked entity no longer exists'}
                      </span>
                    )}
                    {sub && <span className="text-xs text-gray-500">/ <span dir="auto">{sub}</span></span>}
                  </div>

                  {/* Old → new diff */}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-stretch">
                    <div className="rounded-xl border border-red-500/25 bg-red-500/5 px-3 py-2">
                      <p className="mb-0.5 text-[10px] uppercase tracking-wider text-red-300/70">
                        {ar ? 'القديم' : 'Old'}
                      </p>
                      <p dir="auto" className="whitespace-pre-wrap break-words text-sm text-red-200 line-clamp-4">
                        {fmtVal(r.field, r.oldValue)}
                      </p>
                    </div>
                    <div className="hidden items-center sm:flex" aria-hidden>
                      {dir === 'rtl' ? <ArrowLeft size={16} className="text-gray-600" /> : <ArrowRight size={16} className="text-gray-600" />}
                    </div>
                    <div className="rounded-xl border border-green-500/25 bg-green-500/5 px-3 py-2">
                      <p className="mb-0.5 text-[10px] uppercase tracking-wider text-green-300/70">
                        {ar ? 'الجديد' : 'New'}
                      </p>
                      <p dir="auto" className="whitespace-pre-wrap break-words text-sm text-green-100 line-clamp-4">
                        {fmtVal(r.field, r.newValue)}
                      </p>
                    </div>
                  </div>

                  {/* Requester + message */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                    <span className="inline-flex items-center gap-1">
                      <User size={12} />
                      {r.developer
                        ? `${r.developer.companyName || r.developer.name} (${r.developer.email})`
                        : ar
                          ? 'مطوّر مش معروف'
                          : 'Unknown developer'}
                    </span>
                  </div>
                  {r.message && (
                    <p dir="auto" className="rounded-xl bg-white/[0.03] px-3 py-2 text-xs leading-relaxed text-gray-300">
                      {r.message}
                    </p>
                  )}
                  {!decidable && r.reason && (
                    <p dir="auto" className="text-xs text-gray-500">
                      <span className="text-gray-600">{ar ? 'سبب القرار: ' : 'Decision reason: '}</span>
                      {r.reason}
                    </p>
                  )}

                  {decidable && (
                    <div className="flex flex-wrap gap-2 border-t border-border dark:border-[#262626] pt-3">
                      <Button
                        disabled={busy === r.id}
                        onClick={() => setConfirm({ id: r.id })}
                        className="bg-green-500 text-white hover:bg-green-600 disabled:opacity-50"
                      >
                        <CheckCircle size={15} className="mr-1.5" />
                        {ar ? 'وافق وطبّق' : 'Approve & apply'}
                      </Button>
                      <Button
                        disabled={busy === r.id}
                        onClick={() => setReject({ id: r.id, reason: '' })}
                        variant="outline"
                        className="border-red-500/40 text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                      >
                        <XCircle size={15} className="mr-1.5" />
                        {ar ? 'ارفض' : 'Reject'}
                      </Button>
                      {busy === r.id && (
                        <span className="ml-auto self-center text-xs text-gray-500">
                          {ar ? 'بيتنفذ…' : 'Working…'}
                        </span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Approve confirm — applies the change to the live entity */}
      <ConfirmDialog
        open={!!confirm}
        title={ar ? 'وافق وطبّق التعديل' : 'Approve & apply change'}
        tone="primary"
        confirmLabel={ar ? 'وافق وطبّق' : 'Approve & apply'}
        busy={!!confirm && busy === confirm.id}
        message={
          ar
            ? 'الموافقة هتكتب القيمة الجديدة على الكيان اللايف فورًا، وهتتسجل في التدقيق وهيتبلّغ المطوّر.'
            : 'Approval writes the new value onto the live entity immediately, audits it, and notifies the developer.'
        }
        onConfirm={() => confirm && decide(confirm.id, 'APPROVED')}
        onCancel={() => setConfirm(null)}
      />

      {/* Reject — reason stored + sent to the developer */}
      {reject && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4" onClick={() => setReject(null)}>
          <Card className="w-full max-w-md border border-border dark:border-[#262626] bg-card dark:bg-black" onClick={(e) => e.stopPropagation()}>
            <CardContent className="space-y-4 p-6">
              <h3 className="font-semibold text-foreground">{ar ? 'ارفض الطلب' : 'Reject request'}</h3>
              <textarea
                autoFocus
                placeholder={ar ? 'سبب الرفض (هيوصل للمطوّر)' : 'Reason (sent to the developer)'}
                value={reject.reason}
                onChange={(e) => setReject((r) => (r ? { ...r, reason: e.target.value } : null))}
                className="h-24 w-full resize-none rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-black px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-[#D4A843]/50"
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setReject(null)}
                  className="border-border dark:border-[#262626] text-gray-300"
                >
                  {ar ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button
                  disabled={busy === reject.id}
                  onClick={() => decide(reject.id, 'REJECTED', reject.reason)}
                  className="bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                >
                  {ar ? 'ارفض' : 'Reject'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
