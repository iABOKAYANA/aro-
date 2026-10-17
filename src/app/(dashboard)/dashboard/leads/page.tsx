'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useLanguage } from '@/lib/language-context'
import {
  Search, Users, Phone, Mail, Calendar, DollarSign, Shield, ShieldAlert, ShieldOff,
  AlertTriangle, Plus, X, RefreshCw, Eye, Loader2, Inbox, Clock, FileText,
  ArrowRight, Building2, Home, TrendingUp, Mic, Square, Trash2,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatEGP, cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────
interface LeadRow {
  id: string
  leadCode: string | null
  name: string
  email: string | null
  phone: string
  source: string
  status: string
  reviewStatus: string
  budgetMin: number | null
  budgetMax: number | null
  notes: string | null
  nextFollowUp: string | null
  createdAt: string
  protectionStartsAt: string | null
  protectionExpiresAt: string | null
  protectionDays: number | null
  protectionStatus: 'PROTECTED' | 'EXPIRING_SOON' | 'EXPIRED' | 'NONE'
  duplicateNote: string | null
  broker: { id: string; user: { name: string | null; email: string | null } } | null
  project: { id: string; name: string; developerId: string } | null
  unit: { id: string; name: string } | null
  developer: { id: string; companyName: string } | null
  deals: Array<{ id: string; status: string; dealValue: number | null }>
}

interface Stats {
  totalLeads: number
  newLeads: number
  activeProtected: number
  expiringSoon: number
  expired: number
  duplicateReview: number
  qualified: number
  viewings: number
  reservations: number
  contracts: number
  sold: number
  lost: number
}

const ALL_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'VIEWING', 'INTERESTED', 'RESERVATION', 'CONTRACT', 'SOLD', 'LOST', 'CANCELLED', 'EXPIRED']

const STATUS_LABELS: Record<string, { en: string; ar: string }> = {
  NEW: { en: 'New', ar: 'جديد' },
  CONTACTED: { en: 'Contacted', ar: 'تم التواصل' },
  QUALIFIED: { en: 'Qualified', ar: 'مؤهل' },
  VIEWING: { en: 'Viewing', ar: 'معاينة' },
  INTERESTED: { en: 'Interested', ar: 'مهتم' },
  RESERVATION: { en: 'Reservation', ar: 'حجز' },
  CONTRACT: { en: 'Contract', ar: 'عقد' },
  SOLD: { en: 'Sold', ar: 'تم البيع' },
  LOST: { en: 'Lost', ar: 'مفقود' },
  CANCELLED: { en: 'Cancelled', ar: 'ملغي' },
  EXPIRED: { en: 'Expired', ar: 'منتهي' },
  VISITED: { en: 'Visited', ar: 'زار' },
  NEGOTIATING: { en: 'Negotiating', ar: 'تفاوض' },
  CONVERTED: { en: 'Converted', ar: 'تم التحويل' },
}

const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
  CONTACTED: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30',
  QUALIFIED: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  VIEWING: 'bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30',
  INTERESTED: 'bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-500/30',
  RESERVATION: 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30',
  CONTRACT: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/30',
  SOLD: 'bg-green-600/15 text-green-700 dark:text-green-400 border-green-600/30',
  LOST: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
  CANCELLED: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
  EXPIRED: 'bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-500/30',
  VISITED: 'bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30',
  NEGOTIATING: 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30',
  CONVERTED: 'bg-green-600/15 text-green-700 dark:text-green-400 border-green-600/30',
}

function protectionBadge(status: string, lang: string) {
  if (status === 'PROTECTED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
        <Shield className="h-3 w-3" />{lang === 'ar' ? 'محمي' : 'Protected'}
      </span>
    )
  }
  if (status === 'EXPIRING_SOON') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
        <ShieldAlert className="h-3 w-3" />{lang === 'ar' ? 'ينتهي قريبًا' : 'Expiring'}
      </span>
    )
  }
  if (status === 'EXPIRED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
        <ShieldOff className="h-3 w-3" />{lang === 'ar' ? 'منتهي' : 'Expired'}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <Shield className="h-3 w-3" />{lang === 'ar' ? 'بدون حماية' : 'No protection'}
    </span>
  )
}

