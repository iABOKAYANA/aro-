'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Image from 'next/image'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn, formatEGP, getInitials } from '@/lib/utils'
import {
  Search,
  Building,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  FolderOpen,
  Home,
  RefreshCw,
  AlertTriangle,
  Layers,
  CalendarDays,
  Loader2,
  Mail,
  Phone,
  MapPin,
  Pencil,
  Trash2,
  Ban,
  Power,
  Briefcase,
  Globe,
} from 'lucide-react'
import {
  ceoApi,
  Toast,
  type ToastState,
  Modal,
  ConfirmDialog,
  Field,
  fieldInputCls,
  fieldAreaCls,
  fieldSelectCls,
  ActionBtn,
  StatusPill,
  MultiPicker,
  InlineNote,
  ModalSkeleton,
} from '../components/manager-ui'
import ExportCsvBtn from '@/components/ui/export-csv'
import EditRequestsInbox, { usePendingEditCount } from '../components/edit-requests-inbox'
import { useLanguage } from '@/lib/language-context'
import { statusLabel } from '@/components/ceo/ceo-charts'
import { Reveal } from '@/components/design'

/* ─── Types ─────────────────────────────────────────────── */

interface DeveloperProject {
  id: string
  name: string
  status: string
  approvalStatus: string
  isActive: boolean
  location: string
  viewCount?: number
  inquiryCount?: number
}

interface Partnership {
  status: string
  isActive: boolean
  allProjectsApproved: boolean
  approvedProjectIds: string[]
  allowedBrokerIds: string[]
  blockedBrokerIds: string[]
  commissionAgreement: string | null
  leadProtectionDays: number | null
  startDate: string | null
  endDate: string | null
  terms: string | null
}

interface Developer {
  id: string
  userId: string
  companyName: string
  companyNameArabic: string | null
  contactEmail: string
  contactPhone: string
  website: string | null
  crNumber: string | null
  taxId: string | null
  foundedYear: number | null
  headquarters: string
  description: string
  rating: number
  reviewCount: number
  isVerified: boolean
  accountStatus: string
  isActive: boolean
  // Permission mode: DIRECT (legacy direct writes) vs REQUEST (edit-request flow only).
  // Surfaced by GET /api/ceo/developers via the profile spread; REQUEST is the schema default.
  editMode?: string
  avatar?: string | null
  totalProjects: number
  totalUnitsSold: number
  leadCount: number
  leadsLast30Days: number
  soldValue: number
  projects: DeveloperProject[]
  partnership: Partnership | null
}

interface BrokerLite {
  id: string
  name: string
  email: string
  accountStatus: string
  isVerified: boolean
}

type SortKey = 'name' | 'projects' | 'units'
type StatusFilter = 'ALL' | 'VERIFIED' | 'UNVERIFIED' | 'ACTIVE' | 'SUSPENDED'

// Cursor-pagination page size for GET /api/ceo/developers (`?cursor=&limit=` →
// `{items, nextCursor}`). Search/filter/sort stay client-side over loaded pages.
const DEVELOPERS_PAGE_SIZE = 30

const PARTNERSHIP_STATUSES = [
  'PENDING',
  'UNDER_REVIEW',
  'APPROVED',
  'ACTIVE',
  'SUSPENDED',
  'REJECTED',
  'EXPIRED',
]

const PROJECT_APPROVALS = ['DRAFT', 'PENDING', 'APPROVED', 'PUBLISHED', 'HIDDEN', 'ARCHIVED']

const PARTNERSHIP_TONES: Record<string, 'green' | 'yellow' | 'red' | 'gray' | 'blue'> = {
  ACTIVE: 'green',
  APPROVED: 'green',
  PENDING: 'yellow',
  UNDER_REVIEW: 'blue',
  SUSPENDED: 'red',
  REJECTED: 'red',
  EXPIRED: 'gray',
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-5 backdrop-blur-sm">
      <div className="flex items-start gap-4">
        <div className="h-14 w-14 animate-pulse rounded-2xl bg-muted" />
        <div className="flex-1 space-y-3">
          <div className="h-4 w-40 animate-pulse rounded-full bg-muted" />
          <div className="h-3 w-56 animate-pulse rounded-full bg-muted" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    </div>
  )
}

/* ─── Page ──────────────────────────────────────────────── */

