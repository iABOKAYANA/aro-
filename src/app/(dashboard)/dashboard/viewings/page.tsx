'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useSession } from 'next-auth/react'
import {
  Calendar, Clock, MapPin, Video, Loader2, AlertCircle, Copy, Check,
  ExternalLink, X, LogIn, Inbox, CalendarCheck, Phone, Star,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import { Reveal, SectionHeader } from '@/components/design'

type Viewing = {
  id: string
  scheduledAt: string
  duration: number
  status: string
  meetingType: string
  meetingLink?: string | null
  contactPhone?: string | null
  notes?: string | null
  unit?: { name: string; project: { name: string; slug: string } } | null
  project?: { id: string; name: string; slug: string } | null
  broker?: { id: string; user: { name?: string | null } } | null
}

const STATUS_STYLES: Record<string, string> = {
  REQUESTED: 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/30',
  CONFIRMED: 'bg-green-50 text-green-600 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/30',
  COMPLETED: 'bg-estate-gold/10 text-estate-gold-dark border-estate-gold/30 dark:text-estate-gold',
  CANCELLED: 'bg-red-50 text-red-500 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30',
  NO_SHOW: 'bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/30',
}

const PAST_STATUSES = ['CANCELLED', 'COMPLETED', 'NO_SHOW']

const STATUS_LABEL_AR: Record<string, string> = {
  REQUESTED: 'مطلوب',
  CONFIRMED: 'متأكد',
  COMPLETED: 'خلص',
  CANCELLED: 'ملغي',
  NO_SHOW: 'محدش جه',
}

const TAB_LABEL_AR: Record<'upcoming' | 'past', string> = {
  upcoming: 'الجاية',
  past: 'اللي فاتت',
}

function propertyNameOf(v: Viewing, ar: boolean): string {
  if (v.unit) {
    return v.unit.project?.name ? `${v.unit.project.name} — ${v.unit.name}` : v.unit.name
  }
  return v.project?.name || (ar ? 'معاد' : 'Appointment')
}

export default function DashboardViewingsPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const { status: authStatus } = useSession()
  const [viewings, setViewings] = useState<Viewing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const fetchViewings = useCallback(async () => {
    if (authStatus === 'unauthenticated') {
      setLoading(false)
      return
    }
    if (authStatus === 'loading') return
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/viewings')
      if (res.status === 401) {
        // Session is invalid/expired server-side (e.g. stale account id) —
        // force a fresh login instead of showing an empty list.
        window.location.assign('/auth/login?callbackUrl=/dashboard/viewings')
        return
      }
      if (!res.ok) throw new Error('Failed to load appointments')
      const data = await res.json()
      setViewings(data.viewings || [])
    } catch (err) {
      console.error('Viewings load failed:', err)
      setError(ar ? 'معرفناش نجيب المواعيد — جرب تاني.' : 'Could not load the appointments — try again.')
    } finally {
      setLoading(false)
    }
  }, [authStatus, ar])

  useEffect(() => { fetchViewings() }, [fetchViewings])

  const now = Date.now()
  const filtered = viewings.filter(v => {
    const isPast = PAST_STATUSES.includes(v.status) || new Date(v.scheduledAt).getTime() < now
    return tab === 'past' ? isPast : !isPast
  }).sort((a, b) =>
    tab === 'past'
      ? new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
      : new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  )

  const cancelViewing = async (id: string) => {
    if (!confirm(ar ? 'تلغي المعاد ده؟' : 'Cancel this appointment?')) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/viewings?id=${id}`, { method: 'DELETE', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      if (!res.ok) throw new Error('Cancel failed')
      await fetchViewings()
    } catch (err) {
      console.error('Cancel viewing failed:', err)
      alert(ar ? 'معرفناش نلغي المعاد — جرب تاني.' : 'Could not cancel the appointment — try again.')
    } finally {
      setBusyId(null)
    }
  }

  const copyLink = async (v: Viewing) => {
    if (!v.meetingLink) return
    try {
      await navigator.clipboard.writeText(v.meetingLink)
      setCopiedId(v.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch { /* clipboard unavailable */ }
  }

  return (
    <div className="space-y-6">
      <Reveal>
        <SectionHeader
          kicker={ar ? 'مواعيدك' : 'Your schedule'}
          title={ar ? 'مواعيدي' : 'My Appointments'}
          description={ar ? 'المعاينات والاجتماعات الأونلاين اللي حجزتها' : 'Property viewings and online meetings you booked'}
        />
      </Reveal>

      {/* Tabs */}
      <div className="flex gap-2">
        {(['upcoming', 'past'] as const).map(key => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'rounded-full border px-4 py-2 text-sm font-medium capitalize transition-colors',
              tab === key
                ? 'border-estate-gold bg-estate-gold/10 text-estate-gold'
                : 'text-muted-foreground hover:border-estate-gold/40'
            )}
          >
            {ar ? TAB_LABEL_AR[key] : key}
          </button>
        ))}
      </div>

      {/* Not signed in */}
      {authStatus === 'unauthenticated' && (
        <Card>
          <CardContent className="py-16 text-center">
            <LogIn className="mx-auto h-12 w-12 text-muted-foreground/30" />
            <h3 className="mt-4 text-lg font-semibold">{ar ? 'سجل دخول عشان تشوف مواعيدك' : 'Sign in to see your appointments'}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {ar ? 'احجز معاينات واجتماعات أونلاين من أي صفحة مشروع.' : 'Book viewings and online meetings from any project page.'}
            </p>
            <Button asChild className="mt-5 bg-estate-gold text-white hover:bg-estate-gold-dark">
              <Link href="/auth/login?callbackUrl=/dashboard/viewings">{ar ? 'سجل دخول' : 'Sign In'}</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {loading && authStatus !== 'unauthenticated' && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-estate-gold" />
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
          <Button onClick={fetchViewings} variant="ghost" size="sm" className="ms-auto">{ar ? 'حاول تاني' : 'Retry'}</Button>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && authStatus === 'authenticated' && filtered.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <Inbox className="mx-auto h-12 w-12 text-muted-foreground/30" />
            <h3 className="mt-4 text-lg font-semibold">
              {tab === 'upcoming' ? (ar ? 'مفيش مواعيد جاية' : 'No upcoming appointments') : (ar ? 'مفيش مواعيد فاتت' : 'No past appointments')}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {tab === 'upcoming'
                ? (ar ? 'افتح أي مشروع ودوس "احجز اجتماع" عشان تحدد معاد.' : 'Open any project and hit "Book a Meeting" to schedule one.')
                : (ar ? 'مواعيدك اللي خلصت هتظهر هنا.' : 'Your completed appointments will appear here.')}
            </p>
            {tab === 'upcoming' && (
              <Button asChild className="mt-5 bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold-dark">
                <Link href="/projects">{ar ? 'اتفرج على المشاريع' : 'Browse Projects'}</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* List */}
      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-4">
          {filtered.map(v => {
            const date = new Date(v.scheduledAt)
            const canCancel = ['REQUESTED', 'CONFIRMED'].includes(v.status) && date.getTime() > now
            const projectSlug = v.project?.slug || (v.unit as any)?.project?.slug || null
            const canRate = v.status === 'COMPLETED' && projectSlug
            return (
              <Card key={v.id} className="border-estate-gold/20 transition-colors hover:border-estate-gold/40 dark:border-[#D4A843]/20 dark:bg-[#0A0A0A]">
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-semibold">{propertyNameOf(v, ar)}</h3>
                        <span className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                          STATUS_STYLES[v.status] || 'border-border text-muted-foreground'
                        )}>
                          {ar ? STATUS_LABEL_AR[v.status] || v.status : v.status}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {v.meetingType === 'online' ? <Video className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                          {v.meetingType === 'online' ? (ar ? 'أونلاين' : 'Online') : (ar ? 'حضور شخصي' : 'In person')}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-estate-gold" />
                          {date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-estate-gold" />
                          {date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                          <span className="text-xs">({v.duration} {ar ? 'دقيقة' : 'min'})</span>
                        </span>
                        {v.contactPhone && (
                          <span className="inline-flex items-center gap-1.5" dir="ltr">
                            <Phone className="h-3.5 w-3.5 text-estate-gold" />
                            {v.contactPhone}
                          </span>
                        )}
                        {v.broker?.user?.name && (
                          <span className="text-xs text-muted-foreground">{ar ? `مع ${v.broker.user.name}` : `with ${v.broker.user.name}`}</span>
                        )}
                      </div>

                      {v.notes && <p className="mt-2 text-sm text-muted-foreground">{v.notes}</p>}
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {v.meetingLink && v.status !== 'CANCELLED' && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => copyLink(v)} className="h-8">
                            {copiedId === v.id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                            {copiedId === v.id ? (ar ? 'اتنسخ' : 'Copied') : (ar ? 'انسخ اللينك' : 'Copy Link')}
                          </Button>
                          <Button size="sm" asChild className="h-8 bg-estate-gold text-white hover:bg-estate-gold-dark">
                            <a href={v.meetingLink} target="_blank" rel="noopener noreferrer">
                              <CalendarCheck className="me-1.5 h-3.5 w-3.5" />
                              {ar ? 'ادخل الاجتماع' : 'Join Meeting'}
                              <ExternalLink className="ms-1.5 h-3 w-3" />
                            </a>
                          </Button>
                        </>
                      )}
                      {canRate && (
                        <Button size="sm" asChild className="h-8 bg-estate-gold text-white hover:bg-estate-gold-dark">
                          <Link href={`/projects/${projectSlug}?review=${v.id}`}>
                            <Star className="me-1.5 h-3.5 w-3.5" />
                            {ar ? 'قيّم الزيارة' : 'Rate the visit'}
                          </Link>
                        </Button>
                      )}
                      {canCancel && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => cancelViewing(v.id)}
                          disabled={busyId === v.id}
                          className="h-8 border-red-200 text-red-500 hover:bg-red-50 hover:text-red-600 dark:border-red-500/30"
                        >
                          <X className="h-3.5 w-3.5" />
                          {ar ? 'إلغي' : 'Cancel'}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
