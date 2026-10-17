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
  MessageSquare,
  Mail,
  Phone,
  Search,
  Inbox,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  XCircle,
  CheckCircle2,
  Archive,
  Eye,
} from 'lucide-react'
import { Reveal } from '@/components/design'

type ContactSubmission = {
  id: string
  name: string
  email: string
  phone: string | null
  subject: string | null
  message: string
  status: string
  createdAt: string
}

const STATUS_TABS = ['ALL', 'NEW', 'READ', 'REPLIED', 'ARCHIVED'] as const

const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-green-500/15 text-green-400 border-green-500/30',
  READ: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  REPLIED: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  ARCHIVED: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
}

const STATUS_DOTS: Record<string, string> = {
  NEW: 'bg-green-400',
  READ: 'bg-blue-400',
  REPLIED: 'bg-purple-400',
  ARCHIVED: 'bg-gray-400',
}

export default function CEOContactsPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [submissions, setSubmissions] = useState<ContactSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<string>('ALL')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const fetchSubmissions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/contact/list?limit=50')
      if (!res.ok) throw new Error('Failed to fetch contact submissions')
      const data = await res.json()
      // The API answers { items, total, page, totalPages } — older code
      // assigned that object straight into state and crashed on .filter().
      setSubmissions(Array.isArray(data) ? data : data.items || data.submissions || data.contacts || [])
    } catch (err) {
      console.error('Failed to fetch contact submissions:', err)
      setError(ar ? 'معرفناش نجيب الرسايل — حاول تاني.' : 'Failed to fetch contact submissions')
    } finally {
      setLoading(false)
    }
  }, [ar])

  useEffect(() => {
    fetchSubmissions()
  }, [fetchSubmissions])

  const updateStatus = async (id: string, status: string) => {
    setUpdatingId(id)
    try {
      const res = await fetch('/api/contact/list', {
        method: 'PATCH',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      if (!res.ok) throw new Error('Failed to update status')
      await fetchSubmissions()
    } catch (err) {
      console.error('Failed to update status:', err)
      alert(ar ? 'معرفناش نحدّث الحالة — حاول تاني.' : 'Failed to update status')
    } finally {
      setUpdatingId(null)
    }
  }

  const handleExpand = async (submission: ContactSubmission) => {
    if (expandedId === submission.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(submission.id)
    if (submission.status === 'NEW') {
      await updateStatus(submission.id, 'READ')
    }
  }

  const filteredSubmissions = submissions.filter((sub) => {
    if (activeTab !== 'ALL' && sub.status !== activeTab) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        sub.name.toLowerCase().includes(q) ||
        sub.email.toLowerCase().includes(q) ||
        (sub.subject && sub.subject.toLowerCase().includes(q))
      )
    }
    return true
  })

  const statusCounts = submissions.reduce(
    (acc, sub) => {
      acc[sub.status] = (acc[sub.status] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Reveal>
          <p className="section-kicker">{ar ? 'لوحة المدير · التواصل' : 'CEO Console · Contact'}</p>
          <h1 className="font-display display-3 text-foreground">{ar ? 'رسايل التواصل' : 'Contact Submissions'}</h1>
          <p className="mt-1 text-sm text-gray-400">{ar ? 'راجع واتحكم في الرسايل اللي جاية من فورم التواصل' : 'Review and manage contact form submissions'}</p>
          <hr className="gold-hairline mt-4" />
        </Reveal>
        <Button onClick={fetchSubmissions} variant="outline" className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]">
          <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
          {ar ? 'حدّث' : 'Refresh'}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => {
          const count = tab === 'ALL' ? submissions.length : (statusCounts[tab] || 0)
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition-all duration-200',
                activeTab === tab
                  ? 'border-estate-gold/30 bg-estate-gold/10 text-estate-gold'
                  : 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-400 hover:border-border dark:hover:border-[#262626] hover:text-gray-300'
              )}
            >
              {tab !== 'ALL' && <span className={cn('h-2 w-2 rounded-full', STATUS_DOTS[tab])} />}
              {tab === 'ALL' ? (ar ? 'الكل' : 'ALL') : statusLabel(tab, ar)}
              <span className={cn(
                'rounded-full px-1.5 py-0.5 text-xs',
                activeTab === tab ? 'bg-estate-gold/20 text-estate-gold' : 'bg-card dark:bg-[#0A0A0A] text-gray-500'
              )}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <Input
          placeholder={ar ? 'دوّر بالاسم أو الإيميل أو الموضوع…' : 'Search by name, email, or subject...'}
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

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-400">
          <XCircle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
          <Button onClick={fetchSubmissions} variant="ghost" size="sm" className="ml-auto text-red-400 hover:text-red-300">
            {ar ? 'حاول تاني' : 'Retry'}
          </Button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-estate-gold" />
        </div>
      )}

      {!loading && !error && filteredSubmissions.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] py-20">
          <Inbox className="h-12 w-12 text-gray-600" />
          <p className="mt-4 text-lg font-medium text-gray-400">{ar ? 'مفيش رسايل' : 'No submissions found'}</p>
          <p className="mt-1 text-sm text-gray-500">
            {search ? (ar ? 'جرّب تظبط البحث' : 'Try adjusting your search') : activeTab !== 'ALL' ? (ar ? 'مفيش رسايل بالحالة دي' : 'No submissions with this status') : (ar ? 'لسه مفيش رسايل تواصل' : 'No contact submissions yet')}
          </p>
        </div>
      )}

      {!loading && !error && filteredSubmissions.length > 0 && (
        <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border dark:border-[#262626]">
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'الاسم' : 'Name'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 md:table-cell">{ar ? 'الإيميل' : 'Email'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 md:table-cell">{ar ? 'التليفون' : 'Phone'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 sm:table-cell">{ar ? 'الموضوع' : 'Subject'}</th>
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'الحالة' : 'Status'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 lg:table-cell">{ar ? 'التاريخ' : 'Date'}</th>
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'إجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border dark:divide-[#262626]">
                  {filteredSubmissions.map((sub) => {
                    const isExpanded = expandedId === sub.id
                    return (
                      <>
                        <tr
                          key={sub.id}
                          onClick={() => handleExpand(sub)}
                          className={cn('cursor-pointer transition-colors hover:bg-card dark:hover:bg-[#0A0A0A]', isExpanded && 'bg-muted')}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-estate-gold/20 to-estate-gold/5 text-sm font-semibold text-estate-gold">
                                {sub.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium text-foreground">{sub.name}</p>
                                <p className="text-xs text-gray-500 md:hidden">{sub.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="hidden px-4 py-3 md:table-cell">
                            <div className="flex items-center gap-1.5 text-gray-400">
                              <Mail className="h-3 w-3" />
                              <span className="truncate max-w-[180px]">{sub.email}</span>
                            </div>
                          </td>
                          <td className="hidden px-4 py-3 md:table-cell">
                            {sub.phone ? (
                              <div className="flex items-center gap-1.5 text-gray-400">
                                <Phone className="h-3 w-3" />
                                {sub.phone}
                              </div>
                            ) : (
                              <span className="text-gray-600">—</span>
                            )}
                          </td>
                          <td className="hidden px-4 py-3 sm:table-cell">
                            <p className="max-w-[160px] truncate text-gray-400">{sub.subject || '—'}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
                                STATUS_COLORS[sub.status] || 'bg-gray-500/15 text-gray-400 border-gray-500/30'
                              )}
                            >
                              <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOTS[sub.status])} />
                              {statusLabel(sub.status, ar)}
                            </span>
                          </td>
                          <td className="hidden px-4 py-3 lg:table-cell">
                            <span className="text-gray-400">
                              {new Date(sub.createdAt).toLocaleDateString(ar ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <div className="relative group">
                                <button className="rounded-full border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-1.5 text-gray-400 transition-colors hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-foreground">
                                  <MessageSquare className="h-3.5 w-3.5" />
                                </button>
                                <div className="absolute right-0 top-full z-20 mt-1 hidden w-36 rounded-2xl border border-border dark:border-[#262626] bg-[#1a2535] p-1 shadow-xl group-hover:block">
                                  {['NEW', 'READ', 'REPLIED', 'ARCHIVED'].map((s) => (
                                    <button
                                      key={s}
                                      onClick={() => updateStatus(sub.id, s)}
                                      disabled={sub.status === s || updatingId === sub.id}
                                      className={cn(
                                        'flex w-full items-center gap-2 rounded-full px-3 py-2 text-left text-sm transition-colors',
                                        sub.status === s
                                          ? 'bg-card dark:bg-[#0A0A0A] text-estate-gold'
                                          : 'text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]',
                                        updatingId === sub.id && 'opacity-50'
                                      )}
                                    >
                                      <span className={cn('h-2 w-2 rounded-full', STATUS_DOTS[s])} />
                                      {statusLabel(s, ar)}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <button
                                onClick={() => handleExpand(sub)}
                                className="rounded-full border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-1.5 text-gray-400 transition-colors hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-foreground"
                              >
                                {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr key={`${sub.id}-expanded`}>
                            <td colSpan={7} className="border-b border-border dark:border-[#262626] bg-white/[0.02] px-4 py-5">
                              <div className="grid gap-6 lg:grid-cols-3">
                                <div className="space-y-3">
                                  <h4 className="text-sm font-semibold text-estate-gold">{ar ? 'بيانات التواصل' : 'Contact Information'}</h4>
                                  <div className="space-y-2 text-sm">
                                    <div className="flex items-center gap-2 text-gray-300">
                                      <Mail className="h-3.5 w-3.5 text-gray-500" />
                                      {sub.email}
                                    </div>
                                    {sub.phone && (
                                      <div className="flex items-center gap-2 text-gray-300">
                                        <Phone className="h-3.5 w-3.5 text-gray-500" />
                                        {sub.phone}
                                      </div>
                                    )}
                                    <div className="flex items-center gap-2 text-gray-300">
                                      <Eye className="h-3.5 w-3.5 text-gray-500" />
                                      {new Date(sub.createdAt).toLocaleString(ar ? 'ar-EG' : undefined)}
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-3 lg:col-span-2">
                                  <h4 className="text-sm font-semibold text-estate-gold">{ar ? 'الرسالة' : 'Message'}</h4>
                                  {sub.subject && (
                                    <div className="mb-2">
                                      <p className="text-xs text-gray-500">{ar ? 'الموضوع' : 'Subject'}</p>
                                      <p className="text-sm font-medium text-foreground">{sub.subject}</p>
                                    </div>
                                  )}
                                  <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-4">
                                    <p className="whitespace-pre-wrap text-sm text-gray-300">{sub.message}</p>
                                  </div>
                                </div>
                              </div>

                              <div className="mt-5 border-t border-border dark:border-[#262626] pt-4">
                                <h4 className="mb-3 text-sm font-semibold text-estate-gold">{ar ? 'إجراءات سريعة' : 'Quick Actions'}</h4>
                                <div className="flex flex-wrap gap-2">
                                  {['NEW', 'READ', 'REPLIED', 'ARCHIVED'].map((s) => (
                                    <button
                                      key={s}
                                      onClick={() => updateStatus(sub.id, s)}
                                      disabled={sub.status === s || updatingId === sub.id}
                                      className={cn(
                                        'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                                        sub.status === s
                                          ? 'border-estate-gold/30 bg-estate-gold/10 text-estate-gold'
                                          : 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-400 hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-foreground'
                                      )}
                                    >
                                      {statusLabel(s, ar)}
                                    </button>
                                  ))}
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
