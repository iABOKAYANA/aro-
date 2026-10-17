'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import {
  FolderTree, Loader2, Search, AlertTriangle, ChevronDown, ChevronRight,
  ExternalLink, Sparkles, Building2, MapPin, Tag, Layers,
  Banknote, CalendarClock, Image as ImageIcon, BarChart3, Package,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatEGP, cn } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import { statusLabel } from '@/components/ceo/ceo-charts'
import { Reveal } from '@/components/design'

// ─── types (mirror /api/ceo/projects-all) ──────────────────
interface Counts {
  units: number; amenities: number; phases: number; paymentPlans: number
  masterPlanImages: number; brochures: number; leads: number; deals: number
  viewings: number; nearbyPlaces: number; brokerAccess: number
}

interface Row {
  id: string
  name: string
  nameArabic?: string | null
  slug: string
  tagline?: string | null
  coverImage?: string | null
  status: string
  approvalStatus: string
  isActive: boolean
  isFeatured: boolean
  isVerified: boolean
  featuredRank?: number | null
  startPrice?: number | null
  endPrice?: number | null
  completionPercent?: number | null
  totalUnits?: number | null
  totalArea?: number | null
  deliveryDate?: string | null
  viewCount: number
  favoriteCount: number
  inquiryCount: number
  createdAt: string
  updatedAt: string
  publishedAt?: string | null
  isNewLaunch: boolean
  developer?: { id: string; companyName: string; logo?: string | null; isVerified?: boolean } | null
  governorate?: { name: string; nameArabic?: string | null } | null
  city?: { name: string; nameArabic?: string | null } | null
  district?: { name: string; nameArabic?: string | null } | null
  _count: Counts
}

interface Detail {
  project: Record<string, any>
  unitStats: { count: number; minPrice: number | null; maxPrice: number | null; totalArea: number | null }
}

interface Stats {
  total: number; active: number; inactive: number; published: number; drafts: number
}

const APPROVAL_BADGE: Record<string, string> = {
  DRAFT: 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-400',
  PENDING: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400',
  APPROVED: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  REJECTED: 'border-red-500/30 bg-red-500/10 text-red-400',
  PUBLISHED: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  HIDDEN: 'border-orange-500/30 bg-orange-500/10 text-orange-400',
  ARCHIVED: 'border-gray-500/30 bg-gray-500/10 text-gray-500',
}

const BUILD_BADGE: Record<string, string> = {
  COMING_SOON: 'border-purple-500/30 bg-purple-500/10 text-purple-400',
  UNDER_CONSTRUCTION: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  DELIVERED: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  SOLD_OUT: 'border-gray-500/30 bg-gray-500/10 text-gray-500',
}