export default function DashboardLeadsPage() {
  const { data: session } = useSession()
  const { lang } = useLanguage()
  const role = ((session?.user as any)?.role as string) || ''
  const canCreate = role === 'BROKER' || role === 'CEO' || role === 'ADMIN'

  const [leads, setLeads] = useState<LeadRow[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [protectionFilter, setProtectionFilter] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  const [showAdd, setShowAdd] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<any | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en)

  const loadStats = useCallback(() => {
    fetch('/api/leads/stats')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setStats(data.stats))
      .catch(() => setStats(null))
  }, [])

  const loadLeads = useCallback(() => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (statusFilter) params.set('status', statusFilter)
    if (protectionFilter) params.set('protection', protectionFilter)
    params.set('page', String(page))
    params.set('limit', '20')
    fetch(`/api/leads?${params.toString()}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || 'Failed')
        return r.json()
      })
      .then((data) => {
        setLeads(data.leads || [])
        setTotalPages(data.totalPages || 1)
        setTotal(data.total || 0)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [search, statusFilter, protectionFilter, page])

  useEffect(() => { loadStats() }, [loadStats])
  useEffect(() => {
    const timer = setTimeout(loadLeads, search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [loadLeads, search])

  useEffect(() => {
    if (!detailId) { setDetail(null); return }
    setDetailLoading(true)
    fetch(`/api/leads/${detailId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setDetail(data.lead))
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false))
  }, [detailId])

  const transitionStatus = async (to: string) => {
    if (!detailId) return
    const res = await fetch(`/api/leads/${detailId}`, {
      method: 'PATCH',
      headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: to }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error || 'Failed')
      return
    }
    const refreshed = await fetch(`/api/leads/${detailId}`).then((r) => r.json()).catch(() => null)
    if (refreshed?.lead) setDetail(refreshed.lead)
    loadLeads()
    loadStats()
  }

  const protectionChips = [
    { key: '', label: t('All', 'الكل') },
    { key: 'active', label: t('Protected', 'محمي') },
    { key: 'expiring', label: t('Expiring soon', 'ينتهي قريبًا') },
    { key: 'expired', label: t('Expired', 'منتهي') },
  ]

  const statCards = stats
    ? [
        { icon: Users, label: t('My leads', ' Leads الخاصة بي'), value: stats.totalLeads, accent: 'text-blue-500' },
        { icon: Shield, label: t('Active protected', 'محمية فعّالة'), value: stats.activeProtected, accent: 'text-green-500' },
        { icon: ShieldAlert, label: t('Expiring soon', 'تنتهي قريبًا'), value: stats.expiringSoon, accent: 'text-amber-500' },
        { icon: ShieldOff, label: t('Expired protection', 'حماية منتهية'), value: stats.expired, accent: 'text-red-500' },
        { icon: AlertTriangle, label: t('Duplicate review', 'مراجعة تكرار'), value: stats.duplicateReview, accent: 'text-orange-500' },
        { icon: TrendingUp, label: t('Qualified', 'مؤهل'), value: stats.qualified, accent: 'text-teal-500' },
        { icon: Calendar, label: t('Viewings', 'معاينات'), value: stats.viewings, accent: 'text-purple-500' },
        { icon: DollarSign, label: t('Reservations', 'حجوزات'), value: stats.reservations, accent: 'text-indigo-500' },
        { icon: FileText, label: t('Sold', 'تم البيع'), value: stats.sold, accent: 'text-emerald-600' },
      ]
    : []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('Lead Protection', 'حماية العملاء')}</h1>
          <p className="text-muted-foreground">
            {t('Register clients, track protection windows and convert to deals', 'سجّل عملاءك، تابع فترات الحماية، وحوّلهم لصفقات')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { loadLeads(); loadStats() }}>
            <RefreshCw className="mr-1 h-4 w-4" />{t('Refresh', 'تحديث')}
          </Button>
          {canCreate && (
            <Button className="bg-estate-gold text-white hover:bg-estate-gold-dark" size="sm" onClick={() => setShowAdd(true)}>
              <Plus className="mr-1 h-4 w-4" />{t('Add Lead', 'إضافة عميل')}
            </Button>
          )}
        </div>
      </div>

      {/* Protection stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {statCards.map((card) => (
            <Card key={card.label} className="card-hover">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <card.icon className={cn('h-4 w-4', card.accent)} />
                  <span className="text-xs text-muted-foreground">{card.label}</span>
                </div>
                <p className="mt-1 text-2xl font-bold">{card.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('Search name, code or phone...', 'ابحث بالاسم أو الكود أو الموبايل...')}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1 rounded-2xl border p-1">
          {protectionChips.map((chip) => (
            <button
              key={chip.key}
              onClick={() => { setProtectionFilter(chip.key); setPage(1) }}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition',
                protectionFilter === chip.key
                  ? 'bg-estate-gold text-white'
                  : 'text-muted-foreground hover:bg-muted'
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="rounded-xl border bg-background px-3 py-2 text-sm"
        >
          <option value="">{t('All statuses', 'كل الحالات')}</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]?.[lang === 'ar' ? 'ar' : 'en'] || s}</option>
          ))}
        </select>
      </div>

      {error && (
        <Card className="border-red-500/30">
          <CardContent className="flex items-center justify-between p-4 text-sm text-red-600 dark:text-red-400">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={loadLeads}>{t('Retry', 'إعادة المحاولة')}</Button>
          </CardContent>
        </Card>
      )}

      {/* List */}
      {loading ? (
        <div className="flex py-20 items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> {t('Loading leads...', 'جارِ تحميل العملاء...')}
        </div>
      ) : leads.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Inbox className="mx-auto h-12 w-12 text-muted-foreground/30" />
            <p className="mt-4 text-muted-foreground">
              {t('No leads match these filters', 'لا يوجد عملاء مطابقين للتصفية')}
            </p>
            {canCreate && (
              <Button className="mt-4 bg-estate-gold text-white hover:bg-estate-gold-dark" size="sm" onClick={() => setShowAdd(true)}>
                <Plus className="mr-1 h-4 w-4" />{t('Register first lead', 'سجّل أول عميل')}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">{t('Lead', 'العميل')}</th>
                  <th className="px-4 py-3">{t('Project', 'المشروع')}</th>
                  <th className="px-4 py-3">{t('Status', 'الحالة')}</th>
                  <th className="px-4 py-3">{t('Protection', 'الحماية')}</th>
                  <th className="px-4 py-3">{t('Deal', 'الصفقة')}</th>
                  <th className="px-4 py-3 text-right">{t('Actions', 'إجراءات')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {leads.map((lead) => (
                  <tr key={lead.id} className="transition hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="font-medium">{lead.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {lead.leadCode && <span className="font-mono">{lead.leadCode}</span>}
                            {lead.leadCode && ' · '}
                            <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{lead.phone}</span>
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs">{lead.project?.name || <span className="text-muted-foreground">—</span>}</p>
                      {lead.unit && <p className="text-xs text-muted-foreground">{lead.unit.name}</p>}
                      {(role === 'BROKER' || role === 'CEO' || role === 'ADMIN') && lead.developer && (
                        <p className="text-xs text-muted-foreground">{lead.developer.companyName}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={STATUS_COLORS[lead.status] || ''}>
                        {STATUS_LABELS[lead.status]?.[lang === 'ar' ? 'ar' : 'en'] || lead.status}
                      </Badge>
                      {lead.reviewStatus === 'DUPLICATE_REVIEW' && (
                        <Badge className="ml-1 border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400">
                          {t('Duplicate', 'تكرار')}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {protectionBadge(lead.protectionStatus, lang)}
                      {lead.protectionExpiresAt && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {new Date(lead.protectionExpiresAt).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {lead.deals.length > 0 ? (
                        <Badge className="border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                          {lead.deals[0].status}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setDetailId(lead.id)}>
                        <Eye className="mr-1 h-4 w-4" />{t('View', 'عرض')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {leads.map((lead) => (
              <Card key={lead.id} className="card-hover">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{lead.name}</h3>
                        <Badge className={STATUS_COLORS[lead.status] || ''}>
                          {STATUS_LABELS[lead.status]?.[lang === 'ar' ? 'ar' : 'en'] || lead.status}
                        </Badge>
                      </div>
                      {lead.leadCode && <p className="font-mono text-xs text-muted-foreground">{lead.leadCode}</p>}
                      <div className="mt-1 flex flex-wrap gap-x-3 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{lead.phone}</span>
                        {lead.email && <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{lead.email}</span>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {protectionBadge(lead.protectionStatus, lang)}
                      {lead.protectionExpiresAt && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(lead.protectionExpiresAt).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="h-3 w-3" />{lead.project?.name || '—'}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => setDetailId(lead.id)}>
                      <Eye className="mr-1 h-3.5 w-3.5" />{t('View', 'عرض')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{t('Total', 'الإجمالي')}: {total}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  {t('Previous', 'السابق')}
                </Button>
                <span className="px-2 py-1">{page} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  {t('Next', 'التالي')}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {showAdd && (
        <AddLeadModal
          lang={lang}
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); loadLeads(); loadStats() }}
        />
      )}

      {detailId && (
        <DetailModal
          lang={lang}
          loading={detailLoading}
          detail={detail}
          canEdit={canCreate}
          onClose={() => setDetailId(null)}
          onTransition={transitionStatus}
        />
      )}
    </div>
  )
}

// ─── Add Lead Modal ───────────────────────────────────────
function AddLeadModal({ lang, onClose, onCreated }: { lang: string; onClose: () => void; onCreated: () => void }) {
  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en)
  const [form, setForm] = useState({ name: '', phone: '', email: '', projectId: '', budgetMin: '', budgetMax: '', source: 'WEBSITE', notes: '' })
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([])
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'error' | 'info' | 'success'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/projects?limit=100')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setProjects(data.projects || []))
      .catch(() => setProjects([]))
  }, [])

  const submit = async () => {
    setMessage(null)
    if (form.name.trim().length < 2) { setMessage({ type: 'error', text: t('Enter the client name', 'أدخل اسم العميل') }); return }
    if (form.phone.replace(/\D/g, '').length < 7) { setMessage({ type: 'error', text: t('Enter a valid phone', 'أدخل رقم موبايل صحيح') }); return }

    setSubmitting(true)
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || undefined,
          projectId: form.projectId || undefined,
          source: form.source,
          notes: form.notes.trim() || undefined,
          budgetMin: form.budgetMin ? Number(form.budgetMin) : undefined,
          budgetMax: form.budgetMax ? Number(form.budgetMax) : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))

      if (data.duplicate === true) {
        // Neutral duplicate handling — never expose the other owner's details
        setMessage({
          type: 'info',
          text: data.message || t('This client may already be registered on EstateAI. The case was sent for review.', 'هذا العميل مسجّل ربما لدى شريك آخر. تمت إرسال الحالة للمراجعة.'),
        })
        if (data.sameBroker || data.claimed) { onCreated() }
        return
      }
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || t('Failed to register lead', 'فشل تسجيل العميل') })
        return
      }
      setMessage({ type: 'success', text: data.message || t('Lead registered — protection activated', 'تم التسجيل — الحماية مفعّلة') })
      setTimeout(() => onCreated(), 700)
    } catch {
      setMessage({ type: 'error', text: t('Network error', 'خطأ في الاتصال') })
    } finally {
      setSubmitting(false)
    }
  }

  const field = 'w-full rounded-xl border bg-background px-3 py-2 text-sm'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('Register Lead', 'تسجيل عميل جديد')}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t('Client name', 'اسم العميل')} *</label>
            <input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t('Phone', 'الموبايل')} *</label>
              <input className={field} dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="01xxxxxxxxx" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t('Email', 'البريد')}</label>
              <input className={field} dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t('Project (starts protection scope)', 'المشروع (يحدد نطاق الحماية)')}</label>
            <select className={field} value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
              <option value="">{t('— No project —', '— بدون مشروع —')}</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t('Budget min', 'الحد الأدنى')}</label>
              <input className={field} type="number" value={form.budgetMin} onChange={(e) => setForm({ ...form, budgetMin: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t('Budget max', 'الحد الأقصى')}</label>
              <input className={field} type="number" value={form.budgetMax} onChange={(e) => setForm({ ...form, budgetMax: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t('Source', 'المصدر')}</label>
              <select className={field} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                {['WEBSITE', 'REFERRAL', 'SOCIAL_MEDIA', 'DIRECT_CALL', 'WALK_IN', 'PORTAL', 'AI_CHATBOT', 'EXHIBITION', 'MEETING_BOOKING'].map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t('Notes', 'ملاحظات')}</label>
              <input className={field} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>

          {message && (
            <div className={cn(
              'rounded-2xl border p-3 text-sm',
              message.type === 'error' && 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
              message.type === 'info' && 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
              message.type === 'success' && 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400',
            )}>
              {message.text}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>{t('Cancel', 'إلغاء')}</Button>
            <Button className="bg-estate-gold text-white hover:bg-estate-gold-dark" onClick={submit} disabled={submitting}>
              {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
              {t('Register & protect', 'تسجيل وحماية')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Detail Modal ─────────────────────────────────────────
function DetailModal({
  lang, loading, detail, canEdit, onClose, onTransition,
}: {
  lang: string
  loading: boolean
  detail: any | null
  canEdit: boolean
  onClose: () => void
  onTransition: (to: string) => void
}) {
  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en)
  const [confirmTo, setConfirmTo] = useState<string | null>(null)

  const quickActions = detail
    ? ALL_STATUSES.filter((s) => s !== detail.status && ['CONTACTED', 'QUALIFIED', 'VIEWING', 'INTERESTED', 'RESERVATION', 'CONTRACT', 'SOLD', 'LOST'].includes(s))
    : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {loading ? t('Loading...', 'جارِ التحميل...') : detail?.name}
            {detail?.leadCode && <span className="ml-2 font-mono text-sm text-muted-foreground">{detail.leadCode}</span>}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : detail ? (
          <div className="space-y-4">
            {/* Status + protection */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={STATUS_COLORS[detail.status] || ''}>
                {STATUS_LABELS[detail.status]?.[lang === 'ar' ? 'ar' : 'en'] || detail.status}
              </Badge>
              {protectionBadge(detail.protectionStatus, lang)}
              {detail.reviewStatus === 'DUPLICATE_REVIEW' && (
                <Badge className="border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400">
                  {t('Under duplicate review', 'قيد مراجعة التكرار')}
                </Badge>
              )}
            </div>

            {detail.protectionStartsAt && (
              <div className="rounded-2xl border bg-muted/30 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 font-medium"><Shield className="h-4 w-4 text-green-500" />{t('Protection window', 'فترة الحماية')}</span>
                  <span className="text-xs text-muted-foreground">{detail.protectionDays} {t('days', 'يوم')}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  {(() => {
                    const start = new Date(detail.protectionStartsAt).getTime()
                    const end = new Date(detail.protectionExpiresAt).getTime()
                    const now = Date.now()
                    const pct = end > start ? Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100)) : 100
                    const color = detail.protectionStatus === 'PROTECTED' ? 'bg-green-500' : detail.protectionStatus === 'EXPIRING_SOON' ? 'bg-amber-500' : 'bg-red-500'
                    return <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
                  })()}
                </div>
                <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                  <span>{new Date(detail.protectionStartsAt).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}</span>
                  <span>{detail.protectionExpiresAt ? new Date(detail.protectionExpiresAt).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US') : '—'}</span>
                </div>
              </div>
            )}

            {detail.duplicateNote && detail.reviewStatus === 'DUPLICATE_REVIEW' && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                {detail.duplicateNote}
              </div>
            )}

            {/* Contact */}
            <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /><span dir="ltr">{detail.phone}</span></p>
              {detail.email && <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /><span dir="ltr">{detail.email}</span></p>}
              <p className="flex items-center gap-2"><Building2 className="h-4 w-4 text-muted-foreground" />{detail.project?.name || t('No project', 'بدون مشروع')}</p>
              {detail.unit && <p className="flex items-center gap-2"><Home className="h-4 w-4 text-muted-foreground" />{detail.unit.name}</p>}
              {detail.broker && <p className="flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" />{detail.broker.user?.name}</p>}
              {detail.budgetMin && detail.budgetMax && (
                <p className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-muted-foreground" />{formatEGP(detail.budgetMin)} – {formatEGP(detail.budgetMax)}</p>
              )}
            </div>

            {/* Deal info */}
            {detail.deals?.length > 0 && (
              <div className="rounded-2xl border p-3 text-sm">
                <p className="font-medium">{t('Linked deal', 'الصفقة المرتبطة')}</p>
                <p className="text-muted-foreground">
                  {detail.deals[0].status}
                  {detail.deals[0].dealValue ? ` — ${formatEGP(detail.deals[0].dealValue)}` : ''}
                </p>
              </div>
            )}

            {/* Status transitions */}
            {canEdit && (
              <div>
                <p className="mb-2 text-sm font-medium">{t('Move to stage', 'نقل إلى مرحلة')}</p>
                <div className="flex flex-wrap gap-2">
                  {quickActions.map((s) => (
                    <button
                      key={s}
                      onClick={() => setConfirmTo(s)}
                      className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition hover:bg-muted"
                    >
                      {STATUS_LABELS[s]?.[lang === 'ar' ? 'ar' : 'en'] || s}
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Activities */}
            <div>
              <p className="mb-2 text-sm font-medium">{t('Recent activity', 'النشاط الأخير')}</p>
              {detail.activities?.length ? (
                <ul className="space-y-2 text-sm">
                  {detail.activities.map((a: any) => (
                    <li key={a.id} className="flex items-start gap-2 rounded-2xl border p-2">
                      <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <div>
                        <p className="text-xs font-medium">{a.type}</p>
                        {a.content && <p className="text-xs text-muted-foreground">{a.content}</p>}
                        <p className="text-xs text-muted-foreground/70">{new Date(a.createdAt).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t('No activity yet', 'لا يوجد نشاط بعد')}</p>
              )}
            </div>

            {/* Voice notes — record via MediaRecorder, play back inline */}
            <VoiceNotesSection leadId={detail.id} lang={lang} />
          </div>
        ) : (
          <p className="py-8 text-center text-muted-foreground">{t('Lead not found', 'العميل غير موجود')}</p>
        )}

        {confirmTo && (
          <div className="mt-4 rounded-2xl border border-estate-gold/40 bg-estate-gold/5 p-3 text-sm">
            <p>{t('Move this lead to', 'نقل العميل إلى')} <strong>{STATUS_LABELS[confirmTo]?.[lang === 'ar' ? 'ar' : 'en'] || confirmTo}</strong>؟</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {['RESERVATION', 'CONTRACT', 'SOLD'].includes(confirmTo)
                ? t('A linked deal record will be created automatically.', 'سيتم إنشاء صفقة مرتبطة تلقائيًا.')
                : t('The owner broker and system logs will be notified.', 'سيتم إشعار بروكر المالك وسجلات النظام.')}
            </p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" className="bg-estate-gold text-white hover:bg-estate-gold-dark" onClick={() => { onTransition(confirmTo); setConfirmTo(null) }}>
                {t('Confirm', 'تأكيد')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmTo(null)}>{t('Cancel', 'إلغاء')}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Voice notes (record + playback inside the detail modal) ───
const MAX_VN_SECONDS = 120

interface VoiceNoteRow {
  id: string
  leadId: string
  audioUrl: string
  durationSec: number | null
  createdById: string
  createdAt: string
  createdBy?: { id: string; name: string | null } | null
}

function formatVnTime(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function VoiceNotesSection({ leadId, lang }: { leadId: string; lang: string }) {
  const { data: session } = useSession()
  const userId = (session?.user as any)?.id as string | undefined
  const role = ((session?.user as any)?.role as string) || ''
  const isAdmin = role === 'CEO' || role === 'ADMIN'
  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en)

  const [notes, setNotes] = useState<VoiceNoteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [micDenied, setMicDenied] = useState(false)
  const [actionError, setActionError] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pending, setPending] = useState<{ blob: Blob; seconds: number } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const startedAtRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stopRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setLoadError(false)
    fetch(`/api/voice-notes?leadId=${encodeURIComponent(leadId)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('load')
        return r.json()
      })
      .then((data) => setNotes(data.voiceNotes || []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [leadId])

  useEffect(() => { load() }, [load])

  // Never leave the mic open when the modal closes.
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (stopRef.current) clearTimeout(stopRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
  }, [])

  const uploadBlob = useCallback(async (blob: Blob, seconds: number) => {
    setActionError(false)
    setUploading(true)
    try {
      const ext = blob.type.includes('mp4') || blob.type.includes('m4a')
        ? 'm4a'
        : blob.type.includes('mpeg') ? 'mp3' : 'webm'
      const form = new FormData()
      form.append('leadId', leadId)
      form.append('durationSec', String(Math.max(1, Math.round(seconds))))
      form.append('audio', blob, `voice-note-${Date.now()}.${ext}`)
      const res = await fetch('/api/voice-notes', { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' }, body: form })
      if (!res.ok) throw new Error('upload')
      setPending(null)
      load()
    } catch {
      // Keep the blob for the retry button — never a raw error on screen.
      setPending({ blob, seconds })
      setActionError(true)
    } finally {
      setUploading(false)
    }
  }, [leadId, load])

  const stopRecording = useCallback((discard = false) => {
    const rec = mediaRef.current
    mediaRef.current = null
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (stopRef.current) { clearTimeout(stopRef.current); stopRef.current = null }
    setRecording(false)
    if (!rec) return
    const seconds = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
    rec.onstop = () => {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      if (discard) return
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
      chunksRef.current = []
      void uploadBlob(blob, seconds)
    }
    try {
      if (rec.state !== 'inactive') rec.stop()
    } catch {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [uploadBlob])

  const startRecording = useCallback(async () => {
    setMicDenied(false)
    setActionError(false)
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('no-mic')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = ['audio/webm', 'audio/mp4'].find((m) => {
        try {
          return MediaRecorder.isTypeSupported(m)
        } catch {
          return false
        }
      })
      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      streamRef.current = stream
      mediaRef.current = rec
      startedAtRef.current = Date.now()
      setElapsed(0)
      rec.start()
      setRecording(true)
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000))
      }, 500)
      // Hard stop at the 2-minute cap.
      stopRef.current = setTimeout(() => stopRecording(), MAX_VN_SECONDS * 1000)
    } catch {
      // Mic denied (or no mic at all): plain Egyptian hint, never a crash.
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      mediaRef.current = null
      setRecording(false)
      setMicDenied(true)
    }
  }, [stopRecording])

  const doDelete = async (id: string) => {
    setDeletingId(id)
    setActionError(false)
    try {
      const res = await fetch(`/api/voice-notes?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      if (!res.ok) throw new Error('delete')
      setConfirmDeleteId(null)
      load()
    } catch {
      setActionError(true)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div>
      <p className="mb-1 text-sm font-medium">{t('Voice notes', 'ملاحظات صوتية')}</p>
      <p className="mb-2 text-xs text-muted-foreground">{t('Max 2 minutes per note.', 'أقصى حاجة دقيقتين للملاحظة.')}</p>

      {micDenied && (
        <div className="mb-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          {t('Microphone is blocked — allow it from the browser settings and try again.', 'الميك مقفول — افتحه من إعدادات المتصفح وحاول تاني.')}
        </div>
      )}
      {actionError && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
          <span>{t('Something failed — try again.', 'حاجة فشلت — حاول تاني.')}</span>
          {pending && (
            <Button variant="outline" size="sm" onClick={() => void uploadBlob(pending.blob, pending.seconds)}>
              {t('Retry', 'إعادة المحاولة')}
            </Button>
          )}
        </div>
      )}

      <div className="mb-2 flex flex-wrap gap-2">
        {!recording ? (
          <Button
            size="sm"
            className="bg-estate-gold text-white hover:bg-estate-gold-dark"
            disabled={uploading}
            onClick={() => void startRecording()}
          >
            {uploading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Mic className="mr-1 h-4 w-4" />}
            {uploading ? t('Sending...', 'جارِ الإرسال...') : t('Record', 'سجّل')}
          </Button>
        ) : (
          <>
            <Button size="sm" className="bg-red-600 text-white hover:bg-red-700" onClick={() => stopRecording()}>
              <Square className="mr-1 h-4 w-4" />
              {formatVnTime(elapsed)} · {t('Stop & send', 'قف وابعت')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => stopRecording(true)}>
              {t('Cancel', 'إلغاء')}
            </Button>
          </>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />{t('Loading voice notes...', 'جارِ تحميل الملاحظات الصوتية...')}
        </div>
      ) : loadError ? (
        <div className="flex items-center justify-between rounded-2xl border p-3 text-sm text-muted-foreground">
          <span>{t('Could not load voice notes.', 'مقدرناش نحمل الملاحظات الصوتية.')}</span>
          <Button variant="outline" size="sm" onClick={load}>{t('Retry', 'إعادة المحاولة')}</Button>
        </div>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('No voice notes yet.', 'لسه مفيش ملاحظات صوتية.')}</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-2xl border p-2">
              <audio controls src={n.audioUrl} preload="metadata" className="w-full" />
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {n.durationSec ? `${formatVnTime(n.durationSec)} · ` : ''}
                  {n.createdBy?.name ? `${n.createdBy.name} · ` : ''}
                  {new Date(n.createdAt).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')}
                </span>
                {(n.createdById === userId || isAdmin) && (
                  deletingId === n.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : confirmDeleteId === n.id ? (
                    <span className="flex gap-1">
                      <button
                        onClick={() => void doDelete(n.id)}
                        className="rounded-full bg-red-600 px-2 py-1 font-medium text-white"
                      >
                        {t('Confirm', 'تأكيد')}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded-full border px-2 py-1"
                      >
                        {t('Cancel', 'إلغاء')}
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(n.id)}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-red-600 hover:bg-red-500/10 dark:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />{t('Delete', 'امسح')}
                    </button>
                  )
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
