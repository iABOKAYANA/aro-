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
  Building2,
  Star,
  ArrowUpDown,
  CheckCircle2,
  Check,
  X,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Briefcase,
  Phone,
  Mail,
  Pencil,
  Trash2,
  ShieldCheck,
  Ban,
  KeyRound,
  UserPlus,
  Link2,
  FolderOpen,
  Power,
  Eye,
  EyeOff,
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
  ActionBtn,
  StatusPill,
  ModalSkeleton,
} from '../components/manager-ui'
import ExportCsvBtn from '@/components/ui/export-csv'
import TargetsBoard from './components/targets-board'
import { useLanguage } from '@/lib/language-context'
import { statusLabel } from '@/components/ceo/ceo-charts'
import { Reveal } from '@/components/design'

/* ─── Types ─────────────────────────────────────────────── */

interface AccessRow {
  id: string
  developerId: string | null
  projectId: string | null
  access: string
  expiresAt: string | null
  notes: string | null
}

interface Broker {
  id: string
  userId: string
  name: string
  email: string
  phone: string
  avatar: string | null
  agencyName: string
  licenseNumber: string
  specializations: string[]
  yearsExperience: number | null
  totalDeals: number
  rating: number
  reviewCount: number
  commissionRate: number | null
  bio: string | null
  isVerified: boolean
  accountStatus: string
  isActive: boolean
  leadCount: number
  activeLeads: number
  leadsLast30Days: number
  conversionRate: number
  wonDeals: number
  totalRevenue: number
  commissionEarned: number
  projectAccess: AccessRow[]
  /** New editable profile fields — the list endpoint does not return them,
      so the modal starts them blank (omit = leave untouched server-side). */
  nameArabic?: string | null
  socialLinks?: string | null
  preferredLang?: string | null
  preferredCurrency?: string | null
}

interface LeadLite {
  id: string
  leadCode: string | null
  name: string
  phone: string
  email: string | null
  status: string
  budgetMax: number | null
  broker: { id: string; user?: { name?: string | null } } | null
}

interface ProjectLite {
  id: string
  name: string
  developerId: string
  isActive: boolean
  approvalStatus: string
  developer: { id: string; companyName: string }
}

interface DeveloperLite {
  id: string
  companyName: string
}

type SortKey = 'name' | 'deals' | 'rating' | 'leads'
type StatusFilter = 'ALL' | 'VERIFIED' | 'UNVERIFIED' | 'ACTIVE' | 'SUSPENDED'

// Cursor-pagination page size for GET /api/ceo/brokers (`?cursor=&limit=` →
// `{items, nextCursor}`). Search/filter/sort stay client-side over loaded pages.
const BROKERS_PAGE_SIZE = 30

/* ─── Presentational helpers ────────────────────────────── */

function StarRating({ rating, reviewCount }: { rating: number; reviewCount?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            'h-3.5 w-3.5',
            i < Math.floor(rating)
              ? 'fill-estate-gold text-estate-gold'
              : i < rating
              ? 'fill-estate-gold/40 text-estate-gold/40'
              : 'text-gray-700'
          )}
        />
      ))}
      <span className="ml-1 text-sm font-medium text-foreground">{rating.toFixed(1)}</span>
      <span className="text-[11px] text-gray-600">
        {typeof reviewCount === 'number' ? `(${reviewCount})` : ''}
      </span>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-5 backdrop-blur-sm">
      <div className="flex items-start gap-4">
        <div className="h-14 w-14 animate-pulse rounded-2xl bg-muted" />
        <div className="flex-1 space-y-3">
          <div className="h-4 w-32 animate-pulse rounded-full bg-muted" />
          <div className="h-3 w-48 animate-pulse rounded-full bg-muted" />
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