const fmtDate = (v?: string | null, ar = false) =>
  v ? new Date(v).toLocaleDateString(ar ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const money = (v?: number | null) => (typeof v === 'number' ? formatEGP(v) : '—')

function jsonArr(val: string | null | undefined): string[] {
  if (!val) return []
  try { const p = JSON.parse(val); return Array.isArray(p) ? p : [] } catch { return [] }
}

function Badge({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <span className={cn('inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', cls)}>
      {children}
    </span>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-0.5 break-words text-sm text-gray-200">{value ?? '—'}</p>
    </div>
  )
}

function Group({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border dark:border-[#262626] bg-white/[0.03] p-4">
      <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-estate-gold">
        {icon} {title}
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3">{children}</div>
    </div>
  )
}

export default function AllProjectsPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [items, setItems] = useState<Row[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('ALL')
  const [approval, setApproval] = useState('ALL')
  const [active, setActive] = useState('ALL')
  const [sort, setSort] = useState('newest')

  const [expanded, setExpanded] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, Detail>>({})
  const [detailLoading, setDetailLoading] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)

  const load = useCallback(
    async (p: number) => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({ page: String(p), limit: '25', sort })
        if (query.trim()) params.set('q', query.trim())
        if (status !== 'ALL') params.set('status', status)
        if (approval !== 'ALL') params.set('approval', approval)
        if (active !== 'ALL') params.set('active', active === 'ACTIVE' ? 'true' : 'false')
        const res = await fetch(`/api/ceo/projects-all?${params}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load')
        setItems(data.items || [])
        setTotal(data.total || 0)
        setPage(data.page || 1)
        setPages(data.pages || 1)
        setStats(data.stats || null)
      } catch (err) {
        console.error('Failed to load projects:', err)
        setError(ar ? 'معرفناش نحمّل المشاريع — حاول تاني.' : 'Failed to load')
      } finally {
        setLoading(false)
      }
    },
    [query, status, approval, active, sort, ar]
  )

  useEffect(() => {
    load(1)
  }, [load])

  const runSearch = (e?: React.FormEvent) => {
    e?.preventDefault()
    setQuery(q)
  }

  const toggleExpand = async (id: string) => {
    if (expanded === id) {
      setExpanded(null)
      return
    }
    setExpanded(id)
    setDetailError(null)
    if (details[id]) return
    setDetailLoading(id)
    try {
      const res = await fetch(`/api/ceo/projects-all/${id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load details')
      setDetails((prev) => ({ ...prev, [id]: data }))
    } catch (err) {
      console.error('Failed to load project details:', err)
      setDetailError(ar ? 'معرفناش نحمّل التفاصيل — حاول تاني.' : 'Failed to load details')
    } finally {
      setDetailLoading(null)
    }
  }

  const selectCls =
    'h-9 rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 text-sm text-gray-300 outline-none focus:border-estate-gold/50'

  return (
    <div className="space-y-6">
      {/* Header + stats */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Reveal>
          <p className="section-kicker">{ar ? 'لوحة المدير · كل المشاريع' : 'CEO Console · Inventory'}</p>
          <h1 className="flex items-center gap-2 font-display display-3 text-foreground">
            <FolderTree className="h-6 w-6 text-estate-gold" /> {ar ? 'كل المشاريع' : 'All Projects'}
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            {ar
              ? 'كل مشروع في الداتابيز — المنشور والمسودة والمستخبي والمؤرشف — بالتفاصيل الكاملة.'
              : 'Every project in the database — published, draft, hidden or archived — with complete details per project.'}{' '}
            {total > 0 && (ar ? <>بيعرض {total} مشروع مطابق.</> : <>Showing {total} matching project{total === 1 ? '' : 's'}.</>)}
          </p>
          <hr className="gold-hairline mt-4" />
        </Reveal>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            { label: 'Total', labelAr: 'الكل', value: stats.total, cls: 'text-foreground' },
            { label: 'Active', labelAr: 'نشطة', value: stats.active, cls: 'text-emerald-400' },
            { label: 'Inactive', labelAr: 'مقفولة', value: stats.inactive, cls: 'text-red-400' },
            { label: 'Published', labelAr: 'منشورة', value: stats.published, cls: 'text-blue-400' },
            { label: 'Drafts', labelAr: 'مسودات', value: stats.drafts, cls: 'text-yellow-400' },
          ].map((s) => (
            <Card key={s.label} className="border-border dark:border-[#262626] bg-card dark:bg-black">
              <CardContent className="px-4 py-3">
                <p className={cn('text-xl font-bold', s.cls)}>{s.value}</p>
                <p className="text-[11px] uppercase tracking-wide text-gray-500">{ar ? s.labelAr : s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* Filters */}
      <Card className="border-border dark:border-[#262626] bg-card dark:bg-black">
        <CardContent className="flex flex-wrap items-center gap-2 px-4 py-3">
          <form onSubmit={runSearch} className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={ar ? 'دوّر بالاسم (إنجليزي/عربي) أو الرابط أو العنوان أو المطوّر…' : 'Search name (EN/AR), slug, address or developer…'}
              className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] pl-9 text-foreground"
            />
          </form>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
            <option value="ALL">{ar ? 'كل حالات البنا' : 'All builds'}</option>
            <option value="COMING_SOON">{ar ? 'جاي قريب' : 'Coming soon'}</option>
            <option value="UNDER_CONSTRUCTION">{ar ? 'تحت الإنشاء' : 'Under construction'}</option>
            <option value="DELIVERED">{ar ? 'اتسلّم' : 'Delivered'}</option>
            <option value="SOLD_OUT">{ar ? 'اتباع كله' : 'Sold out'}</option>
          </select>
          <select value={approval} onChange={(e) => setApproval(e.target.value)} className={selectCls}>
            <option value="ALL">{ar ? 'كل الموافقات' : 'All approvals'}</option>
            <option value="DRAFT">{ar ? 'مسودة' : 'Draft'}</option>
            <option value="PENDING">{ar ? 'مستنّي' : 'Pending'}</option>
            <option value="APPROVED">{ar ? 'متوافق عليه' : 'Approved'}</option>
            <option value="PUBLISHED">{ar ? 'منشور' : 'Published'}</option>
            <option value="REJECTED">{ar ? 'مرفوض' : 'Rejected'}</option>
            <option value="HIDDEN">{ar ? 'مستخبي' : 'Hidden'}</option>
            <option value="ARCHIVED">{ar ? 'مؤرشف' : 'Archived'}</option>
          </select>
          <select value={active} onChange={(e) => setActive(e.target.value)} className={selectCls}>
            <option value="ALL">{ar ? 'النشط والمقفول' : 'Active + inactive'}</option>
            <option value="ACTIVE">{ar ? 'النشط بس' : 'Active only'}</option>
            <option value="INACTIVE">{ar ? 'المقفول بس' : 'Inactive only'}</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className={selectCls}>
            <option value="newest">{ar ? 'الأحدث الأول' : 'Newest first'}</option>
            <option value="oldest">{ar ? 'الأقدم الأول' : 'Oldest first'}</option>
            <option value="name">{ar ? 'الاسم أ-ي' : 'Name A–Z'}</option>
            <option value="views">{ar ? 'الأكتر مشاهدة' : 'Most viewed'}</option>
            <option value="price">{ar ? 'الأرخص' : 'Lowest price'}</option>
          </select>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-border dark:border-[#262626] bg-card dark:bg-black">
        <CardContent className="p-0">
          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-14 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> {ar ? 'بيحمّل المشاريع…' : 'Loading projects…'}
            </div>
          ) : items.length === 0 ? (
            <div className="py-14 text-center text-sm text-gray-400">
              {ar ? 'مفيش مشاريع' : 'No projects found'}{query ? (ar ? ` لـ"${query}"` : ` for “${query}”`) : ''} {ar ? 'بالفلاتر الحالية.' : 'with the current filters.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="w-8 px-3 py-2.5" />
                    <th className="px-3 py-2.5 font-medium">{ar ? 'المشروع' : 'Project'}</th>
                    <th className="px-3 py-2.5 font-medium">{ar ? 'المطوّر' : 'Developer'}</th>
                    <th className="px-3 py-2.5 font-medium">{ar ? 'المكان' : 'Location'}</th>
                    <th className="px-3 py-2.5 font-medium">{ar ? 'الحالة' : 'State'}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{ar ? 'الوحدات' : 'Units'}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{ar ? 'السعر من' : 'Price from'}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{ar ? 'المشاهدات' : 'Views'}</th>
                    <th className="px-3 py-2.5 font-medium">{ar ? 'اتعمل' : 'Created'}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => {
                    const open = expanded === p.id
                    return (
                      <Fragment key={p.id}>
                        <tr
                          onClick={() => toggleExpand(p.id)}
                          className={cn(
                            'cursor-pointer border-b border-border dark:border-[#262626] transition-colors hover:bg-white/[0.04]',
                            open && 'bg-white/[0.05]'
                          )}
                        >
                          <td className="px-3 py-2.5 text-gray-500">
                            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-3">
                              <Image
                                src={p.coverImage || '/images/placeholder.jpg'}
                                alt=""
                                width={56}
                                height={36}
                                className="h-9 w-14 shrink-0 rounded-2xl object-cover"
                              />
                              <div className="min-w-0">
                                <p className="flex items-center gap-1.5 truncate font-medium text-foreground">
                                  {ar && p.nameArabic ? p.nameArabic : p.name}
                                  {p.isNewLaunch && (
                                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-estate-gold" />
                                  )}
                                </p>
                                <p className="truncate text-xs text-gray-500">/projects/{p.slug}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-gray-300">{p.developer?.companyName || '—'}</td>
                          <td className="px-3 py-2.5 text-xs text-gray-400">
                            {[p.district?.name, p.city?.name, p.governorate?.name].filter(Boolean).join(ar ? '، ' : ', ') || '—'}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              <Badge cls={APPROVAL_BADGE[p.approvalStatus] || APPROVAL_BADGE.DRAFT}>
                                {statusLabel(p.approvalStatus, ar)}
                              </Badge>
                              <Badge cls={BUILD_BADGE[p.status] || 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-400'}>
                                {statusLabel(p.status, ar)}
                              </Badge>
                              {!p.isActive && <Badge cls="border-red-500/30 bg-red-500/10 text-red-400">{ar ? 'مش نشط' : 'Inactive'}</Badge>}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-300">{p._count.units}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right text-gray-300">{money(p.startPrice)}</td>
                          <td className="px-3 py-2.5 text-right text-gray-400">{p.viewCount}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-xs text-gray-500">{fmtDate(p.createdAt, ar)}</td>
                        </tr>

                        {open && (
                          <tr>
                            <td colSpan={9} className="border-b border-border dark:border-[#262626] bg-card dark:bg-black/60 px-4 py-4">
                              {detailLoading === p.id ? (
                                <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
                                  <Loader2 className="h-4 w-4 animate-spin" /> {ar ? 'بيحمّل التفاصيل الكاملة…' : 'Loading full details…'}
                                </div>
                              ) : detailError ? (
                                <div className="flex items-center gap-2 py-4 text-sm text-red-400">
                                  <AlertTriangle className="h-4 w-4" /> {detailError}
                                </div>
                              ) : details[p.id] ? (
                                <ProjectDetail detail={details[p.id]} ar={ar} />
                              ) : null}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-border dark:border-[#262626] px-4 py-3">
              <p className="text-xs text-gray-500">
                {ar ? `صفحة ${page} من ${pages} · ${total} مشروع` : `Page ${page} of ${pages} · ${total} projects`}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1 || loading}
                  onClick={() => load(page - 1)}
                  className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300"
                >
                  {ar ? 'اللي قبله' : 'Previous'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= pages || loading}
                  onClick={() => load(page + 1)}
                  className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300"
                >
                  {ar ? 'اللي بعده' : 'Next'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── expanded detail panel ─────────────────────────────────
function ProjectDetail({ detail, ar }: { detail: Detail; ar: boolean }) {
  const p = detail.project
  const gallery = jsonArr(p.gallery)
  const propertyTypes = jsonArr(p.propertyTypes)
  const listingTypes = jsonArr(p.listingTypes)
  const keywords = jsonArr(p.keywords)
  const yesNo = (v: unknown) => (v ? (ar ? 'أيوه' : 'Yes') : (ar ? 'لأ' : 'No'))

  return (
    <div className="space-y-4">
      {/* Overview */}
      <Group icon={<Tag className="h-3.5 w-3.5" />} title={ar ? 'نظرة عامة' : 'Overview'}>
        <Field label={ar ? 'الاسم (عربي)' : 'Name (AR)'} value={p.nameArabic || '—'} />
        <Field label={ar ? 'السطر (إنجليزي)' : 'Tagline (EN)'} value={p.tagline || '—'} />
        <Field label={ar ? 'السطر (عربي)' : 'Tagline (AR)'} value={p.taglineArabic || '—'} />
        <Field label={ar ? 'أنواع العقارات' : 'Property types'} value={propertyTypes.length ? propertyTypes.join(ar ? '، ' : ', ') : '—'} />
        <Field label={ar ? 'أنواع الإعلان' : 'Listing types'} value={listingTypes.length ? listingTypes.join(ar ? '، ' : ', ') : '—'} />
        <Field label={ar ? 'الرابط' : 'Slug'} value={<code className="text-estate-gold">/projects/{p.slug}</code>} />
        <Field label={ar ? 'حالة الموافقة' : 'Approval status'} value={statusLabel(p.approvalStatus, ar)} />
        <Field label={ar ? 'نشط' : 'Active'} value={yesNo(p.isActive)} />
        <Field label={ar ? 'مميز' : 'Featured'} value={p.isFeatured ? (ar ? `أيوه (ترتيب ${p.featuredRank ?? '—'})` : `Yes (rank ${p.featuredRank ?? '—'})`) : (ar ? 'لأ' : 'No')} />
        <Field label={ar ? 'متوثّق' : 'Verified'} value={yesNo(p.isVerified)} />
        <Field label={ar ? 'لانش جديد' : 'New launch'} value={p.isNewLaunch ? (ar ? 'أيوه — ظاهر في اللانشات' : 'Yes — shown in New Launches') : (ar ? 'لأ' : 'No')} />
        <Field label={ar ? 'سبب الرفض' : 'Rejection reason'} value={p.rejectionReason || '—'} />
      </Group>

      {/* Description */}
      {(p.description || p.descriptionArabic) && (
        <div className="rounded-2xl border border-border dark:border-[#262626] bg-white/[0.03] p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-estate-gold">{ar ? 'الوصف' : 'Description'}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
              {p.description || '—'}
            </p>
            <p dir="rtl" className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
              {p.descriptionArabic || '—'}
            </p>
          </div>
        </div>
      )}

      {/* Location */}
      <Group icon={<MapPin className="h-3.5 w-3.5" />} title={ar ? 'المكان' : 'Location'}>
        <Field label={ar ? 'العنوان' : 'Address'} value={p.address || '—'} />
        <Field label={ar ? 'المحافظة' : 'Governorate'} value={p.governorate ? `${p.governorate.name} / ${p.governorate.nameArabic || ''}` : '—'} />
        <Field label={ar ? 'المدينة' : 'City'} value={p.city ? `${p.city.name} / ${p.city.nameArabic || ''}` : '—'} />
        <Field label={ar ? 'الحي' : 'District'} value={p.district?.name || '—'} />
        <Field label={ar ? 'الإحداثيات' : 'Coordinates'} value={p.latitude && p.longitude ? `${p.latitude}, ${p.longitude}` : '—'} />
        <Field
          label={ar ? 'جوجل مابس' : 'Google Maps'}
          value={
            p.googleMapsUrl ? (
              <a href={p.googleMapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-estate-gold hover:underline">
                {ar ? 'افتح' : 'Open'} <ExternalLink className="h-3 w-3" />
              </a>
            ) : '—'
          }
        />
      </Group>

      {/* Pricing */}
      <Group icon={<Banknote className="h-3.5 w-3.5" />} title={ar ? 'الأسعار والدفع' : 'Pricing & payment'}>
        <Field label={ar ? 'السعر المبدئي' : 'Start price'} value={money(p.startPrice)} />
        <Field label={ar ? 'السعر النهائي' : 'End price'} value={money(p.endPrice)} />
        <Field label={ar ? 'سعر المتر' : 'Price / m²'} value={money(p.pricePerSqm)} />
        <Field label={ar ? 'أقل مقدم' : 'Min down payment'} value={typeof p.downPaymentMin === 'number' ? `${p.downPaymentMin}%` : '—'} />
        <Field label={ar ? 'التقسيط' : 'Installments'} value={p.installmentYears ? (ar ? `${p.installmentYears} سنة` : `${p.installmentYears} years`) : '—'} />
        <Field label={ar ? 'مصاريف الصيانة' : 'Maintenance fee'} value={typeof p.MaintenanceFeePercent === 'number' ? `${p.MaintenanceFeePercent}%` : '—'} />
        <Field label={ar ? 'مساحة الكمبوند' : 'Compound area'} value={p.compoundArea ? (ar ? `${p.compoundArea} م²` : `${p.compoundArea} m²`) : '—'} />
        <Field label={ar ? 'مدى أسعار الوحدات' : 'Unit price range (all units)'} value={`${money(detail.unitStats.minPrice)} – ${money(detail.unitStats.maxPrice)}`} />
        <Field label={ar ? 'خطط الدفع' : 'Payment plans'} value={p.paymentPlans?.length || 0} />
      </Group>

      {p.paymentPlans?.length > 0 && (
        <div className="rounded-2xl border border-border dark:border-[#262626] bg-white/[0.03] p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-estate-gold">{ar ? 'خطط الدفع' : 'Payment plans'}</p>
          <div className="flex flex-wrap gap-2">
            {p.paymentPlans.map((pl: any) => (
              <span key={pl.id} className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-2.5 py-1 text-xs text-gray-300">
                {pl.name} — <b className="text-estate-gold">{pl.downPaymentPct}%</b> {ar ? 'مقدم' : 'down'}, {pl.installmentYears}{ar ? ' سنة' : 'y'}
                {pl.isDefault ? (ar ? ' · افتراضية' : ' · default') : ''}
                {!pl.isActive ? (ar ? ' · واقفة' : ' · inactive') : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Delivery */}
      <Group icon={<CalendarClock className="h-3.5 w-3.5" />} title={ar ? 'التسليم والحجم' : 'Delivery & scale'}>
        <Field label={ar ? 'الوحدات (المعلنة)' : 'Total units (declared)'} value={p.totalUnits ?? '—'} />
        <Field label={ar ? 'الوحدات في الداتابيز' : 'Units in DB'} value={detail.unitStats.count} />
        <Field label={ar ? 'المساحة الكلية' : 'Total area'} value={p.totalArea ? (ar ? `${p.totalArea} م²` : `${p.totalArea} m²`) : '—'} />
        <Field label={ar ? 'المساحة المبنية (مجموع الوحدات)' : 'Built area (units sum)'} value={detail.unitStats.totalArea ? (ar ? `${Math.round(detail.unitStats.totalArea)} م²` : `${Math.round(detail.unitStats.totalArea)} m²`) : '—'} />
        <Field label={ar ? 'الإنجاز' : 'Completion'} value={`${p.completionPercent ?? 0}%`} />
        <Field label={ar ? 'معاد التسليم' : 'Delivery date'} value={fmtDate(p.deliveryDate, ar)} />
        <Field label={ar ? 'شروط التسليم' : 'Delivery terms'} value={p.deliveryTerms || '—'} />
        <Field label={ar ? 'المراحل' : 'Phases'} value={p.phases?.length || 0} />
      </Group>

      {p.phases?.length > 0 && (
        <div className="rounded-2xl border border-border dark:border-[#262626] bg-white/[0.03] p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-estate-gold">{ar ? 'المراحل' : 'Phases'}</p>
          <div className="flex flex-wrap gap-2">
            {p.phases.map((ph: any) => (
              <span key={ph.id} className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-2.5 py-1 text-xs text-gray-300">
                {ph.name} — {ph.status} · {ph.totalUnits ?? '—'} {ar ? 'وحدة' : 'units'} · {fmtDate(ph.deliveryDate, ar)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Media */}
      <Group icon={<ImageIcon className="h-3.5 w-3.5" />} title={ar ? 'الميديا والسيو' : 'Media & SEO'}>
        <Field label={ar ? 'صورة الغلاف' : 'Cover image'} value={p.coverImage ? <a href={p.coverImage} target="_blank" rel="noreferrer" className="text-estate-gold hover:underline">{ar ? 'شوف' : 'View'}</a> : '—'} />
        <Field label={ar ? 'صور الجاليري' : 'Gallery images'} value={gallery.length} />
        <Field label={ar ? 'الماستر بلان' : 'Master plans'} value={p.masterPlanImages?.length || 0} />
        <Field label={ar ? 'البروشورات' : 'Brochures'} value={p.brochures?.length || 0} />
        <Field label={ar ? 'فيديو' : 'Video'} value={p.videoUrl ? <a href={p.videoUrl} target="_blank" rel="noreferrer" className="text-estate-gold hover:underline">{ar ? 'اتفرج' : 'Watch'}</a> : '—'} />
        <Field label={ar ? 'الجولة الافتراضية' : 'Virtual tour'} value={p.virtualTourUrl ? <a href={p.virtualTourUrl} target="_blank" rel="noreferrer" className="text-estate-gold hover:underline">{ar ? 'افتح' : 'Open'}</a> : '—'} />
        <Field label={ar ? 'عنوان الميتا' : 'Meta title'} value={p.metaTitle || '—'} />
        <Field label={ar ? 'وصف الميتا' : 'Meta description'} value={p.metaDescription || '—'} />
        <Field label={ar ? 'الكلمات' : 'Keywords'} value={keywords.length ? keywords.join(ar ? '، ' : ', ') : '—'} />
      </Group>

      {/* Stats */}
      <Group icon={<BarChart3 className="h-3.5 w-3.5" />} title={ar ? 'الإحصائيات والعلاقات' : 'Stats & relations'}>
        <Field label={ar ? 'المشاهدات' : 'Views'} value={p.viewCount} />
        <Field label={ar ? 'المفضلة' : 'Favorites'} value={p.favoriteCount} />
        <Field label={ar ? 'الاستفسارات' : 'Inquiries'} value={p.inquiryCount} />
        <Field label={ar ? 'الليدز' : 'Leads'} value={p._count?.leads ?? 0} />
        <Field label={ar ? 'الصفقات' : 'Deals'} value={p._count?.deals ?? 0} />
        <Field label={ar ? 'المعاينات' : 'Viewings'} value={p._count?.viewings ?? 0} />
        <Field label={ar ? 'صلاحيات البروكرز' : 'Broker access grants'} value={p._count?.brokerAccess ?? 0} />
        <Field label={ar ? 'قواعد العمولة' : 'Commission rules'} value={p._count?.commissionRules ?? 0} />
        <Field label={ar ? 'المقالات' : 'Blog posts'} value={p._count?.blogs ?? 0} />
        <Field label={ar ? 'المرافق' : 'Amenities'} value={p.amenities?.length || 0} />
        <Field label={ar ? 'الأماكن القريبة' : 'Nearby places'} value={p.nearbyPlaces?.length || 0} />
        <Field label={ar ? 'اتعمل' : 'Created'} value={fmtDate(p.createdAt, ar)} />
        <Field label={ar ? 'اتحدّث' : 'Updated'} value={fmtDate(p.updatedAt, ar)} />
        <Field label={ar ? 'اتنشر' : 'Published'} value={fmtDate(p.publishedAt, ar)} />
      </Group>

      {/* Developer */}
      <Group icon={<Building2 className="h-3.5 w-3.5" />} title={ar ? 'المطوّر' : 'Developer'}>
        <Field label={ar ? 'الشركة' : 'Company'} value={p.developer?.companyName || '—'} />
        <Field label={ar ? 'متوثّق' : 'Verified'} value={p.developer?.isVerified ? (ar ? 'أيوه' : 'Yes') : (ar ? 'لأ' : 'No')} />
        <Field label={ar ? 'التواصل' : 'Contact'} value={p.developer?.user ? `${p.developer.user.name} · ${p.developer.user.email}` : '—'} />
      </Group>

      {/* Units sample */}
      <div className="rounded-2xl border border-border dark:border-[#262626] bg-white/[0.03] p-4">
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-estate-gold">
          <Package className="h-3.5 w-3.5" /> {ar ? 'عيّنة الوحدات' : 'Units sample'}
          <span className="font-normal text-gray-500">
            ({detail.unitStats.count} {ar ? 'الكل' : 'total'}{(p.units?.length || 0) < detail.unitStats.count ? (ar ? `, بيعرض الأرخص ${p.units?.length || 0}` : `, showing cheapest ${p.units?.length || 0}`) : ''})
          </span>
        </p>
        {p.units?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border dark:border-[#262626] text-left text-gray-500">
                  <th className="py-1.5 pr-3 font-medium">{ar ? 'الوحدة' : 'Unit'}</th>
                  <th className="py-1.5 pr-3 font-medium">{ar ? 'النوع' : 'Type'}</th>
                  <th className="py-1.5 pr-3 font-medium">{ar ? 'أوض' : 'Beds'}</th>
                  <th className="py-1.5 pr-3 text-right font-medium">{ar ? 'المساحة' : 'Area'}</th>
                  <th className="py-1.5 pr-3 text-right font-medium">{ar ? 'السعر' : 'Price'}</th>
                  <th className="py-1.5 font-medium">{ar ? 'الحالة' : 'Status'}</th>
                </tr>
              </thead>
              <tbody>
                {p.units.map((u: any) => (
                  <tr key={u.id} className="border-b border-border dark:border-[#262626] last:border-0">
                    <td className="py-1.5 pr-3 text-gray-200">{u.name}{u.unitNumber ? ` · #${u.unitNumber}` : ''}</td>
                    <td className="py-1.5 pr-3 text-gray-400">{u.unitType}</td>
                    <td className="py-1.5 pr-3 text-gray-400">{u.bedrooms ?? '—'}</td>
                    <td className="py-1.5 pr-3 text-right text-gray-400">{u.area} {ar ? 'م²' : 'm²'}</td>
                    <td className="py-1.5 pr-3 text-right text-gray-200">{formatEGP(u.price)}</td>
                    <td className="py-1.5 text-gray-400">{statusLabel(u.status, ar)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500">{ar ? 'مفيش وحدات في الداتابيز للمشروع ده.' : 'No units in the database for this project.'}</p>
        )}
      </div>

      {/* Amenities & nearby */}
      {(p.amenities?.length > 0 || p.nearbyPlaces?.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {p.amenities?.length > 0 && (
            <div className="rounded-2xl border border-border dark:border-[#262626] bg-white/[0.03] p-4">
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-estate-gold">
                <Layers className="h-3.5 w-3.5" /> {ar ? 'المرافق' : 'Amenities'}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {p.amenities.map((a: any) => (
                  <span key={a.amenity.id} className="rounded-full border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-2 py-0.5 text-[11px] text-gray-300">
                    {a.amenity.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {p.nearbyPlaces?.length > 0 && (
            <div className="rounded-2xl border border-border dark:border-[#262626] bg-white/[0.03] p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-estate-gold">{ar ? 'الأماكن القريبة' : 'Nearby places'}</p>
              <div className="flex flex-wrap gap-1.5">
                {p.nearbyPlaces.map((n: any) => (
                  <span key={n.id} className="rounded-full border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-2 py-0.5 text-[11px] text-gray-300">
                    {n.name} · {n.type} · {n.distance} {ar ? 'كم' : 'km'}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
