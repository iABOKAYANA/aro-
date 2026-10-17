'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatEGP, cn } from '@/lib/utils'
import ExportCsvBtn from '@/components/ui/export-csv'
import { useLanguage } from '@/lib/language-context'
import { statusLabel } from '@/components/ceo/ceo-charts'
import {
  Search,
  Users,
  UserPlus,
  Phone,
  Mail,
  MapPin,
  DollarSign,
  Calendar,
  ChevronDown,
  ChevronUp,
  Trash2,
  RefreshCw,
  Filter,
  X,
  Clock,
  Star,
  MessageSquare,
  Loader2,
  AlertCircle,
  Inbox,
  ArrowUpDown,
  Eye,
  CheckCircle2,
} from 'lucide-react'
import { Reveal } from '@/components/design'
import DuplicatesPanel from './components/duplicates-panel'
import BulkToolbar from './components/bulk-toolbar'

type Lead = {
  id: string
  leadCode: string | null
  name: string
  email: string | null
  phone: string
  source: string
  status: string
  reviewStatus: string
  protectionStartsAt: string | null
  protectionExpiresAt: string | null
  protectionDays: number | null
  protectionStatus?: 'PROTECTED' | 'EXPIRING_SOON' | 'EXPIRED' | 'NONE'
  duplicateNote: string | null
  budgetMin: number | null
  budgetMax: number | null
  preferredPropertyTypes: string
  preferredAreas: string
  notes: string | null
  score: number | null
  tags: string
  lostReason: string | null
  contactedAt: string | null
  convertedAt: string | null
  createdAt: string
  updatedAt: string
  project?: { id: string; name: string } | null
  broker: {
    id: string
    user: { name: string | null; email: string | null }
  } | null
  activities: {
    id: string
    type: string
    content: string | null
    createdAt: string
  }[]
}

type Broker = {
  id: string
  user: { name: string | null; email: string | null }
}

const STATUS_TABS = ['ALL', 'NEW', 'CONTACTED', 'QUALIFIED', 'VIEWING', 'INTERESTED', 'RESERVATION', 'CONTRACT', 'SOLD', 'LOST'] as const

const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  CONTACTED: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  QUALIFIED: 'bg-green-500/15 text-green-400 border-green-500/30',
  VIEWING: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  INTERESTED: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
  RESERVATION: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  CONTRACT: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  SOLD: 'bg-green-600/15 text-green-400 border-green-600/30',
  CANCELLED: 'bg-red-500/15 text-red-400 border-red-500/30',
  EXPIRED: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
  CONVERTED: 'bg-[#D4A843]/15 text-[#D4A843] border-[#D4A843]/30',
  LOST: 'bg-red-500/15 text-red-400 border-red-500/30',
}

const STATUS_DOTS: Record<string, string> = {
  NEW: 'bg-blue-400',
  CONTACTED: 'bg-yellow-400',
  QUALIFIED: 'bg-green-400',
  VIEWING: 'bg-purple-400',
  INTERESTED: 'bg-teal-400',
  RESERVATION: 'bg-orange-400',
  CONTRACT: 'bg-indigo-400',
  SOLD: 'bg-green-500',
  CANCELLED: 'bg-red-400',
  EXPIRED: 'bg-gray-400',
  CONVERTED: 'bg-[#D4A843]',
  LOST: 'bg-red-400',
}

const PROTECTION_BADGES: Record<string, { label: string; labelAr: string; cls: string }> = {
  PROTECTED: { label: 'Protected', labelAr: 'محمي', cls: 'border border-green-500/30 bg-green-500/10 text-green-400' },
  EXPIRING_SOON: { label: 'Expiring soon', labelAr: 'هيخلص قريب', cls: 'border border-amber-500/30 bg-amber-500/10 text-amber-400' },
  EXPIRED: { label: 'Expired', labelAr: 'خلص', cls: 'border border-red-500/30 bg-red-500/10 text-red-400' },
  NONE: { label: 'No protection', labelAr: 'من غير حماية', cls: 'border border-gray-500/30 bg-gray-500/10 text-gray-400' },
}

