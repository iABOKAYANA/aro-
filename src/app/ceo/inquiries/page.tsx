'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import { statusLabel } from '@/components/ceo/ceo-charts'
import {
  Search,
  HelpCircle,
  Phone,
  Mail,
  MessageSquare,
  Calendar,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  X,
  Loader2,
  AlertCircle,
  Inbox,
  ArrowUpDown,
  UserPlus,
  Building2,
  Tag,
} from 'lucide-react'
import { Reveal } from '@/components/design'

type Inquiry = {
  id: string
  name: string
  email: string | null
  phone: string
  message: string | null
  type: string
  status: string
  source: string
  priority: number
  assignedTo: string | null
  notes: string | null
  contactedAt: string | null
  resolvedAt: string | null
  createdAt: string
  unit: {
    id: string
    name: string
    slug: string
    unitType: string
    price: number
    project: { id: string; name: string } | null
  } | null
  user: { id: string; name: string | null; email: string | null } | null
}

type Broker = {
  id: string
  user: { name: string | null; email: string | null }
}

const STATUS_TABS = ['ALL', 'NEW', 'CONTACTED', 'RESOLVED', 'CLOSED'] as const

const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  CONTACTED: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  RESOLVED: 'bg-green-500/15 text-green-400 border-green-500/30',
  CLOSED: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
}

const STATUS_DOTS: Record<string, string> = {
  NEW: 'bg-blue-400',
  CONTACTED: 'bg-yellow-400',
  RESOLVED: 'bg-green-400',
  CLOSED: 'bg-gray-400',
}

const INQUIRY_TYPES: Record<string, string> = {
  GENERAL: 'bg-card dark:bg-[#0A0A0A] text-gray-300',
  PRICING: 'bg-purple-500/15 text-purple-400',
  VIEWING: 'bg-blue-500/15 text-blue-400',
  COMPLAINT: 'bg-red-500/15 text-red-400',
  FEEDBACK: 'bg-green-500/15 text-green-400',
  PARTNERSHIP: 'bg-[#D4A843]/15 text-[#D4A843]',
}

const INQUIRY_TYPE_AR: Record<string, string> = {
  GENERAL: 'عام',
  PRICING: 'أسعار',
  VIEWING: 'معاينة',
  COMPLAINT: 'شكوى',
  FEEDBACK: 'فيدباك',
  PARTNERSHIP: 'شراكة',
}

