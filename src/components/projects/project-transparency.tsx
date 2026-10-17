'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Bell, BellRing, Loader2, CheckCircle2, AlertTriangle, Clock, ShieldCheck, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useLanguage } from '@/lib/language-context'
import { AppAccountPanel } from '@/components/app-account-panel'
import { useAppType } from '@/lib/use-app-type'

// ─── PUBLIC TRANSPARENCY COMPONENTS (Features 7 + 8 + 10) ────
// Rendered on the public project detail page: watch toggle,
// verification-status badges, and the approved project timeline.

// ─── View tracker (F6) ──────────────────────────────────────
// Fire-and-forget journey event for server-rendered pages.
export function JourneyViewTracker({ type, entityId }: { type: string; entityId: string }) {
  useEffect(() => {
    let anon: string
    try {
      anon = localStorage.getItem('ea_visitor') || ''
      if (!anon) {
        anon = crypto.randomUUID ? crypto.randomUUID() : `v-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
        localStorage.setItem('ea_visitor', anon)
      }
    } catch {
      anon = 'no-storage'
    }
    const body = JSON.stringify({ type, entityType: type.includes('UNIT') ? 'UNIT' : 'PROJECT', entityId, visitorId: anon })
    // Fire-and-forget beacon: one retry, still silent — nothing user-visible to surface.
    fetch('/api/journey', {
      method: 'POST',
      headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
      body,
    }).catch(() => {
      fetch('/api/journey', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body,
      }).catch(() => {})
    })
  }, [type, entityId])
  return null
}

// ─── Watch Button (F7) ────────────────────────────────────────

export function WatchButton({
  targetType,
  targetId,
  className,
  size = 'default',
}: {
  targetType: 'UNIT' | 'PROJECT'
  targetId: string
  className?: string
  size?: 'sm' | 'default' | 'lg'
}) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const { data: session } = useSession()
  // Public host: zero login — guests get the app-forward panel, never a
  // "sign in" prompt pointing at the removed login page.
  const isPublic = useAppType() === 'public'
  const [watching, setWatching] = useState(false)
  const [watchId, setWatchId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [checked, setChecked] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [showAppNote, setShowAppNote] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!session?.user) {
      setChecked(true)
      return
    }
    fetch('/api/watch')
      .then((r) => (r.ok ? r.json() : { watches: [] }))
      .then((d) => {
        if (cancelled) return
        const match = (d.watches || []).find(
          (w: { targetType: string; targetId: string }) => w.targetType === targetType && w.targetId === targetId,
        )
        if (match) {
          setWatching(true)
          setWatchId(match.id)
        }
        setChecked(true)
      })
      .catch(() => setChecked(true))
    return () => {
      cancelled = true
    }
  }, [session?.user, targetType, targetId])

  const toggle = async () => {
    if (!session?.user) {
      if (isPublic) {
        setShowAppNote(true)
        return
      }
      setMsg(ar ? 'سجل الدخول عشان توصلك تنبيهات الأسعار والتوافر' : 'Sign in to get price & availability alerts')
      return
    }
    setLoading(true)
    setMsg(null)
    try {
      if (watching && watchId) {
        const res = await fetch('/api/watch', {
          method: 'DELETE',
          headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: watchId }),
        })
        if (!res.ok) throw new Error('Failed')
        setWatching(false)
        setWatchId(null)
      } else {
        const res = await fetch('/api/watch', {
          method: 'POST',
          headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetType, targetId }),
        })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error || 'Failed')
        setWatching(true)
        setWatchId(d.watch?.id || null)
      }
    } catch (e) {
      console.error('Watch toggle failed:', e)
      setMsg(ar ? 'معرفناش نحدث المتابعة — جرب تاني.' : 'Failed to update watch')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={className}>
      <Button
        type="button"
        variant={watching ? 'default' : 'outline'}
        className={watching ? 'w-full min-h-[44px] bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold-dark md:min-h-0' : 'w-full min-h-[44px] md:min-h-0'}
        size={size}
        onClick={toggle}
        disabled={!checked || loading}
        aria-pressed={watching}
      >
        {loading || !checked ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : watching ? (
          <BellRing className="mr-2 h-4 w-4" />
        ) : (
          <Bell className="mr-2 h-4 w-4" />
        )}
        {watching ? (ar ? 'بتتابعه — التنبيهات شغالة' : 'Watching — alerts on') : (ar ? 'تابع تغيرات السعر' : 'Watch for price changes')}
      </Button>
      {msg && <p className="mt-2 text-center text-xs text-muted-foreground">{msg}</p>}
      {showAppNote && isPublic && <AppAccountPanel compact />}
    </div>
  )
}

// ─── Trust Badges (F10) ──────────────────────────────────────

interface TrustEntry {
  status: string
  label: string
  tone: string
  ageDays: number
  source?: string
}

const TONE_CLASS: Record<string, string> = {
  success: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-900',
  info: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900',
  warning: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900',
  muted: 'bg-muted text-muted-foreground border-border',
  danger: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900',
}

function TrustIcon({ status }: { status: string }) {
  if (status === 'VERIFIED') return <ShieldCheck className="h-3.5 w-3.5" />
  if (status === 'STALE') return <Clock className="h-3.5 w-3.5" />
  if (status === 'PENDING_REVIEW') return <AlertTriangle className="h-3.5 w-3.5" />
  if (status === 'UNVERIFIED') return <Info className="h-3.5 w-3.5" />
  return <CheckCircle2 className="h-3.5 w-3.5" />
}

const FIELD_LABELS: Record<string, string> = {
  price: 'Pricing',
  paymentPlan: 'Payment plan',
  delivery: 'Delivery date',
  location: 'Location',
  amenities: 'Amenities',
  area: 'Area',
  availability: 'Availability',
}

const FIELD_LABELS_AR: Record<string, string> = {
  price: 'السعر',
  paymentPlan: 'خطة السداد',
  delivery: 'معاد التسليم',
  location: 'الموقع',
  amenities: 'المرافق',
  area: 'المساحة',
  availability: 'التوافر',
}

export function ProjectTrust({ projectId }: { projectId: string }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [trust, setTrust] = useState<Record<string, TrustEntry> | null>(null)
  const [windowDays, setWindowDays] = useState(90)
  const [error, setError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    setError(false)
    fetch(`/api/trust?projectId=${projectId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load'))))
      .then((d) => {
        setTrust(d.trust || {})
        setWindowDays(d.freshnessWindowDays || 90)
      })
      .catch(() => {
        // Surface the failure instead of the misleading "no records" card.
        setTrust({})
        setError(true)
      })
  }, [projectId, retryKey])

  if (error) {
    return (
      <Card>
        <CardContent className="p-4 text-center text-sm">
          <p className="text-red-600 dark:text-red-400">{ar ? 'معرفناش نجيب حالة التوثيق — جرب تاني.' : 'Could not load the verification status — try again.'}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 min-h-[44px] md:min-h-0"
            onClick={() => {
              setTrust(null)
              setRetryKey((k) => k + 1)
            }}
          >
            {ar ? 'جرب تاني' : 'Try again'}
          </Button>
        </CardContent>
      </Card>
    )
  }
  if (trust === null) return null
  const entries = Object.entries(trust)
  if (!entries.length) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          {ar
            ? 'لسه مفيش سجلات توثيق للمشروع ده. المصدر وحالة التوثيق هيظهروا هنا لما EstateAI تراجع البيانات.'
            : 'No verification records yet for this project. Source and verification status will appear here as EstateAI reviews the data.'}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="section-kicker flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> {ar ? 'شفافية البيانات' : 'Data transparency'}
        </CardTitle>
        <CardDescription className="text-xs">
          {ar
            ? 'حالة توثيق المعلومات المهمة. أي بيانات مش متوثقة عمرها ما بتتعرض على إنها متوثقة.'
            : 'Verification status of key information. Unverified data is never presented as verified.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {entries.map(([field, entry]) => (
          <span
            key={field}
            title={ar
              ? `${entry.source ? `المصدر: ${entry.source}. ` : ''}اتحدث من ${entry.ageDays} ${entry.ageDays === 1 ? 'يوم' : 'أيام'}`
              : `${entry.source ? `Source: ${entry.source}. ` : ''}Updated ${entry.ageDays} day${entry.ageDays === 1 ? '' : 's'} ago`}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${TONE_CLASS[entry.tone] || TONE_CLASS.muted}`}
          >
            <TrustIcon status={entry.status} />
            {(ar ? FIELD_LABELS_AR[field] : FIELD_LABELS[field]) || field}: {entry.label}
            {entry.status === 'STALE' && <span className="opacity-70">({entry.ageDays}d)</span>}
          </span>
        ))}
        <span className="w-full text-[11px] text-muted-foreground">{ar ? `مدة الصلاحية: ${windowDays} يوم` : `Freshness window: ${windowDays} days`}</span>
      </CardContent>
    </Card>
  )
}

// ─── Project Timeline (F8) ───────────────────────────────────

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
  updatedAt?: string
  createdAt?: string
}

const TYPE_TONE: Record<string, string> = {
  LAUNCH: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  CONSTRUCTION: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  PROGRESS: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  DELIVERY: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  HANDOVER: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  CUSTOM: 'bg-gray-100 text-gray-800 dark:bg-[#262626] dark:text-gray-200',
}

const STATUS_TONE: Record<string, string> = {
  PLANNED: 'outline',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  DELAYED: 'warning',
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
  PLANNED: 'مخطط',
  IN_PROGRESS: 'شغال',
  COMPLETED: 'خلص',
  DELAYED: 'متأخر',
}

export function ProjectTimeline({ projectId }: { projectId: string }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [milestones, setMilestones] = useState<Milestone[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/milestones?projectId=${projectId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load'))))
      .then((d) => setMilestones(d.milestones || []))
      .catch((e) => {
        console.error('Timeline load failed:', e)
        setError(ar ? 'معرفناش نجيب الجدول الزمني — جرب تاني.' : 'Could not load the timeline — try again.')
        setMilestones([])
      })
  }, [projectId, ar])

  if (milestones === null) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {ar ? 'بنجيب الجدول الزمني...' : 'Loading timeline…'}
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display flex items-center gap-2 text-xl">
          <Clock className="h-5 w-5 text-estate-gold" /> {ar ? 'الجدول الزمني للمشروع' : 'Project Timeline'}
        </CardTitle>
        <CardDescription>
          {ar
            ? 'مراحل بيبعتها المطور وEstateAI بتعتمدها.'
            : 'Milestones reported by the developer and approved by EstateAI.'}
          {(() => {
            const stamps = milestones.map((m) => Date.parse(m.date || m.updatedAt || m.createdAt || '')).filter((t) => Number.isFinite(t) && t > 0)
            return stamps.length > 0 ? <> {ar ? 'آخر تحديث' : 'Last updated'} {new Date(Math.max(...stamps)).toLocaleDateString(ar ? 'ar-EG' : 'en-GB')}.</> : null
          })()}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!error && milestones.length === 0 && (
          <p className="text-sm text-muted-foreground">{ar ? 'لسه مفيش مراحل منشورة للمشروع ده.' : 'No timeline milestones published yet for this project.'}</p>
        )}
        {!error && milestones.length > 0 && (
          <ol className="relative ml-3 space-y-6 border-l-2 border-border pl-6">
            {milestones.map((m) => (
              <li key={m.id} className="relative">
                <span
                  className={`absolute -left-[31px] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-background ${
                    m.status === 'COMPLETED' ? 'bg-green-500' : m.status === 'DELAYED' ? 'bg-amber-500' : m.status === 'IN_PROGRESS' ? 'bg-blue-500' : 'bg-muted'
                  }`}
                  aria-hidden
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${TYPE_TONE[m.type] || TYPE_TONE.CUSTOM}`}>{ar ? TYPE_LABEL_AR[m.type] || m.type : m.type}</span>
                  <Badge variant={STATUS_TONE[m.status] as 'outline' | 'info' | 'success' | 'warning' || 'outline'} className="text-[11px]">
                    {ar ? STATUS_LABEL_AR[m.status] || m.status.replace(/_/g, ' ') : m.status.replace(/_/g, ' ')}
                  </Badge>
                  {m.progressPercent !== null && (
                    <span className="text-xs text-muted-foreground">{m.progressPercent}% {ar ? 'خلص' : 'complete'}</span>
                  )}
                </div>
                <p className="font-display mt-1 break-words text-lg font-medium">{m.title}</p>
                {m.titleArabic && <p className="text-sm text-muted-foreground" dir="rtl">{m.titleArabic}</p>}
                {m.description && <p className="mt-0.5 text-sm text-muted-foreground">{m.description}</p>}
                {m.date && <p className="mt-0.5 text-xs text-muted-foreground">{new Date(m.date).toLocaleDateString(ar ? 'ar-EG' : 'en-GB')}</p>}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