export default function CEOLeadsPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<string>('ALL')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [brokers, setBrokers] = useState<Broker[]>([])
  const [showAssignModal, setShowAssignModal] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [notesEditId, setNotesEditId] = useState<string | null>(null)
  const [notesText, setNotesText] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const fetchLeads = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (activeTab !== 'ALL') params.set('status', activeTab)
      const res = await fetch(`/api/ceo/leads?${params}`)
      if (!res.ok) throw new Error('Failed to fetch leads')
      const data = await res.json()
      setLeads(data.leads || [])
    } catch (err) {
      console.error('Failed to fetch leads:', err)
      setError(ar ? 'معرفناش نجيب الليدز — حاول تاني.' : 'Failed to fetch leads')
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
    fetchLeads()
  }, [fetchLeads])

  useEffect(() => {
    fetchBrokers()
  }, [fetchBrokers])

  const statusCounts = leads.reduce(
    (acc, lead) => {
      acc[lead.status] = (acc[lead.status] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  const updateLeadStatus = async (id: string, status: string) => {
    setUpdatingId(id)
    try {
      const res = await fetch('/api/ceo/leads', {
        method: 'PATCH',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to update lead')
      }
      await fetchLeads()
    } catch (err) {
      console.error('Failed to update lead:', err)
      alert(ar ? 'معرفناش نحدّث الليد — حاول تاني.' : 'Failed to update lead')
    } finally {
      setUpdatingId(null)
    }
  }

  const assignBroker = async (id: string, brokerId: string) => {
    setUpdatingId(id)
    try {
      const res = await fetch('/api/ceo/leads', {
        method: 'PATCH',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, brokerId }),
      })
      if (!res.ok) throw new Error('Failed to assign broker')
      setShowAssignModal(null)
      await fetchLeads()
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
      const res = await fetch('/api/ceo/leads', {
        method: 'PATCH',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, notes: notesText }),
      })
      if (!res.ok) throw new Error('Failed to save notes')
      setNotesEditId(null)
      await fetchLeads()
    } catch (err) {
      console.error('Failed to save notes:', err)
      alert(ar ? 'معرفناش نحفظ الملاحظات — حاول تاني.' : 'Failed to save notes')
    } finally {
      setUpdatingId(null)
    }
  }

  const deleteLead = async (id: string) => {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/ceo/leads?id=${id}`, { method: 'DELETE', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to delete lead')
      }
      setDeleteConfirmId(null)
      setExpandedId(null)
      await fetchLeads()
    } catch (err) {
      console.error('Failed to delete lead:', err)
      alert(ar ? 'معرفناش نمسح الليد — حاول تاني.' : 'Failed to delete lead')
    } finally {
      setDeletingId(null)
    }
  }

  const parseJsonArray = (val: string): string[] => {
    try {
      const parsed = JSON.parse(val)
      if (Array.isArray(parsed)) return parsed
      return []
    } catch {
      return []
    }
  }

  const filteredLeads = leads.filter((lead) => {
    if (activeTab !== 'ALL' && lead.status !== activeTab) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        lead.name.toLowerCase().includes(q) ||
        (lead.email && lead.email.toLowerCase().includes(q)) ||
        lead.phone.includes(q)
      )
    }
    return true
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Reveal>
          <p className="section-kicker">{ar ? 'لوحة المدير · الليدز' : 'CEO Console · Leads'}</p>
          <h1 className="font-display display-3 text-foreground">{ar ? 'إدارة الليدز' : 'Lead Management'}</h1>
          <p className="mt-1 text-sm text-gray-400">{ar ? 'تابع واتحكم في كل ليدز العملا في مسار المبيعات' : 'Track and manage all customer leads across your sales pipeline'}</p>
          <hr className="gold-hairline mt-4" />
        </Reveal>
        <div className="flex gap-2">
          <Button onClick={() => setShowAddModal(true)} className="gold-shimmer bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold/90">
            <UserPlus className="mr-2 h-4 w-4" />
            {ar ? 'ضيف ليد' : 'Add lead'}
          </Button>
          <Button onClick={fetchLeads} variant="outline" className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]">
            <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
            {ar ? 'حدّث' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <Reveal className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {STATUS_TABS.map((tab) => {
          const count = tab === 'ALL' ? leads.length : (statusCounts[tab] || 0)
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
      </Reveal>

      {/* Search + export */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <Input
            placeholder={ar ? 'دوّر بالاسم أو الإيميل أو التليفون…' : 'Search by name, email, or phone...'}
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

        {/* Exports exactly the rows shown in the current tab/search. */}
        <ExportCsvBtn
          filename="ceo-leads"
          rows={filteredLeads.map((l) => ({
            leadCode: l.leadCode,
            name: l.name,
            email: l.email,
            phone: l.phone,
            source: l.source,
            status: l.status,
            reviewStatus: l.reviewStatus,
            score: l.score,
            budgetMin: l.budgetMin,
            budgetMax: l.budgetMax,
            preferredPropertyTypes: l.preferredPropertyTypes,
            preferredAreas: l.preferredAreas,
            project: l.project?.name ?? '',
            broker: l.broker?.user?.name ?? (ar ? 'مش متوزع' : 'Unassigned'),
            protectionExpiresAt: l.protectionExpiresAt,
            contactedAt: l.contactedAt,
            convertedAt: l.convertedAt,
            lostReason: l.lostReason,
            createdAt: l.createdAt,
            notes: l.notes,
          }))}
          columns={[
            { key: 'leadCode', label: ar ? 'كود الليد' : 'Lead code' },
            { key: 'name', label: ar ? 'الاسم' : 'Name' },
            { key: 'email', label: ar ? 'الإيميل' : 'Email' },
            { key: 'phone', label: ar ? 'التليفون' : 'Phone' },
            { key: 'source', label: ar ? 'المصدر' : 'Source' },
            { key: 'status', label: ar ? 'الحالة' : 'Status' },
            { key: 'reviewStatus', label: ar ? 'حالة المراجعة' : 'Review status' },
            { key: 'score', label: ar ? 'السكور' : 'Score' },
            { key: 'budgetMin', label: ar ? 'أقل ميزانية' : 'Budget min' },
            { key: 'budgetMax', label: ar ? 'أعلى ميزانية' : 'Budget max' },
            { key: 'preferredPropertyTypes', label: ar ? 'الأنواع المفضلة' : 'Preferred types' },
            { key: 'preferredAreas', label: ar ? 'المناطق المفضلة' : 'Preferred areas' },
            { key: 'project', label: ar ? 'المشروع' : 'Project' },
            { key: 'broker', label: ar ? 'البروكر' : 'Broker' },
            { key: 'protectionExpiresAt', label: ar ? 'الحماية بتخلص' : 'Protection ends' },
            { key: 'contactedAt', label: ar ? 'اتتواصل معاه' : 'Contacted' },
            { key: 'convertedAt', label: ar ? 'اتحوّل' : 'Converted' },
            { key: 'lostReason', label: ar ? 'سبب الضياع' : 'Lost reason' },
            { key: 'createdAt', label: ar ? 'اتعمل' : 'Created' },
            { key: 'notes', label: ar ? 'ملاحظات' : 'Notes' },
          ]}
          className="self-start sm:self-auto"
        />
      </div>

      {/* Bulk actions + duplicates */}
      <BulkToolbar
        selectedIds={selectedIds}
        brokers={brokers}
        onDone={fetchLeads}
        onClear={() => setSelectedIds([])}
      />
      <DuplicatesPanel brokers={brokers} onMerged={fetchLeads} />

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-400">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
          <Button onClick={fetchLeads} variant="ghost" size="sm" className="ml-auto text-red-400 hover:text-red-300">
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
      {!loading && !error && filteredLeads.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] py-20">
          <Inbox className="h-12 w-12 text-gray-600" />
          <p className="mt-4 text-lg font-medium text-gray-400">{ar ? 'مفيش ليدز' : 'No leads found'}</p>
          <p className="mt-1 text-sm text-gray-500">
            {search ? (ar ? 'جرّب تظبط البحث' : 'Try adjusting your search criteria') : (ar ? 'مفيش ليدز مطابقة للفلاتر الحالية' : 'No leads match the current filters')}
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && filteredLeads.length > 0 && (
        <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border dark:border-[#262626]">
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={filteredLeads.length > 0 && filteredLeads.every((l) => selectedIds.includes(l.id))}
                        onChange={(e) => setSelectedIds(e.target.checked ? filteredLeads.map((l) => l.id) : [])}
                        aria-label={ar ? 'علّم على الكل' : 'Select all'}
                        className="h-4 w-4 accent-[#D4A843]"
                      />
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'الليد' : 'Lead'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 md:table-cell">{ar ? 'التواصل' : 'Contact'}</th>
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'الحالة' : 'Status'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 xl:table-cell">{ar ? 'الحماية' : 'Protection'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 lg:table-cell">{ar ? 'الميزانية' : 'Budget'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 lg:table-cell">{ar ? 'المصدر' : 'Source'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 xl:table-cell">{ar ? 'البروكر' : 'Broker'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 xl:table-cell">{ar ? 'التاريخ' : 'Date'}</th>
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'إجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border dark:divide-[#262626]">
                  {filteredLeads.map((lead) => {
                    const isExpanded = expandedId === lead.id
                    const preferredAreas = parseJsonArray(lead.preferredAreas)
                    const preferredTypes = parseJsonArray(lead.preferredPropertyTypes)

                    return (
                      <>
                        <tr
                          key={lead.id}
                          onClick={() => setExpandedId(isExpanded ? null : lead.id)}
                          className={cn(
                            'cursor-pointer transition-colors hover:bg-card dark:hover:bg-[#0A0A0A]',
                            isExpanded && 'bg-muted'
                          )}
                        >
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(lead.id)}
                              onChange={(e) =>
                                setSelectedIds(
                                  e.target.checked
                                    ? [...selectedIds, lead.id]
                                    : selectedIds.filter((id) => id !== lead.id)
                                )
                              }
                              aria-label={ar ? `علّم على ${lead.name}` : `Select ${lead.name}`}
                              className="h-4 w-4 accent-[#D4A843]"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-estate-gold/20 to-estate-gold/5 text-sm font-semibold text-estate-gold">
                                {lead.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium text-foreground">{lead.name}</p>
                                {lead.leadCode && (
                                  <p className="font-mono text-xs text-estate-gold">{lead.leadCode}</p>
                                )}
                                <p className="text-xs text-gray-500 md:hidden">{lead.phone}</p>
                              </div>
                            </div>
                          </td>
                          <td className="hidden px-4 py-3 md:table-cell">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5 text-gray-400">
                                <Phone className="h-3 w-3" />
                                <span>{lead.phone}</span>
                              </div>
                              {lead.email && (
                                <div className="flex items-center gap-1.5 text-gray-500">
                                  <Mail className="h-3 w-3" />
                                  <span className="truncate max-w-[160px]">{lead.email}</span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
                                STATUS_COLORS[lead.status] || 'bg-gray-500/15 text-gray-400 border-gray-500/30'
                              )}
                            >
                              <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOTS[lead.status])} />
                              {statusLabel(lead.status, ar)}
                            </span>
                            {lead.reviewStatus === 'DUPLICATE_REVIEW' && (
                              <span className="ml-1.5 inline-flex items-center rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[10px] font-medium text-orange-400">
                                {ar ? 'مكرر' : 'DUPLICATE'}
                              </span>
                            )}
                          </td>
                          <td className="hidden px-4 py-3 xl:table-cell">
                            {(() => {
                              const badge = PROTECTION_BADGES[lead.protectionStatus || 'NONE'] || PROTECTION_BADGES.NONE
                              return (
                                <div>
                                  <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', badge.cls)}>
                                    {ar ? badge.labelAr : badge.label}
                                  </span>
                                  {lead.protectionExpiresAt && (
                                    <p className="mt-1 text-[11px] text-gray-500">
                                      → {new Date(lead.protectionExpiresAt).toLocaleDateString(ar ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </p>
                                  )}
                                </div>
                              )
                            })()}
                          </td>
                          <td className="hidden px-4 py-3 lg:table-cell">
                            {lead.budgetMin != null || lead.budgetMax != null ? (
                              <div className="text-gray-300">
                                {lead.budgetMin != null && lead.budgetMax != null
                                  ? `${formatEGP(lead.budgetMin)} - ${formatEGP(lead.budgetMax)}`
                                  : lead.budgetMin != null
                                    ? (ar ? `من ${formatEGP(lead.budgetMin)}` : `From ${formatEGP(lead.budgetMin)}`)
                                    : (ar ? `لحد ${formatEGP(lead.budgetMax!)}` : `Up to ${formatEGP(lead.budgetMax!)}`)}
                              </div>
                            ) : (
                              <span className="text-gray-600">—</span>
                            )}
                          </td>
                          <td className="hidden px-4 py-3 lg:table-cell">
                            <span className="text-gray-400">{lead.source}</span>
                          </td>
                          <td className="hidden px-4 py-3 xl:table-cell">
                            {lead.broker ? (
                              <span className="text-gray-300">{lead.broker.user.name || (ar ? 'مش متوزع' : 'Unassigned')}</span>
                            ) : (
                              <span className="text-gray-600">{ar ? 'مش متوزع' : 'Unassigned'}</span>
                            )}
                          </td>
                          <td className="hidden px-4 py-3 xl:table-cell">
                            <span className="text-gray-400">
                              {new Date(lead.createdAt).toLocaleDateString(ar ? 'ar-EG' : 'en-US', {
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
                                  {['NEW', 'CONTACTED', 'QUALIFIED', 'VIEWING', 'INTERESTED', 'RESERVATION', 'CONTRACT', 'SOLD', 'LOST'].map((s) => (
                                    <button
                                      key={s}
                                      onClick={() => updateLeadStatus(lead.id, s)}
                                      disabled={lead.status === s || updatingId === lead.id}
                                      className={cn(
                                        'flex w-full items-center gap-2 rounded-full px-3 py-2 text-left text-sm transition-colors',
                                        lead.status === s
                                          ? 'bg-card dark:bg-[#0A0A0A] text-estate-gold'
                                          : 'text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]',
                                        updatingId === lead.id && 'opacity-50'
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
                                onClick={() => setExpandedId(isExpanded ? null : lead.id)}
                                className="rounded-full border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-1.5 text-gray-400 transition-colors hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-foreground"
                              >
                                {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Expanded Row */}
                        {isExpanded && (
                          <tr key={`${lead.id}-expanded`}>
                            <td colSpan={10} className="border-b border-border dark:border-[#262626] bg-white/[0.02] px-4 py-5">
                              <div className="grid gap-6 lg:grid-cols-3">
                                {/* Details */}
                                <div className="space-y-4">
                                  <h4 className="text-sm font-semibold text-estate-gold">{ar ? 'تفاصيل الليد' : 'Lead Details'}</h4>
                                  <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                      <span className="text-gray-500">{ar ? 'التليفون' : 'Phone'}</span>
                                      <span className="text-gray-300">{lead.phone}</span>
                                    </div>
                                    {lead.email && (
                                      <div className="flex justify-between">
                                        <span className="text-gray-500">{ar ? 'الإيميل' : 'Email'}</span>
                                        <span className="text-gray-300">{lead.email}</span>
                                      </div>
                                    )}
                                    <div className="flex justify-between">
                                      <span className="text-gray-500">{ar ? 'المصدر' : 'Source'}</span>
                                      <span className="text-gray-300">{lead.source}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-500">{ar ? 'السكور' : 'Score'}</span>
                                      <span className="text-gray-300">{lead.score ?? (ar ? 'مفيش' : 'N/A')}</span>
                                    </div>
                                    {lead.lostReason && (
                                      <div className="flex justify-between">
                                        <span className="text-gray-500">{ar ? 'سبب الضياع' : 'Lost Reason'}</span>
                                        <span className="text-red-400">{lead.lostReason}</span>
                                      </div>
                                    )}
                                    <div className="flex justify-between">
                                      <span className="text-gray-500">{ar ? 'اتعمل' : 'Created'}</span>
                                      <span className="text-gray-300">
                                        {new Date(lead.createdAt).toLocaleDateString(ar ? 'ar-EG' : undefined)}
                                      </span>
                                    </div>
                                    {lead.contactedAt && (
                                      <div className="flex justify-between">
                                        <span className="text-gray-500">{ar ? 'أول تواصل' : 'First Contacted'}</span>
                                        <span className="text-gray-300">
                                          {new Date(lead.contactedAt).toLocaleDateString(ar ? 'ar-EG' : undefined)}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Preferences */}
                                <div className="space-y-4">
                                  <h4 className="text-sm font-semibold text-estate-gold">{ar ? 'التفضيلات' : 'Preferences'}</h4>
                                  <div className="space-y-3">
                                    <div>
                                      <p className="mb-1 text-xs text-gray-500">{ar ? 'الميزانية' : 'Budget Range'}</p>
                                      <p className="text-sm text-gray-300">
                                        {lead.budgetMin != null && lead.budgetMax != null
                                          ? `${formatEGP(lead.budgetMin)} - ${formatEGP(lead.budgetMax)}`
                                          : (ar ? 'مش متحدد' : 'Not specified')}
                                      </p>
                                    </div>
                                    {preferredAreas.length > 0 && (
                                      <div>
                                        <p className="mb-1 text-xs text-gray-500">{ar ? 'المناطق المفضلة' : 'Preferred Areas'}</p>
                                        <div className="flex flex-wrap gap-1.5">
                                          {preferredAreas.map((area) => (
                                            <span key={area} className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-gray-300">
                                              {area}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {preferredTypes.length > 0 && (
                                      <div>
                                        <p className="mb-1 text-xs text-gray-500">{ar ? 'أنواع العقارات' : 'Property Types'}</p>
                                        <div className="flex flex-wrap gap-1.5">
                                          {preferredTypes.map((type) => (
                                            <span key={type} className="rounded-full bg-estate-gold/10 px-2.5 py-0.5 text-xs text-estate-gold">
                                              {type}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Actions & Notes */}
                                <div className="space-y-4">
                                  <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-semibold text-estate-gold">{ar ? 'إجراءات' : 'Actions'}</h4>
                                  </div>

                                  {/* Broker Assignment */}
                                  <div>
                                    <p className="mb-1 text-xs text-gray-500">{ar ? 'البروكر المسؤول' : 'Assigned Broker'}</p>
                                    {showAssignModal === lead.id ? (
                                      <div className="space-y-2">
                                        <select
                                          className="w-full rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-foreground focus:border-estate-gold focus:outline-none"
                                          onChange={(e) => {
                                            if (e.target.value) assignBroker(lead.id, e.target.value)
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
                                        onClick={() => setShowAssignModal(lead.id)}
                                        className="flex w-full items-center gap-2 rounded-full border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-card dark:hover:bg-[#0A0A0A]"
                                      >
                                        <UserPlus className="h-3.5 w-3.5" />
                                        {lead.broker?.user.name || (ar ? 'وزّع على بروكر' : 'Assign Broker')}
                                      </button>
                                    )}
                                  </div>

                                  {/* Notes */}
                                  <div>
                                    <div className="mb-1 flex items-center justify-between">
                                      <p className="text-xs text-gray-500">{ar ? 'ملاحظات' : 'Notes'}</p>
                                      {notesEditId !== lead.id && (
                                        <button
                                          onClick={() => {
                                            setNotesEditId(lead.id)
                                            setNotesText(lead.notes || '')
                                          }}
                                          className="text-xs text-estate-gold hover:text-estate-gold/80"
                                        >
                                          {ar ? 'تعديل' : 'Edit'}
                                        </button>
                                      )}
                                    </div>
                                    {notesEditId === lead.id ? (
                                      <div className="space-y-2">
                                        <textarea
                                          value={notesText}
                                          onChange={(e) => setNotesText(e.target.value)}
                                          rows={3}
                                          className="w-full rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-estate-gold focus:outline-none"
                                          placeholder={ar ? 'اكتب ملاحظات عن الليد ده…' : 'Add notes about this lead...'}
                                        />
                                        <div className="flex gap-2">
                                          <Button
                                            size="sm"
                                            onClick={() => saveNotes(lead.id)}
                                            disabled={updatingId === lead.id}
                                            className="bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold/90"
                                          >
                                            {ar ? 'احفظ' : 'Save'}
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => setNotesEditId(null)}
                                            className="text-gray-400 hover:text-foreground"
                                          >
                                            {ar ? 'إلغاء' : 'Cancel'}
                                          </Button>
                                        </div>
                                      </div>
                                    ) : (
                                      <p className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-gray-400">
                                        {lead.notes || (ar ? 'مفيش ملاحظات لسه' : 'No notes yet')}
                                      </p>
                                    )}
                                  </div>

                                  {/* Delete */}
                                  {deleteConfirmId === lead.id ? (
                                    <div className="flex items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 p-3">
                                      <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-400" />
                                      <span className="text-xs text-red-400">{ar ? 'امسح الليد ده؟' : 'Delete this lead?'}</span>
                                      <div className="ml-auto flex gap-1">
                                        <button
                                          onClick={() => deleteLead(lead.id)}
                                          disabled={deletingId === lead.id}
                                          className="rounded-full bg-red-500 px-2 py-1 text-xs text-white hover:bg-red-600"
                                        >
                                          {deletingId === lead.id ? '...' : (ar ? 'أيوه' : 'Yes')}
                                        </button>
                                        <button
                                          onClick={() => setDeleteConfirmId(null)}
                                          className="rounded-full px-2 py-1 text-xs text-gray-400 hover:text-foreground"
                                        >
                                          {ar ? 'لأ' : 'No'}
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setDeleteConfirmId(lead.id)}
                                      className="flex w-full items-center gap-2 rounded-full border border-red-500/10 bg-red-500/5 px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/10"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                      {ar ? 'امسح الليد' : 'Delete Lead'}
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Activity Timeline */}
                              {lead.activities.length > 0 && (
                                <div className="mt-6 border-t border-border dark:border-[#262626] pt-5">
                                  <h4 className="mb-3 text-sm font-semibold text-estate-gold">{ar ? 'آخر النشاطات' : 'Recent Activity'}</h4>
                                  <div className="space-y-2">
                                    {lead.activities.map((activity) => (
                                      <div key={activity.id} className="flex items-start gap-3 text-sm">
                                        <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-estate-gold/50" />
                                        <div>
                                          <span className="font-medium text-gray-300">{activity.type}</span>
                                          {activity.content && (
                                            <span className="ml-2 text-gray-500">— {activity.content}</span>
                                          )}
                                          <p className="mt-0.5 text-xs text-gray-600">
                                            {new Date(activity.createdAt).toLocaleString(ar ? 'ar-EG' : undefined)}
                                          </p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
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

      {showAddModal && (
        <AddLeadModal
          brokers={brokers}
          onClose={() => setShowAddModal(false)}
          onCreated={fetchLeads}
        />
      )}
    </div>
  )
}

/* ─── Add lead dialog (POST /api/ceo/leads) ────────────── */

const SOURCE_CHIPS = [
  { value: 'COLD_CALL', label: 'Cold Call', labelAr: 'كولد كول' },
  { value: 'WEBSITE', label: 'Website', labelAr: 'الموقع' },
  { value: 'REFERRAL', label: 'Referral', labelAr: 'ترشيح' },
  { value: 'SOCIAL', label: 'Social', labelAr: 'سوشيال' },
  { value: 'WALK_IN', label: 'Walk-in', labelAr: 'عميل دخل' },
] as const

const CREATE_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'VIEWING', 'INTERESTED', 'RESERVATION', 'CONTRACT', 'SOLD', 'LOST'] as const

type AddLeadForm = {
  name: string
  phone: string
  email: string
  source: string
  brokerId: string
  projectId: string
  unitId: string
  developerId: string
  notes: string
  budgetMin: string
  budgetMax: string
  status: string
  priority: number
  reason: string
}

const EMPTY_ADD_FORM: AddLeadForm = {
  name: '',
  phone: '',
  email: '',
  source: 'WEBSITE',
  brokerId: '',
  projectId: '',
  unitId: '',
  developerId: '',
  notes: '',
  budgetMin: '',
  budgetMax: '',
  status: 'NEW',
  priority: 3,
  reason: '',
}

type ProjectOpt = {
  id: string
  name: string
  developerId: string
  developer: { id: string; companyName: string }
}

type DeveloperOpt = { id: string; companyName: string }
type UnitOpt = { id: string; name: string; projectId: string }

function AddLeadModal({
  brokers,
  onClose,
  onCreated,
}: {
  brokers: Broker[]
  onClose: () => void
  onCreated: () => void
}) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [form, setForm] = useState<AddLeadForm>(EMPTY_ADD_FORM)
  const [projects, setProjects] = useState<ProjectOpt[] | null>(null)
  const [developers, setDevelopers] = useState<DeveloperOpt[] | null>(null)
  const [units, setUnits] = useState<UnitOpt[] | null>(null)
  const [unitsLoading, setUnitsLoading] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ duplicate: boolean; leadCode: string | null; message: string } | null>(null)

  const patch = (p: Partial<AddLeadForm>) => setForm((f) => ({ ...f, ...p }))

  // Project + developer pickers — same endpoints as the broker access modal.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [projRes, devRes] = await Promise.all([
          fetch('/api/ceo/projects-all?limit=100'),
          fetch('/api/ceo/developers'),
        ])
        if (cancelled) return
        if (projRes.ok) {
          const data = await projRes.json()
          setProjects(data.items || [])
        } else {
          setProjects([])
        }
        if (devRes.ok) {
          const data = await devRes.json()
          setDevelopers(data.developers || [])
        } else {
          setDevelopers([])
        }
      } catch {
        if (!cancelled) {
          setProjects([])
          setDevelopers([])
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Units follow the chosen project (unit wins over project server-side).
  useEffect(() => {
    if (!form.projectId) {
      setUnits(null)
      return
    }
    let cancelled = false
    setUnitsLoading(true)
    fetch(`/api/ceo/units?projectId=${encodeURIComponent(form.projectId)}`)
      .then(async (r) => {
        if (cancelled) return
        if (!r.ok) throw new Error('units failed')
        const data = await r.json()
        if (!cancelled) setUnits(data.units || [])
      })
      .catch(() => {
        if (!cancelled) setUnits([])
      })
      .finally(() => {
        if (!cancelled) setUnitsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [form.projectId])

  const validate = (): string[] => {
    const errs: string[] = []
    const name = form.name.trim()
    if (!name || name.length < 2) {
      errs.push(ar ? 'اكتب اسم العميل (حرفين على الأقل).' : 'Client name is required (at least 2 characters).')
    }
    if (!/^\+?[\d\s\-().]{7,30}$/.test(form.phone.trim())) {
      errs.push(ar ? 'اكتب رقم تليفون صحيح — ده إجباري.' : 'A valid phone number is required.')
    }
    const email = form.email.trim()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.slice(0, 254))) {
      errs.push(ar ? 'الإيميل شكله مش مظبوط — راجعه.' : 'That email address does not look right.')
    }
    if (form.source.trim().length > 40) {
      errs.push(ar ? 'المصدر طويل زيادة (آخره ٤٠ حرف).' : 'Source is too long (max 40 characters).')
    }
    for (const [key, labelAr, labelEn] of [
      ['budgetMin', 'أقل ميزانية', 'Budget min'],
      ['budgetMax', 'أعلى ميزانية', 'Budget max'],
    ] as const) {
      const raw = form[key].trim()
      if (raw && (Number.isNaN(Number(raw)) || Number(raw) < 0)) {
        errs.push(ar ? `${labelAr} لازم تبقى رقم موجب.` : `${labelEn} must be a positive number.`)
      }
    }
    if (form.notes.length > 4000) {
      errs.push(ar ? 'الملاحظات طويلة أوي (آخرها ٤٠٠٠ حرف).' : 'Notes are too long (max 4000 characters).')
    }
    return errs
  }

  const submit = async () => {
    const errs = validate()
    setErrors(errs)
    setServerError(null)
    if (errs.length > 0) return
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        source: form.source.trim() || 'WEBSITE',
        status: form.status,
        priority: form.priority,
      }
      if (form.email.trim()) payload.email = form.email.trim()
      if (form.brokerId) payload.brokerId = form.brokerId
      if (form.projectId) payload.projectId = form.projectId
      if (form.unitId) payload.unitId = form.unitId
      if (form.developerId) payload.developerId = form.developerId
      if (form.notes) payload.notes = form.notes
      if (form.budgetMin.trim()) payload.budgetMin = Number(form.budgetMin)
      if (form.budgetMax.trim()) payload.budgetMax = Number(form.budgetMax)
      if (form.reason.trim()) payload.reason = form.reason.trim()

      const res = await fetch('/api/ceo/leads', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create lead')
      }
      const isDup = !!(data.duplicate || data.claimed)
      setResult({
        duplicate: isDup,
        leadCode: data.lead?.leadCode ?? null,
        message: typeof data.message === 'string' ? data.message : '',
      })
      setErrors([])
      onCreated()
    } catch (err) {
      console.error('Failed to create lead:', err)
      setServerError(
        ar
          ? `معرفناش نضيف الليد — ${err instanceof Error ? err.message : 'حاول تاني.'}`
          : `Could not add the lead — ${err instanceof Error ? err.message : 'try again.'}`
      )
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setForm(EMPTY_ADD_FORM)
    setResult(null)
    setErrors([])
    setServerError(null)
  }

  const fieldCls =
    'h-10 w-full rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-estate-gold/50 focus:ring-1 focus:ring-estate-gold/20'
  const labelCls = 'mb-1.5 block text-xs font-medium text-gray-400'

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative my-8 w-full max-w-2xl rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-black p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-lg font-semibold text-foreground">{ar ? 'ضيف ليد جديد' : 'Add a new lead'}</h3>
            <p className="mt-0.5 text-sm text-gray-400">
              {ar ? 'الاسم والتليفون إجباري — الباقي اختياري' : 'Name and phone are required — everything else is optional'}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={ar ? 'اقفل' : 'Close'}
            className="rounded-full p-1 text-gray-500 transition-colors hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {result ? (
          /* Friendly duplicate / success panel — never error-scary. */
          <div className="space-y-4">
            <div
              className={cn(
                'flex items-start gap-3 rounded-2xl border p-4',
                result.duplicate
                  ? 'border-blue-500/30 bg-blue-500/10'
                  : 'border-green-500/30 bg-green-500/10'
              )}
            >
              <CheckCircle2
                className={cn('mt-0.5 h-5 w-5 shrink-0', result.duplicate ? 'text-blue-400' : 'text-green-400')}
              />
              <div>
                <p className={cn('text-sm font-semibold', result.duplicate ? 'text-blue-300' : 'text-green-300')}>
                  {result.duplicate
                    ? (ar ? 'العميل ده متسجل عندنا أوريدي' : 'This client is already on the books')
                    : (ar ? 'الليد اتضاف واتسجّل' : 'Lead added and logged')}
                  {result.leadCode && (
                    <span className="ml-2 font-mono text-xs text-estate-gold">{result.leadCode}</span>
                  )}
                </p>
                <p className="mt-1 text-sm text-gray-400">
                  {result.duplicate
                    ? (ar
                      ? 'مفيش مشكلة خالص — البيانات اللي دخلتها اتراجعت مع الموجود، والليد الأصلي هو اللي شغال. دوس تمام وهتلاقيه في الجدول.'
                      : 'No problem at all — what you entered was matched against the existing record, and the original lead stays live. Hit done and you will find it in the table.')
                    : (ar ? 'الليد اتعمل واتوزّع والحماية اشتغلت.' : 'The lead was created, routed and protected.')}
                </p>
                {result.message && (
                  <p className="mt-1 text-xs text-gray-500">{result.message}</p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-3 border-t border-border dark:border-[#262626] pt-4">
              <Button
                variant="outline"
                onClick={reset}
                className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]"
              >
                {ar ? 'ضيف واحد تاني' : 'Add another'}
              </Button>
              <Button onClick={onClose} className="gold-shimmer bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold/90">
                {ar ? 'تمام' : 'Done'}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Validation summary */}
            {errors.length > 0 && (
              <div className="mb-4 flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                <div>
                  <p className="text-sm font-semibold text-red-300">
                    {ar ? 'راجع الحاجات دي قبل ما تحفظ:' : 'Please fix these before saving:'}
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-red-300/90">
                    {errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {serverError && (
              <div className="mb-4 flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                <span>{serverError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>
                  {ar ? 'اسم العميل *' : 'Client name *'}
                </label>
                <input
                  className={fieldCls}
                  value={form.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  placeholder={ar ? 'مثال: أحمد محمود' : 'e.g. Ahmed Mahmoud'}
                />
              </div>
              <div>
                <label className={labelCls}>
                  {ar ? 'التليفون *' : 'Phone *'}
                </label>
                <input
                  dir="ltr"
                  className={cn(fieldCls, 'text-left')}
                  value={form.phone}
                  onChange={(e) => patch({ phone: e.target.value })}
                  placeholder="+20 1xxxxxxxxx"
                />
              </div>
              <div>
                <label className={labelCls}>{ar ? 'الإيميل' : 'Email'}</label>
                <input
                  dir="ltr"
                  className={cn(fieldCls, 'text-left')}
                  value={form.email}
                  onChange={(e) => patch({ email: e.target.value })}
                  placeholder="name@mail.com"
                />
              </div>
              <div>
                <label className={labelCls}>{ar ? 'الحالة' : 'Status'}</label>
                <select className={fieldCls} value={form.status} onChange={(e) => patch({ status: e.target.value })}>
                  {CREATE_STATUSES.map((s) => (
                    <option key={s} value={s} className="bg-[#0a1220]">
                      {statusLabel(s, ar)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Source chips + free text */}
              <div className="sm:col-span-2">
                <label className={labelCls}>{ar ? 'المصدر' : 'Source'}</label>
                <div className="flex flex-wrap gap-2">
                  {SOURCE_CHIPS.map((chip) => (
                    <button
                      key={chip.value}
                      type="button"
                      onClick={() => patch({ source: chip.value })}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                        form.source === chip.value
                          ? 'border-estate-gold/40 bg-estate-gold/10 text-estate-gold'
                          : 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-400 hover:text-foreground'
                      )}
                    >
                      {ar ? chip.labelAr : chip.label}
                    </button>
                  ))}
                </div>
                <input
                  className={cn(fieldCls, 'mt-2')}
                  value={form.source}
                  maxLength={40}
                  onChange={(e) => patch({ source: e.target.value })}
                  placeholder={ar ? 'أو اكتب مصدر مخصوص…' : 'Or type a custom source...'}
                />
              </div>

              <div>
                <label className={labelCls}>{ar ? 'البروكر (التوزيع من أولها)' : 'Broker (assign at creation)'}</label>
                <select className={fieldCls} value={form.brokerId} onChange={(e) => patch({ brokerId: e.target.value })}>
                  <option value="">{ar ? 'من غير توزيع' : 'Unassigned'}</option>
                  {brokers.map((b) => (
                    <option key={b.id} value={b.id} className="bg-[#0a1220]">
                      {b.user.name || b.user.email}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>{ar ? 'المطوّر' : 'Developer'}</label>
                <select
                  className={fieldCls}
                  value={form.developerId}
                  onChange={(e) => patch({ developerId: e.target.value })}
                  disabled={developers === null}
                >
                  <option value="">{ar ? 'من غير تحديد' : 'Not specified'}</option>
                  {(developers || []).map((d) => (
                    <option key={d.id} value={d.id} className="bg-[#0a1220]">
                      {d.companyName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>{ar ? 'المشروع' : 'Project'}</label>
                <select
                  className={fieldCls}
                  value={form.projectId}
                  onChange={(e) => patch({ projectId: e.target.value, unitId: '' })}
                  disabled={projects === null}
                >
                  <option value="">{ar ? 'من غير تحديد' : 'Not specified'}</option>
                  {(projects || []).map((p) => (
                    <option key={p.id} value={p.id} className="bg-[#0a1220]">
                      {p.name} · {p.developer.companyName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>{ar ? 'الوحدة' : 'Unit'}</label>
                <select
                  className={fieldCls}
                  value={form.unitId}
                  onChange={(e) => patch({ unitId: e.target.value })}
                  disabled={!form.projectId || unitsLoading}
                >
                  <option value="">
                    {!form.projectId
                      ? (ar ? 'اختار مشروع الأول' : 'Pick a project first')
                      : unitsLoading
                        ? (ar ? 'بيحمّل…' : 'Loading...')
                        : (ar ? 'من غير تحديد' : 'Not specified')}
                  </option>
                  {(units || []).map((u) => (
                    <option key={u.id} value={u.id} className="bg-[#0a1220]">
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelCls}>{ar ? 'أقل ميزانية (جنيه)' : 'Budget min (EGP)'}</label>
                <input
                  type="number"
                  min={0}
                  dir="ltr"
                  className={cn(fieldCls, 'text-left')}
                  value={form.budgetMin}
                  onChange={(e) => patch({ budgetMin: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div>
                <label className={labelCls}>{ar ? 'أعلى ميزانية (جنيه)' : 'Budget max (EGP)'}</label>
                <input
                  type="number"
                  min={0}
                  dir="ltr"
                  className={cn(fieldCls, 'text-left')}
                  value={form.budgetMax}
                  onChange={(e) => patch({ budgetMax: e.target.value })}
                  placeholder="0"
                />
              </div>

              {/* Priority */}
              <div>
                <label className={labelCls}>
                  {ar ? 'الأولوية' : 'Priority'} · <span className="font-mono text-estate-gold">P{form.priority}</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={5}
                  step={1}
                  value={form.priority}
                  onChange={(e) => patch({ priority: Number(e.target.value) })}
                  className="h-10 w-full accent-[#D4A843]"
                />
              </div>
              <div>
                <label className={labelCls}>{ar ? 'سبب التوزيع' : 'Assignment reason'}</label>
                <input
                  className={fieldCls}
                  value={form.reason}
                  onChange={(e) => patch({ reason: e.target.value })}
                  placeholder={ar ? 'ليه الليد ده رايح للبروكر ده؟' : 'Why is this lead going to this broker?'}
                />
              </div>

              <div className="sm:col-span-2">
                <label className={labelCls}>{ar ? 'ملاحظات' : 'Notes'}</label>
                <textarea
                  rows={3}
                  maxLength={4000}
                  value={form.notes}
                  onChange={(e) => patch({ notes: e.target.value })}
                  className={cn(fieldCls, 'h-auto min-h-[84px] resize-y py-2 leading-relaxed')}
                  placeholder={ar ? 'أي تفاصيل زيادة عن العميل…' : 'Anything extra about this client...'}
                />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-border dark:border-[#262626] pt-4">
              <Button
                variant="outline"
                onClick={onClose}
                className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]"
              >
                {ar ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button
                onClick={submit}
                disabled={saving}
                className="gold-shimmer bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold/90"
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {ar ? 'ضيف الليد' : 'Add lead'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
