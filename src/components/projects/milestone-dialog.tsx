'use client'

import { useState, useEffect } from 'react'
import { Clock, Loader2, Plus, CheckCircle2, XCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useLanguage } from '@/lib/language-context'

// ─── PROJECT TIMELINE (Feature 8) ─────────────────────────────
// Developers view/submit milestones for their projects (they go to
// PENDING until a CEO/ADMIN approves them). Public pages only ever
// show APPROVED milestones. Uses the app's overlay-modal pattern.

interface Milestone {
  id: string
  type: string
  title: string
  titleArabic: string | null
  description: string | null
  date: string | null
  status: string
  progressPercent: number | null
  approvalStatus: string
  rejectionReason: string | null
}

const TYPES = ['LAUNCH', 'CONSTRUCTION', 'PROGRESS', 'DELIVERY', 'HANDOVER', 'CUSTOM']
const STATUSES = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'DELAYED']

const APPROVAL_TONE: Record<string, string> = {
  APPROVED: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300',
  REJECTED: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300',
}

const TYPE_LABEL_AR: Record<string, string> = {
  LAUNCH: 'إطلاق',
  CONSTRUCTION: 'إنشاءات',
  PROGRESS: 'تقدم',
  DELIVERY: 'تسليم',
  HANDOVER: 'استلام',
  CUSTOM: 'أخرى',
}

const STATUS_LABEL_AR: Record<string, string> = {
  PLANNED: 'مخططة',
  IN_PROGRESS: 'شغالة',
  COMPLETED: 'خلصت',
  DELAYED: 'متأخرة',
}

const APPROVAL_LABEL_AR: Record<string, string> = {
  APPROVED: 'معتمدة',
  PENDING: 'مستنية المراجعة',
  REJECTED: 'مرفوضة',
}

export function MilestoneDialog({ projectId, projectName }: { projectId: string; projectName: string }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [open, setOpen] = useState(false)
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [type, setType] = useState('CONSTRUCTION')
  const [status, setStatus] = useState('PLANNED')
  const [date, setDate] = useState('')
  const [description, setDescription] = useState('')
  const [progress, setProgress] = useState('')

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    fetch(`/api/milestones?projectId=${projectId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load timeline'))))
      .then((d) => setMilestones(d.milestones || []))
      .catch((e) => {
        console.error('Milestones load failed:', e)
        setError(ar ? 'معرفناش نجيب الجدول الزمني — جرب تاني.' : 'Could not load the timeline — try again.')
      })
      .finally(() => setLoading(false))
  }, [open, projectId, ar])

  const submit = async () => {
    setError(null)
    setMsg(null)
    if (!title.trim()) {
      setError(ar ? 'العنوان مطلوب' : 'Title is required')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/milestones', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          title: title.trim(),
          type,
          status,
          date: date || null,
          description: description.trim() || null,
          progressPercent: progress === '' ? null : Number(progress),
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed to submit')
      setMilestones((prev) => [...prev, d.milestone])
      setTitle('')
      setDescription('')
      setDate('')
      setProgress('')
      setMsg(
        d.milestone.approvalStatus === 'PENDING'
          ? (ar ? 'المرحلة اتبعتت — هتظهر للكل بعد ما EstateAI تعتمدها.' : 'Milestone submitted — it will appear publicly after EstateAI approval.')
          : (ar ? 'المرحلة اتنشرت.' : 'Milestone published.'),
      )
    } catch (e) {
      console.error('Milestone submit failed:', e)
      setError(ar ? 'معرفناش نبعت المرحلة — جرب تاني.' : 'Could not submit the milestone — try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Clock className="mr-1 h-4 w-4" /> {ar ? 'الجدول الزمني' : 'Timeline'}
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Project timeline — ${projectName}`}
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-background p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display display-3">{ar ? `الجدول الزمني — ${projectName}` : `Project Timeline — ${projectName}`}</h2>
                <p className="text-sm text-muted-foreground">
                  {ar
                    ? 'ابعت مراحل الإنشاء والتسليم. أي حاجة بتتبعت بتتراجع قبل ما تظهر للكل.'
                    : 'Submit construction/delivery milestones. Submissions are reviewed before they appear publicly.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              {error && <div className="rounded-2xl bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-300">{error}</div>}
              {msg && (
                <div className="flex items-center gap-2 rounded-2xl bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
                  <CheckCircle2 className="h-4 w-4 shrink-0" /> {msg}
                </div>
              )}

              {loading ? (
                <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> {ar ? 'بيحمل...' : 'Loading…'}
                </div>
              ) : milestones.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">{ar ? 'لسه مفيش مراحل. كن أول واحد يضيف.' : 'No milestones yet. Be the first to add one.'}</p>
              ) : (
                <ul className="space-y-3">
                  {milestones.map((m) => (
                    <li key={m.id} className="rounded-2xl border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold uppercase text-muted-foreground">{ar ? TYPE_LABEL_AR[m.type] || m.type : m.type}</span>
                        <Badge variant="outline" className={`text-[11px] ${APPROVAL_TONE[m.approvalStatus] || ''}`}>
                          {ar ? APPROVAL_LABEL_AR[m.approvalStatus] || m.approvalStatus : m.approvalStatus}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{ar ? STATUS_LABEL_AR[m.status] || m.status.replace(/_/g, ' ') : m.status.replace(/_/g, ' ')}</span>
                        {m.progressPercent !== null && <span className="text-xs text-muted-foreground">{m.progressPercent}%</span>}
                      </div>
                      <p className="font-display mt-1 text-sm font-medium">{m.title}</p>
                      {m.description && <p className="text-xs text-muted-foreground">{m.description}</p>}
                      {m.date && <p className="text-xs text-muted-foreground">{new Date(m.date).toLocaleDateString(ar ? 'ar-EG' : 'en-GB')}</p>}
                      {m.approvalStatus === 'REJECTED' && m.rejectionReason && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                          <XCircle className="h-3 w-3" /> {m.rejectionReason}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <div className="rounded-2xl border border-dashed p-4">
                <p className="font-display mb-3 text-sm font-semibold">{ar ? 'ابعت مرحلة جديدة' : 'Submit a milestone'}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs font-medium">{ar ? 'العنوان *' : 'Title *'}</label>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={ar ? 'مثال: خلصنا الهيكل — عمارة A' : 'e.g. Structure completed — Building A'} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">{ar ? 'النوع' : 'Type'}</label>
                    <select className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
                      {TYPES.map((t) => <option key={t} value={t}>{ar ? TYPE_LABEL_AR[t] || t : t}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">{ar ? 'الحالة' : 'Status'}</label>
                    <select className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
                      {STATUSES.map((s) => <option key={s} value={s}>{ar ? STATUS_LABEL_AR[s] || s.replace(/_/g, ' ') : s.replace(/_/g, ' ')}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">{ar ? 'التاريخ' : 'Date'}</label>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">{ar ? 'نسبة الإنجاز % (اختياري)' : 'Progress % (optional)'}</label>
                    <Input inputMode="numeric" value={progress} onChange={(e) => setProgress(e.target.value)} placeholder="0–100" />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs font-medium">{ar ? 'الوصف' : 'Description'}</label>
                    <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={ar ? 'تفاصيل إضافية (اختياري)' : 'Optional details'} />
                  </div>
                </div>
                <Button onClick={submit} disabled={submitting} className="gold-shimmer mt-3 bg-estate-gold hover:bg-estate-gold-dark">
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Plus className="mr-1 h-4 w-4" /> {ar ? 'ابعت للمراجعة' : 'Submit for review'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