export default function CEOBrokersPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [brokers, setBrokers] = useState<Broker[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('deals')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const [editBroker, setEditBroker] = useState<Broker | null>(null)
  const [accessBroker, setAccessBroker] = useState<Broker | null>(null)
  const [assignBroker, setAssignBroker] = useState<Broker | null>(null)
  const [removeBroker, setRemoveBroker] = useState<Broker | null>(null)
  // Cursor pagination — `pagingOn` is true only once the backend speaks
  // `{items, nextCursor}`; legacy `{brokers}` falls back to full-list.
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [pagingOn, setPagingOn] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const notify = useCallback((msg: string, tone: 'ok' | 'err' = 'ok') => {
    setToast({ msg, tone })
  }, [])

  const fetchBrokersPage = useCallback(async (cursor: string | null) => {
    const params = new URLSearchParams({ limit: String(BROKERS_PAGE_SIZE) })
    if (cursor) params.set('cursor', cursor)
    const data = await ceoApi<{ brokers?: Broker[]; items?: Broker[]; nextCursor?: string | null }>(
      `/api/ceo/brokers?${params.toString()}`
    )
    // Paginated contract: {items, nextCursor}
    if (Array.isArray(data.items)) {
      return { items: data.items || [], nextCursor: data.nextCursor ?? null, paged: true }
    }
    // Legacy fallback: {brokers} — no crash during backend rollout.
    return { items: data.brokers || [], nextCursor: null as string | null, paged: false }
  }, [])

  const fetchBrokers = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const { items, nextCursor: nc, paged } = await fetchBrokersPage(null)
      setBrokers(items)
      setNextCursor(nc)
      setPagingOn(paged)
    } catch (err) {
      console.error('Failed to fetch brokers:', err)
      setError(ar ? 'معرفناش نجيب البروكرز — حاول تاني.' : 'Failed to fetch brokers')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [ar, fetchBrokersPage])

  useEffect(() => {
    fetchBrokers()
  }, [fetchBrokers])

  // Append-only "load more" — search/filter/sort stay client-side over loaded pages.
  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const { items, nextCursor: nc } = await fetchBrokersPage(nextCursor)
      setBrokers((prev) => {
        const seen = new Set(prev.map((b) => b.id))
        return [...prev, ...items.filter((b) => !seen.has(b.id))]
      })
      setNextCursor(nc)
    } catch (err) {
      console.error('Failed to load more brokers:', err)
      notify(ar ? 'معرفناش نجيب الباقي — حاول تاني.' : 'Failed to load more', 'err')
    } finally {
      setLoadingMore(false)
    }
  }, [nextCursor, loadingMore, fetchBrokersPage, notify, ar])

  const patchLocal = useCallback((id: string, patch: Partial<Broker>) => {
    setBrokers((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  }, [])

  const run = useCallback(
    async (key: string, action: () => Promise<void>) => {
      setBusyKey(key)
      try {
        await action()
      } catch (err) {
        console.error('Broker action failed:', key, err)
        notify(ar ? 'حصلت مشكلة — حاول تاني.' : 'Something went wrong', 'err')
      } finally {
        setBusyKey(null)
      }
    },
    [notify, ar]
  )

  /* ── Actions ──────────────────────────────────────────── */

  const toggleVerify = (broker: Broker) =>
    run(`verify-${broker.id}`, async () => {
      const next = !broker.isVerified
      await ceoApi(`/api/ceo/brokers/${broker.id}`, 'PATCH', { isVerified: next })
      patchLocal(broker.id, { isVerified: next })
      notify(next ? (ar ? `${broker.name} بقى متوثّق` : `${broker.name} is now verified`) : (ar ? `اتشال التوثيق من ${broker.name}` : `Verification removed from ${broker.name}`))
    })

  const toggleAccount = (broker: Broker) =>
    run(`account-${broker.id}`, async () => {
      const active = broker.accountStatus === 'ACTIVE' && broker.isActive
      const status = active ? 'SUSPENDED' : 'ACTIVE'
      await ceoApi('/api/ceo/users', 'PATCH', {
        userId: broker.userId,
        status,
        isActive: !active,
      })
      patchLocal(broker.id, { accountStatus: status, isActive: !active })
      notify(active ? (ar ? `${broker.name} اتوقّف` : `${broker.name} suspended`) : (ar ? `${broker.name} اشتغل تاني` : `${broker.name} reactivated`))
    })

  const confirmRemove = async () => {
    const target = removeBroker
    if (!target) return
    await run(`remove-${target.id}`, async () => {
      await ceoApi(`/api/ceo/brokers/${target.id}?hard=true`, 'DELETE')
      setBrokers((prev) => prev.filter((b) => b.id !== target.id))
      notify(ar ? `${target.name} اتشال من المنصة` : `${target.name} removed from the platform`)
      setRemoveBroker(null)
      setExpandedId(null)
    })
  }

  /* ── Filtering ────────────────────────────────────────── */

  const counts = useMemo(
    () => ({
      total: brokers.length,
      verified: brokers.filter((b) => b.isVerified).length,
      suspended: brokers.filter((b) => !(b.accountStatus === 'ACTIVE' && b.isActive)).length,
      leads: brokers.reduce((sum, b) => sum + b.leadCount, 0),
      avgRating: brokers.length
        ? brokers.reduce((sum, b) => sum + b.rating, 0) / brokers.length
        : 0,
    }),
    [brokers]
  )

  const filteredBrokers = useMemo(() => {
    const q = search.trim().toLowerCase()
    return brokers
      .filter((b) => {
        if (q) {
          const matches =
            b.name.toLowerCase().includes(q) ||
            b.email.toLowerCase().includes(q) ||
            b.agencyName.toLowerCase().includes(q) ||
            b.phone.toLowerCase().includes(q)
          if (!matches) return false
        }
        const active = b.accountStatus === 'ACTIVE' && b.isActive
        switch (statusFilter) {
          case 'VERIFIED':
            return b.isVerified
          case 'UNVERIFIED':
            return !b.isVerified
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
            return a.name.localeCompare(b.name)
          case 'rating':
            return b.rating - a.rating
          case 'leads':
            return b.leadCount - a.leadCount
          default:
            return b.totalDeals - a.totalDeals
        }
      })
  }, [brokers, search, statusFilter, sortBy])

  const avgRating = counts.avgRating.toFixed(1)

  return (
    <div className="space-y-6">
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Reveal>
          <p className="section-kicker">{ar ? 'لوحة المدير · البروكرز' : 'CEO Console · Brokers'}</p>
          <h1 className="font-display display-3 text-foreground">{ar ? 'إدارة البروكرز' : 'Broker Management'}</h1>
          <p className="text-sm text-gray-400">
            {ar ? 'وثّق ووَقّف وعدّل ووزّع شغل على كل بروكر في المنصة' : 'Verify, suspend, edit and assign work to every broker on the platform'}
          </p>
          <hr className="gold-hairline mt-4" />
        </Reveal>
        <Button
          onClick={() => fetchBrokers()}
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
            label: 'Total Brokers',
            labelAr: 'كل البروكرز',
            value: counts.total,
            icon: <Briefcase className="h-5 w-5" />,
            color: 'text-blue-400 bg-blue-500/10',
          },
          {
            label: 'Verified',
            labelAr: 'متوثّقين',
            value: `${counts.verified}/${counts.total}`,
            icon: <CheckCircle2 className="h-5 w-5" />,
            color: 'text-green-400 bg-green-500/10',
          },
          {
            label: 'Avg Rating',
            labelAr: 'متوسط التقييم',
            value: avgRating,
            icon: <Star className="h-5 w-5" />,
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

      {/* Search, filter & sort */}
      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <Input
            placeholder={ar ? 'دوّر بالاسم أو الإيميل أو المكتب أو التليفون…' : 'Search by name, email, agency, or phone...'}
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
              { key: 'deals', label: 'Deals', labelAr: 'الصفقات' },
              { key: 'rating', label: 'Rating', labelAr: 'التقييم' },
              { key: 'leads', label: 'Leads', labelAr: 'الليدز' },
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
          filename="ceo-brokers"
          rows={filteredBrokers as unknown as Record<string, unknown>[]}
          columns={[
            { key: 'name', label: ar ? 'الاسم' : 'Name' },
            { key: 'email', label: ar ? 'الإيميل' : 'Email' },
            { key: 'phone', label: ar ? 'التليفون' : 'Phone' },
            { key: 'agencyName', label: ar ? 'المكتب' : 'Agency' },
            { key: 'licenseNumber', label: ar ? 'الرخصة' : 'License' },
            { key: 'specializations', label: ar ? 'التخصصات' : 'Specializations' },
            { key: 'yearsExperience', label: ar ? 'سنين الخبرة' : 'Years experience' },
            { key: 'isVerified', label: ar ? 'متوثّق' : 'Verified' },
            { key: 'accountStatus', label: ar ? 'حالة الحساب' : 'Account status' },
            { key: 'isActive', label: ar ? 'نشط' : 'Active' },
            { key: 'leadCount', label: ar ? 'كل الليدز' : 'Total leads' },
            { key: 'activeLeads', label: ar ? 'ليدز شغالة' : 'Active leads' },
            { key: 'conversionRate', label: ar ? 'نسبة التحويل %' : 'Conversion %' },
            { key: 'totalDeals', label: ar ? 'كل الصفقات' : 'Total deals' },
            { key: 'wonDeals', label: ar ? 'صفقات كسبانة' : 'Won deals' },
            { key: 'totalRevenue', label: ar ? 'الإيراد (جنيه)' : 'Revenue (EGP)' },
            { key: 'commissionEarned', label: ar ? 'العمولة المكتسبة (جنيه)' : 'Commission earned (EGP)' },
            { key: 'rating', label: ar ? 'التقييم' : 'Rating' },
            { key: 'reviewCount', label: ar ? 'التقييمات' : 'Reviews' },
            { key: 'commissionRate', label: ar ? 'نسبة العمولة %' : 'Commission %' },
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
              onClick={() => fetchBrokers()}
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
      ) : filteredBrokers.length === 0 ? (
        <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
          <CardContent className="flex flex-col items-center gap-3 py-16">
            <Building2 className="h-10 w-10 text-gray-600" />
            <p className="text-sm text-gray-400">{ar ? 'مفيش بروكرز' : 'No brokers found'}</p>
            <p className="text-xs text-gray-600">{ar ? 'جرّب تظبط البحث أو الفلاتر' : 'Try adjusting your search or filters'}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredBrokers.map((broker) => {
            const isExpanded = expandedId === broker.id
            const accountActive = broker.accountStatus === 'ACTIVE' && broker.isActive
            return (
              <Card
                key={broker.id}
                className="group border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm transition-all hover:border-border dark:hover:border-[#262626] hover:bg-white/[0.07]"
              >
                <CardContent className="p-5">
                  {/* Top row */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-estate-gold/10 text-estate-gold ring-1 ring-estate-gold/20">
                        {broker.avatar ? (
                          <Image
                            src={broker.avatar}
                            alt={broker.name}
                            width={48}
                            height={48}
                            className="h-12 w-12 rounded-2xl object-cover"
                          />
                        ) : (
                          <span className="text-sm font-bold">{getInitials(broker.name)}</span>
                        )}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-foreground">{broker.name}</h3>
                          {broker.isVerified ? (
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
                              {ar ? statusLabel(broker.accountStatus || 'SUSPENDED', true) : (broker.accountStatus || 'Suspended')}
                            </StatusPill>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">{broker.agencyName || (ar ? 'مستقل' : 'Independent')}</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setExpandedId(isExpanded ? null : broker.id)}
                      className="h-8 w-8 text-gray-500 hover:text-foreground"
                      aria-label={isExpanded ? (ar ? 'اقفل' : 'Collapse') : (ar ? 'افتح' : 'Expand')}
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>

                  {/* Quick info */}
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {broker.email}
                    </span>
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {broker.phone || '—'}
                    </span>
                  </div>

                  <div className="mt-2">
                    <StarRating rating={broker.rating} reviewCount={broker.reviewCount} />
                  </div>

                  {/* Metrics */}
                  <div className="mt-4 grid grid-cols-4 gap-2">
                    {[
                      { label: 'Deals', labelAr: 'صفقات', value: broker.totalDeals, color: 'text-blue-400' },
                      { label: 'Leads', labelAr: 'ليدز', value: broker.leadCount, color: 'text-purple-400' },
                      { label: 'Live', labelAr: 'شغالين', value: broker.activeLeads, color: 'text-green-400' },
                      {
                        label: 'Exp',
                        labelAr: 'خبرة',
                        value: ar ? `${broker.yearsExperience ?? 0} سنة` : `${broker.yearsExperience ?? 0}yr`,
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
                          <p className="text-[10px] uppercase tracking-wider text-gray-600">{ar ? 'الرخصة' : 'License'}</p>
                          <p className="text-sm text-foreground">{broker.licenseNumber || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-gray-600">{ar ? 'التخصص' : 'Specialization'}</p>
                          <p className="text-sm text-foreground">
                            {broker.specializations.length ? broker.specializations.join(ar ? '، ' : ', ') : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-gray-600">{ar ? 'قيمة الصفقات (المباعة)' : 'Deal Value (Sold)'}</p>
                          <p className="text-sm font-semibold text-estate-gold">
                            {formatEGP(broker.totalRevenue)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-gray-600">{ar ? 'العمولة المكتسبة' : 'Commission Earned'}</p>
                          <p className="text-sm text-foreground">{formatEGP(broker.commissionEarned)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-gray-600">{ar ? 'التحويل' : 'Conversion'}</p>
                          <p className="text-sm text-foreground">
                            {broker.conversionRate}% ({broker.leadCount} {ar ? 'ليدز' : 'leads'})
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-gray-600">{ar ? 'نسبة العمولة' : 'Commission Rate'}</p>
                          <p className="text-sm text-foreground">
                            {broker.commissionRate != null ? `${broker.commissionRate}%` : '—'}
                          </p>
                        </div>
                      </div>

                      {/* Performance bar */}
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <p className="text-[10px] uppercase tracking-wider text-gray-600">{ar ? 'سكور الأداء' : 'Performance Score'}</p>
                          <p className="text-xs font-medium text-estate-gold">
                            {Math.min(
                              100,
                              Math.round((broker.rating / 5) * 50 + (broker.totalDeals / 100) * 50)
                            )}
                            %
                          </p>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-estate-gold to-amber-400"
                            style={{
                              width: `${Math.min(100, (broker.rating / 5) * 50 + (broker.totalDeals / 100) * 50)}%`,
                            }}
                          />
                        </div>
                      </div>

                      {/* Controls */}
                      <div>
                        <p className="mb-2 text-[10px] uppercase tracking-wider text-gray-600">
                          {ar ? 'تحكم البروكر' : 'Broker Controls'}
                        </p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          <ActionBtn
                            icon={<Pencil className="h-3.5 w-3.5" />}
                            label={ar ? 'تعديل' : 'Edit'}
                            tone="gold"
                            onClick={() => setEditBroker(broker)}
                          />
                          <ActionBtn
                            icon={<ShieldCheck className="h-3.5 w-3.5" />}
                            label={broker.isVerified ? (ar ? 'اشيل التوثيق' : 'Unverify') : (ar ? 'وثّق' : 'Verify')}
                            tone={broker.isVerified ? 'default' : 'success'}
                            busy={busyKey === `verify-${broker.id}`}
                            onClick={() => toggleVerify(broker)}
                          />
                          <ActionBtn
                            icon={<Power className="h-3.5 w-3.5" />}
                            label={accountActive ? (ar ? 'وقّف' : 'Suspend') : (ar ? 'شغّل' : 'Reactivate')}
                            tone={accountActive ? 'danger' : 'success'}
                            busy={busyKey === `account-${broker.id}`}
                            onClick={() => toggleAccount(broker)}
                          />
                          <ActionBtn
                            icon={<UserPlus className="h-3.5 w-3.5" />}
                            label={ar ? 'الليدز' : 'Leads'}
                            onClick={() => setAssignBroker(broker)}
                          />
                          <ActionBtn
                            icon={<KeyRound className="h-3.5 w-3.5" />}
                            label={ar ? 'الصلاحية' : 'Access'}
                            onClick={() => setAccessBroker(broker)}
                          />
                          <ActionBtn
                            icon={<Trash2 className="h-3.5 w-3.5" />}
                            label={ar ? 'احذف' : 'Remove'}
                            tone="danger"
                            onClick={() => setRemoveBroker(broker)}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Cursor pagination footer — hidden for legacy {brokers} shape (pagingOn=false). */}
      {pagingOn && !loading && !error && brokers.length > 0 && (
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
                : (ar ? `حمّل كمان (${brokers.length} محمّلين)` : `Load more (${brokers.length} loaded)`)}
            </Button>
          ) : (
            <p className="text-xs text-gray-600">
              {ar ? `كل البروكرز المحمّلين (${brokers.length})` : `All loaded brokers (${brokers.length})`}
            </p>
          )}
        </div>
      )}

      <TargetsBoard />

      <BrokerReviewsQueue notify={notify} />

      {editBroker && (
        <EditBrokerModal
          broker={editBroker}
          onClose={() => setEditBroker(null)}
          onSaved={(patch) => {
            if (!editBroker) return
            patchLocal(editBroker.id, patch)
            notify(ar ? 'البيانات اتحدّثت' : 'Broker updated')
            setEditBroker(null)
          }}
          onError={(msg) => notify(msg, 'err')}
        />
      )}

      {accessBroker && (
        <AccessModal
          broker={accessBroker}
          onClose={() => setAccessBroker(null)}
          onChanged={(rows) => {
            if (!accessBroker) return
            patchLocal(accessBroker.id, { projectAccess: rows })
            setAccessBroker((prev) => (prev ? { ...prev, projectAccess: rows } : prev))
          }}
          notify={notify}
        />
      )}

      {assignBroker && (
        <AssignLeadModal
          broker={assignBroker}
          onClose={() => setAssignBroker(null)}
          onAssigned={(count, mode) => {
            notify(
              mode === 'assign'
                ? (ar ? `${count} ليد اتوزّعوا على ${assignBroker.name}` : `${count} lead(s) assigned to ${assignBroker.name}`)
                : (ar ? `${count} ليد اتسحبوا من ${assignBroker.name}` : `${count} lead(s) released from ${assignBroker.name}`)
            )
            fetchBrokers(true)
            setAssignBroker(null)
          }}
          onError={(msg) => notify(msg, 'err')}
        />
      )}

      <ConfirmDialog
        open={!!removeBroker}
        title={ar ? 'احذف البروكر' : 'Remove broker'}
        confirmLabel={ar ? 'احذف البروكر' : 'Remove broker'}
        busy={!!removeBroker && busyKey === `remove-${removeBroker.id}`}
        confirmPhrase={removeBroker?.name || removeBroker?.email}
        message={
          ar ? (
            <>
              ده هيمسح <span className="font-semibold text-foreground">{removeBroker?.name}</span>
              {' '}وحسابه نهائيًا، والليدز بتوعه هيرجعوا للمخزون العام.
              الصفقات اللي قفلها هتفضل متسجلة باسمه، فالبروكر اللي عنده صفقات مينفعش
              يتمسح — وَقّفه بدل كده.
            </>
          ) : (
            <>
              This permanently deletes <span className="font-semibold text-foreground">{removeBroker?.name}</span>
              {' '}and their account, and releases the leads they own back to the unassigned pool.
              Deals they closed keep their historical attribution, so a broker with deals cannot be
              deleted — suspend them instead.
            </>
          )
        }
        onConfirm={confirmRemove}
        onCancel={() => setRemoveBroker(null)}
      />
    </div>
  )
}

/* ─── Broker-rating moderation queue ─────────────────── */

type BrokerQueueReview = {
  id: string
  rating: number
  comment: string | null
  status: string
  createdAt: string
  rater: { id: string; name: string | null } | null
  broker: { id: string; name: string | null } | null
}

// Client ratings of brokers waiting for CEO review — GET
// /api/broker-reviews?status= (no brokerId is the global queue, CEO/ADMIN
// only) with approve / reject through PATCH /api/broker-reviews/:id,
// the same contract as src/app/ceo/reviews/page.tsx.
function BrokerReviewsQueue({ notify }: { notify: (msg: string, tone?: 'ok' | 'err') => void }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [reviews, setReviews] = useState<BrokerQueueReview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const data = await ceoApi<{ reviews: BrokerQueueReview[] }>(
        '/api/broker-reviews?status=PENDING'
      )
      setReviews(data.reviews || [])
    } catch (err) {
      console.error('Failed to fetch broker reviews:', err)
      setError(ar ? 'معرفناش نجيب التقييمات — حاول تاني.' : 'Failed to fetch reviews')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [ar])

  useEffect(() => {
    load()
  }, [load])

  const moderate = (id: string, status: 'APPROVED' | 'REJECTED') =>
    (async () => {
      setBusyId(id)
      try {
        await ceoApi(`/api/broker-reviews/${id}`, 'PATCH', { status })
        notify(status === 'APPROVED' ? (ar ? 'تقييم البروكر اتوافق عليه' : 'Broker rating approved') : (ar ? 'تقييم البروكر اترفض' : 'Broker rating rejected'))
        await load(true)
      } catch (err) {
        console.error('Failed to moderate review:', err)
        notify(ar ? 'معرفناش نحدّث التقييم — حاول تاني.' : 'Update failed', 'err')
      } finally {
        setBusyId(null)
      }
    })()

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">{ar ? 'تقييمات البروكرز' : 'Broker ratings'}</h2>
          <p className="text-xs text-gray-500">{ar ? 'تقييمات العملا المستنية المراجعة' : 'Client ratings waiting for review'}</p>
        </div>
        <Button
          onClick={() => load()}
          variant="outline"
          size="sm"
          className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]"
        >
          <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
          {ar ? 'حدّث' : 'Refresh'}
        </Button>
      </div>

      {error ? (
        <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A]">
          <CardContent className="flex items-center justify-between gap-3 p-4 text-sm text-red-400">
            <span>{error}</span>
            <Button onClick={() => load()} variant="outline" size="sm" className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300">
              {ar ? 'حاول تاني' : 'Try Again'}
            </Button>
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" /> {ar ? 'بيحمّل التقييمات…' : 'Loading ratings…'}
        </div>
      ) : reviews.length === 0 ? (
        <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A]">
          <CardContent className="py-10 text-center">
            <Star className="mx-auto h-8 w-8 text-gray-600" />
            <p className="mt-3 text-sm text-gray-400">{ar ? 'مفيش حاجة مستنية' : 'Nothing waiting'}</p>
            <p className="mt-1 text-xs text-gray-600">{ar ? 'تقييمات العملا الجديدة هتنزل هنا' : 'New client ratings will land here'}</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A]">
          <CardContent className="divide-y divide-border dark:divide-[#262626] p-0">
            {reviews.map((review) => (
              <div key={review.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{review.rater?.name || (ar ? 'عميل' : 'Client')}</p>
                    <span className="text-xs text-gray-500">→ {review.broker?.name || (ar ? 'بروكر' : 'Broker')}</span>
                    <span className="inline-flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={cn(
                            'h-3.5 w-3.5',
                            s <= review.rating ? 'fill-estate-gold text-estate-gold' : 'text-gray-600'
                          )}
                        />
                      ))}
                    </span>
                  </div>
                  {review.comment && (
                    <p className="mt-1 truncate text-xs text-gray-400">{review.comment}</p>
                  )}
                  <p className="mt-0.5 text-[11px] text-gray-600">
                    {new Date(review.createdAt).toLocaleDateString(ar ? 'ar-EG' : 'en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => moderate(review.id, 'APPROVED')}
                    disabled={busyId === review.id}
                    className="text-green-400 hover:text-green-300"
                    title={ar ? 'وافق' : 'Approve'}
                  >
                    {busyId === review.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => moderate(review.id, 'REJECTED')}
                    disabled={busyId === review.id}
                    className="text-red-400 hover:text-red-300"
                    title={ar ? 'ارفض' : 'Reject'}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/* ─── Edit broker modal ─────────────────────────────────── */

function parseSocialLinks(raw: string | null | undefined): { k: string; v: string }[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.entries(parsed as Record<string, unknown>)
        .filter(([, v]) => typeof v === 'string' && (v as string).trim())
        .map(([k, v]) => ({ k, v: (v as string).trim() }))
    }
    return []
  } catch {
    return []
  }
}

function EditBrokerModal({
  broker,
  onClose,
  onSaved,
  onError,
}: {
  broker: Broker
  onClose: () => void
  onSaved: (patch: Partial<Broker>) => void
  onError: (msg: string) => void
}) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState({
    name: broker.name,
    phone: broker.phone,
    agencyName: broker.agencyName,
    licenseNumber: broker.licenseNumber,
    commissionRate: broker.commissionRate ?? '',
    yearsExperience: broker.yearsExperience ?? '',
    rating: broker.rating,
    specialization: broker.specializations.join(', '),
    bio: broker.bio ?? '',
    password: '',
    nameArabic: broker.nameArabic ?? '',
    avatar: broker.avatar ?? '',
    preferredLang: broker.preferredLang ?? '',
    preferredCurrency: broker.preferredCurrency ?? '',
    socialRows: parseSocialLinks(broker.socialLinks),
  })

  const passwordStrength =
    form.password.length === 0
      ? null
      : form.password.length < 10
        ? (ar ? 'قصيرة — لازم ١٠ حروف على الأقل' : 'Too short — at least 10 characters')
        : form.password.length < 10
          ? (ar ? 'مقبولة' : 'Okay')
          : /[A-Z]/.test(form.password) && /[a-z]/.test(form.password) && /\d/.test(form.password)
            ? (ar ? 'قوية' : 'Strong')
            : (ar ? 'كويسة' : 'Good')

  const submit = async () => {
    setFormError(null)
    if (form.password && form.password.length < 10) {
      setFormError(ar ? 'الباسورد لازم تبقى ١٠ حروف على الأقل — أو سيبها فاضية لو مش عايز تغيّرها.' : 'Password must be at least 10 characters — or leave it empty to keep the current one.')
      return
    }
    if (form.nameArabic.trim().length > 100) {
      setFormError(ar ? 'الاسم بالعربي طويل زيادة (آخره ١٠٠ حرف).' : 'Arabic name is too long (max 100 characters).')
      return
    }
    setSaving(true)
    try {
      const socialObj: Record<string, string> = {}
      for (const row of form.socialRows) {
        const k = row.k.trim()
        const v = row.v.trim()
        if (k && v) socialObj[k] = v
      }
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        agencyName: form.agencyName.trim(),
        licenseNumber: form.licenseNumber.trim(),
        commissionRate: form.commissionRate === '' ? null : Number(form.commissionRate),
        yearsExperience: form.yearsExperience === '' ? null : Number(form.yearsExperience),
        rating: Number(form.rating),
        specialization: form.specialization,
        bio: form.bio.trim(),
        nameArabic: form.nameArabic.trim() || null,
        avatar: form.avatar.trim() || null,
      }
      // Optional account fields — omitted when blank so existing values survive.
      if (form.password) payload.password = form.password
      if (Object.keys(socialObj).length > 0) payload.socialLinks = socialObj
      if (form.preferredLang) payload.preferredLang = form.preferredLang
      if (form.preferredCurrency) payload.preferredCurrency = form.preferredCurrency
      await ceoApi(`/api/ceo/brokers/${broker.id}`, 'PATCH', payload)
      onSaved({
        name: payload.name as string,
        phone: payload.phone as string,
        agencyName: payload.agencyName as string,
        licenseNumber: payload.licenseNumber as string,
        commissionRate: payload.commissionRate as number | null,
        yearsExperience: payload.yearsExperience as number | null,
        rating: payload.rating as number,
        specializations: (payload.specialization as string)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        bio: payload.bio as string,
        avatar: payload.avatar as string | null,
        nameArabic: payload.nameArabic as string | null,
      })
    } catch (err) {
      console.error('Failed to update broker:', err)
      onError(ar ? 'معرفناش نحدّث البروكر — حاول تاني.' : 'Failed to update broker')
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={ar ? 'تعديل البروكر' : 'Edit broker'}
      subtitle={broker.email}
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
            disabled={saving || !form.name.trim()}
            className="gold-shimmer bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold/90"
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {ar ? 'احفظ التغييرات' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={ar ? 'الاسم بالكامل' : 'Full name'}>
          <input
            className={fieldInputCls}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label={ar ? 'الاسم بالعربي' : 'Name (Arabic)'}>
          <input
            className={fieldInputCls}
            value={form.nameArabic}
            maxLength={100}
            onChange={(e) => setForm({ ...form, nameArabic: e.target.value })}
            placeholder="مثال: أحمد محمود"
          />
        </Field>
        <Field label={ar ? 'التليفون' : 'Phone'}>
          <input
            className={fieldInputCls}
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </Field>
        <Field label={ar ? 'اسم المكتب' : 'Agency name'}>
          <input
            className={fieldInputCls}
            value={form.agencyName}
            onChange={(e) => setForm({ ...form, agencyName: e.target.value })}
          />
        </Field>
        <Field label={ar ? 'رقم الرخصة' : 'License number'}>
          <input
            className={fieldInputCls}
            value={form.licenseNumber}
            onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })}
          />
        </Field>
        <Field label={ar ? 'نسبة العمولة %' : 'Commission rate %'} hint="0 – 100">
          <input
            type="number"
            min={0}
            max={100}
            step="0.5"
            className={fieldInputCls}
            value={form.commissionRate}
            onChange={(e) => setForm({ ...form, commissionRate: e.target.value })}
          />
        </Field>
        <Field label={ar ? 'سنين الخبرة' : 'Years of experience'}>
          <input
            type="number"
            min={0}
            className={fieldInputCls}
            value={form.yearsExperience}
            onChange={(e) => setForm({ ...form, yearsExperience: e.target.value })}
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
            onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })}
          />
        </Field>
        <Field label={ar ? 'التخصصات' : 'Specializations'} hint={ar ? 'افصل بفاصلة' : 'Comma separated'}>
          <input
            className={fieldInputCls}
            placeholder="New Cairo, Sahel, Marina"
            value={form.specialization}
            onChange={(e) => setForm({ ...form, specialization: e.target.value })}
          />
        </Field>
        <Field label={ar ? 'نبذة' : 'Bio'} className="sm:col-span-2">
          <textarea
            className={fieldAreaCls}
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
          />
        </Field>

        {/* Avatar URL + preview */}
        <Field label={ar ? 'الصورة (رابط)' : 'Avatar (URL)'} className="sm:col-span-2">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-estate-gold/10 text-estate-gold ring-1 ring-estate-gold/20">
              {form.avatar.trim() ? (
                <Image
                  src={form.avatar.trim()}
                  alt={form.name}
                  width={48}
                  height={48}
                  className="h-12 w-12 object-cover"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              ) : (
                <span className="text-sm font-bold">{getInitials(form.name || '?')}</span>
              )}
            </div>
            <input
              dir="ltr"
              className={fieldInputCls}
              value={form.avatar}
              onChange={(e) => setForm({ ...form, avatar: e.target.value })}
              placeholder="https://…"
            />
          </div>
        </Field>

        {/* Password reset with show/hide + strength note */}
        <Field
          label={ar ? 'باسورد جديدة' : 'New password'}
          hint={ar ? 'سيبها فاضية لو مش عايز تغيّرها — بتتشفّر على السيرفر ومش بترجع تاني' : "Leave empty to keep the current one — hashed server-side, never echoed back"}
          className="sm:col-span-2"
        >
          <div className="relative">
            <input
              dir="ltr"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              className={cn(fieldInputCls, 'pr-10 text-left')}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? (ar ? 'اخفي الباسورد' : 'Hide password') : (ar ? 'اظهر الباسورد' : 'Show password')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {passwordStrength && (
            <p className={cn('mt-1 text-[11px]', form.password.length < 10 ? 'text-red-400' : 'text-green-400')}>
              {passwordStrength}
            </p>
          )}
        </Field>

        {/* Language + currency */}
        <Field label={ar ? 'اللغة المفضلة' : 'Preferred language'}>
          <select
            className={fieldInputCls}
            value={form.preferredLang}
            onChange={(e) => setForm({ ...form, preferredLang: e.target.value })}
          >
            <option value="">{ar ? 'من غير تغيير' : 'No change'}</option>
            <option value="ar">{ar ? 'عربي' : 'Arabic (ar)'}</option>
            <option value="en">{ar ? 'إنجليزي' : 'English (en)'}</option>
          </select>
        </Field>
        <Field label={ar ? 'العملة المفضلة' : 'Preferred currency'}>
          <select
            className={fieldInputCls}
            value={form.preferredCurrency}
            onChange={(e) => setForm({ ...form, preferredCurrency: e.target.value })}
          >
            <option value="">{ar ? 'من غير تغيير' : 'No change'}</option>
            {['EGP', 'USD', 'EUR', 'SAR', 'AED', 'QAR', 'KWD', 'GBP'].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        {/* Social links key-values */}
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-medium text-gray-400">
            {ar ? 'لينكات السوشيال' : 'Social links'}
          </label>
          <div className="space-y-2">
            {form.socialRows.map((row, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className={fieldInputCls}
                  value={row.k}
                  list={`social-keys-${broker.id}`}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      socialRows: form.socialRows.map((r, j) => (j === i ? { ...r, k: e.target.value } : r)),
                    })
                  }
                  placeholder={ar ? 'المنصة (فيسبوك…)' : 'Platform (facebook...)'}
                />
                <input
                  dir="ltr"
                  className={cn(fieldInputCls, 'text-left')}
                  value={row.v}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      socialRows: form.socialRows.map((r, j) => (j === i ? { ...r, v: e.target.value } : r)),
                    })
                  }
                  placeholder="https://…"
                />
                <button
                  type="button"
                  onClick={() =>
                    setForm({ ...form, socialRows: form.socialRows.filter((_, j) => j !== i) })
                  }
                  aria-label={ar ? 'اشيل اللينك' : 'Remove link'}
                  className="shrink-0 rounded-xl border border-red-500/30 bg-red-500/10 px-2.5 text-red-400 hover:bg-red-500/20"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <datalist id={`social-keys-${broker.id}`}>
              {['facebook', 'instagram', 'tiktok', 'linkedin', 'x', 'whatsapp', 'youtube', 'website'].map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
            <button
              type="button"
              onClick={() => setForm({ ...form, socialRows: [...form.socialRows, { k: '', v: '' }] })}
              className="rounded-full border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-foreground"
            >
              {ar ? '+ ضيف لينك' : '+ Add link'}
            </button>
          </div>
        </div>
        {formError && (
          <div className="flex items-start gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300 sm:col-span-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{formError}</span>
          </div>
        )}
      </div>
    </Modal>
  )
}

/* ─── Project access modal ──────────────────────────────── */

function AccessModal({
  broker,
  onClose,
  onChanged,
  notify,
}: {
  broker: Broker
  onClose: () => void
  onChanged: (rows: AccessRow[]) => void
  notify: (msg: string, tone?: 'ok' | 'err') => void
}) {
  const { lang: accessLang } = useLanguage()
  const ar = accessLang === 'ar'
  const [projects, setProjects] = useState<ProjectLite[] | null>(null)
  const [developers, setDevelopers] = useState<DeveloperLite[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [devFilter, setDevFilter] = useState('')
  const [selDev, setSelDev] = useState<string[]>([])
  const [selProj, setSelProj] = useState<string[]>([])
  const [selRule, setSelRule] = useState<string[]>([])
  const [bulkKey, setBulkKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [projData, devData] = await Promise.all([
        ceoApi<{ items: ProjectLite[] }>('/api/ceo/projects-all?limit=100'),
        ceoApi<{ developers: DeveloperLite[] }>('/api/ceo/developers'),
      ])
      // projects-all selects the `developer` relation but not the scalar key
      const projectRows = (projData.items || []).map((p) => ({
        ...p,
        developerId: p.developerId || p.developer.id,
      }))
      setProjects(projectRows)
      setDevelopers(devData.developers || [])
    } catch (err) {
      console.error('Failed to load projects:', err)
      setError(ar ? 'معرفناش نجيب المشاريع — حاول تاني.' : 'Failed to load projects')
    }
  }, [ar])

  useEffect(() => {
    load()
  }, [load])

  const rows = broker.projectAccess

  const projectName = (id: string) =>
    projects?.find((p) => p.id === id)?.name || (ar ? 'مشروع مش معروف' : 'Unknown project')

  const developerName = (id: string | null) =>
    (id && developers?.find((d) => d.id === id)?.companyName) || (ar ? 'مطوّر مش معروف' : 'Unknown developer')

  /** Developer-wide BLOCKED rule that shadows every project under it. */
  const devWideBlock = (developerId: string) =>
    rows.some((r) => r.developerId === developerId && !r.projectId && r.access === 'BLOCKED')

  const setAccess = (project: ProjectLite, access: 'APPROVED' | 'BLOCKED') =>
    (async () => {
      setBusyKey(project.id)
      try {
        await ceoApi('/api/ceo/partnerships', 'POST', {
          type: 'ACCESS_UPSERT',
          brokerId: broker.id,
          developerId: project.developerId,
          projectId: project.id,
          access,
        })
        const existing = rows.find((r) => r.projectId === project.id)
        const next: AccessRow[] = existing
          ? rows.map((r) => (r.id === existing.id ? { ...r, access } : r))
          : [
              ...rows,
              {
                id: `local-${project.id}`,
                developerId: project.developerId,
                projectId: project.id,
                access,
                expiresAt: null,
                notes: null,
              },
            ]
        onChanged(next)
        notify(
          access === 'APPROVED'
            ? (ar ? `${broker.name} يقدر يشتغل على ${project.name} دلوقتي` : `${broker.name} can now work on ${project.name}`)
            : (ar ? `${broker.name} اتحظر من ${project.name}` : `${broker.name} blocked from ${project.name}`)
        )
      } catch (err) {
        console.error('Failed to update access:', err)
        notify(ar ? 'معرفناش نحدّث الصلاحية — حاول تاني.' : 'Failed to update access', 'err')
      } finally {
        setBusyKey(null)
      }
    })()

  const setDevAccess = (dev: DeveloperLite, access: 'APPROVED' | 'BLOCKED') =>
    (async () => {
      setBusyKey(`dev-${dev.id}`)
      try {
        await ceoApi('/api/ceo/partnerships', 'POST', {
          type: 'ACCESS_UPSERT',
          brokerId: broker.id,
          developerId: dev.id,
          access,
        })
        const existing = rows.find((r) => r.developerId === dev.id && !r.projectId)
        const next: AccessRow[] = existing
          ? rows.map((r) => (r.id === existing.id ? { ...r, access } : r))
          : [
              ...rows,
              {
                id: `local-dev-${dev.id}`,
                developerId: dev.id,
                projectId: null,
                access,
                expiresAt: null,
                notes: null,
              },
            ]
        onChanged(next)
        notify(
          access === 'APPROVED'
            ? (ar ? `${broker.name} يقدر يشتغل على كل مشاريع ${dev.companyName} دلوقتي` : `${broker.name} can now work on every project of ${dev.companyName}`)
            : (ar ? `${broker.name} اتحظر من كل مشاريع ${dev.companyName}` : `${broker.name} blocked from every project of ${dev.companyName}`)
        )
      } catch (err) {
        console.error('Failed to update access:', err)
        notify(ar ? 'معرفناش نحدّث الصلاحية — حاول تاني.' : 'Failed to update access', 'err')
      } finally {
        setBusyKey(null)
      }
    })()

  const revoke = (row: AccessRow) =>
    (async () => {
      const key = row.id
      setBusyKey(key)
      try {
        if (!row.id.startsWith('local-')) {
          await ceoApi('/api/ceo/partnerships', 'POST', {
            type: 'ACCESS_DELETE',
            accessId: row.id,
          })
        }
        const next = rows.filter((r) => r.id !== row.id)
        onChanged(next)
        notify(ar ? 'القاعدة اتشالت' : 'Access rule removed')
      } catch (err) {
        console.error('Failed to remove rule:', err)
        notify(ar ? 'معرفناش نشيل القاعدة — حاول تاني.' : 'Failed to remove rule', 'err')
      } finally {
        setBusyKey(null)
      }
    })()

  const bulkRevokeRules = () =>
    (async () => {
      const selected = rows.filter((r) => selRule.includes(r.id))
      if (selected.length === 0) return
      setBulkKey('rules')
      try {
        const ids = selected.map((r) => r.id).filter((id) => !id.startsWith('local-'))
        if (ids.length > 0) {
          await ceoApi('/api/ceo/partnerships', 'POST', {
            type: 'ACCESS_DELETE_BULK',
            brokerId: broker.id,
            accessIds: ids,
          })
        }
        onChanged(rows.filter((r) => !selRule.includes(r.id)))
        notify(ar ? `اتشال ${selected.length} قاعدة` : `${selected.length} access rule(s) removed`)
        setSelRule([])
      } catch (err) {
        console.error('Failed to remove rules:', err)
        notify(ar ? 'معرفناش نشيل القواعد — حاول تاني.' : 'Failed to remove rules', 'err')
      } finally {
        setBulkKey(null)
      }
    })()

  /* ── Bulk select-all ───────────────────────────────────── */

  const toggleSel = (id: string, list: string[], set: (next: string[]) => void) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  /**
   * "Select all" works on whatever is currently visible (i.e. after filtering),
   * so a filtered select-all never silently drops an earlier selection.
   */
  const selectionState = (visible: string[], selected: string[]) => {
    const hit = visible.filter((id) => selected.includes(id)).length
    return {
      checked: visible.length > 0 && hit === visible.length,
      indeterminate: hit > 0 && hit < visible.length,
    }
  }

  const toggleVisible = (
    visible: string[],
    selected: string[],
    set: (next: string[]) => void
  ) => {
    const hit = visible.filter((id) => selected.includes(id)).length
    if (visible.length > 0 && hit === visible.length) {
      set(selected.filter((id) => !visible.includes(id)))
    } else {
      set([...new Set([...selected, ...visible])])
    }
  }

  /** Mirror the bulk call onto local rows so the UI updates without a refetch. */
  const applyBulkLocal = (
    targets: { developerId: string; projectId: string | null }[],
    access: 'APPROVED' | 'BLOCKED'
  ): AccessRow[] => {
    const next = [...rows]
    for (const t of targets) {
      const idx = t.projectId
        ? next.findIndex((r) => r.projectId === t.projectId)
        : next.findIndex((r) => !r.projectId && r.developerId === t.developerId)
      if (idx >= 0) next[idx] = { ...next[idx], access }
      else
        next.push({
          id: t.projectId ? `local-${t.projectId}` : `local-dev-${t.developerId}`,
          developerId: t.developerId,
          projectId: t.projectId,
          access,
          expiresAt: null,
          notes: null,
        })
    }
    return next
  }

  const bulkApply = (kind: 'dev' | 'proj', access: 'APPROVED' | 'BLOCKED') =>
    (async () => {
      const selected = kind === 'dev' ? selDev : selProj
      if (selected.length === 0) return
      setBulkKey(`${kind}-${access}`)
      try {
        const targets =
          kind === 'dev'
            ? selected.map((developerId) => ({ developerId, projectId: null as string | null }))
            : selected
                .map((projectId) => ({
                  developerId: projects?.find((x) => x.id === projectId)?.developerId ?? '',
                  projectId,
                }))
                .filter((t) => t.developerId)

        const res = await ceoApi<{ changed: number; total: number }>(
          '/api/ceo/partnerships',
          'POST',
          {
            type: 'ACCESS_BULK',
            brokerId: broker.id,
            access,
            projectIds: kind === 'proj' ? selected : [],
            developerIds: kind === 'dev' ? selected : [],
          }
        )

        onChanged(applyBulkLocal(targets, access))
        notify(
          res.changed === 0
            ? (ar ? `كل الـ${res.total} معمولين ${statusLabel(access, true)} أوريدي` : `All ${res.total} already set to ${access}`)
            : (ar ? `${res.changed} من ${res.total} اتعملوا ${statusLabel(access, true)}` : `${res.changed} of ${res.total} rule(s) set to ${access}`)
        )
        if (kind === 'dev') setSelDev([])
        else setSelProj([])
      } catch (err) {
        console.error('Bulk access update failed:', err)
        notify(ar ? 'التحديث الجماعي فشل — حاول تاني.' : 'Bulk update failed', 'err')
      } finally {
        setBulkKey(null)
      }
    })()

  const visibleProjects = (projects || []).filter((p) =>
    filter.trim() ? p.name.toLowerCase().includes(filter.trim().toLowerCase()) : true
  )

  const visibleDevelopers = (developers || []).filter((d) =>
    devFilter.trim() ? d.companyName.toLowerCase().includes(devFilter.trim().toLowerCase()) : true
  )

  return (
    <Modal
      open
      onClose={onClose}
      title={ar ? 'صلاحية المشاريع والمطوّرين' : 'Project & developer access'}
      subtitle={ar ? `${broker.name} — اسمح أو احظر المطوّرين والمشاريع اللي البروكر يقدر يشتغل عليها` : `${broker.name} — grant or revoke which developers and projects this broker may work on`}
      className="max-w-3xl"
      footer={
        <Button
          variant="outline"
          onClick={onClose}
          className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]"
        >
          {ar ? 'تمام' : 'Done'}
        </Button>
      }
    >
      <div className="space-y-5">
        {/* Active rules */}
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <label className="flex cursor-pointer select-none items-center gap-2 text-[10px] uppercase tracking-wider text-gray-600">
              <SelectBox
                {...selectionState(
                  rows.map((r) => r.id),
                  selRule
                )}
                label={ar ? 'اختار كل القواعد النشطة' : 'Select all active rules'}
                onToggle={() =>
                  toggleVisible(
                    rows.map((r) => r.id),
                    selRule,
                    setSelRule
                  )
                }
              />
              {ar ? `القواعد النشطة (${rows.length})` : `Active rules (${rows.length})`}
            </label>
          </div>

          <BulkBar
            count={selRule.length}
            busy={bulkKey === 'rules'}
            actions={[
              { label: ar ? 'اشيل المختار' : 'Revoke selected', tone: 'red', onClick: () => bulkRevokeRules() },
            ]}
            onClear={() => setSelRule([])}
          />

          {rows.length === 0 ? (
            <div className="rounded-2xl border border-border dark:border-[#262626] bg-white/[0.02] p-4 text-center">
              <FolderOpen className="mx-auto mb-2 h-5 w-5 text-gray-600" />
              <p className="text-xs text-gray-500">
                {ar ? 'مفيش قواعد مخصوصة — البروكر ماشي على إعدادات الشراكة مع المطوّر.' : 'No explicit rules — this broker follows the developer partnership settings.'}
              </p>
            </div>
          ) : (
            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {rows.map((row) => {
                const picked = selRule.includes(row.id)
                return (
                  <div
                    key={row.id}
                    className={cn(
                      'flex items-center justify-between gap-3 rounded-2xl border p-3 transition-colors',
                      picked
                        ? 'border-estate-gold/40 bg-estate-gold/10'
                        : 'border-border dark:border-[#262626] bg-white/[0.03]'
                    )}
                  >
                    <div className="flex min-w-0 items-start gap-2.5">
                      <SelectBox
                        checked={picked}
                        label={ar ? `اختار القاعدة ${row.projectId ? projectName(row.projectId) : developerName(row.developerId)}` : `Select rule ${row.projectId ? projectName(row.projectId) : developerName(row.developerId)}`}
                        onToggle={() => toggleSel(row.id, selRule, setSelRule)}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm text-foreground">
                          {row.projectId ? projectName(row.projectId) : developerName(row.developerId)}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          {row.projectId ? (ar ? 'مشروع واحد' : 'Single project') : (ar ? 'كل مشاريع المطوّر ده' : 'All projects of this developer')}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusPill tone={row.access === 'BLOCKED' ? 'red' : 'green'}>
                        {statusLabel(row.access, ar)}
                      </StatusPill>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyKey === row.id || bulkKey === 'rules'}
                        onClick={() => revoke(row)}
                        className="h-7 px-2 text-gray-400 hover:text-red-400"
                      >
                        {busyKey === row.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          ar ? 'اشيلها' : 'Revoke'
                        )}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Developer-wide picker — bulk allow / block */}
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <label className="flex cursor-pointer select-none items-center gap-2 text-[10px] uppercase tracking-wider text-gray-600">
              <SelectBox
                {...selectionState(
                  visibleDevelopers.map((d) => d.id),
                  selDev
                )}
                label={ar ? 'اختار كل المطوّرين' : 'Select all developers'}
                onToggle={() =>
                  toggleVisible(
                    visibleDevelopers.map((d) => d.id),
                    selDev,
                    setSelDev
                  )
                }
              />
              {ar ? `المطوّرين — كل مشاريعهم (${visibleDevelopers.length})` : `Developers — all their projects (${visibleDevelopers.length})`}
            </label>
            <input
              className="h-8 w-40 rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-2 text-xs text-foreground outline-none focus:border-estate-gold/50"
              placeholder={ar ? 'فلتر المطوّرين…' : 'Filter developers...'}
              value={devFilter}
              onChange={(e) => setDevFilter(e.target.value)}
            />
          </div>

          <BulkBar
            count={selDev.length}
            busy={!!bulkKey}
            actions={[
              {
                label: ar ? 'اسمح للمختار' : 'Allow all selected',
                tone: 'green',
                onClick: () => bulkApply('dev', 'APPROVED'),
              },
              {
                label: ar ? 'احظر المختار' : 'Block all selected',
                tone: 'red',
                onClick: () => bulkApply('dev', 'BLOCKED'),
              },
            ]}
            onClear={() => setSelDev([])}
          />

          {developers === null ? (
            <ModalSkeleton rows={3} />
          ) : visibleDevelopers.length === 0 ? (
            <div className="rounded-2xl border border-border dark:border-[#262626] bg-white/[0.02] p-4 text-center text-xs text-gray-500">
              {ar ? 'مفيش مطوّرين مطابقين.' : 'No developers match.'}
            </div>
          ) : (
            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {visibleDevelopers.map((dev) => {
                const current = rows.find((r) => r.developerId === dev.id && !r.projectId)
                const busy = busyKey === `dev-${dev.id}`
                const picked = selDev.includes(dev.id)
                return (
                  <div
                    key={dev.id}
                    className={cn(
                      'flex items-center justify-between gap-3 rounded-2xl border p-3 transition-colors',
                      picked
                        ? 'border-estate-gold/40 bg-estate-gold/10'
                        : 'border-border dark:border-[#262626] bg-white/[0.03]'
                    )}
                  >
                    <div className="flex min-w-0 items-start gap-2.5">
                      <SelectBox
                        checked={picked}
                        label={ar ? `اختار ${dev.companyName}` : `Select ${dev.companyName}`}
                        onToggle={() => toggleSel(dev.id, selDev, setSelDev)}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm text-foreground">{dev.companyName}</p>
                        <p className="truncate text-[11px] text-gray-500">
                          {(projects || []).filter((p) => p.developerId === dev.id).length}{' '}
                          {ar ? 'مشروع متسجل' : 'project(s) listed'}
                          {current && ` · ${ar ? 'القاعدة' : 'rule'}: ${statusLabel(current.access, ar)}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        onClick={() => setDevAccess(dev, 'APPROVED')}
                        disabled={busy}
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all disabled:opacity-50',
                          current?.access === 'APPROVED'
                            ? 'border-green-500/40 bg-green-500/15 text-green-400'
                            : 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-400 hover:text-green-400'
                        )}
                      >
                        {ar ? 'اسمح بالكل' : 'Allow all'}
                      </button>
                      <button
                        onClick={() => setDevAccess(dev, 'BLOCKED')}
                        disabled={busy}
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all disabled:opacity-50',
                          current?.access === 'BLOCKED'
                            ? 'border-red-500/40 bg-red-500/15 text-red-400'
                            : 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-400 hover:text-red-400'
                        )}
                      >
                        {ar ? 'احظر الكل' : 'Block all'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Project picker */}
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <label className="flex cursor-pointer select-none items-center gap-2 text-[10px] uppercase tracking-wider text-gray-600">
              <SelectBox
                {...selectionState(
                  visibleProjects.map((p) => p.id),
                  selProj
                )}
                label={ar ? 'اختار كل المشاريع' : 'Select all projects'}
                onToggle={() =>
                  toggleVisible(
                    visibleProjects.map((p) => p.id),
                    selProj,
                    setSelProj
                  )
                }
              />
              {ar ? `المشاريع (${visibleProjects.length})` : `Projects (${visibleProjects.length})`}
            </label>
            <input
              className="h-8 w-40 rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-2 text-xs text-foreground outline-none focus:border-estate-gold/50"
              placeholder={ar ? 'فلتر المشاريع…' : 'Filter projects...'}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>

          <BulkBar
            count={selProj.length}
            busy={!!bulkKey}
            actions={[
              {
                label: ar ? 'اسمح للمختار' : 'Allow all selected',
                tone: 'green',
                onClick: () => bulkApply('proj', 'APPROVED'),
              },
              {
                label: ar ? 'احظر المختار' : 'Block all selected',
                tone: 'red',
                onClick: () => bulkApply('proj', 'BLOCKED'),
              },
            ]}
            onClear={() => setSelProj([])}
          />

          {error ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-center text-xs text-red-300">
              {error}
            </div>
          ) : projects === null ? (
            <ModalSkeleton rows={4} />
          ) : visibleProjects.length === 0 ? (
            <div className="rounded-2xl border border-border dark:border-[#262626] bg-white/[0.02] p-4 text-center text-xs text-gray-500">
              {ar ? 'مفيش مشاريع مطابقة.' : 'No projects match.'}
            </div>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {visibleProjects.map((project) => {
                const current = rows.find((r) => r.projectId === project.id)
                const shadowedByDev = devWideBlock(project.developerId)
                const picked = selProj.includes(project.id)
                return (
                  <div
                    key={project.id}
                    className={cn(
                      'flex items-center justify-between gap-3 rounded-2xl border p-3 transition-colors',
                      picked
                        ? 'border-estate-gold/40 bg-estate-gold/10'
                        : 'border-border dark:border-[#262626] bg-white/[0.03]'
                    )}
                  >
                    <div className="flex min-w-0 items-start gap-2.5">
                      <SelectBox
                        checked={picked}
                        label={ar ? `اختار ${project.name}` : `Select ${project.name}`}
                        onToggle={() => toggleSel(project.id, selProj, setSelProj)}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm text-foreground">{project.name}</p>
                        <p className="truncate text-[11px] text-gray-500">
                          {project.developer.companyName}
                          {!project.isActive && (ar ? ' · مستخبي' : ' · hidden')}
                          {shadowedByDev && (ar ? ' · حظر شامل من المطوّر (السماح بيغلبه)' : ' · dev-wide block (Allow overrides it)')}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        onClick={() => setAccess(project, 'APPROVED')}
                        disabled={busyKey === project.id}
                        title={
                          shadowedByDev
                            ? (ar ? 'بيغلب الحظر الشامل للمشروع ده بس' : 'Overrides the developer-wide block for this project only')
                            : (ar ? 'اسمح بالمشروع ده' : 'Grant access to this project')
                        }
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40',
                          current?.access === 'APPROVED'
                            ? 'border-green-500/40 bg-green-500/15 text-green-400'
                            : 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-400 hover:text-green-400'
                        )}
                      >
                        {ar ? 'اسمح' : 'Allow'}
                      </button>
                      <button
                        onClick={() => setAccess(project, 'BLOCKED')}
                        disabled={busyKey === project.id}
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all disabled:opacity-50',
                          current?.access === 'BLOCKED'
                            ? 'border-red-500/40 bg-red-500/15 text-red-400'
                            : 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-400 hover:text-red-400'
                        )}
                      >
                        {ar ? 'احظر' : 'Block'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-gray-600">
          <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {ar
            ? 'الأولوية: قاعدة المشروع بتغلب قاعدة المطوّر، وأي واحدة فيهم بتغلب قايمة الشراكة. اشيل القاعدة عشان البروكر يرجع لوضع الشراكة الافتراضي — وده اللي بيحصل لما مفيش قاعدة خالص.'
            : 'Precedence: a project rule beats a developer-wide rule, and either of them beats the developer partnership allowlist. Revoke a rule to send the broker back to the partnership default — which is what happens when there is no rule at all.'}
        </p>
      </div>
    </Modal>
  )
}

/* ─── Select-all primitives ─────────────────────────────── */

function SelectBox({
  checked,
  indeterminate = false,
  onToggle,
  label,
}: {
  checked: boolean
  indeterminate?: boolean
  onToggle: () => void
  label?: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
        checked || indeterminate
          ? 'border-estate-gold bg-estate-gold'
          : 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] hover:border-border dark:hover:border-[#262626]'
      )}
    >
      {indeterminate ? (
        <span className="h-0.5 w-2 rounded-full bg-[#0F1A2C]" />
      ) : checked ? (
        <CheckCircle2 className="h-3 w-3 text-[#0F1A2C]" />
      ) : null}
    </button>
  )
}

function BulkBar({
  count,
  busy,
  actions,
  onClear,
}: {
  count: number
  busy: boolean
  actions: { label: string; onClick: () => void; tone?: 'green' | 'red' }[]
  onClear: () => void
}) {
  const { lang: bulkLang } = useLanguage()
  const bulkAr = bulkLang === 'ar'
  if (count === 0) return null
  const tones = {
    green: 'border-green-500/40 bg-green-500/15 text-green-400 hover:bg-green-500/25',
    red: 'border-red-500/40 bg-red-500/15 text-red-400 hover:bg-red-500/25',
  } as const
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-2xl border border-estate-gold/30 bg-estate-gold/[0.07] px-3 py-2">
      <span className="text-xs font-medium text-estate-gold">{bulkAr ? `${count} مختارين` : `${count} selected`}</span>
      <span className="flex-1" />
      {actions.map((a, i) => (
        <button
          key={a.label}
          type="button"
          onClick={a.onClick}
          disabled={busy}
          className={cn(
            'flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50',
            tones[a.tone || 'green']
          )}
        >
          {busy && i === 0 && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
          {a.label}
        </button>
      ))}
      <button
        type="button"
        onClick={onClear}
        disabled={busy}
        className="rounded-full px-2 py-1 text-[11px] font-medium text-gray-400 transition-colors hover:text-foreground disabled:opacity-50"
      >
        {bulkAr ? 'اشيل التحديد' : 'Clear'}
      </button>
    </div>
  )
}

/* ─── Assign lead modal ─────────────────────────────────── */

function AssignLeadModal({
  broker,
  onClose,
  onAssigned,
  onError,
}: {
  broker: Broker
  onClose: () => void
  onAssigned: (count: number, mode: 'assign' | 'release') => void
  onError: (msg: string) => void
}) {
  const { lang: assignLang } = useLanguage()
  const ar = assignLang === 'ar'
  const [leads, setLeads] = useState<LeadLite[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState<'assign' | 'release'>('assign')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await ceoApi<{ leads: LeadLite[] }>('/api/ceo/leads')
        if (cancelled) return
        setLeads(data.leads || [])
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load leads:', err)
          setError(ar ? 'معرفناش نجيب الليدز — حاول تاني.' : 'Failed to load leads')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const isOwned = useCallback((l: LeadLite) => l.broker?.id === broker.id, [broker.id])

  /** Assign = leads the broker does not own yet · Release = leads currently on this broker */
  const visible = useMemo(() => {
    if (!leads) return []
    const scoped = mode === 'assign' ? leads.filter((l) => !isOwned(l)) : leads.filter(isOwned)
    const q = filter.trim().toLowerCase()
    if (!q) return scoped
    return scoped.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.phone.toLowerCase().includes(q) ||
        (l.leadCode || '').toLowerCase().includes(q) ||
        (l.email || '').toLowerCase().includes(q)
    )
  }, [leads, filter, mode, isOwned])

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const switchMode = (next: 'assign' | 'release') => {
    setMode(next)
    setSelected([])
  }

  const submit = async () => {
    if (selected.length === 0) return
    setSaving(true)
    try {
      if (mode === 'assign') {
        const res = await ceoApi<{ assigned: number }>(
          `/api/ceo/brokers/${broker.id}/assign-lead`,
          'POST',
          { leadIds: selected }
        )
        onAssigned(res.assigned ?? selected.length, 'assign')
      } else {
        let done = 0
        for (const id of selected) {
          await ceoApi('/api/ceo/leads', 'PATCH', {
            id,
            brokerId: null,
            reason: `Released by CEO from ${broker.name}`,
          })
          done += 1
        }
        onAssigned(done, 'release')
      }
    } catch (err) {
      console.error('Failed to submit lead assignment:', err)
      onError(
        ar
          ? (mode === 'assign' ? 'معرفناش نوزّع الليدز — حاول تاني.' : 'معرفناش نسحب الليدز — حاول تاني.')
          : (err instanceof Error
            ? err.message
            : mode === 'assign'
              ? 'Failed to assign leads'
              : 'Failed to release leads')
      )
    } finally {
      setSaving(false)
    }
  }

  const ownedCount = (leads || []).filter(isOwned).length
  const availableCount = (leads || []).length - ownedCount

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === 'assign' ? (ar ? 'وزّع ليدز' : 'Assign leads') : (ar ? 'اسحب ليدز' : 'Release leads')}
      subtitle={
        mode === 'assign'
          ? (ar ? `اختار الليدز اللي هتديها لـ${broker.name}` : `Select leads to hand over to ${broker.name}`)
          : (ar ? `اختار الليدز اللي هتاخدها من ${broker.name}` : `Select leads to take away from ${broker.name}`)
      }
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
            disabled={saving || selected.length === 0}
            className={cn(
              'hover:opacity-90',
              mode === 'assign'
                ? 'gold-shimmer bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold/90'
                : 'bg-red-500 text-white hover:bg-red-600'
            )}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'assign' ? (ar ? 'وزّع' : 'Assign') : (ar ? 'اسحب' : 'Release')} {selected.length > 0 ? `${selected.length} ` : ''}
            {ar ? 'ليد' : <>Lead{selected.length === 1 ? '' : 's'}</>}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Assign ⇄ Release */}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border dark:border-[#262626] bg-white/[0.03] p-1.5">
          {(
            [
              { key: 'assign', label: 'Assign to broker', labelAr: 'وزّع على البروكر', count: availableCount },
              { key: 'release', label: 'Release from broker', labelAr: 'اسحب من البروكر', count: ownedCount },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => switchMode(opt.key)}
              className={cn(
                'flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                mode === opt.key
                  ? 'bg-estate-gold/15 text-estate-gold'
                  : 'text-gray-500 hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-gray-300'
              )}
            >
              {ar ? opt.labelAr : opt.label}{' '}
              <span className={mode === opt.key ? 'text-estate-gold/70' : 'text-gray-600'}>
                ({opt.count})
              </span>
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            className={cn(fieldInputCls, 'pl-9')}
            placeholder={ar ? 'دوّر بالاسم أو التليفون أو الإيميل أو كود الليد…' : 'Search by name, phone, email or lead code...'}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-center text-xs text-red-300">
            {error}
          </div>
        ) : leads === null ? (
          <ModalSkeleton rows={5} />
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-border dark:border-[#262626] bg-white/[0.02] p-6 text-center text-xs text-gray-500">
            {mode === 'assign'
              ? availableCount === 0
                ? (ar ? 'البروكر ده واخد كل الليدز اللي في السيستم أوريدي.' : 'This broker already owns every lead in the system.')
                : (ar ? 'مفيش ليدز مطابقة للبحث.' : 'No unassigned leads match your search.')
              : ownedCount === 0
                ? (ar ? 'البروكر ده مش ماسك أي ليدز دلوقتي.' : 'This broker does not hold any leads right now.')
                : (ar ? 'مفيش ليدز من اللي مع البروكر مطابقة للبحث.' : 'No leads held by this broker match your search.')}
          </div>
        ) : (
          <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
            {visible.map((lead) => {
              const checked = selected.includes(lead.id)
              return (
                <button
                  key={lead.id}
                  type="button"
                  onClick={() => toggle(lead.id)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left transition-all',
                    checked
                      ? 'border-estate-gold/40 bg-estate-gold/10'
                      : 'border-border dark:border-[#262626] bg-white/[0.03] hover:border-border dark:hover:border-[#262626] hover:bg-white/[0.06]'
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">
                      {lead.name}
                      {lead.leadCode && (
                        <span className="ml-2 text-[11px] text-gray-600">{lead.leadCode}</span>
                      )}
                    </p>
                    <p className="truncate text-[11px] text-gray-500">
                      {lead.phone}
                      {lead.broker
                        ? (ar ? ` · المالك: ${lead.broker.user?.name || 'بروكر'}` : ` · owner: ${lead.broker.user?.name || 'broker'}`)
                        : (ar ? ' · من غير مالك' : ' · unassigned')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusPill tone="gray">{statusLabel(lead.status, ar)}</StatusPill>
                    <span
                      className={cn(
                        'flex h-4 w-4 items-center justify-center rounded border transition-colors',
                        checked
                          ? 'border-estate-gold bg-estate-gold'
                          : 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A]'
                      )}
                    >
                      {checked && <CheckCircle2 className="h-3 w-3 text-[#0F1A2C]" />}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-gray-600">
          {mode === 'assign'
            ? (ar ? 'التوزيع بيتسجل في تاريخ ملكية الليد، فالمالك القديم بيحتفظ بفترة الحماية بتاعته والتغيير بيظهر في سجل التدقيق.' : 'Assigning records a transfer in the lead ownership history, so the previous owner keeps their protection window and the change appears in the audit log.')
            : (ar ? 'السحب بيرجّع الليد للمخزون العام عشان يتوزّع من تاني. الحركة بتتكتب في تاريخ الملكية وسجل التدقيق.' : 'Releasing frees the lead back into the pool so it can be reassigned. The move is written to the ownership history and the audit log.')}
        </p>
      </div>
    </Modal>
  )
}
