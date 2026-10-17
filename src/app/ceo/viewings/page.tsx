'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import { statusLabel } from '@/components/ceo/ceo-charts'
import {
  Search,
  Eye,
  RefreshCw,
  Loader2,
  AlertCircle,
  Inbox,
  X,
  Check,
  Calendar,
  Clock,
  User,
  MessageCircle,
  MessageSquare,
  ChevronDown,
} from 'lucide-react'
import { Reveal } from '@/components/design'

// wa.me needs bare digits (no `+`, spaces or dashes) — same
// encodeURIComponent-text pattern as the share buttons. Pure deep link:
// tapping opens the client's chat with the confirmation prefilled, nothing
// is ever auto-sent.
function waDigits(raw: string | null | undefined): string {
  return (raw || '').replace(/\D/g, '')
}

function buildWaConfirmText(viewing: Viewing, ar: boolean): string {
  const date = new Date(viewing.scheduledAt).toLocaleDateString(ar ? 'ar-EG' : 'en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
  const time = new Date(viewing.scheduledAt).toLocaleTimeString(ar ? 'ar-EG' : 'en-US', {
    hour: '2-digit', minute: '2-digit',
  })
  const type = viewing.meetingType === 'online'
    ? (ar ? 'اجتماع أونلاين' : 'Online meeting')
    : (ar ? 'معاينة حضورية' : 'In-person viewing')
  if (ar) {
    return `أهلاً ${viewing.clientName} 👋\nمعاينتك في ${viewing.propertyName} متسجلة يوم ${date} الساعة ${time} (${type}).\nهنستناك، ولو عايز تغيّر المعاد رد على الرسالة دي 🙏`
  }
  return `Hi ${viewing.clientName} 👋\nYour viewing at ${viewing.propertyName} is booked for ${date} at ${time} (${type}).\nSee you then — reply here if you need to reschedule 🙏`
}

function waHrefFor(viewing: Viewing, ar: boolean): string | null {
  // Upcoming only (REQUESTED/CONFIRMED) with a diallable client phone.
  // The shaped clientPhone falls back to '—' when the viewing carries no
  // phone (contactPhone → user.phone → lead.phone chain came back empty).
  if (!['REQUESTED', 'CONFIRMED'].includes(viewing.status)) return null
  const digits = waDigits(viewing.clientPhone)
  if (digits.length < 7) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(buildWaConfirmText(viewing, ar))}`
}

type Viewing = {
  id: string
  clientName: string
  clientPhone: string
  clientEmail: string | null
  propertyName: string
  propertyAddress: string | null
  scheduledAt: string
  duration: number
  status: string
  notes: string | null
  feedback: string | null
  createdAt: string
  meetingType: string
  meetingLink: string | null
  broker: { id: string; user: { name: string | null; email: string | null } } | null
}

const STATUS_TABS = ['ALL', 'REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const

const STATUS_COLORS: Record<string, string> = {
  REQUESTED: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  CONFIRMED: 'bg-green-500/15 text-green-400 border-green-500/30',
  COMPLETED: 'bg-[#D4A843]/15 text-[#D4A843] border-[#D4A843]/30',
  CANCELLED: 'bg-red-500/15 text-red-400 border-red-500/30',
  NO_SHOW: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
}

const STATUS_DOTS: Record<string, string> = {
  REQUESTED: 'bg-blue-400',
  CONFIRMED: 'bg-green-400',
  COMPLETED: 'bg-[#D4A843]',
  CANCELLED: 'bg-red-400',
  NO_SHOW: 'bg-orange-400',
}

type Broker = { id: string; user: { name: string | null; email: string | null } }

export default function CEOViewingsPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [viewings, setViewings] = useState<Viewing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<string>('ALL')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [brokers, setBrokers] = useState<Broker[]>([])
  const [showAssignModal, setShowAssignModal] = useState<string | null>(null)
  const [notesEditId, setNotesEditId] = useState<string | null>(null)
  const [notesText, setNotesText] = useState('')
  const [rescheduleId, setRescheduleId] = useState<string | null>(null)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [feedbackEditId, setFeedbackEditId] = useState<string | null>(null)
  const [feedbackText, setFeedbackText] = useState('')

  const fetchViewings = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (activeTab !== 'ALL') params.set('status', activeTab)
      const res = await fetch(`/api/ceo/viewings?${params}`)
      if (!res.ok) throw new Error('Failed to fetch viewings')
      const data = await res.json()
      // Shape the API response for the table
      const shaped = (data.viewings || []).map((v: any) => ({
        id: v.id,
        clientName: v.user?.name || v.lead?.name || v.user?.email || (ar ? 'عميل' : 'Client'),
        clientPhone: v.contactPhone || v.user?.phone || v.lead?.phone || '—',
        clientEmail: v.user?.email || null,
        propertyName: v.unit
          ? `${v.unit.project?.name ? `${v.unit.project.name} — ` : ''}${v.unit.name}`
          : v.project?.name || (ar ? 'اجتماع' : 'Meeting'),
        propertyAddress: v.project?.address || null,
        scheduledAt: v.scheduledAt,
        duration: v.duration,
        status: v.status,
        notes: v.notes,
        feedback: v.feedback,
        createdAt: v.createdAt,
        meetingType: v.meetingType || 'in_person',
        meetingLink: v.meetingLink || null,
        broker: v.broker,
      }))
      setViewings(shaped)
    } catch (err) {
      console.error('Failed to fetch viewings:', err)
      setError(ar ? 'معرفناش نجيب المعاينات — حاول تاني.' : 'Failed to fetch viewings')
    } finally {
      setLoading(false)
    }
  }, [search, activeTab, ar])

  const fetchBrokers = useCallback(async () => {
    try {
      const res = await fetch('/api/ceo/brokers')
      if (res.ok) {
        const data = await res.json()
        setBrokers(data.brokers || [])
      }
    } catch { /* silent */ }
  }, [])

  useEffect(() => { fetchViewings() }, [fetchViewings])
  useEffect(() => { fetchBrokers() }, [fetchBrokers])

  const statusCounts = viewings.reduce(
    (acc, v) => { acc[v.status] = (acc[v.status] || 0) + 1; return acc },
    {} as Record<string, number>
  )

  const updateStatus = async (id: string, status: string) => {
    setUpdatingId(id)
    try {
      const res = await fetch('/api/ceo/viewings', {
        method: 'PATCH',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      if (!res.ok) throw new Error('Failed to update status')
      await fetchViewings()
    } catch (err) {
      console.error('Failed to update status:', err)
      alert(ar ? 'معرفناش نحدّث الحالة — حاول تاني.' : 'Failed to update status')
    } finally {
      setUpdatingId(null)
    }
  }

  const assignBroker = async (id: string, brokerId: string) => {
    setUpdatingId(id)
    try {
      const res = await fetch('/api/ceo/viewings', {
        method: 'PATCH',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, brokerId }),
      })
      if (!res.ok) throw new Error('Failed to assign broker')
      setShowAssignModal(null)
      await fetchViewings()
    } catch (err) {
      console.error('Failed to assign broker:', err)
      alert(ar ? 'معرفناش نوزّع البروكر — حاول تاني.' : 'Failed to assign broker')
    } finally {
      setUpdatingId(null)
    }
  }

  const saveNotes = async (id: string) => {
    setUpdatingId(id)
    try {
      const res = await fetch('/api/ceo/viewings', {
        method: 'PATCH',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, notes: notesText }),
      })
      if (!res.ok) throw new Error('Failed to save notes')
      setNotesEditId(null)
      await fetchViewings()
    } catch (err) {
      console.error('Failed to save notes:', err)
      alert(ar ? 'معرفناش نحفظ الملاحظات — حاول تاني.' : 'Failed to save notes')
    } finally {
      setUpdatingId(null)
    }
  }

  const saveFeedback = async (id: string) => {
    setUpdatingId(id)
    try {
      const res = await fetch('/api/ceo/viewings', {
        method: 'PATCH',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, feedback: feedbackText }),
      })
      if (!res.ok) throw new Error('Failed to save feedback')
      setFeedbackEditId(null)
      await fetchViewings()
    } catch (err) {
      console.error('Failed to save feedback:', err)
      alert(ar ? 'معرفناش نحفظ الفيدباك — حاول تاني.' : 'Failed to save feedback')
    } finally {
      setUpdatingId(null)
    }
  }

  const reschedule = async (id: string) => {
    setUpdatingId(id)
    try {
      const res = await fetch('/api/ceo/viewings', {
        method: 'PATCH',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, scheduledAt: rescheduleDate, status: 'REQUESTED' }),
      })
      if (!res.ok) throw new Error('Failed to reschedule')
      setRescheduleId(null)
      setRescheduleDate('')
      await fetchViewings()
    } catch (err) {
      console.error('Failed to reschedule:', err)
      alert(ar ? 'معرفناش نغيّر المعاد — حاول تاني.' : 'Failed to reschedule')
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Reveal>
          <p className="section-kicker">{ar ? 'لوحة المدير · المعاينات' : 'CEO Console · Viewings'}</p>
          <h1 className="font-display display-3 text-foreground">{ar ? 'إدارة المعاينات' : 'Viewings Management'}</h1>
          <p className="mt-1 text-sm text-gray-400">{ar ? 'حدد وتابع معاينات العقارات' : 'Schedule and track property viewings'}</p>
          <hr className="gold-hairline mt-4" />
        </Reveal>
        <Button onClick={fetchViewings} variant="outline" className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]">
          <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
          {ar ? 'حدّث' : 'Refresh'}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {STATUS_TABS.map((tab) => {
          const count = tab === 'ALL' ? viewings.length : (statusCounts[tab] || 0)
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'rounded-2xl border p-4 text-left transition-all duration-200',
                activeTab === tab
                  ? 'border-estate-gold/30 bg-estate-gold/10'
                  : 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] hover:border-border dark:hover:border-[#262626] hover:bg-card dark:hover:bg-[#0A0A0A]'
              )}
            >
              <div className="flex items-center gap-2">
                {tab !== 'ALL' && <div className={cn('h-2 w-2 rounded-full', STATUS_DOTS[tab])} />}
                <span className="text-xs font-medium text-gray-400">{tab === 'ALL' ? (ar ? 'الكل' : 'ALL') : statusLabel(tab, ar)}</span>
              </div>
              <p className={cn('mt-2 text-2xl font-bold', activeTab === tab ? 'text-estate-gold' : 'text-foreground')}>
                {count}
              </p>
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <Input
          placeholder={ar ? 'دوّر بعميل أو عقار أو بروكر…' : 'Search by client, property, broker...'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] pl-10 text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50 focus:ring-estate-gold/20"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-400">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
          <Button onClick={fetchViewings} variant="ghost" size="sm" className="ml-auto text-red-400 hover:text-red-300">{ar ? 'حاول تاني' : 'Retry'}</Button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-estate-gold" />
        </div>
      )}

      {/* Empty */}
      {!loading && !error && viewings.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] py-20">
          <Inbox className="h-12 w-12 text-gray-600" />
          <p className="mt-4 text-lg font-medium text-gray-400">{ar ? 'مفيش معاينات' : 'No viewings found'}</p>
          <p className="mt-1 text-sm text-gray-500">
            {search ? (ar ? 'جرّب تظبط البحث' : 'Try adjusting your search criteria') : (ar ? 'مفيش معاينات مطابقة للفلاتر الحالية' : 'No viewings match the current filters')}
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && viewings.length > 0 && (
        <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border dark:border-[#262626]">
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'العميل' : 'Client'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 md:table-cell">{ar ? 'العقار' : 'Property'}</th>
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'التاريخ / الوقت' : 'Date/Time'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 lg:table-cell">{ar ? 'البروكر' : 'Broker'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 lg:table-cell">{ar ? 'المدة' : 'Duration'}</th>
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'الحالة' : 'Status'}</th>
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'إجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border dark:divide-[#262626]">
                  {viewings.map((viewing) => {
                    const isExpanded = expandedId === viewing.id
                    const waHref = waHrefFor(viewing, ar)
                    return (
                      <>
                        <tr
                          key={viewing.id}
                          onClick={() => setExpandedId(isExpanded ? null : viewing.id)}
                          className={cn('cursor-pointer transition-colors hover:bg-card dark:hover:bg-[#0A0A0A]', isExpanded && 'bg-muted')}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-estate-gold/20 to-estate-gold/5 text-sm font-semibold text-estate-gold">
                                {viewing.clientName.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium text-foreground">{viewing.clientName}</p>
                                <p className="text-xs text-gray-500">{viewing.clientPhone}</p>
                              </div>
                            </div>
                          </td>
                          <td className="hidden px-4 py-3 md:table-cell">
                            <p className="text-gray-300">{viewing.propertyName}</p>
                            {viewing.propertyAddress && <p className="text-xs text-gray-500">{viewing.propertyAddress}</p>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5 text-gray-300">
                                <Calendar className="h-3 w-3" />
                                <span>{new Date(viewing.scheduledAt).toLocaleDateString(ar ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-gray-500">
                                <Clock className="h-3 w-3" />
                                <span>{new Date(viewing.scheduledAt).toLocaleTimeString(ar ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                            </div>
                          </td>
                          <td className="hidden px-4 py-3 lg:table-cell">
                            {viewing.broker ? (
                              <span className="text-gray-300">{viewing.broker.user.name || (ar ? 'مش متوزع' : 'Unassigned')}</span>
                            ) : (
                              <span className="text-gray-600">{ar ? 'مش متوزع' : 'Unassigned'}</span>
                            )}
                          </td>
                          <td className="hidden px-4 py-3 lg:table-cell">
                            <span className="text-gray-400">{viewing.duration} {ar ? 'دقيقة' : 'min'}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn(
                              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
                              STATUS_COLORS[viewing.status] || 'bg-gray-500/15 text-gray-400 border-gray-500/30'
                            )}>
                              <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOTS[viewing.status])} />
                              {statusLabel(viewing.status, ar)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              {waHref && (
                                <Button size="sm" variant="ghost" asChild className="text-[#25D366] hover:text-[#25D366]/80" title={ar ? 'تأكيد واتساب' : 'Confirm on WhatsApp'}>
                                  <a href={waHref} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                                    <MessageCircle className="h-3.5 w-3.5" />
                                  </a>
                                </Button>
                              )}
                              {viewing.status === 'REQUESTED' && (
                                <Button size="sm" variant="ghost" onClick={() => updateStatus(viewing.id, 'CONFIRMED')} disabled={updatingId === viewing.id} className="text-green-400 hover:text-green-300" title={ar ? 'أكّد' : 'Confirm'}>
                                  <Check className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {viewing.status === 'CONFIRMED' && (
                                <>
                                  <Button size="sm" variant="ghost" onClick={() => updateStatus(viewing.id, 'COMPLETED')} disabled={updatingId === viewing.id} className="text-estate-gold hover:text-estate-gold/80" title={ar ? 'اتعملت' : 'Complete'}>
                                    <Check className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => updateStatus(viewing.id, 'NO_SHOW')} disabled={updatingId === viewing.id} className="text-orange-400 hover:text-orange-300" title={ar ? 'مجاش' : 'No Show'}>
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                              {['REQUESTED', 'CONFIRMED'].includes(viewing.status) && (
                                <>
                                  <Button size="sm" variant="ghost" onClick={() => updateStatus(viewing.id, 'CANCELLED')} disabled={updatingId === viewing.id} className="text-red-400 hover:text-red-300" title={ar ? 'ألغي' : 'Cancel'}>
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                  <div className="relative group">
                                    <Button size="sm" variant="ghost" className="text-gray-400 hover:text-foreground" title={ar ? 'غيّر المعاد' : 'Reschedule'}>
                                      <Calendar className="h-3.5 w-3.5" />
                                    </Button>
                                    <div className="absolute right-0 top-full z-20 mt-1 hidden w-64 rounded-2xl border border-border dark:border-[#262626] bg-[#1a2535] p-3 shadow-xl group-hover:block">
                                      <p className="mb-2 text-xs font-medium text-gray-400">{ar ? 'المعاد الجديد' : 'Reschedule Date & Time'}</p>
                                      <input
                                        type="datetime-local"
                                        value={rescheduleDate}
                                        onChange={(e) => setRescheduleDate(e.target.value)}
                                        className="mb-2 w-full rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-2 py-1.5 text-sm text-foreground focus:border-estate-gold/50 focus:outline-none"
                                      />
                                      <Button size="sm" onClick={() => reschedule(viewing.id)} disabled={!rescheduleDate || updatingId === viewing.id} className="w-full bg-estate-gold text-black hover:bg-estate-gold/90">
                                        {ar ? 'غيّر المعاد' : 'Reschedule'}
                                      </Button>
                                    </div>
                                  </div>
                                </>
                              )}
                              <div className="relative group">
                                <Button size="sm" variant="ghost" className="text-gray-400 hover:text-foreground" title={ar ? 'وزّع على بروكر' : 'Assign Broker'}>
                                  <User className="h-3.5 w-3.5" />
                                </Button>
                                <div className="absolute right-0 top-full z-20 mt-1 hidden w-48 rounded-2xl border border-border dark:border-[#262626] bg-[#1a2535] p-1 shadow-xl group-hover:block">
                                  {brokers.map((b) => (
                                    <button
                                      key={b.id}
                                      onClick={() => assignBroker(viewing.id, b.id)}
                                      disabled={viewing.broker?.id === b.id || updatingId === viewing.id}
                                      className={cn(
                                        'flex w-full items-center gap-2 rounded-full px-3 py-2 text-left text-sm transition-colors',
                                        viewing.broker?.id === b.id ? 'bg-card dark:bg-[#0A0A0A] text-estate-gold' : 'text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]'
                                      )}
                                    >
                                      {b.user.name || b.user.email || (ar ? 'من غير اسم' : 'Unnamed')}
                                    </button>
                                  ))}
                                  {brokers.length === 0 && <p className="px-3 py-2 text-sm text-gray-500">{ar ? 'مفيش بروكرز متاحين' : 'No brokers available'}</p>}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${viewing.id}-expand`}>
                            <td colSpan={7} className="border-b border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-6 py-4">
                              <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                  <p className="mb-1 text-xs font-medium text-gray-400">{ar ? 'التواصل' : 'Contact'}</p>
                                  <p className="text-sm text-gray-300">{viewing.clientPhone}</p>
                                  {viewing.clientEmail && <p className="text-sm text-gray-400">{viewing.clientEmail}</p>}
                                </div>
                                <div>
                                  <p className="mb-1 text-xs font-medium text-gray-400">{ar ? 'الاجتماع' : 'Meeting'}</p>
                                  <p className="text-sm text-gray-300">
                                    {viewing.meetingType === 'online' ? (ar ? 'اجتماع أونلاين' : 'Online meeting') : (ar ? 'معاينة حضورية' : 'In-person viewing')}
                                  </p>
                                  {viewing.meetingLink && (
                                    <a
                                      href={viewing.meetingLink}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="truncate text-xs text-estate-gold hover:underline"
                                    >
                                      {viewing.meetingLink}
                                    </a>
                                  )}
                                </div>
                                <div>
                                  <p className="mb-1 text-xs font-medium text-gray-400">{ar ? 'العقار' : 'Property'}</p>
                                  <p className="text-sm text-gray-300">{viewing.propertyName}</p>
                                  {viewing.propertyAddress && <p className="text-sm text-gray-400">{viewing.propertyAddress}</p>}
                                </div>
                                <div>
                                  <div className="mb-1 flex items-center justify-between">
                                    <p className="text-xs font-medium text-gray-400">{ar ? 'ملاحظات' : 'Notes'}</p>
                                    <button
                                      onClick={() => { setNotesEditId(notesEditId === viewing.id ? null : viewing.id); setNotesText(viewing.notes || '') }}
                                      className="text-xs text-estate-gold hover:underline"
                                    >
                                      {notesEditId === viewing.id ? (ar ? 'إلغاء' : 'Cancel') : (ar ? 'تعديل' : 'Edit')}
                                    </button>
                                  </div>
                                  {notesEditId === viewing.id ? (
                                    <div className="flex gap-2">
                                      <Input value={notesText} onChange={(e) => setNotesText(e.target.value)} className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground focus:border-estate-gold/50" />
                                      <Button size="sm" onClick={() => saveNotes(viewing.id)} className="bg-estate-gold text-black hover:bg-estate-gold/90">{ar ? 'احفظ' : 'Save'}</Button>
                                    </div>
                                  ) : (
                                    <p className="text-sm text-gray-300">{viewing.notes || (ar ? 'مفيش ملاحظات' : 'No notes')}</p>
                                  )}
                                </div>
                                <div>
                                  <div className="mb-1 flex items-center justify-between">
                                    <p className="text-xs font-medium text-gray-400">{ar ? 'الفيدباك' : 'Feedback'}</p>
                                    <button
                                      onClick={() => { setFeedbackEditId(feedbackEditId === viewing.id ? null : viewing.id); setFeedbackText(viewing.feedback || '') }}
                                      className="text-xs text-estate-gold hover:underline"
                                    >
                                      {feedbackEditId === viewing.id ? (ar ? 'إلغاء' : 'Cancel') : (ar ? 'تعديل' : 'Edit')}
                                    </button>
                                  </div>
                                  {feedbackEditId === viewing.id ? (
                                    <div className="flex gap-2">
                                      <Input value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)} className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground focus:border-estate-gold/50" />
                                      <Button size="sm" onClick={() => saveFeedback(viewing.id)} className="bg-estate-gold text-black hover:bg-estate-gold/90">{ar ? 'احفظ' : 'Save'}</Button>
                                    </div>
                                  ) : (
                                    <p className="text-sm text-gray-300">{viewing.feedback || (ar ? 'مفيش فيدباك' : 'No feedback')}</p>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