export default function CEODevelopersPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [developers, setDevelopers] = useState<Developer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('projects')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const [editDev, setEditDev] = useState<Developer | null>(null)
  const [partnerDev, setPartnerDev] = useState<Developer | null>(null)
  const [removeDev, setRemoveDev] = useState<Developer | null>(null)
  // Top-level tab: developer list vs the developer edit-request review queue.
  const [mainTab, setMainTab] = useState<'developers' | 'requests'>('developers')
  const pendingEdits = usePendingEditCount()
  // Cursor pagination — `pagingOn` is true only once the backend speaks
  // `{items, nextCursor}`; legacy `{developers}` falls back to full-list.
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [pagingOn, setPagingOn] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const notify = useCallback((msg: string, tone: 'ok' | 'err' = 'ok') => {
    setToast({ msg, tone })
  }, [])

  const fetchDevelopersPage = useCallback(async (cursor: string | null) => {
    const params = new URLSearchParams({ limit: String(DEVELOPERS_PAGE_SIZE) })
    if (cursor) params.set('cursor', cursor)
    const data = await ceoApi<{ developers?: Developer[]; items?: Developer[]; nextCursor?: string | null }>(
      `/api/ceo/developers?${params.toString()}`
    )
    // Paginated contract: {items, nextCursor}
    if (Array.isArray(data.items)) {
      return { items: data.items || [], nextCursor: data.nextCursor ?? null, paged: true }
    }
    // Legacy fallback: {developers} — no crash during backend rollout.
    return { items: data.developers || [], nextCursor: null as string | null, paged: false }
  }, [])

  const fetchDevelopers = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const { items, nextCursor: nc, paged } = await fetchDevelopersPage(null)
      setDevelopers(items)
      setNextCursor(nc)
      setPagingOn(paged)
    } catch (err) {
      console.error('Failed to fetch developers:', err)
      setError(ar ? 'معرفناش نجيب المطوّرين — حاول تاني.' : 'Failed to fetch developers')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [ar, fetchDevelopersPage])

  useEffect(() => {
    fetchDevelopers()
  }, [fetchDevelopers])

  // Append-only "load more" — search/filter/sort stay client-side over loaded pages.
  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const { items, nextCursor: nc } = await fetchDevelopersPage(nextCursor)
      setDevelopers((prev) => {
        const seen = new Set(prev.map((d) => d.id))
        return [...prev, ...items.filter((d) => !seen.has(d.id))]
      })
      setNextCursor(nc)
    } catch (err) {
      console.error('Failed to load more developers:', err)
      notify(ar ? 'معرفناش نجيب الباقي — حاول تاني.' : 'Failed to load more', 'err')
    } finally {
      setLoadingMore(false)
    }
  }, [nextCursor, loadingMore, fetchDevelopersPage, notify, ar])

  const patchLocal = useCallback((id: string, patch: Partial<Developer>) => {
    setDevelopers((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)))
  }, [])

  const run = useCallback(
    async (key: string, action: () => Promise<void>) => {
      setBusyKey(key)
      try {
        await action()
      } catch (err) {
        console.error('Developer action failed:', key, err)
        notify(ar ? 'حصلت مشكلة — حاول تاني.' : 'Something went wrong', 'err')
      } finally {
        setBusyKey(null)
      }
    },
    [notify, ar]
  )

  /* ── Actions ──────────────────────────────────────────── */

  const toggleVerify = (dev: Developer) =>
    run(`verify-${dev.id}`, async () => {
      const next = !dev.isVerified
      await ceoApi(`/api/ceo/developers/${dev.id}`, 'PATCH', { isVerified: next })
      patchLocal(dev.id, { isVerified: next })
      notify(next ? (ar ? `${dev.companyName} اتوثّقت` : `${dev.companyName} verified`) : (ar ? `اتشال التوثيق من ${dev.companyName}` : `Verification removed from ${dev.companyName}`))
    })

  const toggleAccount = (dev: Developer) =>
    run(`account-${dev.id}`, async () => {
      const active = dev.accountStatus === 'ACTIVE' && dev.isActive
      const status = active ? 'SUSPENDED' : 'ACTIVE'
      await ceoApi('/api/ceo/users', 'PATCH', {
        userId: dev.userId,
        status,
        isActive: !active,
      })
      patchLocal(dev.id, { accountStatus: status, isActive: !active })
      notify(active ? (ar ? `${dev.companyName} اتوقّفت` : `${dev.companyName} suspended`) : (ar ? `${dev.companyName} اشتغلت تاني` : `${dev.companyName} reactivated`))
    })

  // Permission mode toggle: DIRECT (legacy direct writes) vs REQUEST
  // (direct writes blocked with 403 requestOnly — developers file edit requests).
  // Immediate PATCH + notice; failures roll back via silent refetch.
  const toggleEditMode = (dev: Developer, mode: 'DIRECT' | 'REQUEST') =>
    run(`editmode-${dev.id}`, async () => {
      await ceoApi(`/api/ceo/developers/${dev.id}`, 'PATCH', { editMode: mode })
      patchLocal(dev.id, { editMode: mode })
      notify(
        mode === 'DIRECT'
          ? ar
            ? `${dev.companyName} بقى يعدّل مباشر من غير طلبات`
            : `${dev.companyName} can now edit directly without requests`
          : ar
            ? `${dev.companyName} بقى طلبات بس — أي تعديل لازم موافقتك`
            : `${dev.companyName} is now request-only — every edit needs your approval`
      )
    })

  const toggleProject = (dev: Developer, project: DeveloperProject) =>
    run(`project-${project.id}`, async () => {
      const next = !project.isActive
      await ceoApi(`/api/ceo/projects/${project.id}`, 'PATCH', { isActive: next })
      patchLocal(dev.id, {
        projects: dev.projects.map((p) =>
          p.id === project.id ? { ...p, isActive: next } : p
        ),
      })
      notify(next ? (ar ? `${project.name} ظهر تاني` : `${project.name} is visible again`) : (ar ? `${project.name} استخبى` : `${project.name} hidden`))
    })

  const setProjectApproval = (dev: Developer, project: DeveloperProject, approval: string) =>
    run(`approval-${project.id}`, async () => {
      await ceoApi(`/api/ceo/projects/${project.id}`, 'PATCH', { approvalStatus: approval })
      patchLocal(dev.id, {
        projects: dev.projects.map((p) =>
          p.id === project.id ? { ...p, approvalStatus: approval } : p
        ),
      })
      notify(ar ? `${project.name} ← ${statusLabel(approval, true)}` : `${project.name} → ${approval}`)
    })

  const confirmRemove = async () => {
    const target = removeDev
    if (!target) return
    await run(`remove-${target.id}`, async () => {
      await ceoApi(`/api/ceo/developers/${target.id}?hard=true`, 'DELETE')
      setDevelopers((prev) => prev.filter((d) => d.id !== target.id))
      notify(ar ? `${target.companyName} اتشالت من المنصة` : `${target.companyName} removed from the platform`)
      setRemoveDev(null)
      setExpandedId(null)
    })
  }

  /* ── Filtering ────────────────────────────────────────── */

  const counts = useMemo(
    () => ({
      total: developers.length,
      verified: developers.filter((d) => d.isVerified).length,
      suspended: developers.filter((d) => !(d.accountStatus === 'ACTIVE' && d.isActive)).length,
      projects: developers.reduce((sum, d) => sum + d.totalProjects, 0),
    }),
    [developers]
  )

  const filteredDevelopers = useMemo(() => {
    const q = search.trim().toLowerCase()
    return developers
      .filter((d) => {
        if (q) {
          const matches =
            d.companyName.toLowerCase().includes(q) ||
            (d.companyNameArabic || '').toLowerCase().includes(q) ||
            d.contactEmail.toLowerCase().includes(q)
          if (!matches) return false
        }
        const active = d.accountStatus === 'ACTIVE' && d.isActive
        switch (statusFilter) {
          case 'VERIFIED':
            return d.isVerified
          case 'UNVERIFIED':
            return !d.isVerified
          case 'ACTIVE':
            return active
          case 'SUSPENDED':
            return !active
          default:
            return true
        }
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'name':
            return a.companyName.localeCompare(b.companyName)
          case 'units':
            return b.totalUnitsSold - a.totalUnitsSold
          default:
            return b.totalProjects - a.totalProjects
        }
      })
  }, [developers, search, statusFilter, sortBy])

  return (
    <div className="space-y-6">
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Reveal>
          <p className="section-kicker">{ar ? 'لوحة المدير · المطورون' : 'CEO Console · Developers'}</p>
          <h1 className="font-display display-3 text-foreground">{ar ? 'إدارة المطوّرين' : 'Developer Management'}</h1>
          <p className="text-sm text-gray-400">
            {ar ? 'وثّق ووَقّف وعدّل واتحكم في الشراكات لكل شركة تطوير' : 'Verify, suspend, edit and manage partnerships for every developer company'}
          </p>
          <hr className="gold-hairline mt-4" />
        </Reveal>
        <Button
          onClick={() => fetchDevelopers()}
          variant="outline"
          className="w-fit border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]"
        >
          <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
          {ar ? 'حدّث' : 'Refresh'}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: 'Total Developers',
            labelAr: 'كل المطوّرين',
            value: counts.total,
            icon: <Building className="h-5 w-5" />,
            color: 'text-green-400 bg-green-500/10',
          },
          {
            label: 'Verified',
            labelAr: 'متوثّقين',
            value: `${counts.verified}/${counts.total}`,
            icon: <CheckCircle2 className="h-5 w-5" />,
            color: 'text-blue-400 bg-blue-500/10',
          },
          {
            label: 'Projects',
            labelAr: 'المشاريع',
            value: counts.projects,
            icon: <Layers className="h-5 w-5" />,
            color: 'text-estate-gold bg-estate-gold/10',
          },
          {
            label: 'Suspended',
            labelAr: 'موقوفين',
            value: counts.suspended,
            icon: <Ban className="h-5 w-5" />,
            color: 'text-red-400 bg-red-500/10',
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="flex items-center gap-3 rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-4"
          >
            <div className={cn('flex h-10 w-10 items-center justify-center rounded-2xl', stat.color)}>
              {stat.icon}
            </div>
            <div>
              <p className="text-xs text-gray-500">{ar ? stat.labelAr : stat.label}</p>
              <p className="text-lg font-bold text-foreground">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Main tabs: developer list vs edit-request review queue */}
      <div className="flex gap-2">
        <button
          onClick={() => setMainTab('developers')}
          className={cn(
            'rounded-2xl border px-4 py-2 text-sm font-semibold transition-colors',
            mainTab === 'developers'
              ? 'border-estate-gold/30 bg-estate-gold/10 text-estate-gold'
              : 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-400 hover:text-foreground'
          )}
        >
          {ar ? 'المطوّرين' : 'Developers'}
        </button>
        <button
          onClick={() => setMainTab('requests')}
          className={cn(
            'rounded-2xl border px-4 py-2 text-sm font-semibold transition-colors',
            mainTab === 'requests'
              ? 'border-estate-gold/30 bg-estate-gold/10 text-estate-gold'
              : 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-400 hover:text-foreground'
          )}
        >
          {ar ? 'طلبات التعديل' : 'Edit requests'}
          {pendingEdits !== null && pendingEdits > 0 && (
            <span className="ml-1.5 rounded-full bg-yellow-500/20 px-1.5 py-0.5 text-[10px] font-bold text-yellow-300">
              {pendingEdits}
            </span>
          )}
        </button>
      </div>

      {mainTab === 'requests' ? (
        <EditRequestsInbox />
      ) : (
        <>
      {/* Search, filter & sort */}
      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <Input
            placeholder={ar ? 'دوّر باسم الشركة أو الاسم بالعربي أو الإيميل…' : 'Search by company name, Arabic name, or email...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] pl-10 text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50 focus:ring-estate-gold/20"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { key: 'ALL', label: 'All', labelAr: 'الكل' },
              { key: 'VERIFIED', label: 'Verified', labelAr: 'متوثّق' },
              { key: 'UNVERIFIED', label: 'Unverified', labelAr: 'مش متوثّق' },
              { key: 'ACTIVE', label: 'Active', labelAr: 'نشط' },
              { key: 'SUSPENDED', label: 'Suspended', labelAr: 'موقوف' },
            ] as { key: StatusFilter; label: string; labelAr: string }[]
          ).map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                statusFilter === f.key
                  ? 'border-estate-gold/30 bg-estate-gold/10 text-estate-gold'
                  : 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-400 hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-foreground'
              )}
            >
              {ar ? f.labelAr : f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {(
            [
              { key: 'projects', label: 'Projects', labelAr: 'المشاريع' },
              { key: 'units', label: 'Units', labelAr: 'الوحدات' },
              { key: 'name', label: 'Name', labelAr: 'الاسم' },
            ] as { key: SortKey; label: string; labelAr: string }[]
          ).map((s) => (
            <button
              key={s.key}
              onClick={() => setSortBy(s.key)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition-all',
                sortBy === s.key
                  ? 'border-estate-gold/30 bg-estate-gold/10 text-estate-gold'
                  : 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-400 hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-foreground'
              )}
            >
              <ArrowUpDown className="h-3 w-3" />
              {ar ? s.labelAr : s.label}
            </button>
          ))}
        </div>

        {/* Exports exactly what is currently filtered/sorted below. */}
        <ExportCsvBtn
          filename="ceo-developers"
          rows={filteredDevelopers.map((d) => ({
            companyName: d.companyName,
            companyNameArabic: d.companyNameArabic,
            contactEmail: d.contactEmail,
            contactPhone: d.contactPhone,
            website: d.website,
            crNumber: d.crNumber,
            taxId: d.taxId,
            foundedYear: d.foundedYear,
            headquarters: d.headquarters,
            isVerified: d.isVerified,
            accountStatus: d.accountStatus,
            isActive: d.isActive,
            editMode: d.editMode || 'REQUEST',
            totalProjects: d.totalProjects,
            projectsListed: d.projects.length,
            totalUnitsSold: d.totalUnitsSold,
            leadCount: d.leadCount,
            leadsLast30Days: d.leadsLast30Days,
            soldValue: d.soldValue,
            rating: d.rating,
            reviewCount: d.reviewCount,
            partnershipStatus: d.partnership?.status ?? '',
          }))}
          columns={[
            { key: 'companyName', label: ar ? 'الشركة' : 'Company' },
            { key: 'companyNameArabic', label: ar ? 'الشركة (عربي)' : 'Company (AR)' },
            { key: 'contactEmail', label: ar ? 'إيميل التواصل' : 'Contact email' },
            { key: 'contactPhone', label: ar ? 'تليفون التواصل' : 'Contact phone' },
            { key: 'website', label: ar ? 'الموقع' : 'Website' },
            { key: 'crNumber', label: ar ? 'رقم السجل' : 'CR number' },
            { key: 'taxId', label: ar ? 'الرقم الضريبي' : 'Tax ID' },
            { key: 'foundedYear', label: ar ? 'سنة التأسيس' : 'Founded' },
            { key: 'headquarters', label: ar ? 'المقر' : 'Headquarters' },
            { key: 'isVerified', label: ar ? 'متوثّق' : 'Verified' },
            { key: 'editMode', label: ar ? 'صلاحية التعديل' : 'Edit mode' },
            { key: 'accountStatus', label: ar ? 'حالة الحساب' : 'Account status' },
            { key: 'isActive', label: ar ? 'نشط' : 'Active' },
            { key: 'totalProjects', label: ar ? 'المشاريع (مسجل)' : 'Projects (record)' },
            { key: 'projectsListed', label: ar ? 'المشاريع (محمّلة)' : 'Projects (loaded)' },
            { key: 'totalUnitsSold', label: ar ? 'الوحدات المباعة' : 'Units sold' },
            { key: 'leadCount', label: ar ? 'كل الليدز' : 'Total leads' },
            { key: 'leadsLast30Days', label: ar ? 'ليدز (٣٠ يوم)' : 'Leads (30d)' },
            { key: 'soldValue', label: ar ? 'قيمة المباع (جنيه)' : 'Sold value (EGP)' },
            { key: 'rating', label: ar ? 'التقييم' : 'Rating' },
            { key: 'reviewCount', label: ar ? 'التقييمات' : 'Reviews' },
            { key: 'partnershipStatus', label: ar ? 'الشراكة' : 'Partnership' },
          ]}
        />
      </div>

      {/* List */}
      {error ? (
        <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
          <CardContent className="flex flex-col items-center gap-3 py-16">
            <AlertTriangle className="h-10 w-10 text-red-400" />
            <p className="text-sm text-gray-400">{error}</p>
            <Button
              onClick={() => fetchDevelopers()}
              variant="outline"
              size="sm"
              className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300"
            >
              {ar ? 'حاول تاني' : 'Try Again'}
            </Button>
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : filteredDevelopers.length === 0 ? (
        <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
          <CardContent className="flex flex-col items-center gap-3 py-16">
            <Building className="h-10 w-10 text-gray-600" />
            <p className="text-sm text-gray-400">{ar ? 'مفيش مطوّرين' : 'No developers found'}</p>
            <p className="text-xs text-gray-600">{ar ? 'جرّب تظبط البحث أو الفلاتر' : 'Try adjusting your search or filters'}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredDevelopers.map((dev) => {
            const isExpanded = expandedId === dev.id
            const accountActive = dev.accountStatus === 'ACTIVE' && dev.isActive
            return (
              <Card
                key={dev.id}
                className="group border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm transition-all hover:border-border dark:hover:border-[#262626] hover:bg-white/[0.07]"
              >
                <CardContent className="p-5">
                  {/* Top row */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-500/10 text-green-400 ring-1 ring-green-500/20">
                        {dev.avatar ? (
                          <Image
                            src={dev.avatar}
                            alt={dev.companyName}
                            width={48}
                            height={48}
                            className="h-12 w-12 rounded-2xl object-cover"
                          />
                        ) : (
                          <span className="text-sm font-bold">{getInitials(dev.companyName)}</span>
                        )}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-foreground">{dev.companyName}</h3>
                          {dev.isVerified ? (
                            <Badge className="border-green-500/20 bg-green-500/10 text-xs text-green-400">
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                              {ar ? 'متوثّق' : 'Verified'}
                            </Badge>
                          ) : (
                            <Badge className="border-yellow-500/20 bg-yellow-500/10 text-xs text-yellow-400">
                              <Clock className="mr-1 h-3 w-3" />
                              {ar ? 'مش متوثّق' : 'Unverified'}
                            </Badge>
                          )}
                          {accountActive ? (
                            <StatusPill tone="green">{ar ? 'نشط' : 'Active'}</StatusPill>
                          ) : (
                            <StatusPill tone="red" icon={<Ban className="h-3 w-3" />}>
                              {ar ? statusLabel(dev.accountStatus || 'SUSPENDED', true) : (dev.accountStatus || 'Suspended')}
                            </StatusPill>
                          )}
                          <StatusPill tone={PARTNERSHIP_TONES[dev.partnership?.status || ''] || 'gray'}>
                            {dev.partnership ? (ar ? `الشراكة: ${statusLabel(dev.partnership.status, true)}` : `Partnership: ${dev.partnership.status}`) : (ar ? 'من غير شراكة' : 'No partnership')}
                          </StatusPill>
                          <StatusPill tone={(dev.editMode || 'REQUEST') === 'DIRECT' ? 'blue' : 'gray'}>
                            {(dev.editMode || 'REQUEST') === 'DIRECT'
                              ? (ar ? 'تعديل مباشر' : 'Direct edits')
                              : (ar ? 'طلبات بس' : 'Request-only')}
                          </StatusPill>
                        </div>
                        <p className="mt-0.5 text-xs text-gray-500 line-clamp-1">
                          {dev.description || dev.headquarters || '—'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : dev.id)}
                      className="rounded-full p-1.5 text-gray-500 transition-colors hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-foreground"
                      aria-label={isExpanded ? (ar ? 'اقفل' : 'Collapse') : (ar ? 'افتح' : 'Expand')}
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* Contact info */}
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {dev.contactEmail}
                    </span>
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {dev.contactPhone || '—'}
                    </span>
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      {dev.foundedYear ? (ar ? `تأسست ${dev.foundedYear}` : `Est. ${dev.foundedYear}`) : '—'}
                    </span>
                  </div>

                  {/* Metrics */}
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {[
                      { label: 'Projects', labelAr: 'مشاريع', value: dev.totalProjects, color: 'text-green-400' },
                      {
                        label: 'Units Sold',
                        labelAr: 'وحدات مباعة',
                        value: (dev.totalUnitsSold || 0).toLocaleString(),
                        color: 'text-blue-400',
                      },
                      {
                        label: 'Avg Units',
                        labelAr: 'متوسط الوحدات',
                        value:
                          dev.totalProjects > 0
                            ? Math.round((dev.totalUnitsSold || 0) / dev.totalProjects).toLocaleString()
                            : '0',
                        color: 'text-estate-gold',
                      },
                    ].map((m) => (
                      <div
                        key={m.label}
                        className="rounded-2xl border border-border dark:border-[#262626] bg-white/[0.03] p-2.5 text-center"
                      >
                        <p className={cn('text-base font-bold', m.color)}>{m.value}</p>
                        <p className="text-[10px] text-gray-500">{ar ? m.labelAr : m.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Expanded */}
                  {isExpanded && (
                    <div className="mt-4 space-y-4 border-t border-border dark:border-[#262626] pt-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-gray-600">{ar ? 'رقم السجل' : 'CR Number'}</p>
                          <p className="text-sm text-foreground">{dev.crNumber || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-gray-600">{ar ? 'المقر' : 'Headquarters'}</p>
                          <p className="text-sm text-foreground">{dev.headquarters || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-gray-600">{ar ? 'قيمة الصفقات (المباعة)' : 'Deal Value (Sold)'}</p>
                          <p className="text-sm font-semibold text-estate-gold">
                            {formatEGP(dev.soldValue)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-gray-600">{ar ? 'ليدز (٣٠ يوم)' : 'Leads (30d)'}</p>
                          <p className="text-sm text-foreground">
                            {dev.leadsLast30Days} / {dev.leadCount}
                          </p>
                        </div>
                      </div>

                      {/* Controls */}
                      <div>
                        <p className="mb-2 text-[10px] uppercase tracking-wider text-gray-600">
                          {ar ? 'تحكم المطوّر' : 'Developer Controls'}
                        </p>
                        {/* Edit-permission toggle: DIRECT vs REQUEST (immediate PATCH) */}
                        <div className="mb-2 rounded-2xl border border-border dark:border-[#262626] bg-white/[0.03] p-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] text-gray-500">
                              {ar ? 'صلاحية التعديل' : 'Edit permission'}
                            </span>
                            <div className="ml-auto flex rounded-full border border-border dark:border-[#262626] p-0.5">
                              {(['DIRECT', 'REQUEST'] as const).map((m) => {
                                const on = (dev.editMode || 'REQUEST') === m
                                return (
                                  <button
                                    key={m}
                                    type="button"
                                    disabled={busyKey === `editmode-${dev.id}` || on}
                                    onClick={() => toggleEditMode(dev, m)}
                                    className={cn(
                                      'rounded-full px-3 py-1 text-[11px] font-medium transition-all disabled:cursor-default',
                                      on
                                        ? m === 'DIRECT'
                                          ? 'bg-blue-500/20 text-blue-300'
                                          : 'bg-estate-gold/15 text-estate-gold'
                                        : 'text-gray-500 hover:text-foreground disabled:opacity-60'
                                    )}
                                  >
                                    {busyKey === `editmode-${dev.id}` && !on ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : m === 'DIRECT' ? (
                                      ar ? 'مباشر' : 'Direct'
                                    ) : (
                                      ar ? 'بطلب' : 'Request'
                                    )}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                          <p className="mt-1.5 text-[11px] leading-relaxed text-gray-600">
                            {ar
                              ? 'مباشر: المطوّر يعدّل المشاريع والوحدات وخطط السداد على طول. بطلب: الكتابة المباشرة بتترفض وبتتحوّل لطلب تعديل لازم توافق عليه من تبويبة «طلبات التعديل».'
                              : 'Direct: the developer edits projects, units and plans immediately. Request: direct writes are rejected and become edit requests you approve from the “Edit requests” tab.'}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          <ActionBtn
                            icon={<Pencil className="h-3.5 w-3.5" />}
                            label={ar ? 'تعديل' : 'Edit'}
                            tone="gold"
                            onClick={() => setEditDev(dev)}
                          />
                          <ActionBtn
                            icon={<Briefcase className="h-3.5 w-3.5" />}
                            label={ar ? 'الشراكة' : 'Partnership'}
                            tone={dev.partnership ? 'default' : 'gold'}
                            onClick={() => setPartnerDev(dev)}
                          />
                          <ActionBtn
                            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                            label={dev.isVerified ? (ar ? 'اشيل التوثيق' : 'Unverify') : (ar ? 'وثّق' : 'Verify')}
                            tone={dev.isVerified ? 'default' : 'success'}
                            busy={busyKey === `verify-${dev.id}`}
                            onClick={() => toggleVerify(dev)}
                          />
                          <ActionBtn
                            icon={<Power className="h-3.5 w-3.5" />}
                            label={accountActive ? (ar ? 'وقّف' : 'Suspend') : (ar ? 'شغّل' : 'Reactivate')}
                            tone={accountActive ? 'danger' : 'success'}
                            busy={busyKey === `account-${dev.id}`}
                            onClick={() => toggleAccount(dev)}
                          />
                          <ActionBtn
                            icon={<Trash2 className="h-3.5 w-3.5" />}
                            label={ar ? 'احذف' : 'Remove'}
                            tone="danger"
                            onClick={() => setRemoveDev(dev)}
                          />
                        </div>
                      </div>

                      {/* Projects */}
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-[10px] uppercase tracking-wider text-gray-600">
                            {ar ? `المشاريع (${dev.projects.length})` : `Projects (${dev.projects.length})`}
                          </p>
                          <p className="text-[10px] text-gray-600">{ar ? 'إظهار / إخفاء ونشر' : 'Show / hide & publish'}</p>
                        </div>

                        {dev.projects.length === 0 ? (
                          <div className="rounded-2xl border border-border dark:border-[#262626] bg-white/[0.02] p-4 text-center">
                            <FolderOpen className="mx-auto mb-2 h-6 w-6 text-gray-600" />
                            <p className="text-xs text-gray-500">{ar ? 'مفيش مشاريع متسجلة' : 'No projects listed'}</p>
                          </div>
                        ) : (
                          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                            {dev.projects.map((project) => {
                              const busy = busyKey === `project-${project.id}` ||
                                busyKey === `approval-${project.id}`
                              return (
                                <div
                                  key={project.id}
                                  className="rounded-2xl border border-border dark:border-[#262626] bg-white/[0.03] p-3"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-medium text-foreground">
                                        {project.name}
                                      </p>
                                      <p className="flex items-center gap-1 text-[11px] text-gray-500">
                                        <MapPin className="h-3 w-3" />
                                        {project.location}
                                      </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                      <StatusPill tone={project.isActive ? 'green' : 'gray'}>
                                        {project.isActive ? (ar ? 'ظاهر' : 'Visible') : (ar ? 'مستخبي' : 'Hidden')}
                                      </StatusPill>
                                      <button
                                        onClick={() => toggleProject(dev, project)}
                                        disabled={busy}
                                        title={project.isActive ? (ar ? 'اخفي المشروع' : 'Hide project') : (ar ? 'اظهر المشروع' : 'Show project')}
                                        className={cn(
                                          'flex h-7 w-7 items-center justify-center rounded-full border transition-all disabled:opacity-50',
                                          project.isActive
                                            ? 'border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20'
                                            : 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-400 hover:text-foreground'
                                        )}
                                      >
                                        <Power className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </div>

                                  <div className="mt-2 flex items-center gap-2">
                                    <label className="text-[11px] text-gray-600">{ar ? 'الموافقة' : 'Approval'}</label>
                                    <select
                                      value={project.approvalStatus}
                                      disabled={busy}
                                      onChange={(e) => setProjectApproval(dev, project, e.target.value)}
                                      className={cn(fieldSelectCls(busy), 'h-7 flex-1 py-0 text-[11px]')}
                                    >
                                      {PROJECT_APPROVALS.map((s) => (
                                        <option key={s} value={s}>
                                          {statusLabel(s, ar)}
                                        </option>
                                      ))}
                                    </select>
                                    <span className="flex items-center gap-1 text-[11px] text-gray-500">
                                      <Home className="h-3 w-3" />
                                      {(project.viewCount || 0).toLocaleString()} {ar ? 'مشاهدة' : 'views'}
                                    </span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
      {/* Cursor pagination footer — hidden for legacy {developers} shape (pagingOn=false). */}
      {pagingOn && !loading && !error && mainTab === 'developers' && developers.length > 0 && (
        <div className="flex flex-col items-center gap-2 py-2">
          {nextCursor ? (
            <Button
              onClick={loadMore}
              disabled={loadingMore}
              variant="outline"
              className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300"
            >
              {loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loadingMore
                ? (ar ? 'بيحمّل…' : 'Loading…')
                : (ar ? `حمّل كمان (${developers.length} محمّلين)` : `Load more (${developers.length} loaded)`)}
            </Button>
          ) : (
            <p className="text-xs text-gray-600">
              {ar ? `كل المطوّرين المحمّلين (${developers.length})` : `All loaded developers (${developers.length})`}
            </p>
          )}
        </div>
      )}
        </>
      )}

      {editDev && (
        <EditDeveloperModal
          dev={editDev}
          onClose={() => setEditDev(null)}
          onSaved={(patch) => {
            if (!editDev) return
            patchLocal(editDev.id, patch)
            notify(ar ? 'بيانات المطوّر اتحدّثت' : 'Developer updated')
            setEditDev(null)
          }}
          onError={(msg) => notify(msg, 'err')}
        />
      )}

      {partnerDev && (
        <PartnershipModal
          dev={partnerDev}
          onClose={() => setPartnerDev(null)}
          onSaved={(partnership) => {
            if (!partnerDev) return
            patchLocal(partnerDev.id, { partnership })
            notify(ar ? 'الشراكة اتحفظت' : 'Partnership saved')
            setPartnerDev(null)
          }}
          onError={(msg) => notify(msg, 'err')}
        />
      )}

      <ConfirmDialog
        open={!!removeDev}
        title={ar ? 'احذف المطوّر' : 'Remove developer'}
        confirmLabel={ar ? 'احذف المطوّر' : 'Remove developer'}
        busy={!!removeDev && busyKey === `remove-${removeDev.id}`}
        confirmPhrase={removeDev?.companyName}
        message={
          ar ? (
            <>
              ده هيمسح <span className="font-semibold text-foreground">{removeDev?.companyName}</span>
              {' '}وحسابهم نهائيًا. المسح بينجح بس لو الشركة مفيش عليها مشاريع ولا
              صفقات متسجلة — غير كده المنصة هتطلب منك توقّفهم بدل المسح عشان
              سجل المشاريع والصفقات يفضل محفوظ.
            </>
          ) : (
            <>
              This permanently deletes <span className="font-semibold text-foreground">{removeDev?.companyName}</span>
              {' '}and their account. It only succeeds while the company has no projects and no
              recorded deals — otherwise the platform will ask you to suspend them instead so
              project and deal history is preserved.
            </>
          )
        }
        onConfirm={confirmRemove}
        onCancel={() => setRemoveDev(null)}
      />
    </div>
  )
}

/* ─── Edit developer modal ──────────────────────────────── */

function EditDeveloperModal({
  dev,
  onClose,
  onSaved,
  onError,
}: {
  dev: Developer
  onClose: () => void
  onSaved: (patch: Partial<Developer>) => void
  onError: (msg: string) => void
}) {
  const { lang: editLang } = useLanguage()
  const ar = editLang === 'ar'
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    companyName: dev.companyName,
    companyNameArabic: dev.companyNameArabic || '',
    contactEmail: dev.contactEmail,
    contactPhone: dev.contactPhone,
    website: dev.website || '',
    crNumber: dev.crNumber || '',
    taxId: dev.taxId || '',
    foundedYear: dev.foundedYear || '',
    headquarters: dev.headquarters,
    rating: dev.rating,
    description: dev.description,
  })

  const set = (key: string, value: string | number) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const submit = async () => {
    setSaving(true)
    try {
      const payload = {
        companyName: form.companyName.trim(),
        companyNameArabic: form.companyNameArabic.trim(),
        contactEmail: form.contactEmail.trim(),
        contactPhone: form.contactPhone.trim(),
        website: form.website.trim(),
        crNumber: form.crNumber.trim(),
        taxId: form.taxId.trim(),
        foundedYear: form.foundedYear === '' ? null : Number(form.foundedYear),
        headquarters: form.headquarters.trim(),
        rating: Number(form.rating),
        description: form.description.trim(),
      }
      await ceoApi(`/api/ceo/developers/${dev.id}`, 'PATCH', payload)
      onSaved({
        companyName: payload.companyName,
        companyNameArabic: payload.companyNameArabic || null,
        contactEmail: payload.contactEmail,
        contactPhone: payload.contactPhone,
        website: payload.website || null,
        crNumber: payload.crNumber || null,
        taxId: payload.taxId || null,
        foundedYear: payload.foundedYear,
        headquarters: payload.headquarters,
        rating: payload.rating,
        description: payload.description,
      })
    } catch (err) {
      console.error('Failed to update developer:', err)
      onError(ar ? 'معرفناش نحدّث المطوّر — حاول تاني.' : 'Failed to update developer')
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={ar ? 'تعديل المطوّر' : 'Edit developer'}
      subtitle={dev.contactEmail}
      className="max-w-2xl"
      footer={
        <>
          <Button
            variant="outline"
            onClick={onClose}
            className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]"
          >
            {ar ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button
            onClick={submit}
            disabled={saving || !form.companyName.trim()}
            className="gold-shimmer bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold/90"
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {ar ? 'احفظ التغييرات' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={ar ? 'اسم الشركة' : 'Company name'}>
          <input
            className={fieldInputCls}
            value={form.companyName}
            onChange={(e) => set('companyName', e.target.value)}
          />
        </Field>
        <Field label={ar ? 'اسم الشركة (بالعربي)' : 'Company name (Arabic)'}>
          <input
            className={fieldInputCls}
            dir="rtl"
            value={form.companyNameArabic}
            onChange={(e) => set('companyNameArabic', e.target.value)}
          />
        </Field>
        <Field label={ar ? 'إيميل التواصل' : 'Contact email'}>
          <input
            type="email"
            className={fieldInputCls}
            value={form.contactEmail}
            onChange={(e) => set('contactEmail', e.target.value)}
          />
        </Field>
        <Field label={ar ? 'تليفون التواصل' : 'Contact phone'}>
          <input
            className={fieldInputCls}
            value={form.contactPhone}
            onChange={(e) => set('contactPhone', e.target.value)}
          />
        </Field>
        <Field label={ar ? 'الموقع' : 'Website'}>
          <input
            className={fieldInputCls}
            placeholder="https://"
            value={form.website}
            onChange={(e) => set('website', e.target.value)}
          />
        </Field>
        <Field label={ar ? 'المقر' : 'Headquarters'}>
          <input
            className={fieldInputCls}
            value={form.headquarters}
            onChange={(e) => set('headquarters', e.target.value)}
          />
        </Field>
        <Field label={ar ? 'رقم السجل' : 'CR number'}>
          <input
            className={fieldInputCls}
            value={form.crNumber}
            onChange={(e) => set('crNumber', e.target.value)}
          />
        </Field>
        <Field label={ar ? 'الرقم الضريبي' : 'Tax ID'}>
          <input
            className={fieldInputCls}
            value={form.taxId}
            onChange={(e) => set('taxId', e.target.value)}
          />
        </Field>
        <Field label={ar ? 'سنة التأسيس' : 'Founded year'}>
          <input
            type="number"
            min={1800}
            className={fieldInputCls}
            value={form.foundedYear}
            onChange={(e) => set('foundedYear', e.target.value)}
          />
        </Field>
        <Field label={ar ? 'التقييم' : 'Rating'} hint="0 – 5">
          <input
            type="number"
            min={0}
            max={5}
            step="0.1"
            className={fieldInputCls}
            value={form.rating}
            onChange={(e) => set('rating', Number(e.target.value))}
          />
        </Field>
        <Field label={ar ? 'الوصف' : 'Description'} className="sm:col-span-2">
          <textarea
            className={fieldAreaCls}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  )
}

/* ─── Partnership modal ─────────────────────────────────── */

function PartnershipModal({
  dev,
  onClose,
  onSaved,
  onError,
}: {
  dev: Developer
  onClose: () => void
  onSaved: (p: Partnership) => void
  onError: (msg: string) => void
}) {
  const { lang: partLang } = useLanguage()
  const ar = partLang === 'ar'
  const existing = dev.partnership
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    status: existing?.status || 'PENDING',
    isActive: existing?.isActive ?? true,
    allProjectsApproved: existing?.allProjectsApproved ?? true,
    leadProtectionDays: existing?.leadProtectionDays ?? '',
    commissionAgreement: existing?.commissionAgreement || '',
    terms: existing?.terms || '',
    startDate: existing?.startDate ? existing.startDate.slice(0, 10) : '',
    endDate: existing?.endDate ? existing.endDate.slice(0, 10) : '',
  })

  const set = (key: string, value: string | boolean | number) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const [allowed, setAllowed] = useState<string[]>(existing?.allowedBrokerIds ?? [])
  const [blocked, setBlocked] = useState<string[]>(existing?.blockedBrokerIds ?? [])
  const [approved, setApproved] = useState<string[]>(existing?.approvedProjectIds ?? [])
  const [reviewNote, setReviewNote] = useState('')
  const [brokers, setBrokers] = useState<BrokerLite[] | null>(null)
  const [brokersError, setBrokersError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await ceoApi<{ brokers: BrokerLite[] }>('/api/ceo/brokers')
        if (!cancelled) setBrokers(data.brokers || [])
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load brokers:', err)
          setBrokersError(ar ? 'معرفناش نجيب البروكرز — حاول تاني.' : 'Failed to load brokers')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const toggleId = (
    list: string[],
    update: (next: string[]) => void,
    id: string
  ) => update(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  const submit = async () => {
    setSaving(true)
    try {
      const leadProtectionDays =
        form.leadProtectionDays === '' ? null : Number(form.leadProtectionDays)
      const startDate = form.startDate ? new Date(form.startDate).toISOString() : null
      const endDate = form.endDate ? new Date(form.endDate).toISOString() : null

      await ceoApi('/api/ceo/partnerships', 'POST', {
        type: 'PARTNERSHIP_UPSERT',
        partnership: {
          developerId: dev.id,
          status: form.status,
          isActive: form.isActive,
          allProjectsApproved: form.allProjectsApproved,
          approvedProjectIds: approved,
          allowedBrokerIds: allowed,
          blockedBrokerIds: blocked,
          leadProtectionDays,
          commissionAgreement: form.commissionAgreement.trim() || null,
          terms: form.terms.trim() || null,
          startDate,
          endDate,
          reviewNote: reviewNote.trim() || null,
        },
      })

      onSaved({
        status: form.status,
        isActive: form.isActive,
        allProjectsApproved: form.allProjectsApproved,
        approvedProjectIds: approved,
        allowedBrokerIds: allowed,
        blockedBrokerIds: blocked,
        leadProtectionDays,
        commissionAgreement: form.commissionAgreement.trim() || null,
        terms: form.terms.trim() || null,
        startDate,
        endDate,
      })
    } catch (err) {
      console.error('Failed to save partnership:', err)
      onError(ar ? 'معرفناش نحفظ الشراكة — حاول تاني.' : 'Failed to save partnership')
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={ar ? 'شراكة المطوّر' : 'Developer partnership'}
      subtitle={ar ? `${dev.companyName} — بتتحكم في أنهي بروكرز يقدروا يسجلوا ليدز وصفقات` : `${dev.companyName} — gates which brokers may register leads and deals`}
      className="max-w-3xl"
      footer={
        <>
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
            {ar ? 'احفظ الشراكة' : 'Save partnership'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={ar ? 'الحالة' : 'Status'}>
          <select
            className={fieldSelectCls()}
            value={form.status}
            onChange={(e) => set('status', e.target.value)}
          >
            {PARTNERSHIP_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s, ar)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={ar ? 'حماية الليد (بالأيام)' : 'Lead protection (days)'} hint={ar ? '١ – ٧٣٠، أو سيبه فاضي للافتراضي' : '1 – 730, or blank for the platform default'}>
          <input
            type="number"
            min={1}
            max={730}
            className={fieldInputCls}
            value={form.leadProtectionDays}
            onChange={(e) => set('leadProtectionDays', e.target.value)}
          />
        </Field>
        <Field label={ar ? 'تاريخ البداية' : 'Start date'}>
          <input
            type="date"
            className={fieldInputCls}
            value={form.startDate}
            onChange={(e) => set('startDate', e.target.value)}
          />
        </Field>
        <Field label={ar ? 'تاريخ النهاية' : 'End date'}>
          <input
            type="date"
            className={fieldInputCls}
            value={form.endDate}
            onChange={(e) => set('endDate', e.target.value)}
          />
        </Field>

        <div className="flex flex-wrap gap-4 sm:col-span-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => set('isActive', e.target.checked)}
              className="h-4 w-4 accent-estate-gold"
            />
            {ar ? 'الشراكة شغالة' : 'Partnership active'}
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={form.allProjectsApproved}
              onChange={(e) => set('allProjectsApproved', e.target.checked)}
              className="h-4 w-4 accent-estate-gold"
            />
            {ar ? 'تشمل كل المشاريع' : 'Cover all projects'}
          </label>
        </div>

        <Field
          label={ar ? 'اتفاق العمولة' : 'Commission agreement'}
          className="sm:col-span-2"
        >
          <textarea
            className={fieldAreaCls}
            placeholder="e.g. Broker 2% / EstateAI 1% on reservations…"
            value={form.commissionAgreement}
            onChange={(e) => set('commissionAgreement', e.target.value)}
          />
        </Field>

        <Field label={ar ? 'الشروط والملاحظات' : 'Terms & notes'} className="sm:col-span-2">
          <textarea
            className={fieldAreaCls}
            value={form.terms}
            onChange={(e) => set('terms', e.target.value)}
          />
        </Field>

        <Field
          label={ar ? 'ملاحظة المدير للمراجعة' : 'CEO review note'}
          hint={ar ? 'داخلية بس — فريق المدير بس اللي بيشوفها، مش المطوّر' : 'Internal only — visible to the CEO team, not to the developer'}
          className="sm:col-span-2"
        >
          <input
            type="text"
            className={fieldInputCls}
            placeholder="e.g. Renewal pending, waiting for updated CR…"
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
          />
        </Field>

        {/* ── Broker allow / block lists ── */}
        <div className="sm:col-span-2">
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs font-medium text-gray-400">
              {ar ? 'قوايم صلاحية البروكرز' : 'Broker access lists'}
            </label>
            <div className="flex gap-2 text-[11px]">
              <span className="text-green-400">{allowed.length} {ar ? 'مسموح' : 'allowed'}</span>
              <span className="text-red-400">{blocked.length} {ar ? 'محظور' : 'blocked'}</span>
            </div>
          </div>

          {brokersError ? (
            <InlineNote tone="err">{brokersError}</InlineNote>
          ) : brokers === null ? (
            <ModalSkeleton rows={3} />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-[11px] text-gray-600">
                  {ar ? 'المسموح — يقدروا يسجلوا ليدز وصفقات' : 'Allowed — may register leads & deals'}
                </p>
                <MultiPicker
                  items={brokers.map((b) => ({
                    id: b.id,
                    label: b.name,
                    sub: b.email,
                  }))}
                  selected={allowed}
                  onToggle={(id) => toggleId(allowed, setAllowed, id)}
                  searchPlaceholder={ar ? 'دوّر على بروكرز…' : 'Search brokers…'}
                  emptyLabel={ar ? 'مفيش بروكرز مطابقين.' : 'No brokers match.'}
                />
              </div>
              <div>
                <p className="mb-1 text-[11px] text-gray-600">
                  {ar ? 'المحظور — بيترفض على طول، وبيغلب "المسموح"' : 'Blocked — always rejected, wins over “allowed”'}
                </p>
                <MultiPicker
                  items={brokers.map((b) => ({
                    id: b.id,
                    label: b.name,
                    sub: b.email,
                  }))}
                  selected={blocked}
                  onToggle={(id) => toggleId(blocked, setBlocked, id)}
                  searchPlaceholder={ar ? 'دوّر على بروكرز…' : 'Search brokers…'}
                  emptyLabel={ar ? 'مفيش بروكرز مطابقين.' : 'No brokers match.'}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Approved project set ── */}
        {!form.allProjectsApproved && (
          <div className="sm:col-span-2">
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-gray-400">
                {ar ? `المشاريع المتوافق عليها (${approved.length}/${dev.projects.length})` : `Approved projects (${approved.length}/${dev.projects.length})`}
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setApproved(dev.projects.map((p) => p.id))}
                  className="text-[11px] text-estate-gold hover:underline"
                >
                  {ar ? 'الكل' : 'All'}
                </button>
                <button
                  type="button"
                  onClick={() => setApproved([])}
                  className="text-[11px] text-gray-500 hover:underline"
                >
                  {ar ? 'مفيش' : 'None'}
                </button>
              </div>
            </div>
            <MultiPicker
              items={dev.projects.map((p) => ({
                id: p.id,
                label: p.name,
                sub: p.location,
              }))}
              selected={approved}
              onToggle={(id) => toggleId(approved, setApproved, id)}
              searchPlaceholder={ar ? 'دوّر على مشاريع…' : 'Search projects…'}
              emptyLabel={ar ? 'المطوّر ده لسه معندوش مشاريع.' : 'This developer has no projects yet.'}
            />
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl border border-border dark:border-[#262626] bg-white/[0.03] p-3 text-xs text-gray-500">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-600">{ar ? 'التغطية' : 'Coverage'}</p>
          <p className="text-sm text-foreground">
            {form.allProjectsApproved
              ? (ar ? 'كل المشاريع' : 'All projects')
              : (ar ? `${approved.length} مشروع` : `${approved.length} project(s)`)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-600">{ar ? 'المدة' : 'Window'}</p>
          <p className="text-sm text-foreground">
            {form.startDate || form.endDate
              ? `${form.startDate || '…'} → ${form.endDate || '…'}`
              : (ar ? 'من غير نهاية' : 'No expiry')}
          </p>
        </div>
      </div>

      <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-gray-600">
        <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {ar ? (
          <>القواعد دي هي نفسها اللي بتتطبق لما البروكر يسجل ليد أو يقدم صفقة، وهي مشتركة مع<span className="text-gray-400"> الصفقات ← الشراكات</span>. أي تغيير هنا بينزل في سجل التدقيق.</>
        ) : (
          <>These rules are the same ones enforced when a broker registers a lead or files a deal,
          and they are shared with
          <span className="text-gray-400"> Deals → Partnerships</span>. Everything you change here
          lands in the audit log.</>
        )}
      </p>
    </Modal>
  )
}