export default function CEOInquiriesPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<string>('ALL')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [brokers, setBrokers] = useState<Broker[]>([])
  const [showAssignModal, setShowAssignModal] = useState<string | null>(null)

  const fetchInquiries = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (activeTab !== 'ALL') params.set('status', activeTab)
      const res = await fetch(`/api/ceo/inquiries?${params}`)
      if (!res.ok) throw new Error('Failed to fetch inquiries')
      const data = await res.json()
      setInquiries(data.inquiries || [])
      setTotal(data.total || 0)
    } catch (err) {
      console.error('Failed to fetch inquiries:', err)
      setError(ar ? 'معرفناش نجيب الاستفسارات — حاول تاني.' : 'Failed to fetch inquiries')
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
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    fetchInquiries()
  }, [fetchInquiries])

  useEffect(() => {
    fetchBrokers()
  }, [fetchBrokers])

  const statusCounts = inquiries.reduce(
    (acc, inq) => {
      acc[inq.status] = (acc[inq.status] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  const updateInquiryStatus = async (id: string, status: string) => {
    setUpdatingId(id)
    try {
      const res = await fetch('/api/ceo/inquiries', {
        method: 'PATCH',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      if (!res.ok) throw new Error('Failed to update inquiry')
      await fetchInquiries()
    } catch (err) {
      console.error('Failed to update inquiry:', err)
      alert(ar ? 'معرفناش نحدّث الاستفسار — حاول تاني.' : 'Failed to update inquiry')
    } finally {
      setUpdatingId(null)
    }
  }

  const assignBroker = async (id: string, assignedTo: string) => {
    setUpdatingId(id)
    try {
      const res = await fetch('/api/ceo/inquiries', {
        method: 'PATCH',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, assignedTo }),
      })
      if (!res.ok) throw new Error('Failed to assign broker')
      setShowAssignModal(null)
      await fetchInquiries()
    } catch (err) {
      console.error('Failed to assign broker:', err)
      alert(ar ? 'معرفناش نوزّع البروكر — حاول تاني.' : 'Failed to assign broker')
    } finally {
      setUpdatingId(null)
    }
  }

  const filteredInquiries = inquiries.filter((inq) => {
    if (activeTab !== 'ALL' && inq.status !== activeTab) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        inq.name.toLowerCase().includes(q) ||
        (inq.email && inq.email.toLowerCase().includes(q)) ||
        inq.phone.includes(q) ||
        (inq.message && inq.message.toLowerCase().includes(q))
      )
    }
    return true
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Reveal>
          <p className="section-kicker">{ar ? 'لوحة المدير · الاستفسارات' : 'CEO Console · Inquiries'}</p>
          <h1 className="font-display display-3 text-foreground">{ar ? 'إدارة الاستفسارات' : 'Inquiry Management'}</h1>
          <p className="mt-1 text-sm text-gray-400">
            {ar ? 'اتحكم ورد على استفسارات العملا' : 'Manage and respond to customer inquiries'}
            {total > 0 && <span className="ml-2 text-estate-gold">({ar ? `${total} في الكل` : `${total} total`})</span>}
          </p>
          <hr className="gold-hairline mt-4" />
        </Reveal>
        <Button onClick={fetchInquiries} variant="outline" className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]">
          <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
          {ar ? 'حدّث' : 'Refresh'}
        </Button>
      </div>

      {/* Status Tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => {
          const count = tab === 'ALL' ? inquiries.length : (statusCounts[tab] || 0)
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

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <Input
          placeholder={ar ? 'دوّر بالاسم أو الإيميل أو التليفون أو الرسالة…' : 'Search by name, email, phone, or message...'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] pl-10 text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50 focus:ring-estate-gold/20"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-400">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
          <Button onClick={fetchInquiries} variant="ghost" size="sm" className="ml-auto text-red-400 hover:text-red-300">
            {ar ? 'حاول تاني' : 'Retry'}
          </Button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-estate-gold" />
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && filteredInquiries.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] py-20">
          <Inbox className="h-12 w-12 text-gray-600" />
          <p className="mt-4 text-lg font-medium text-gray-400">{ar ? 'مفيش استفسارات' : 'No inquiries found'}</p>
          <p className="mt-1 text-sm text-gray-500">
            {search ? (ar ? 'جرّب تظبط البحث' : 'Try adjusting your search criteria') : (ar ? 'مفيش استفسارات مطابقة للفلاتر الحالية' : 'No inquiries match the current filters')}
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && filteredInquiries.length > 0 && (
        <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border dark:border-[#262626]">
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'العميل' : 'Client'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 md:table-cell">{ar ? 'المشروع / الوحدة' : 'Project / Unit'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 sm:table-cell">{ar ? 'النوع' : 'Type'}</th>
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'الحالة' : 'Status'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 lg:table-cell">{ar ? 'الرسالة' : 'Message'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 xl:table-cell">{ar ? 'البروكر' : 'Broker'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 xl:table-cell">{ar ? 'التاريخ' : 'Date'}</th>
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'إجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border dark:divide-[#262626]">
                  {filteredInquiries.map((inq) => {
                    const isExpanded = expandedId === inq.id

                    return (
                      <Fragment key={inq.id}>
                        <tr
                          onClick={() => setExpandedId(isExpanded ? null : inq.id)}
                          className={cn(
                            'cursor-pointer transition-colors hover:bg-card dark:hover:bg-[#0A0A0A]',
                            isExpanded && 'bg-muted'
                          )}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-estate-gold/20 to-estate-gold/5 text-sm font-semibold text-estate-gold">
                                {inq.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium text-foreground">{inq.name}</p>
                                <div className="flex items-center gap-2 text-xs text-gray-500 md:hidden">
                                  <Phone className="h-3 w-3" />
                                  {inq.phone}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="hidden px-4 py-3 md:table-cell">
                            {inq.unit ? (
                              <div>
                                <p className="text-gray-300">{inq.unit.name}</p>
                                {inq.unit.project && (
                                  <p className="text-xs text-gray-500">{inq.unit.project.name}</p>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-600">—</span>
                            )}
                          </td>
                          <td className="hidden px-4 py-3 sm:table-cell">
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
                                INQUIRY_TYPES[inq.type] || 'bg-card dark:bg-[#0A0A0A] text-gray-300'
                              )}
                            >
                              <Tag className="h-3 w-3" />
                              {ar ? INQUIRY_TYPE_AR[inq.type] || inq.type : inq.type}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
                                STATUS_COLORS[inq.status] || 'bg-gray-500/15 text-gray-400 border-gray-500/30'
                              )}
                            >
                              <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOTS[inq.status])} />
                              {statusLabel(inq.status, ar)}
                            </span>
                          </td>
                          <td className="hidden px-4 py-3 lg:table-cell">
                            <p className="max-w-[200px] truncate text-gray-400">
                              {inq.message || '—'}
                            </p>
                          </td>
                          <td className="hidden px-4 py-3 xl:table-cell">
                            {inq.assignedTo ? (
                              <span className="text-gray-300">
                                {brokers.find((b) => b.id === inq.assignedTo)?.user.name || (ar ? 'متوزع' : 'Assigned')}
                              </span>
                            ) : (
                              <span className="text-gray-600">{ar ? 'مش متوزع' : 'Unassigned'}</span>
                            )}
                          </td>
                          <td className="hidden px-4 py-3 xl:table-cell">
                            <span className="text-gray-400">
                              {new Date(inq.createdAt).toLocaleDateString(ar ? 'ar-EG' : 'en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              {/* Status dropdown */}
                              <div className="relative group">
                                <button className="rounded-full border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-1.5 text-gray-400 transition-colors hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-foreground">
                                  <ArrowUpDown className="h-3.5 w-3.5" />
                                </button>
                                <div className="absolute right-0 top-full z-20 mt-1 hidden w-40 rounded-2xl border border-border dark:border-[#262626] bg-[#1a2535] p-1 shadow-xl group-hover:block">
                                  {['NEW', 'CONTACTED', 'RESOLVED', 'CLOSED'].map((s) => (
                                    <button
                                      key={s}
                                      onClick={() => updateInquiryStatus(inq.id, s)}
                                      disabled={inq.status === s || updatingId === inq.id}
                                      className={cn(
                                        'flex w-full items-center gap-2 rounded-full px-3 py-2 text-left text-sm transition-colors',
                                        inq.status === s
                                          ? 'bg-card dark:bg-[#0A0A0A] text-estate-gold'
                                          : 'text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]',
                                        updatingId === inq.id && 'opacity-50'
                                      )}
                                    >
                                      <span className={cn('h-2 w-2 rounded-full', STATUS_DOTS[s])} />
                                      {statusLabel(s, ar)}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Expand */}
                              <button
                                onClick={() => setExpandedId(isExpanded ? null : inq.id)}
                                className="rounded-full border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-1.5 text-gray-400 transition-colors hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-foreground"
                              >
                                {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Expanded Row */}
                        {isExpanded && (
                          <tr key={`${inq.id}-expanded`}>
                            <td colSpan={8} className="border-b border-border dark:border-[#262626] bg-white/[0.02] px-4 py-5">
                              <div className="grid gap-6 lg:grid-cols-3">
                                {/* Client Info */}
                                <div className="space-y-4">
                                  <h4 className="text-sm font-semibold text-estate-gold">{ar ? 'بيانات العميل' : 'Client Information'}</h4>
                                  <div className="space-y-2 text-sm">
                                    <div className="flex items-center gap-2 text-gray-300">
                                      <Phone className="h-3.5 w-3.5 text-gray-500" />
                                      {inq.phone}
                                    </div>
                                    {inq.email && (
                                      <div className="flex items-center gap-2 text-gray-300">
                                        <Mail className="h-3.5 w-3.5 text-gray-500" />
                                        {inq.email}
                                      </div>
                                    )}
                                    <div className="flex items-center gap-2 text-gray-300">
                                      <Calendar className="h-3.5 w-3.5 text-gray-500" />
                                      {new Date(inq.createdAt).toLocaleString(ar ? 'ar-EG' : undefined)}
                                    </div>
                                    {inq.user && (
                                      <div className="flex items-center gap-2 text-gray-300">
                                        <HelpCircle className="h-3.5 w-3.5 text-gray-500" />
                                        {ar ? `يوزر مسجل: ${inq.user.name || inq.user.email}` : `Registered user: ${inq.user.name || inq.user.email}`}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Inquiry Details */}
                                <div className="space-y-4">
                                  <h4 className="text-sm font-semibold text-estate-gold">{ar ? 'تفاصيل الاستفسار' : 'Inquiry Details'}</h4>
                                  <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                      <span className="text-gray-500">{ar ? 'النوع' : 'Type'}</span>
                                      <span className="text-gray-300">{ar ? INQUIRY_TYPE_AR[inq.type] || inq.type : inq.type}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-500">{ar ? 'المصدر' : 'Source'}</span>
                                      <span className="text-gray-300">{inq.source}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-500">{ar ? 'الأولوية' : 'Priority'}</span>
                                      <span className="text-gray-300">{inq.priority}</span>
                                    </div>
                                    {inq.unit && (
                                      <div>
                                        <p className="mb-1 text-gray-500">{ar ? 'الوحدة المرتبطة' : 'Linked Unit'}</p>
                                        <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-2">
                                          <p className="text-gray-300">{inq.unit.name}</p>
                                          <p className="text-xs text-gray-500">{inq.unit.unitType}</p>
                                          {inq.unit.project && (
                                            <p className="text-xs text-estate-gold">{inq.unit.project.name}</p>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Actions */}
                                <div className="space-y-4">
                                  <h4 className="text-sm font-semibold text-estate-gold">{ar ? 'إجراءات' : 'Actions'}</h4>

                                  {/* Broker Assignment */}
                                  <div>
                                    <p className="mb-1 text-xs text-gray-500">{ar ? 'البروكر المسؤول' : 'Assigned Broker'}</p>
                                    {showAssignModal === inq.id ? (
                                      <div className="space-y-2">
                                        <select
                                          className="w-full rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-foreground focus:border-estate-gold focus:outline-none"
                                          onChange={(e) => {
                                            if (e.target.value) assignBroker(inq.id, e.target.value)
                                          }}
                                        >
                                          <option value="">{ar ? 'اختار بروكر…' : 'Select broker...'}</option>
                                          {brokers.map((b) => (
                                            <option key={b.id} value={b.id} className="bg-[#0a1220]">
                                              {b.user.name || b.user.email}
                                            </option>
                                          ))}
                                        </select>
                                        <button
                                          onClick={() => setShowAssignModal(null)}
                                          className="text-xs text-gray-500 hover:text-foreground"
                                        >
                                          {ar ? 'إلغاء' : 'Cancel'}
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => setShowAssignModal(inq.id)}
                                        className="flex w-full items-center gap-2 rounded-full border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-card dark:hover:bg-[#0A0A0A]"
                                      >
                                        <UserPlus className="h-3.5 w-3.5" />
                                        {inq.assignedTo
                                          ? brokers.find((b) => b.id === inq.assignedTo)?.user.name || (ar ? 'متوزع' : 'Assigned')
                                          : (ar ? 'وزّع على بروكر' : 'Assign Broker')}
                                      </button>
                                    )}
                                  </div>

                                  {/* Quick Status */}
                                  <div>
                                    <p className="mb-1 text-xs text-gray-500">{ar ? 'حالة سريعة' : 'Quick Status'}</p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {['NEW', 'CONTACTED', 'RESOLVED', 'CLOSED'].map((s) => (
                                        <button
                                          key={s}
                                          onClick={() => updateInquiryStatus(inq.id, s)}
                                          disabled={inq.status === s || updatingId === inq.id}
                                          className={cn(
                                            'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                                            inq.status === s
                                              ? 'border-estate-gold/30 bg-estate-gold/10 text-estate-gold'
                                              : 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-400 hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-foreground'
                                          )}
                                        >
                                          {statusLabel(s, ar)}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Full Message */}
                              {inq.message && (
                                <div className="mt-6 border-t border-border dark:border-[#262626] pt-5">
                                  <h4 className="mb-3 text-sm font-semibold text-estate-gold">{ar ? 'الرسالة كاملة' : 'Full Message'}</h4>
                                  <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-4">
                                    <p className="whitespace-pre-wrap text-sm text-gray-300">{inq.message}</p>
                                  </div>
                                </div>
                              )}

                              {/* Notes */}
                              {inq.notes && (
                                <div className="mt-4">
                                  <h4 className="mb-2 text-sm font-semibold text-estate-gold">{ar ? 'ملاحظات داخلية' : 'Internal Notes'}</h4>
                                  <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-4">
                                    <p className="whitespace-pre-wrap text-sm text-gray-400">{inq.notes}</p>
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
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
