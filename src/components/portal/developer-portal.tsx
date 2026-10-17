'use client'

import { createContext, useContext, useEffect, useMemo, useState, Fragment } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  Building2,
  Users,
  Handshake,
  Wallet,
  Search,
  BadgeCheck,
  AlertTriangle,
  ArrowUpRight,
  Eye,
  Mail,
  Plus,
  Send,
  Pencil,
  Trash2,
  Loader2,
  ChevronDown,
  Home,
  CreditCard,
  Check,
  MapPin,
  Copy,
  Share2,
  EyeOff,
  History,
  CalendarDays,
  Download,
  Upload,
} from 'lucide-react'
import { formatEGP, cn } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import { Reveal, SectionHeader } from '@/components/design'

export type ProjectRow = {
  id: string
  name: string
  slug: string
  coverImage: string | null
  status: string
  approvalStatus: string
  startPrice: number | null
  totalUnits: number | null
  completionPercent: number | null
  deliveryDate: string | null
  isActive: boolean
  isFeatured: boolean
  viewCount: number
  favoriteCount: number
  inquiryCount: number
  rejectionReason?: string | null
  location: string | null
  units: number
  leads: number
  deals: number
}

type LeadRow = {
  id: string
  name: string
  phone: string
  email: string | null
  status: string
  source: string
  createdAt: string
  protectionExpiresAt: string | null
  brokerName: string
  projectName: string | null
  projectSlug: string | null
}

type DealRow = {
  id: string
  status: string
  dealValue: number | null
  createdAt: string
  projectName: string
  unitName: string | null
  brokerName: string
  commissionStatus: string | null
}

type CommissionRow = {
  id: string
  status: string
  totalAmount: number
  estateaiAmount: number
  dueDate: string | null
  createdAt: string
  projectName: string
}

type Partnership = {
  status: string
  allProjectsApproved: boolean
  approvedCount: number
  leadProtectionDays: number | null
  startDate: string | null
  endDate: string | null
  terms: string | null
  reviewNote: string | null
  isActive: boolean
  updatedAt: string
} | null

type Props = {
  profile: {
    companyName: string
    logo: string | null
    isVerified: boolean
    rating: number
    reviewCount: number
    foundedYear: number | null
    headquarters: string | null
    website: string | null
    totalProjects: number
    accountStatus: string
    isActive: boolean
  }
  viewer: { name: string; role: string }
  partnership: Partnership
  stats: {
    projects: number
    published: number
    leads: number
    statusCounts: Record<string, number>
    deals: number
    totalValue: number
    commissionTotal: number
    commissionPaid: number
    commissionPending: number
    views: number
    inquiries: number
  }
  projects: ProjectRow[]
  leads: LeadRow[]
  deals: DealRow[]
  commissions: CommissionRow[]
}

const TABS = ['Overview', 'Projects', 'Leads', 'Deals', 'Partnership', 'Compare', 'Viewings'] as const
type Tab = (typeof TABS)[number]

const TAB_LABEL_AR: Record<Tab, string> = {
  Overview: 'نظرة عامة',
  Projects: 'المشاريع',
  Leads: 'الليدز',
  Deals: 'الصفقات',
  Partnership: 'الشراكة',
  Compare: 'مقارنة مشاريعي',
  Viewings: 'المعاينات',
}

const STATUS_LABEL_AR: Record<string, string> = {
  NEW: 'جديد',
  CONTACTED: 'تم التواصل',
  QUALIFIED: 'مؤهل',
  VIEWING: 'معاينة',
  NEGOTIATION: 'تفاوض',
  CONVERTED: 'اتحوّل',
  LOST: 'ضاع',
  RESERVATION: 'حجز',
  CONTRACT: 'تعاقد',
  SOLD: 'متباع',
  CANCELLED: 'ملغي',
  APPROVED: 'معتمد',
  PUBLISHED: 'منشور',
  PENDING: 'مستني',
  UNDER_REVIEW: 'تحت المراجعة',
  ACTIVE: 'نشط',
  SUSPENDED: 'موقوف',
  REJECTED: 'مرفوض',
  EXPIRED: 'منتهي',
  DRAFT: 'مسودة',
  HIDDEN: 'مخفي',
  ARCHIVED: 'مؤرشف',
  PAID: 'مدفوع',
  PENDING_COMMISSION: 'عمولة مستنية',
}

const PARTNERSHIP_LABEL_AR: Record<string, string> = {
  APPROVED: 'معتمدة',
  ACTIVE: 'نشطة',
  PENDING: 'مستنية',
  UNDER_REVIEW: 'تحت المراجعة',
  SUSPENDED: 'موقوفة',
  REJECTED: 'مرفوضة',
  EXPIRED: 'منتهية',
}

const ACCOUNT_STATUS_AR: Record<string, string> = {
  ACTIVE: 'نشط',
  SUSPENDED: 'موقوف',
  PENDING: 'مستني',
}

const STYLE: Record<string, string> = {
  NEW: 'bg-sky-500/15 text-sky-400',
  CONTACTED: 'bg-blue-500/15 text-blue-400',
  QUALIFIED: 'bg-violet-500/15 text-violet-400',
  VIEWING: 'bg-amber-500/15 text-amber-400',
  NEGOTIATION: 'bg-orange-500/15 text-orange-400',
  CONVERTED: 'bg-emerald-500/15 text-emerald-400',
  LOST: 'bg-red-500/15 text-red-400',
  RESERVATION: 'bg-sky-500/15 text-sky-400',
  CONTRACT: 'bg-blue-500/15 text-blue-400',
  SOLD: 'bg-emerald-500/15 text-emerald-400',
  CANCELLED: 'bg-red-500/15 text-red-400',
  APPROVED: 'bg-emerald-500/15 text-emerald-400',
  PUBLISHED: 'bg-emerald-500/15 text-emerald-400',
  PENDING: 'bg-amber-500/15 text-amber-400',
  UNDER_REVIEW: 'bg-amber-500/15 text-amber-400',
  ACTIVE: 'bg-emerald-500/15 text-emerald-400',
  SUSPENDED: 'bg-red-500/15 text-red-400',
  REJECTED: 'bg-red-500/15 text-red-400',
  EXPIRED: 'bg-red-500/15 text-red-400',
  DRAFT: 'bg-white/10 text-gray-300',
  HIDDEN: 'bg-white/10 text-gray-300',
  ARCHIVED: 'bg-white/10 text-gray-300',
  PAID: 'bg-emerald-500/15 text-emerald-400',
  PENDING_COMMISSION: 'bg-amber-500/15 text-amber-400',
}

const PARTNERSHIP_TONE: Record<string, string> = {
  APPROVED: 'text-emerald-400',
  ACTIVE: 'text-emerald-400',
  PENDING: 'text-amber-400',
  UNDER_REVIEW: 'text-amber-400',
  SUSPENDED: 'text-red-400',
  REJECTED: 'text-red-400',
  EXPIRED: 'text-red-400',
}

export default function DeveloperPortal(props: Props) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [tab, setTab] = useState<Tab>('Overview')
  const suspended = props.profile.accountStatus !== 'ACTIVE' || !props.profile.isActive
  // Local copy so submits / resubmits / inventory edits reflect instantly.
  const [projects, setProjects] = useState<ProjectRow[]>(props.projects)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      <div className="container px-4 py-8">
        {/* Header */}
        <Reveal>
        <div className="relative mb-6 overflow-hidden rounded-2xl border border-estate-gold/20 bg-gradient-to-r from-[#0F1A2C] to-[#10332a] p-6 text-white dark:border-[#D4A843]/20 dark:from-black dark:to-[#0A0A0A]">
          <div className="mashrabiya pointer-events-none absolute inset-0 opacity-30" aria-hidden="true" />
          <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              {props.profile.logo && (
                <div className="relative h-14 w-14 overflow-hidden rounded-2xl bg-white/10 ring-1 ring-estate-gold/30">
                  <Image src={props.profile.logo} alt="" fill sizes="56px" className="object-cover" />
                </div>
              )}
              <div>
                <SectionHeader
                  kicker={ar ? 'بوابة المطور' : 'Developer portal'}
                  title={
                    <span className="inline-flex flex-wrap items-center gap-2">
                      {props.profile.companyName}
                      {props.profile.isVerified && (
                        <BadgeCheck className="h-6 w-6 text-emerald-400" aria-label={ar ? 'مطور موثّق' : 'Verified developer'} />
                      )}
                    </span>
                  }
                />
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white/70">
                  {props.profile.headquarters && <span>{props.profile.headquarters}</span>}
                  {props.profile.foundedYear && (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">
                      {ar ? `متأسسة سنة ${props.profile.foundedYear}` : `Founded ${props.profile.foundedYear}`}
                    </span>
                  )}
                  {props.profile.rating > 0 && (
                    <span className="rounded-full bg-estate-gold/20 px-2 py-0.5 text-xs text-estate-gold">
                      ★ {props.profile.rating.toFixed(1)} ({props.profile.reviewCount})
                    </span>
                  )}
                </div>
              </div>
            </div>

            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-xs font-medium transition-colors hover:bg-white/20"
            >
              {ar ? 'اللوحة الكاملة' : 'Full dashboard'} <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span
              className={cn(
                'rounded-full px-3 py-1 text-xs font-semibold',
                props.partnership
                  ? `bg-white/10 ${PARTNERSHIP_TONE[props.partnership.status] || 'text-white'}`
                  : 'bg-white/10 text-white/70'
              )}
            >
              {ar ? 'الشراكة' : 'Partnership'}: {props.partnership ? (ar ? PARTNERSHIP_LABEL_AR[props.partnership.status] || props.partnership.status : props.partnership.status) : (ar ? 'مبدأتش' : 'Not started')}
            </span>
            <span className="text-xs text-white/50">
              {ar ? `${props.stats.published}/${props.stats.projects} مشاريع شغالة` : `${props.stats.published}/${props.stats.projects} projects live`}
            </span>
          </div>

          {suspended && (
            <p className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              {ar ? (
                <>حالة حسابك <strong>{ACCOUNT_STATUS_AR[props.profile.accountStatus] || props.profile.accountStatus}</strong>. كلّم مدير المنصة لو شايف إن ده غلط.</>
              ) : (
                <>Your account status is <strong>{props.profile.accountStatus}</strong>. Contact the platform administrator if you believe this is a mistake.</>
              )}
            </p>
          )}
          </div>
        </div>
        </Reveal>

        {/* Stats */}
        <Reveal delay={80}>
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat icon={<Building2 className="h-4 w-4" />} label={ar ? 'مشاريع شغالة' : 'Live projects'} value={`${props.stats.published}/${props.stats.projects}`} sub={ar ? 'معتمدة ومنشورة' : 'approved & published'} />
          <Stat icon={<Users className="h-4 w-4" />} label={ar ? 'الليدز' : 'Leads'} value={String(props.stats.leads)} sub={ar ? `${props.stats.statusCounts.CONVERTED || 0} اتحوّلوا` : `${props.stats.statusCounts.CONVERTED || 0} converted`} />
          <Stat icon={<Handshake className="h-4 w-4" />} label={ar ? 'قيمة الصفقات' : 'Deals value'} value={formatEGP(Math.round(props.stats.totalValue))} sub={ar ? `${props.stats.deals} صفقات` : `${props.stats.deals} deals`} />
          <Stat icon={<Wallet className="h-4 w-4" />} label={ar ? 'العمولة' : 'Commission'} value={formatEGP(Math.round(props.stats.commissionPaid))} sub={ar ? `${formatEGP(Math.round(props.stats.commissionPending))} مستنية` : `${formatEGP(Math.round(props.stats.commissionPending))} pending`} accent />
        </div>
        </Reveal>

        {/* Submit entry point — always visible, not buried in a tab */}
        <Reveal delay={100}>
        <Link
          href="/developer/submit"
          className="mb-6 flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-estate-gold/40 bg-estate-gold/[0.06] px-5 py-4 text-left transition-colors hover:border-estate-gold/70 hover:bg-estate-gold/[0.1]"
        >
          <span>
            <span className="block text-sm font-semibold text-white">{ar ? 'عندك مشروع جديد؟ قدّمه للمراجعة' : 'Have a new project? Submit it for review'}</span>
            <span className="mt-0.5 block text-xs text-gray-400">{ar ? 'بيروح للإدارة كـ PENDING وبيظهر للناس بعد الموافقة بس' : 'Goes to review as PENDING and only goes public after approval'}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-estate-gold px-4 py-2 text-xs font-bold text-[#0F1A2C]">
            <Plus className="h-4 w-4" /> {ar ? 'قدّم مشروع جديد' : 'Submit new project'}
          </span>
        </Link>
        </Reveal>

        {/* Tabs */}
        <div className="mb-5 flex gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.04] p-1">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors',
                tab === t ? 'bg-estate-gold text-[#0F1A2C]' : 'text-gray-400 hover:bg-white/5 hover:text-white'
              )}
            >
              {ar ? TAB_LABEL_AR[t] : t}
            </button>
          ))}
        </div>

        {tab === 'Overview' && <Reveal><Overview {...props} /></Reveal>}
        {tab === 'Projects' && <Reveal><SubmissionsTab projects={projects} onProjectsChange={setProjects} /></Reveal>}
        {tab === 'Leads' && <Reveal><LeadsTab leads={props.leads} /></Reveal>}
        {tab === 'Deals' && <Reveal><DealsTab deals={props.deals} commissions={props.commissions} /></Reveal>}
        {tab === 'Partnership' && <Reveal><PartnershipTab partnership={props.partnership} /></Reveal>}
        {tab === 'Compare' && <Reveal><CompareTab projects={projects} /></Reveal>}
        {tab === 'Viewings' && <Reveal><ViewingsTab /></Reveal>}
      </div>
    </div>
  )
}

/* ─── Overview ─────────────────────────────────────────── */

function Overview(props: Props) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const funnel = (['NEW', 'CONTACTED', 'QUALIFIED', 'VIEWING', 'NEGOTIATION', 'CONVERTED'] as const).map(
    (s) => ({ status: s, count: props.stats.statusCounts[s] || 0 })
  )
  const max = Math.max(1, ...funnel.map((f) => f.count))

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <Panel title={ar ? 'قمع الليدز' : 'Lead funnel'}>
          <div className="space-y-3">
            {funnel.map((step) => (
              <div key={step.status} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-xs text-gray-400">{ar ? STATUS_LABEL_AR[step.status] || step.status : step.status}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/5">
                  <div
                    className={cn('h-full rounded-full', step.status === 'CONVERTED' ? 'bg-emerald-500' : 'bg-estate-gold')}
                    style={{ width: `${(step.count / max) * 100}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-xs font-semibold text-white">{step.count}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={ar ? 'أكتر المشاريع تفاعلاً' : 'Top projects by engagement'}>
          <ul className="divide-y divide-white/5">
            {[...props.projects]
              .sort((a, b) => b.viewCount - a.viewCount)
              .slice(0, 6)
              .map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/projects/${p.slug}`} className="truncate text-sm font-medium text-white hover:text-estate-gold">
                      {p.name}
                    </Link>
                    <p className="truncate text-xs text-gray-500">
                      {ar ? `${p.location || '—'} · ${p.leads} ليدز · ${p.deals} صفقات` : `${p.location || '—'} · ${p.leads} leads · ${p.deals} deals`}
                    </p>
                  </div>
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Eye className="h-3.5 w-3.5" /> {p.viewCount.toLocaleString()}
                  </span>
                </li>
              ))}
          </ul>
        </Panel>
      </div>

      <div className="space-y-5">
        <Panel title={ar ? 'التفاعل' : 'Engagement'}>
          <dl className="space-y-2 text-sm">
            <Row label={ar ? 'إجمالي المشاهدات' : 'Total views'} value={props.stats.views.toLocaleString()} />
            <Row label={ar ? 'الاستفسارات' : 'Inquiries'} value={props.stats.inquiries.toLocaleString()} />
            <Row label={ar ? 'الليدز' : 'Leads'} value={String(props.stats.leads)} />
            <Row label={ar ? 'الصفقات' : 'Deals'} value={String(props.stats.deals)} />
          </dl>
        </Panel>

        <Panel title={ar ? 'الشركة' : 'Company'}>
          <dl className="space-y-2 text-sm">
            <Row label={ar ? 'مشاريع متسجلة' : 'Projects on record'} value={String(props.profile.totalProjects)} />
            <Row label={ar ? 'المقر' : 'Headquarters'} value={props.profile.headquarters || '—'} />
            <Row label={ar ? 'الموقع' : 'Website'} value={props.profile.website ? props.profile.website.replace(/^https?:\/\//, '') : '—'} />
            <Row label={ar ? 'الحالة' : 'Status'} value={ar ? ACCOUNT_STATUS_AR[props.profile.accountStatus] || props.profile.accountStatus : props.profile.accountStatus} />
          </dl>
        </Panel>

        <Panel title={ar ? 'طلبات التعديل بتاعتي' : 'My edit requests'}>
          <MyEditRequests />
        </Panel>
      </div>
    </div>
  )
}

/* ─── My edit requests (compact) ───────────────────────
   The caller's own `GET /api/developer/edit-requests` rows, newest-first:
   status + decision + reason. Client-fetched so the server page above stays
   untouched; failures render a quiet line, never a broken tab. */

type MyEditRequest = {
  id: string
  entity: string
  entityId: string
  field: string
  newValue: string
  message: string | null
  status: string
  reason: string | null
  createdAt: string
  project: { id: string; name: string } | null
  unit: { id: string; name: string } | null
  plan: { id: string; name: string } | null
}

function MyEditRequests() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [requests, setRequests] = useState<MyEditRequest[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/developer/edit-requests')
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as { requests?: MyEditRequest[] }
        if (!cancelled) setRequests(Array.isArray(data.requests) ? data.requests : [])
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (failed) {
    return <p className="text-xs text-gray-500">{ar ? 'معرفناش نجيب طلبات التعديل.' : 'Could not load edit requests.'}</p>
  }
  if (requests === null) {
    return (
      <p className="flex items-center gap-2 py-2 text-xs text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> {ar ? 'بيحمّل...' : 'Loading...'}
      </p>
    )
  }
  if (requests.length === 0) {
    return <Empty text={ar ? 'مبعّتش أي طلب تعديل لسه.' : 'No edit requests yet.'} />
  }
  return (
    <ul className="space-y-2.5">
      {requests.slice(0, 10).map((r) => (
        <li key={r.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs font-semibold text-white">
              {r.entity} · {r.field}
            </span>
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                STYLE[r.status] || 'bg-white/10 text-gray-300'
              )}
            >
              {ar ? STATUS_LABEL_AR[r.status] || r.status : r.status}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-gray-400">
            {[r.project?.name ?? null, r.newValue].filter(Boolean).join(' · ') || '—'}
          </p>
          {r.reason && (
            <p className="mt-1 text-xs leading-relaxed text-gray-300">
              {ar ? 'ردّ الفريق: ' : 'Team reply: '}{r.reason}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}

/* ─── Submissions (My submissions + submit + units/plans) ─── */

const CSRF_HEADERS: Record<string, string> = { 'X-Requested-With': 'XMLHttpRequest' }

// Autosave key for the submit-new-project draft (SubmitProjectForm).
const SUBMIT_DRAFT_KEY = 'ghaya-dev-submit-draft-v1'

function readSubmitDraft(): Record<string, unknown> | null {
  try {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(SUBMIT_DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

type MutResult = { ok: boolean; status: number; data: Record<string, unknown> | null }

async function mut(path: string, method: string, body?: unknown): Promise<MutResult> {
  const res = await fetch(path, {
    method,
    headers: { ...CSRF_HEADERS, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  let data: Record<string, unknown> | null = null
  try {
    data = (await res.json()) as Record<string, unknown>
  } catch {
    data = null
  }
  return { ok: res.ok, status: res.status, data }
}

function apiErrorMessage(data: MutResult['data'], status: number): string {
  const raw = typeof data?.error === 'string' ? (data.error as string) : ''
  if (raw === 'Name is required' || raw.startsWith('Name must be')) return 'NAME'
  if (raw.includes('already exists')) return 'SLUG_CLASH'
  if (raw.startsWith('Invalid ') || raw.includes('must be 0') || raw.includes('completionPercent')) return 'NUM'
  if (raw.startsWith('Missing required fields')) return 'MISSING'
  if (raw.startsWith('Cannot submit project in')) return 'BAD_STATE'
  if (raw === 'No developer profile linked to this account') return 'NO_PROFILE'
  if (raw.startsWith('Forbidden')) return 'FORBIDDEN'
  if (raw === 'Project not found' || raw === 'Unit not found' || raw === 'Payment plan not found') return 'NOT_FOUND'
  if (raw.includes('phaseId')) return 'PHASE'
  if (status === 401) return 'AUTH'
  return 'GENERIC'
}

function friendlyError(code: string, ar: boolean): string {
  switch (code) {
    case 'NAME':
      return ar ? 'اكتب اسم المشروع (من حرف لحد ٢٠٠ حرف).' : 'Enter a project name (1–200 characters).'
    case 'SLUG_CLASH':
      return ar ? 'في مشروع تاني بنفس الاسم — غيّر الاسم وحاول تاني.' : 'Another project already uses this name — change it and retry.'
    case 'NUM':
      return ar ? 'في رقم مش مظبوط — راجع الأرقام (لازم تبقى موجبة وفي الرينج) وحاول تاني.' : 'A number looks off — check the numeric fields and retry.'
    case 'MISSING':
      return ar ? 'كمّل الحقول المطلوبة (اللي عليها *) وحاول تاني.' : 'Fill in all required (*) fields and retry.'
    case 'BAD_STATE':
      return ar ? 'المشروع ده مينفعش يتبعت دلوقتي — المتبعت أو المنشور مبيتبعتش تاني.' : 'This project cannot be submitted right now.'
    case 'NO_PROFILE':
      return ar ? 'حسابك مش مربوط بملف مطور — كلّم إدارة المنصة.' : 'Your account has no developer profile linked — contact support.'
    case 'FORBIDDEN':
      return ar ? 'المشروع ده مش بتاع شركتك.' : 'This project does not belong to your company.'
    case 'NOT_FOUND':
      return ar ? 'الحاجة دي مش موجودة — حدّث الصفحة وحاول تاني.' : 'That item no longer exists — refresh and retry.'
    case 'PHASE':
      return ar ? 'المرحلة المختارة مش بتاعة نفس المشروع.' : 'The selected phase belongs to another project.'
    case 'AUTH':
      return ar ? 'جلستك خلصت — سجّل دخول تاني.' : 'Your session expired — sign in again.'
    default:
      return ar ? 'معرفناش نكمّل العملية — حاول تاني.' : 'Something went wrong — please retry.'
  }
}

function toProjectRow(p: Record<string, unknown>): ProjectRow {
  return {
    id: String(p.id),
    name: String(p.name ?? ''),
    slug: String(p.slug ?? ''),
    coverImage: (p.coverImage as string | null) ?? null,
    status: String(p.status ?? 'COMING_SOON'),
    approvalStatus: String(p.approvalStatus ?? 'PENDING'),
    startPrice: (p.startPrice as number | null) ?? null,
    totalUnits: (p.totalUnits as number | null) ?? null,
    completionPercent: (p.completionPercent as number | null) ?? null,
    deliveryDate: (p.deliveryDate as string | null) ?? null,
    isActive: (p.isActive as boolean) ?? true,
    isFeatured: (p.isFeatured as boolean) ?? false,
    viewCount: (p.viewCount as number) ?? 0,
    favoriteCount: (p.favoriteCount as number) ?? 0,
    inquiryCount: (p.inquiryCount as number) ?? 0,
    location: (p.location as string | null) ?? null,
    units: (p.units as number) ?? 0,
    leads: (p.leads as number) ?? 0,
    deals: (p.deals as number) ?? 0,
    rejectionReason: (p.rejectionReason as string | null) ?? null,
  }
}

const PROJECT_STATUSES = ['COMING_SOON', 'AVAILABLE', 'UNDER_CONSTRUCTION', 'DELIVERED', 'SOLD_OUT'] as const
const PROJECT_STATUS_AR: Record<string, string> = {
  COMING_SOON: 'قريب',
  AVAILABLE: 'متاح',
  UNDER_CONSTRUCTION: 'تحت الإنشاء',
  DELIVERED: 'اتسلّم',
  SOLD_OUT: 'خلص',
}

const APPROVAL_AR: Record<string, string> = {
  DRAFT: 'مسودة',
  PENDING: 'مستني المراجعة',
  APPROVED: 'اتقبل',
  REJECTED: 'مرفوض',
  PUBLISHED: 'منشور',
  HIDDEN: 'مخفي',
  ARCHIVED: 'مؤرشف',
}

function SubmissionsTab({
  projects,
  onProjectsChange,
}: {
  projects: ProjectRow[]
  onProjectsChange: (next: ProjectRow[]) => void
}) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
  const [hidingId, setHidingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const resubmit = async (project: ProjectRow) => {
    setSubmittingId(project.id)
    setActionError(null)
    try {
      const { ok, status, data } = await mut(`/api/developer/projects/${project.id}/submit`, 'POST', {})
      if (!ok || !data?.project) {
        setActionError(friendlyError(apiErrorMessage(data, status), ar))
        return
      }
      const updated = toProjectRow({ ...project, ...(data.project as Record<string, unknown>), approvalStatus: 'PENDING', rejectionReason: null })
      onProjectsChange(projects.map((p) => (p.id === project.id ? updated : p)))
    } catch {
      setActionError(ar ? 'معرفناش نبعت المشروع — حاول تاني.' : 'Failed to submit — please retry.')
    } finally {
      setSubmittingId(null)
    }
  }

  // 1) Duplicate — POST /api/developer/projects/[id]/duplicate → 201 {project}
  // (DRAFT clone). Confirm, then prepend the draft so it appears instantly.
  const duplicate = async (project: ProjectRow) => {
    if (!confirm(ar ? `انسخ مشروع «${project.name}» كمسودة جديدة؟` : `Duplicate “${project.name}” as a new draft?`)) return
    setDuplicatingId(project.id)
    setActionError(null)
    setNotice(null)
    try {
      const { ok, status, data } = await mut(`/api/developer/projects/${project.id}/duplicate`, 'POST', {})
      if (!ok || !data?.project) {
        setActionError(friendlyError(apiErrorMessage(data, status), ar))
        return
      }
      const row = toProjectRow(data.project as Record<string, unknown>)
      onProjectsChange([row, ...projects])
      setNotice(ar ? `اتنسخ «${project.name}» كمسودة جديدة («${row.name}»).` : `Duplicated “${project.name}” as a new draft (“${row.name}”).`)
    } catch {
      setActionError(ar ? 'معرفناش ننسخ المشروع — حاول تاني.' : 'Failed to duplicate the project — retry.')
    } finally {
      setDuplicatingId(null)
    }
  }

  // 10) Hide toggle — POST /api/developer/projects/[id]/visibility ← {hidden}
  // Only PUBLISHED ↔ HIDDEN is legal; anything else → 400 with a friendly line.
  const toggleVisibility = async (project: ProjectRow) => {
    const hide = project.approvalStatus === 'PUBLISHED'
    if (!hide && project.approvalStatus !== 'HIDDEN') {
      setActionError(
        ar
          ? 'الإخفاء/النشر متاح بس للمشاريع المنشورة أو المخفية — المسودات والمستني مراجعة مبتتحركش من هنا.'
          : 'Hide/publish is only available for PUBLISHED or HIDDEN projects.'
      )
      return
    }
    if (!confirm(ar ? (hide ? `اخفي مشروع «${project.name}» من الناس؟` : `انشر مشروع «${project.name}» للناس تاني؟`) : (hide ? `Hide “${project.name}” from the public?` : `Publish “${project.name}” again?`))) return
    setHidingId(project.id)
    setActionError(null)
    setNotice(null)
    try {
      const { ok, status, data } = await mut(`/api/developer/projects/${project.id}/visibility`, 'POST', { hidden: hide })
      if (!ok || !data?.project) {
        const raw = typeof data?.error === 'string' ? data.error : ''
        setActionError(
          status === 400
            ? (ar ? 'مينفعش يتحرك كده دلوقتي — الحالة الحالية مبتسمحش (المسودات والمستني مراجعة مبيتخبوش من هنا).' : 'That move is not allowed from its current state.')
            : raw.startsWith('Forbidden')
              ? (ar ? 'المشروع ده مش بتاع شركتك.' : 'This project does not belong to your company.')
              : friendlyError(apiErrorMessage(data, status), ar)
        )
        return
      }
      const p = data.project as Record<string, unknown>
      onProjectsChange(projects.map((x) => (x.id === project.id ? { ...x, approvalStatus: String(p.approvalStatus ?? x.approvalStatus) } : x)))
      setNotice(hide ? (ar ? `«${project.name}» بقى مخفي.` : `“${project.name}” is now hidden.`) : (ar ? `«${project.name}» رجع منشور.` : `“${project.name}” is published again.`))
    } catch {
      setActionError(ar ? 'معرفناش نغيّر الظهور — حاول تاني.' : 'Failed to change visibility — retry.')
    } finally {
      setHidingId(null)
    }
  }

  return (
    <div className="space-y-5">
      <Panel title={ar ? `تقديماتي (${projects.length})` : `My submissions (${projects.length})`}>
        <p className="mb-4 flex items-start gap-2 rounded-2xl border border-sky-400/25 bg-sky-400/[0.07] px-3 py-2 text-xs leading-relaxed text-sky-200">
          <Eye className="mt-0.5 h-4 w-4 flex-shrink-0" />
          {ar ? (
            <>للناس بيظهر بس المشاريع المعتمدة والمنشورة — أي شغل لسه PENDING أو مرفوض محدش شايفه غيرك لحد ما الإدارة توافق عليه.</>
          ) : (
            <>Only APPROVED/PUBLISHED projects are public — anything still PENDING or rejected is visible to you alone until review passes.</>
          )}
        </p>

        <Link
          href="/developer/submit"
          onClick={() => setActionError(null)}
          className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-estate-gold px-4 py-2 text-xs font-bold text-[#0F1A2C] transition-colors hover:bg-estate-gold/90"
        >
          <Plus className="h-4 w-4" /> {ar ? 'قدّم مشروع جديد' : 'Submit new project'}
        </Link>

        {actionError && (
          <p className="mb-4 flex items-start gap-2 rounded-2xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {actionError}
          </p>
        )}

        {notice && (
          <p className="mb-4 flex items-start gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            <Check className="mt-0.5 h-4 w-4 flex-shrink-0" /> {notice}
          </p>
        )}

        {projects.length === 0 ? (
          <Empty text={ar ? 'لسه مقدّمتش أي مشروع. دوس «قدّم مشروع جديد» وابدأ.' : 'No submissions yet. Hit “Submit new project” to start.'} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => {
              const canResubmit = p.approvalStatus === 'DRAFT' || p.approvalStatus === 'REJECTED'
              const expanded = expandedId === p.id
              return (
                <div key={p.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                  <div className="relative aspect-[16/9] bg-white/5">
                    {p.coverImage && (
                      <Image src={p.coverImage} alt={p.name} fill sizes="(max-width: 640px) 100vw, 33vw" className="object-cover" />
                    )}
                    <span
                      className={cn(
                        'absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                        STYLE[p.approvalStatus] || 'bg-white/10 text-gray-300'
                      )}
                    >
                      {ar ? APPROVAL_AR[p.approvalStatus] || p.approvalStatus : p.approvalStatus}
                    </span>
                    {!p.isActive && (
                      <span className="absolute right-2 top-2 rounded-full bg-red-500/80 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                        {ar ? 'مخفي' : 'Hidden'}
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="truncate text-sm font-semibold text-white">{p.name}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{p.location || '—'}</p>
                    <p className="mt-1 text-sm font-bold text-estate-gold">
                      {p.startPrice ? (ar ? `من ${formatEGP(Math.round(p.startPrice))}` : `from ${formatEGP(Math.round(p.startPrice))}`) : (ar ? 'السعر عند الطلب' : 'Price on request')}
                    </p>

                    {p.approvalStatus === 'REJECTED' && p.rejectionReason && (
                      <div className="mt-2 rounded-2xl border border-red-500/25 bg-red-500/[0.07] p-2.5">
                        <p className="text-[11px] uppercase tracking-wide text-red-300">{ar ? 'سبب الرفض' : 'Rejection reason'}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-gray-200">{p.rejectionReason}</p>
                      </div>
                    )}
                    {p.approvalStatus === 'REJECTED' && !p.rejectionReason && (
                      <p className="mt-2 text-xs text-gray-500">{ar ? 'اترفض من غير سبب مكتوب — عدّل وقدّم تاني.' : 'Rejected without a written reason — revise and resubmit.'}</p>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {canResubmit && (
                        <button
                          type="button"
                          disabled={submittingId === p.id}
                          onClick={() => resubmit(p)}
                          className="inline-flex items-center gap-1.5 rounded-full bg-estate-gold px-3 py-1.5 text-xs font-bold text-[#0F1A2C] transition-colors hover:bg-estate-gold/90 disabled:opacity-50"
                        >
                          {submittingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          {ar ? (p.approvalStatus === 'REJECTED' ? 'قدّم تاني' : 'ابعت للمراجعة') : (p.approvalStatus === 'REJECTED' ? 'Resubmit' : 'Send for review')}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={duplicatingId === p.id}
                        onClick={() => duplicate(p)}
                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:border-estate-gold/40 hover:text-white disabled:opacity-50"
                      >
                        {duplicatingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                        {ar ? 'انسخ' : 'Duplicate'}
                      </button>
                      {(p.approvalStatus === 'PUBLISHED' || p.approvalStatus === 'HIDDEN') && (
                        <button
                          type="button"
                          disabled={hidingId === p.id}
                          onClick={() => toggleVisibility(p)}
                          className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:border-estate-gold/40 hover:text-white disabled:opacity-50"
                        >
                          {hidingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <EyeOff className="h-3.5 w-3.5" />}
                          {p.approvalStatus === 'PUBLISHED' ? (ar ? 'اخفي' : 'Hide') : (ar ? 'انشر' : 'Publish')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : p.id)}
                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:border-estate-gold/40 hover:text-white"
                        aria-expanded={expanded}
                      >
                        {ar ? 'إدارة المشروع' : 'Manage'}
                        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
                      </button>
                    </div>
                    <div className="mt-2">
                      <PreviewActions projectId={p.id} projectName={p.name} />
                    </div>

                    {expanded && (
                      <div className="mt-3 space-y-4 border-t border-white/10 pt-3">
                        <ProjectStats projectId={p.id} />
                        <ProjectCompletion slug={p.slug} />
                        <ProjectInventory projectId={p.id} slug={p.slug} projectName={p.name} />
                        <CsvImport projectId={p.id} projectName={p.name} />
                        <BulkImages projectId={p.id} slug={p.slug} projectName={p.name} />
                        <ProjectActivity projectId={p.id} />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Panel>
    </div>
  )
}

/* ─── Submit-new-project form (full page) ────────────
   Shared inner component: same fields/validation/submit logic and POST
   contract as the old cramped modal — now rendered as a spacious page
   with every section expanded. The modal is gone; entry points link to
   /developer/submit which renders this. */

// Spacious presentation switch for the shared presentational bits below
// (StepSection/Field/Chip/Hint). Default false so every other usage
// (units/plans managers, …) keeps its compact look.
const SpaciousCtx = createContext(false)

// Full value sets mirror `propertyFilterSchema` (src/lib/validations.ts) +
// quick-filters — picked as chips, never typed free-hand.
const ALL_PROPERTY_TYPES: { value: string; labelAr: string }[] = [
  { value: 'APARTMENT', labelAr: 'شقة' },
  { value: 'VILLA', labelAr: 'فيلا' },
  { value: 'TOWNHOUSE', labelAr: 'تاونهاوس' },
  { value: 'DUPLEX', labelAr: 'دوبلكس' },
  { value: 'PENTHOUSE', labelAr: 'بنتهاوس' },
  { value: 'STUDIO', labelAr: 'استوديو' },
  { value: 'CHALET', labelAr: 'شاليه' },
  { value: 'LAND', labelAr: 'أرض' },
  { value: 'COMMERCIAL', labelAr: 'تجاري' },
  { value: 'ADMINISTRATIVE', labelAr: 'إداري' },
  { value: 'MEDICAL', labelAr: 'طبي' },
]

const ALL_LISTING_TYPES: { value: string; labelAr: string }[] = [
  { value: 'SALE', labelAr: 'بيع' },
  { value: 'RENT', labelAr: 'إيجار' },
  { value: 'RESALE', labelAr: 'إعادة بيع' },
  { value: 'INSTALLMENT', labelAr: 'تقسيط' },
]

const NUM_LABEL_AR: Record<string, string> = {
  startPrice: 'أول سعر',
  endPrice: 'آخر سعر',
  pricePerSqm: 'سعر المتر',
  totalUnits: 'عدد الوحدات',
  totalArea: 'إجمالي المساحة',
  downPaymentMin: 'أقل مقدم',
  installmentYears: 'سنين التقسيط',
  compoundArea: 'مساحة الكمبوند',
  completionPercent: 'نسبة الإنجاز',
  latitude: 'خط العرض',
  longitude: 'خط الطول',
}

type GeoGovernorate = { id: string; name: string; nameArabic: string | null }
type GeoCity = { id: string; name: string; nameArabic: string | null; governorateId: string }
type GeoDistrict = { id: string; name: string; nameArabic: string | null; cityId: string }

const URL_LIKE = /^(https?:\/\/|\/)/i

export function SubmitProjectForm({ onCreated }: { onCreated: (row: ProjectRow) => void }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  // 1) أساسيات
  const [name, setName] = useState('')
  const [nameArabic, setNameArabic] = useState('')
  const [status, setStatus] = useState<string>('COMING_SOON')
  const [tagline, setTagline] = useState('')
  const [taglineArabic, setTaglineArabic] = useState('')
  const [description, setDescription] = useState('')
  const [descriptionArabic, setDescriptionArabic] = useState('')
  // 2) الموقع — cascading dropdowns from GET /api/geo (same IDs POST contract).
  const [governorateId, setGovernorateId] = useState('')
  const [cityId, setCityId] = useState('')
  const [districtId, setDistrictId] = useState('')
  const [geoGovs, setGeoGovs] = useState<GeoGovernorate[]>([])
  const [geoCities, setGeoCities] = useState<GeoCity[]>([])
  const [geoDistricts, setGeoDistricts] = useState<GeoDistrict[]>([])
  const [geoLoading, setGeoLoading] = useState(true)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [geoRetry, setGeoRetry] = useState(0)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setGeoLoading(true)
      setGeoError(null)
      try {
        const res = await fetch('/api/geo')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as {
          governorates?: GeoGovernorate[]
          cities?: GeoCity[]
          districts?: GeoDistrict[]
        }
        if (cancelled) return
        setGeoGovs(Array.isArray(data.governorates) ? data.governorates : [])
        setGeoCities(Array.isArray(data.cities) ? data.cities : [])
        setGeoDistricts(Array.isArray(data.districts) ? data.districts : [])
      } catch {
        if (!cancelled) setGeoError(ar ? 'معرفناش نجيب المحافظات والمدن — اكتب الـ IDs يدوي أو حاول تاني.' : 'Could not load governorates/cities — type the IDs manually or retry.')
      } finally {
        if (!cancelled) setGeoLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
    // Fetch once when the submit dialog opens; geoRetry re-triggers. `ar` excluded on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoRetry])

  const geoFailed = !geoLoading && geoError !== null
  const cityOptions = useMemo(
    () => (governorateId ? geoCities.filter((c) => c.governorateId === governorateId) : geoCities),
    [geoCities, governorateId]
  )
  const districtOptions = useMemo(
    () => (cityId ? geoDistricts.filter((d) => d.cityId === cityId) : geoDistricts),
    [geoDistricts, cityId]
  )
  const geoName = (name: string, nameArabic: string | null): string =>
    ar ? nameArabic || name : name
  const selectedGov = geoGovs.find((g) => g.id === governorateId)
  const selectedCity = geoCities.find((c) => c.id === cityId)
  const selectedDistrict = geoDistricts.find((d) => d.id === districtId)
  const govDisplay = selectedGov ? geoName(selectedGov.name, selectedGov.nameArabic) : governorateId.trim()
  const cityDisplay = selectedCity ? geoName(selectedCity.name, selectedCity.nameArabic) : cityId.trim()
  const districtDisplay = selectedDistrict ? geoName(selectedDistrict.name, selectedDistrict.nameArabic) : districtId.trim()
  const placePreview = districtDisplay || cityDisplay
  const [address, setAddress] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [googleMapsUrl, setGoogleMapsUrl] = useState('')
  // 3) الأنواع والأرقام
  const [propertyTypes, setPropertyTypes] = useState<string[]>([])
  const [listingTypes, setListingTypes] = useState<string[]>([])
  const [totalUnits, setTotalUnits] = useState('')
  const [totalArea, setTotalArea] = useState('')
  const [compoundArea, setCompoundArea] = useState('')
  const [completionPercent, setCompletionPercent] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [deliveryTerms, setDeliveryTerms] = useState('')
  // 4) الأسعار
  const [startPrice, setStartPrice] = useState('')
  const [endPrice, setEndPrice] = useState('')
  const [pricePerSqm, setPricePerSqm] = useState('')
  const [downPaymentMin, setDownPaymentMin] = useState('')
  const [installmentYears, setInstallmentYears] = useState('')
  // 5) الميديا والسيو
  const [coverImage, setCoverImage] = useState('')
  const [coverBroken, setCoverBroken] = useState(false)
  const [galleryText, setGalleryText] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [virtualTourUrl, setVirtualTourUrl] = useState('')
  const [metaTitle, setMetaTitle] = useState('')
  const [metaDescription, setMetaDescription] = useState('')
  const [keywordsText, setKeywordsText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 2) Autosave draft (localStorage) — restored once when the dialog opens,
  // persisted on every keystroke, NEVER auto-submitted (submit only fires
  // from the review-step button). Cleared on successful submit or manually.
  const [draftRestored, setDraftRestored] = useState(false)
  useEffect(() => {
    const d = readSubmitDraft()
    if (!d) return
    const pick = (k: string, set: (v: string) => void) => {
      const v = typeof d[k] === 'string' ? (d[k] as string) : ''
      if (v) set(v)
    }
    pick('name', setName)
    pick('nameArabic', setNameArabic)
    pick('tagline', setTagline)
    pick('taglineArabic', setTaglineArabic)
    pick('description', setDescription)
    pick('descriptionArabic', setDescriptionArabic)
    pick('governorateId', setGovernorateId)
    pick('cityId', setCityId)
    pick('districtId', setDistrictId)
    pick('address', setAddress)
    pick('latitude', setLatitude)
    pick('longitude', setLongitude)
    pick('googleMapsUrl', setGoogleMapsUrl)
    pick('totalUnits', setTotalUnits)
    pick('totalArea', setTotalArea)
    pick('compoundArea', setCompoundArea)
    pick('completionPercent', setCompletionPercent)
    pick('deliveryDate', setDeliveryDate)
    pick('deliveryTerms', setDeliveryTerms)
    pick('startPrice', setStartPrice)
    pick('endPrice', setEndPrice)
    pick('pricePerSqm', setPricePerSqm)
    pick('downPaymentMin', setDownPaymentMin)
    pick('installmentYears', setInstallmentYears)
    pick('coverImage', setCoverImage)
    pick('galleryText', setGalleryText)
    pick('videoUrl', setVideoUrl)
    pick('virtualTourUrl', setVirtualTourUrl)
    pick('metaTitle', setMetaTitle)
    pick('metaDescription', setMetaDescription)
    pick('keywordsText', setKeywordsText)
    pick('desc', setStatus)
    if (Array.isArray(d.propertyTypes)) setPropertyTypes(d.propertyTypes.filter((x): x is string => typeof x === 'string'))
    if (Array.isArray(d.listingTypes)) setListingTypes(d.listingTypes.filter((x): x is string => typeof x === 'string'))
    setDraftRestored(true)
    // Restore once on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    try {
      window.localStorage.setItem(
        SUBMIT_DRAFT_KEY,
        JSON.stringify({
          name, nameArabic, desc: status, tagline, taglineArabic, description, descriptionArabic,
          governorateId, cityId, districtId, address, latitude, longitude, googleMapsUrl,
          propertyTypes, listingTypes, totalUnits, totalArea, compoundArea, completionPercent,
          deliveryDate, deliveryTerms, startPrice, endPrice, pricePerSqm, downPaymentMin,
          installmentYears, coverImage, galleryText, videoUrl, virtualTourUrl, metaTitle,
          metaDescription, keywordsText,
        })
      )
    } catch {
      // Quota/private mode — the draft simply stays in memory.
    }
  }, [name, nameArabic, status, tagline, taglineArabic, description, descriptionArabic, governorateId, cityId, districtId, address, latitude, longitude, googleMapsUrl, propertyTypes, listingTypes, totalUnits, totalArea, compoundArea, completionPercent, deliveryDate, deliveryTerms, startPrice, endPrice, pricePerSqm, downPaymentMin, installmentYears, coverImage, galleryText, videoUrl, virtualTourUrl, metaTitle, metaDescription, keywordsText])
  const clearDraft = () => {
    setName(''); setNameArabic(''); setStatus('COMING_SOON'); setTagline(''); setTaglineArabic('')
    setDescription(''); setDescriptionArabic(''); setGovernorateId(''); setCityId(''); setDistrictId('')
    setAddress(''); setLatitude(''); setLongitude(''); setGoogleMapsUrl('')
    setPropertyTypes([]); setListingTypes([]); setTotalUnits(''); setTotalArea('')
    setCompoundArea(''); setCompletionPercent(''); setDeliveryDate(''); setDeliveryTerms('')
    setStartPrice(''); setEndPrice(''); setPricePerSqm(''); setDownPaymentMin(''); setInstallmentYears('')
    setCoverImage(''); setCoverBroken(false); setGalleryText(''); setVideoUrl(''); setVirtualTourUrl('')
    setMetaTitle(''); setMetaDescription(''); setKeywordsText(''); setDraftRestored(false)
    try { window.localStorage.removeItem(SUBMIT_DRAFT_KEY) } catch { /* noop */ }
  }

  const numOrUndef = (v: string): number | undefined => {
    const t = v.trim()
    if (!t) return undefined
    const n = Number(t)
    return Number.isFinite(n) ? n : NaN
  }

  // Parsed numbers — same field names as POST /api/developer/projects.
  const nums: Record<string, number | undefined> = {
    startPrice: numOrUndef(startPrice),
    endPrice: numOrUndef(endPrice),
    pricePerSqm: numOrUndef(pricePerSqm),
    totalUnits: numOrUndef(totalUnits),
    totalArea: numOrUndef(totalArea),
    downPaymentMin: numOrUndef(downPaymentMin),
    installmentYears: numOrUndef(installmentYears),
    compoundArea: numOrUndef(compoundArea),
    completionPercent: numOrUndef(completionPercent),
    latitude: numOrUndef(latitude),
    longitude: numOrUndef(longitude),
  }

  const galleryUrls = galleryText.split('\n').map((l) => l.trim()).filter(Boolean)
  const keywordsArr = keywordsText.split(/[,\n]/).map((k) => k.trim()).filter(Boolean)

  // Live validation summary — required (name) + bad numbers/URLs.
  const missing: string[] = []
  const invalid: string[] = []
  if (!name.trim()) missing.push(ar ? 'اسم المشروع' : 'Project name')
  else if (name.trim().length > 200) invalid.push(ar ? 'اسم المشروع (أكتر من ٢٠٠ حرف)' : 'Project name (over 200 chars)')
  const checkNum = (key: string, min: number, max: number, int?: boolean) => {
    const v = nums[key]
    if (v === undefined) return
    if (!Number.isFinite(v) || v < min || v > max || (int && !Number.isInteger(v))) {
      invalid.push(ar ? NUM_LABEL_AR[key] || key : key)
    }
  }
  checkNum('startPrice', 0, 1_000_000_000_000)
  checkNum('endPrice', 0, 1_000_000_000_000)
  checkNum('pricePerSqm', 0, 1_000_000_000_000)
  checkNum('totalUnits', 0, 1_000_000_000, true)
  checkNum('totalArea', 0, 1_000_000_000_000)
  checkNum('compoundArea', 0, 1_000_000_000_000)
  checkNum('completionPercent', 0, 100, true)
  checkNum('downPaymentMin', 0, 100)
  checkNum('installmentYears', 0, 30, true)
  checkNum('latitude', -90, 90)
  checkNum('longitude', -180, 180)
  const urlFields: [string, string][] = [
    [coverImage, ar ? 'صورة الغلاف' : 'Cover image'],
    [videoUrl, ar ? 'الفيديو' : 'Video'],
    [virtualTourUrl, ar ? 'الجولة الافتراضية' : 'Virtual tour'],
    [googleMapsUrl, ar ? 'لوكيشن الخرايط' : 'Maps URL'],
  ]
  for (const [v, label] of urlFields) {
    if (v.trim() && !URL_LIKE.test(v.trim())) invalid.push(label)
  }
  galleryUrls.forEach((u, i) => {
    if (!URL_LIKE.test(u)) invalid.push(`${ar ? 'صورة المعرض' : 'Gallery'} #${i + 1}`)
  })
  const hasProblems = missing.length > 0 || invalid.length > 0

  const numErr = (key: string, min: number, max: number, int?: boolean): string | null => {
    const v = nums[key]
    if (v === undefined) return null
    if (!Number.isFinite(v) || v < min || v > max || (int && !Number.isInteger(v))) {
      return ar
        ? `مش مظبوط — لازم رقم${int ? ' صحيح' : ''} بين ${min} و ${max}.`
        : `Invalid — must be a${int ? ' whole' : ''} number between ${min} and ${max}.`
    }
    return null
  }
  const urlErr = (v: string): string | null =>
    v.trim() && !URL_LIKE.test(v.trim())
      ? (ar ? 'اللينك لازم يبدأ بـ https://' : 'URL must start with https://')
      : null

  const fieldErr: Record<string, string | null> = {
    startPrice: numErr('startPrice', 0, 1_000_000_000_000),
    endPrice: numErr('endPrice', 0, 1_000_000_000_000),
    pricePerSqm: numErr('pricePerSqm', 0, 1_000_000_000_000),
    totalUnits: numErr('totalUnits', 0, 1_000_000_000, true),
    totalArea: numErr('totalArea', 0, 1_000_000_000_000),
    compoundArea: numErr('compoundArea', 0, 1_000_000_000_000),
    completionPercent: numErr('completionPercent', 0, 100, true),
    downPaymentMin: numErr('downPaymentMin', 0, 100),
    installmentYears: numErr('installmentYears', 0, 30, true),
    latitude: numErr('latitude', -90, 90),
    longitude: numErr('longitude', -180, 180),
    coverImage: urlErr(coverImage),
    videoUrl: urlErr(videoUrl),
    virtualTourUrl: urlErr(virtualTourUrl),
    googleMapsUrl: urlErr(googleMapsUrl),
  }
  const galleryBad = galleryUrls.filter((u) => !URL_LIKE.test(u)).length

  const toggleIn = (list: string[], v: string, set: (next: string[]) => void) => {
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  }

  // Review data: every filled field + which optionals were left empty.
  const rows: { label: string; value: string }[] = []
  const emptyOptionals: string[] = []
  const put = (label: string, v: string) => {
    if (v.trim()) rows.push({ label, value: v.trim() })
    else emptyOptionals.push(label)
  }
  const putNum = (label: string, key: string, suffix?: string) => {
    const v = nums[key]
    if (v !== undefined && Number.isFinite(v)) {
      rows.push({ label, value: `${v.toLocaleString('en-US')}${suffix ? ` ${suffix}` : ''}` })
    } else emptyOptionals.push(label)
  }
  put(ar ? 'اسم المشروع *' : 'Project name *', name)
  put(ar ? 'الاسم بالعربي' : 'Arabic name', nameArabic)
  rows.push({ label: ar ? 'الحالة' : 'Status', value: ar ? PROJECT_STATUS_AR[status] || status : status })
  put(ar ? 'سطر تعريفي' : 'Tagline', tagline)
  put(ar ? 'سطر تعريفي (عربي)' : 'Tagline (Arabic)', taglineArabic)
  put(ar ? 'الوصف' : 'Description', description)
  put(ar ? 'الوصف (عربي)' : 'Description (Arabic)', descriptionArabic)
  put(ar ? 'المحافظة' : 'Governorate', govDisplay)
  put(ar ? 'المدينة' : 'City', cityDisplay)
  put(ar ? 'الحي' : 'District', districtDisplay)
  put(ar ? 'العنوان' : 'Address', address)
  putNum(ar ? 'خط العرض' : 'Latitude', 'latitude')
  putNum(ar ? 'خط الطول' : 'Longitude', 'longitude')
  put(ar ? 'لوكيشن الخرايط' : 'Maps URL', googleMapsUrl)
  if (propertyTypes.length > 0) {
    rows.push({ label: ar ? 'أنواع الوحدات' : 'Property types', value: propertyTypes.join(ar ? '، ' : ', ') })
  } else emptyOptionals.push(ar ? 'أنواع الوحدات' : 'Property types')
  if (listingTypes.length > 0) {
    rows.push({ label: ar ? 'أنواع الإعلان' : 'Listing types', value: listingTypes.join(ar ? '، ' : ', ') })
  } else emptyOptionals.push(ar ? 'أنواع الإعلان' : 'Listing types')
  putNum(ar ? 'عدد الوحدات' : 'Total units', 'totalUnits')
  putNum(ar ? 'إجمالي المساحة (م²)' : 'Total area (sqm)', 'totalArea')
  putNum(ar ? 'مساحة الكمبوند (م²)' : 'Compound area (sqm)', 'compoundArea')
  putNum(ar ? 'نسبة الإنجاز (%)' : 'Completion (%)', 'completionPercent')
  put(ar ? 'معاد التسليم' : 'Delivery date', deliveryDate)
  put(ar ? 'شروط التسليم' : 'Delivery terms', deliveryTerms)
  putNum(ar ? 'أول سعر (جنيه)' : 'Starting price (EGP)', 'startPrice')
  putNum(ar ? 'آخر سعر (جنيه)' : 'End price (EGP)', 'endPrice')
  putNum(ar ? 'سعر المتر (جنيه)' : 'Price per sqm (EGP)', 'pricePerSqm')
  putNum(ar ? 'أقل مقدم (%)' : 'Min down payment (%)', 'downPaymentMin')
  putNum(ar ? 'سنين التقسيط' : 'Installment years', 'installmentYears')
  put(ar ? 'صورة الغلاف' : 'Cover image', coverImage)
  if (galleryUrls.length > 0) {
    rows.push({ label: ar ? `المعرض (${galleryUrls.length})` : `Gallery (${galleryUrls.length})`, value: galleryUrls.join(ar ? '، ' : ', ') })
  } else emptyOptionals.push(ar ? 'المعرض' : 'Gallery')
  put(ar ? 'الفيديو' : 'Video', videoUrl)
  put(ar ? 'الجولة الافتراضية' : 'Virtual tour', virtualTourUrl)
  put(ar ? 'عنوان السيو' : 'Meta title', metaTitle)
  put(ar ? 'وصف السيو' : 'Meta description', metaDescription)
  if (keywordsArr.length > 0) {
    rows.push({ label: ar ? 'كلمات السيو' : 'Keywords', value: keywordsArr.join(ar ? '، ' : ', ') })
  } else emptyOptionals.push(ar ? 'كلمات السيو' : 'Keywords')

  const STEPS = [
    { id: 'basics', label: ar ? 'أساسيات' : 'Basics' },
    { id: 'location', label: ar ? 'الموقع' : 'Location' },
    { id: 'types', label: ar ? 'الأنواع والأرقام' : 'Types & figures' },
    { id: 'pricing', label: ar ? 'الأسعار' : 'Pricing' },
    { id: 'media', label: ar ? 'الميديا والسيو' : 'Media & SEO' },
    { id: 'review', label: ar ? 'مراجعة وإرسال' : 'Review & send' },
  ]

  const submit = async () => {
    setError(null)
    if (hasProblems) {
      const bits: string[] = []
      if (missing.length > 0) bits.push(`${ar ? 'ناقص' : 'Missing'}: ${missing.join(ar ? '، ' : ', ')}`)
      if (invalid.length > 0) bits.push(`${ar ? 'راجع' : 'Check'}: ${invalid.join(ar ? '، ' : ', ')}`)
      setError(bits.join(' — '))
      if (typeof document !== 'undefined') document.getElementById('sec-review')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    setBusy(true)
    try {
      // Same POST /api/developer/projects contract: same fields, 201.
      const body: Record<string, unknown> = { name: name.trim(), status }
      const opt: Record<string, unknown> = {
        nameArabic: nameArabic.trim() || undefined,
        tagline: tagline.trim() || undefined,
        taglineArabic: taglineArabic.trim() || undefined,
        description: description.trim() || undefined,
        descriptionArabic: descriptionArabic.trim() || undefined,
        governorateId: governorateId.trim() || undefined,
        cityId: cityId.trim() || undefined,
        districtId: districtId.trim() || undefined,
        address: address.trim() || undefined,
        deliveryDate: deliveryDate.trim() || undefined,
        deliveryTerms: deliveryTerms.trim() || undefined,
        videoUrl: videoUrl.trim() || undefined,
        virtualTourUrl: virtualTourUrl.trim() || undefined,
        googleMapsUrl: googleMapsUrl.trim() || undefined,
        coverImage: coverImage.trim() || undefined,
        metaTitle: metaTitle.trim() || undefined,
        metaDescription: metaDescription.trim() || undefined,
        ...(propertyTypes.length > 0 ? { propertyTypes } : {}),
        ...(listingTypes.length > 0 ? { listingTypes } : {}),
        ...(galleryUrls.length > 0 ? { gallery: galleryUrls } : {}),
        ...(keywordsArr.length > 0 ? { keywords: keywordsArr } : {}),
      }
      for (const [k, v] of Object.entries(nums)) {
        if (v !== undefined) opt[k] = v
      }
      for (const [k, v] of Object.entries(opt)) {
        if (v !== undefined) body[k] = v
      }
      const { ok, status: code, data } = await mut('/api/developer/projects', 'POST', body)
      if (!ok || !data?.project) {
        setError(friendlyError(apiErrorMessage(data, code), ar))
        return
      }
      try { window.localStorage.removeItem(SUBMIT_DRAFT_KEY) } catch { /* noop */ }
      onCreated(toProjectRow(data.project as Record<string, unknown>))
    } catch {
      setError(ar ? 'معرفناش نبعت المشروع — حاول تاني.' : 'Failed to submit the project — please retry.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SpaciousCtx.Provider value={true}>
      <div>
        <div className="mb-8">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl dark:text-white">{ar ? 'قدّم مشروع جديد' : 'Submit new project'}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-500 sm:text-base dark:text-gray-400">
              {ar ? 'املا الأقسام اللي تحت براحتك — كلها مفتوحة قدامك، والمعاينة على الجنب بتتحدث مع كل حرف بتكتبه.' : 'Fill in the sections below at your own pace — everything stays open, and the side preview updates with every keystroke.'}
            </p>
            <p className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm leading-relaxed text-amber-700 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
              {ar ? 'بينزل PENDING للمراجعة — مش هيظهر للناس إلا بعد الموافقة.' : 'Goes in as PENDING for review — stays invisible until approved.'}
            </p>
            <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-500">
              <span>
                {draftRestored
                  ? (ar ? 'رجّعنا مسودتك المحفوظة — كمّل عادي، ومبتتبعتش لوحدها.' : 'Restored your saved draft — carry on; it never submits itself.')
                  : (ar ? 'مسودتك بتتحفظ تلقائياً على جهازك — ومبتتبعتش لوحدها.' : 'Your draft autosaves on this device — it never submits itself.')}
              </span>
              <button type="button" onClick={clearDraft} className="rounded-full border border-gray-200 px-2.5 py-0.5 font-medium text-gray-500 transition-colors hover:border-red-400/50 hover:text-red-500 dark:border-white/10 dark:text-gray-400">
                {ar ? 'امسح المسودة' : 'Clear draft'}
              </button>
            </p>
          </div>
        </div>

        {error && (
          <p className="mb-4 flex items-start gap-2 rounded-2xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {error}
          </p>
        )}

        {/* Section anchors — every section below stays expanded and visible */}
        <nav aria-label={ar ? 'أقسام الاستمارة' : 'Form sections'} className="mb-10 flex flex-wrap gap-2.5">
          {STEPS.map((s, i) => (
            <a
              key={s.id}
              href={`#sec-${s.id}`}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm transition-colors hover:border-estate-gold/60 hover:text-gray-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-300 dark:hover:text-white"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-estate-gold/15 text-xs font-bold text-estate-gold">
                {i + 1}
              </span>
              {s.label}
            </a>
          ))}
        </nav>

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          {/* Form column — every section expanded and visible */}
          <div className="min-w-0 space-y-10 [&_input]:px-4 [&_input]:py-3.5 [&_input]:text-base [&_select]:px-4 [&_select]:py-3.5 [&_select]:text-base [&_textarea]:px-4 [&_textarea]:py-3.5 [&_textarea]:text-base">
            <section id="sec-basics" aria-label={ar ? 'أساسيات' : 'Basics'} className="scroll-mt-24">
              <StepSection title={ar ? 'أساسيات' : 'Basics'} hint={ar ? 'الاسم هو بس اللي إجباري (*) — الباقي يكمّل شكل المشروع.' : 'Only the name is required (*) — the rest fleshes out the project.'}>
                <Field label={ar ? 'اسم المشروع *' : 'Project name *'} className="sm:col-span-2">
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder={ar ? 'مثال: غاية ريزيدنس' : 'e.g. Ghaya Residence'} className={inputCls} />
                </Field>
                <Field label={ar ? 'الاسم بالعربي' : 'Arabic name'}>
                  <input value={nameArabic} onChange={(e) => setNameArabic(e.target.value)} placeholder={ar ? 'مثال: غاية ريزيدنس' : 'Arabic name'} className={inputCls} />
                </Field>
                <Field label={ar ? 'الحالة' : 'Status'}>
                  <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
                    {PROJECT_STATUSES.map((s) => (
                      <option key={s} value={s} className="bg-white dark:bg-[#0d1626]">{ar ? PROJECT_STATUS_AR[s] : s.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </Field>
                <Field label={ar ? 'سطر تعريفي' : 'Tagline'} className="sm:col-span-2">
                  <input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder={ar ? 'سطر واحد يشد' : 'One catchy line'} className={inputCls} />
                </Field>
                <Field label={ar ? 'سطر تعريفي (عربي)' : 'Tagline (Arabic)'} className="sm:col-span-2">
                  <input value={taglineArabic} onChange={(e) => setTaglineArabic(e.target.value)} placeholder={ar ? 'سطر واحد يشد بالعربي' : 'Arabic tagline'} className={inputCls} />
                </Field>
                <Field label={ar ? 'الوصف' : 'Description'} className="sm:col-span-2">
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} placeholder={ar ? 'احكي عن المشروع...' : 'Tell us about the project…'} className={inputCls} />
                </Field>
                <Field label={ar ? 'الوصف (عربي)' : 'Description (Arabic)'} className="sm:col-span-2">
                  <textarea value={descriptionArabic} onChange={(e) => setDescriptionArabic(e.target.value)} rows={5} placeholder={ar ? 'احكي عن المشروع بالعربي...' : 'Arabic description…'} className={inputCls} />
                </Field>
              </StepSection>
            </section>

            <section id="sec-location" aria-label={ar ? 'الموقع' : 'Location'} className="scroll-mt-24">
              <StepSection
                title={ar ? 'الموقع' : 'Location'}
                hint={ar ? 'اختر المحافظة وبعدين المدينة وبعدين الحي — كل اختيار بيفلتر اللي بعده. كلها اختيارية.' : 'Pick governorate, then city, then district — each choice filters the next. All optional.'}
              >
                {geoLoading && (
                  <p className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 sm:col-span-2" role="status">
                    <Loader2 className="h-4 w-4 animate-spin" /> {ar ? 'بيحمّل المحافظات والمدن...' : 'Loading governorates & cities...'}
                  </p>
                )}
                {geoFailed ? (
                  <>
                    <p className="flex flex-wrap items-center gap-2 rounded-2xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300 sm:col-span-2">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                      <span className="flex-1">{geoError}</span>
                      <button type="button" onClick={() => setGeoRetry((n) => n + 1)} className="rounded-full border border-red-500/30 px-3 py-1 font-medium hover:bg-red-500/10">
                        {ar ? 'حاول تاني' : 'Retry'}
                      </button>
                    </p>
                    <Field label={ar ? 'رقم المحافظة (ID)' : 'Governorate ID'}>
                      <input value={governorateId} onChange={(e) => setGovernorateId(e.target.value)} placeholder="cuid…" className={inputCls} dir="ltr" />
                    </Field>
                    <Field label={ar ? 'رقم المدينة (ID)' : 'City ID'}>
                      <input value={cityId} onChange={(e) => setCityId(e.target.value)} placeholder="cuid…" className={inputCls} dir="ltr" />
                    </Field>
                    <Field label={ar ? 'رقم الحي (ID)' : 'District ID'}>
                      <input value={districtId} onChange={(e) => setDistrictId(e.target.value)} placeholder="cuid…" className={inputCls} dir="ltr" />
                    </Field>
                  </>
                ) : (
                  <>
                    <Field label={ar ? 'المحافظة' : 'Governorate'}>
                      <select
                        value={governorateId}
                        disabled={geoLoading}
                        onChange={(e) => { setGovernorateId(e.target.value); setCityId(''); setDistrictId('') }}
                        className={inputCls}
                      >
                        <option value="">{ar ? 'اختار المحافظة (اختياري)' : 'Select governorate (optional)'}</option>
                        {governorateId && !geoGovs.some((g) => g.id === governorateId) && (
                          <option value={governorateId}>{governorateId}</option>
                        )}
                        {geoGovs.map((g) => (
                          <option key={g.id} value={g.id} className="bg-white dark:bg-[#0d1626]">{geoName(g.name, g.nameArabic)}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label={ar ? 'المدينة' : 'City'}>
                      <select
                        value={cityId}
                        disabled={geoLoading || !governorateId}
                        onChange={(e) => { setCityId(e.target.value); setDistrictId('') }}
                        className={inputCls}
                      >
                        <option value="">{governorateId ? (ar ? 'اختاري المدينة (اختياري)' : 'Select city (optional)') : (ar ? 'اختاري المحافظة الأول' : 'Pick a governorate first')}</option>
                        {cityId && !geoCities.some((c) => c.id === cityId) && (
                          <option value={cityId}>{cityId}</option>
                        )}
                        {cityOptions.map((c) => (
                          <option key={c.id} value={c.id} className="bg-white dark:bg-[#0d1626]">{geoName(c.name, c.nameArabic)}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label={ar ? 'الحي' : 'District'}>
                      <select
                        value={districtId}
                        disabled={geoLoading || !cityId}
                        onChange={(e) => setDistrictId(e.target.value)}
                        className={inputCls}
                      >
                        <option value="">{cityId ? (ar ? 'اختاري الحي (اختياري)' : 'Select district (optional)') : (ar ? 'اختاري المدينة الأول' : 'Pick a city first')}</option>
                        {districtId && !geoDistricts.some((d) => d.id === districtId) && (
                          <option value={districtId}>{districtId}</option>
                        )}
                        {districtOptions.map((d) => (
                          <option key={d.id} value={d.id} className="bg-white dark:bg-[#0d1626]">{geoName(d.name, d.nameArabic)}</option>
                        ))}
                      </select>
                    </Field>
                  </>
                )}
                <Field label={ar ? 'العنوان' : 'Address'}>
                  <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={ar ? 'الشارع / المنطقة' : 'Street / area'} className={inputCls} />
                </Field>
                <Field label={ar ? 'خط العرض' : 'Latitude'}>
                  <input value={latitude} onChange={(e) => setLatitude(e.target.value)} inputMode="decimal" placeholder="30.05" className={inputCls} dir="ltr" />
                  {fieldErr.latitude && <Hint text={fieldErr.latitude} />}
                </Field>
                <Field label={ar ? 'خط الطول' : 'Longitude'}>
                  <input value={longitude} onChange={(e) => setLongitude(e.target.value)} inputMode="decimal" placeholder="31.25" className={inputCls} dir="ltr" />
                  {fieldErr.longitude && <Hint text={fieldErr.longitude} />}
                </Field>
                <Field label={ar ? 'لوكيشن خرايط جوجل' : 'Google Maps URL'} className="sm:col-span-2">
                  <input value={googleMapsUrl} onChange={(e) => setGoogleMapsUrl(e.target.value)} placeholder="https://…" className={inputCls} dir="ltr" />
                  {fieldErr.googleMapsUrl && <Hint text={fieldErr.googleMapsUrl} />}
                </Field>
              </StepSection>
            </section>

            <section id="sec-types" aria-label={ar ? 'الأنواع والأرقام' : 'Types & figures'} className="scroll-mt-24">
              <StepSection title={ar ? 'الأنواع والأرقام' : 'Types & figures'} hint={ar ? 'دوس على أي نوع عشان تختاره — ممكن تختار أكتر من واحد.' : 'Tap any type to select it — multiple choices allowed.'}>
                <div className="sm:col-span-2">
                  <p className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">{ar ? 'أنواع الوحدات' : 'Property types'}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_PROPERTY_TYPES.map((t) => (
                      <Chip key={t.value} active={propertyTypes.includes(t.value)} onClick={() => toggleIn(propertyTypes, t.value, setPropertyTypes)}>
                        {ar ? t.labelAr : t.value.replace(/_/g, ' ')}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <p className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">{ar ? 'أنواع الإعلان' : 'Listing types'}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_LISTING_TYPES.map((t) => (
                      <Chip key={t.value} active={listingTypes.includes(t.value)} onClick={() => toggleIn(listingTypes, t.value, setListingTypes)}>
                        {ar ? t.labelAr : t.value}
                      </Chip>
                    ))}
                  </div>
                </div>
                <Field label={ar ? 'عدد الوحدات' : 'Total units'}>
                  <input value={totalUnits} onChange={(e) => setTotalUnits(e.target.value)} inputMode="numeric" placeholder="0" className={inputCls} />
                  {fieldErr.totalUnits && <Hint text={fieldErr.totalUnits} />}
                </Field>
                <Field label={ar ? 'إجمالي المساحة (م²)' : 'Total area (sqm)'}>
                  <input value={totalArea} onChange={(e) => setTotalArea(e.target.value)} inputMode="decimal" placeholder="0" className={inputCls} />
                  {fieldErr.totalArea && <Hint text={fieldErr.totalArea} />}
                </Field>
                <Field label={ar ? 'مساحة الكمبوند (م²)' : 'Compound area (sqm)'}>
                  <input value={compoundArea} onChange={(e) => setCompoundArea(e.target.value)} inputMode="decimal" placeholder="0" className={inputCls} />
                  {fieldErr.compoundArea && <Hint text={fieldErr.compoundArea} />}
                </Field>
                <Field label={ar ? 'نسبة الإنجاز (%)' : 'Completion (%)'}>
                  <input value={completionPercent} onChange={(e) => setCompletionPercent(e.target.value)} inputMode="decimal" placeholder="0" className={inputCls} />
                  {fieldErr.completionPercent && <Hint text={fieldErr.completionPercent} />}
                </Field>
                <Field label={ar ? 'معاد التسليم' : 'Delivery date'}>
                  <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className={inputCls} />
                </Field>
                <Field label={ar ? 'شروط التسليم' : 'Delivery terms'}>
                  <input value={deliveryTerms} onChange={(e) => setDeliveryTerms(e.target.value)} placeholder={ar ? 'مثال: نص تشطيب' : 'e.g. semi-finished'} className={inputCls} />
                </Field>
              </StepSection>
            </section>

            <section id="sec-pricing" aria-label={ar ? 'الأسعار' : 'Pricing'} className="scroll-mt-24">
              <StepSection title={ar ? 'الأسعار' : 'Pricing'} hint={ar ? 'كلها بالجنيه واختيارية — الفاضي مش بيتبعت أصلاً.' : 'All in EGP and optional — empties are omitted from the request.'}>
                <Field label={ar ? 'أول سعر (جنيه)' : 'Starting price (EGP)'}>
                  <input value={startPrice} onChange={(e) => setStartPrice(e.target.value)} inputMode="decimal" placeholder="0" className={inputCls} />
                  {fieldErr.startPrice && <Hint text={fieldErr.startPrice} />}
                </Field>
                <Field label={ar ? 'آخر سعر (جنيه)' : 'End price (EGP)'}>
                  <input value={endPrice} onChange={(e) => setEndPrice(e.target.value)} inputMode="decimal" placeholder="0" className={inputCls} />
                  {fieldErr.endPrice && <Hint text={fieldErr.endPrice} />}
                </Field>
                <Field label={ar ? 'سعر المتر (جنيه)' : 'Price per sqm (EGP)'}>
                  <input value={pricePerSqm} onChange={(e) => setPricePerSqm(e.target.value)} inputMode="decimal" placeholder="0" className={inputCls} />
                  {fieldErr.pricePerSqm && <Hint text={fieldErr.pricePerSqm} />}
                </Field>
                <Field label={ar ? 'أقل مقدم (%)' : 'Min down payment (%)'}>
                  <input value={downPaymentMin} onChange={(e) => setDownPaymentMin(e.target.value)} inputMode="decimal" placeholder="0" className={inputCls} />
                  {fieldErr.downPaymentMin && <Hint text={fieldErr.downPaymentMin} />}
                </Field>
                <Field label={ar ? 'سنين التقسيط' : 'Installment years'}>
                  <input value={installmentYears} onChange={(e) => setInstallmentYears(e.target.value)} inputMode="numeric" placeholder="0" className={inputCls} />
                  {fieldErr.installmentYears && <Hint text={fieldErr.installmentYears} />}
                </Field>
              </StepSection>
            </section>

            <section id="sec-media" aria-label={ar ? 'الميديا والسيو' : 'Media & SEO'} className="scroll-mt-24">
              <StepSection title={ar ? 'الميديا والسيو' : 'Media & SEO'} hint={ar ? 'الغلاف بيبان في المعاينة لحظة بلحظة — لو اللينك بايظ هتشوف صورة بديلة.' : 'The cover shows live in the preview — a broken link falls back to a placeholder.'}>
                <Field label={ar ? 'صورة الغلاف (لينك)' : 'Cover image (URL)'} className="sm:col-span-2">
                  <input value={coverImage} onChange={(e) => { setCoverImage(e.target.value); setCoverBroken(false) }} placeholder="https://…" className={inputCls} dir="ltr" />
                  {fieldErr.coverImage && <Hint text={fieldErr.coverImage} />}
                  {coverImage.trim() && !fieldErr.coverImage && (
                    <div className="mt-2 flex items-center gap-2">
                      <Image
                        src={coverBroken ? '/images/placeholder.jpg' : coverImage.trim()}
                        onError={() => setCoverBroken(true)}
                        alt=""
                        width={96}
                        height={56}
                        className="h-14 w-24 rounded-xl border border-gray-200 object-cover dark:border-white/10"
                      />
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">
                        {coverBroken
                          ? (ar ? 'اللينك ده مش شغال — هيظهر صورة بديلة.' : 'This URL looks dead — a placeholder will show.')
                          : (ar ? 'الصورة شغالة وتمام.' : 'Image loads fine.')}
                      </span>
                    </div>
                  )}
                </Field>
                <Field label={ar ? 'المعرض (لينك في كل سطر)' : 'Gallery (one URL per line)'} className="sm:col-span-2">
                  <textarea value={galleryText} onChange={(e) => setGalleryText(e.target.value)} rows={4} placeholder="https://…" className={inputCls} dir="ltr" />
                  {galleryUrls.length > 0 && (
                    <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                      {galleryBad > 0
                        ? (ar ? `${galleryBad} سطور مش لينكات سليمة.` : `${galleryBad} lines are not valid URLs.`)
                        : (ar ? `${galleryUrls.length} صور جاهزين.` : `${galleryUrls.length} images ready.`)}
                    </p>
                  )}
                </Field>
                <Field label={ar ? 'فيديو (لينك)' : 'Video (URL)'}>
                  <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://…" className={inputCls} dir="ltr" />
                  {fieldErr.videoUrl && <Hint text={fieldErr.videoUrl} />}
                </Field>
                <Field label={ar ? 'جولة افتراضية (لينك)' : 'Virtual tour (URL)'}>
                  <input value={virtualTourUrl} onChange={(e) => setVirtualTourUrl(e.target.value)} placeholder="https://…" className={inputCls} dir="ltr" />
                  {fieldErr.virtualTourUrl && <Hint text={fieldErr.virtualTourUrl} />}
                </Field>
                <Field label={ar ? 'عنوان السيو' : 'Meta title'} className="sm:col-span-2">
                  <input value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} placeholder={ar ? 'عنوان صفحة المشروع' : 'Project page title'} className={inputCls} />
                </Field>
                <Field label={ar ? 'وصف السيو' : 'Meta description'} className="sm:col-span-2">
                  <textarea value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} rows={3} placeholder={ar ? 'وصف قصير لجوجل...' : 'Short description for search…'} className={inputCls} />
                </Field>
                <Field label={ar ? 'كلمات السيو (افصل بفاصلة)' : 'Keywords (comma-separated)'} className="sm:col-span-2">
                  <input value={keywordsText} onChange={(e) => setKeywordsText(e.target.value)} placeholder={ar ? 'كمبوند، التجمع، ...' : 'compound, new cairo, …'} className={inputCls} />
                </Field>
              </StepSection>
            </section>

            <section id="sec-review" aria-label={ar ? 'مراجعة وإرسال' : 'Review & send'} className="scroll-mt-24">
              <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8 dark:border-white/10 dark:bg-white/[0.02]">
                <h4 className="text-xl font-bold text-gray-900 dark:text-white">{ar ? 'مراجعة وإرسال' : 'Review & send'}</h4>
                {hasProblems ? (
                  <div className="mt-5 rounded-2xl border border-red-500/25 bg-red-500/[0.07] p-5 text-sm leading-relaxed text-red-600 dark:text-red-300">
                    <p className="text-base font-bold">{ar ? 'لسه في حاجات ناقصة:' : 'Still needs attention:'}</p>
                    <ul className="mt-2 list-inside list-disc space-y-1">
                      {missing.length > 0 && <li>{ar ? 'ناقص' : 'Missing'}: {missing.join(ar ? '، ' : ', ')}</li>}
                      {invalid.length > 0 && <li>{ar ? 'أرقام/لينكات عايزة تتظبط' : 'Numbers/URLs to fix'}: {invalid.join(ar ? '، ' : ', ')}</li>}
                    </ul>
                    <p className="mt-2 text-xs opacity-80">{ar ? 'اطلع فوق واظبطهم — الأقسام كلها مفتوحة.' : 'Scroll up and fix them — every section is open.'}</p>
                  </div>
                ) : (
                  <p className="mt-5 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.07] p-5 text-sm leading-relaxed text-emerald-600 dark:text-emerald-300">
                    {ar ? 'تمام — كل الحقول المطلوبة سليمة. بص على المعاينة على الجنب واتأكد إن ده الشكل اللي عايزه.' : 'All good — every required field checks out. Glance at the side preview to confirm the look.'}
                  </p>
                )}
                <dl className="mt-5 divide-y divide-gray-100 rounded-2xl border border-gray-200 px-5 dark:divide-white/5 dark:border-white/10">
                  {rows.map((r) => (
                    <div key={r.label} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <dt className="shrink-0 text-sm text-gray-500 dark:text-gray-400">{r.label}</dt>
                      <dd className="break-words text-sm font-medium text-gray-900 sm:max-w-[62%] sm:text-end dark:text-white">{r.value}</dd>
                    </div>
                  ))}
                </dl>
                {emptyOptionals.length > 0 && (
                  <p className="mt-4 text-xs leading-relaxed text-gray-500 dark:text-gray-500">
                    {ar
                      ? `سيبت ${emptyOptionals.length} خانات اختيارية فاضية (${emptyOptionals.slice(0, 6).join('، ')}${emptyOptionals.length > 6 ? '…' : ''}) — عادي، تقدر تكملهم بعدين.`
                      : `You left ${emptyOptionals.length} optional fields empty (${emptyOptionals.slice(0, 6).join(', ')}${emptyOptionals.length > 6 ? '…' : ''}) — fine, you can fill them in later.`}
                  </p>
                )}
                <p className="mt-5 flex items-start gap-2 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm leading-relaxed text-amber-700 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
                  {ar ? 'لما تدوس «ابعت للمراجعة» المشروع هينزل PENDING ومش هيظهر للناس إلا بعد ما الإدارة (CEO) توافق عليه.' : 'Hitting “Send for review” puts the project in PENDING — it stays invisible to the public until the CEO approves it.'}
                </p>
              </div>
            </section>

            <div className="mt-10 rounded-3xl border border-estate-gold/25 bg-estate-gold/[0.05] p-6 sm:p-8 dark:bg-estate-gold/[0.04]">
              <p className="flex items-start gap-2 text-sm leading-relaxed text-amber-700 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
                {ar ? 'لما تدوس «ابعت للمراجعة» المشروع هينزل PENDING ومش هيظهر للناس إلا بعد ما الإدارة (CEO) توافق عليه.' : 'Hitting “Send for review” puts the project in PENDING — it stays invisible to the public until the CEO approves it.'}
              </p>
              {hasProblems && (
                <p className="mt-3 text-sm font-medium text-red-600 dark:text-red-300">
                  {ar ? 'كمّل النواقص اللي فوق الأول — قسم المراجعة فيه التفاصيل.' : 'Fill in the missing bits above first — the review section lists them.'}
                </p>
              )}
              <button
                type="button"
                onClick={submit}
                disabled={busy || hasProblems}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-estate-gold px-10 py-4 text-base font-bold text-[#0F1A2C] transition-colors hover:bg-estate-gold/90 disabled:opacity-50 sm:w-auto"
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                {ar ? 'ابعت للمراجعة' : 'Send for review'}
              </button>
            </div>
          </div>

          {/* Live preview column — sticky on desktop, first on mobile */}
          <div className="order-first lg:order-none lg:sticky lg:top-24">
            <SubmitPreview
              spacious
              ar={ar}
              name={name}
              nameArabic={nameArabic}
              status={status}
              place={placePreview || address.trim()}
              startPrice={nums.startPrice}
              totalUnits={nums.totalUnits}
              completionPercent={nums.completionPercent}
              cover={coverImage}
              coverBroken={coverBroken}
              onCoverError={() => setCoverBroken(true)}
              propertyTypes={propertyTypes}
              listingTypes={listingTypes}
            />
          </div>
        </div>
      </div>
    </SpaciousCtx.Provider>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  const spacious = useContext(SpaciousCtx)
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        spacious
          ? 'rounded-full border px-4 py-2.5 text-sm font-medium transition-colors'
          : 'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'border-estate-gold bg-estate-gold text-[#0F1A2C]'
          : 'border-gray-200 text-gray-600 hover:border-estate-gold/50 dark:border-white/10 dark:text-gray-300'
      )}
    >
      {children}
    </button>
  )
}

function StepSection({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  const spacious = useContext(SpaciousCtx)
  return (
    <div className={spacious ? 'rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8 dark:border-white/10 dark:bg-white/[0.02]' : undefined}>
      <h4 className={spacious ? 'text-xl font-bold text-gray-900 dark:text-white' : 'text-sm font-bold text-gray-900 dark:text-white'}>{title}</h4>
      {hint && <p className={spacious ? 'mt-1.5 max-w-2xl text-sm leading-relaxed text-gray-500 dark:text-gray-400' : 'mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400'}>{hint}</p>}
      <div className={spacious ? 'mt-6 grid gap-5 sm:grid-cols-2' : 'mt-3 grid gap-3 sm:grid-cols-2'}>{children}</div>
    </div>
  )
}

function Hint({ text }: { text: string }) {
  const spacious = useContext(SpaciousCtx)
  return <p className={spacious ? 'mt-1.5 text-xs text-red-500 dark:text-red-400' : 'mt-1 text-[11px] text-red-500 dark:text-red-400'}>{text}</p>
}

// Lightweight project-card mock driven by the live form state —
// deliberately NOT the real ProjectCard (that needs full server data).
function SubmitPreview({
  ar,
  name,
  nameArabic,
  status,
  place,
  startPrice,
  totalUnits,
  completionPercent,
  cover,
  coverBroken,
  onCoverError,
  propertyTypes,
  listingTypes,
  spacious,
}: {
  ar: boolean
  name: string
  nameArabic: string
  status: string
  place: string
  startPrice: number | undefined
  totalUnits: number | undefined
  completionPercent: number | undefined
  cover: string
  coverBroken: boolean
  onCoverError: () => void
  propertyTypes: string[]
  listingTypes: string[]
  spacious?: boolean
}) {
  const src = coverBroken || !cover.trim() ? '/images/placeholder.jpg' : cover.trim()
  const priceOk = typeof startPrice === 'number' && Number.isFinite(startPrice)
  const unitsOk = typeof totalUnits === 'number' && Number.isFinite(totalUnits)
  const pctOk = typeof completionPercent === 'number' && Number.isFinite(completionPercent)
  const badge = spacious ? 'px-2.5 py-1 text-[11px]' : 'px-2 py-0.5 text-[11px]'
  return (
    <div>
      <p className={spacious ? 'text-lg font-bold text-gray-900 dark:text-white' : 'text-xs font-bold text-gray-900 dark:text-white'}>{ar ? 'معاينة — ده شكل المشروع' : 'Preview — how your project will look'}</p>
      <p className={spacious ? 'mb-3 mt-1 text-sm text-gray-500 dark:text-gray-500' : 'mb-2 mt-0.5 text-[11px] text-gray-500 dark:text-gray-500'}>
        {ar ? '(شكل تقريبي خفيف من اللي بتكتبه، مش الكارت الحقيقي)' : '(Lightweight mock from what you type, not the real card)'}
      </p>
      <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-black/30">
        <div className="relative aspect-[16/9] bg-gray-200 dark:bg-white/5">
          <Image src={src} alt="" fill sizes="(max-width: 768px) 100vw, 50vw" onError={onCoverError} className="h-full w-full object-cover" />
          <span className="absolute left-3 top-3 rounded-full bg-amber-500/90 px-2.5 py-1 text-[11px] font-bold uppercase text-white">
            {ar ? 'مستني المراجعة' : 'Pending'}
          </span>
          <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-bold uppercase text-white">
            {ar ? PROJECT_STATUS_AR[status] || status : status.replace(/_/g, ' ')}
          </span>
        </div>
        <div className={spacious ? 'p-5' : 'p-3'}>
          <p className={spacious ? 'truncate text-lg font-bold text-gray-900 dark:text-white' : 'truncate text-sm font-semibold text-gray-900 dark:text-white'}>
            {name.trim() || (ar ? 'اسم المشروع هيظهر هنا' : 'Project name shows here')}
          </p>
          {nameArabic.trim() && <p className={spacious ? 'mt-0.5 truncate text-sm text-gray-500 dark:text-gray-400' : 'truncate text-xs text-gray-500 dark:text-gray-400'}>{nameArabic.trim()}</p>}
          <p className={spacious ? 'mt-1.5 flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-500' : 'mt-0.5 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-500'}>
            <MapPin className={spacious ? 'h-4 w-4 shrink-0' : 'h-3 w-3 shrink-0'} />
            <span className="truncate">{place || (ar ? 'المكان هيظهر هنا' : 'Location shows here')}</span>
          </p>
          <p className={spacious ? 'mt-2 text-xl font-bold text-estate-gold' : 'mt-1 text-sm font-bold text-estate-gold'}>
            {priceOk
              ? (ar ? `من ${formatEGP(Math.round(startPrice))}` : `from ${formatEGP(Math.round(startPrice))}`)
              : (ar ? 'السعر عند الطلب' : 'Price on request')}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {unitsOk && (
              <span className={cn('rounded-full bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300', badge)}>
                {ar ? `${totalUnits} وحدة` : `${totalUnits} units`}
              </span>
            )}
            {pctOk && (
              <span className={cn('rounded-full bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300', badge)}>
                {ar ? `إنجاز ${completionPercent}%` : `${completionPercent}% done`}
              </span>
            )}
            {propertyTypes.slice(0, 3).map((t) => (
              <span key={t} className={cn('rounded-full bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300', badge)}>
                {t.replace(/_/g, ' ')}
              </span>
            ))}
            {listingTypes.slice(0, 2).map((t) => (
              <span key={t} className={cn('rounded-full bg-estate-gold/15 font-medium text-estate-gold', badge)}>
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const inputCls =
  'w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-estate-gold/60 focus:outline-none dark:border-white/10 dark:bg-black/30 dark:text-white dark:placeholder:text-gray-500'

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  const spacious = useContext(SpaciousCtx)
  return (
    <label className={cn('block', className)}>
      <span className={spacious ? 'mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-200' : 'mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400'}>{label}</span>
      {children}
    </label>
  )
}

/* ─── Per-project units & payment-plans manager ────────── */

type InvUnit = {
  id: string
  name: string
  unitType: string
  listingType: string
  area: number | null
  price: number | null
  bedrooms: number | null
  bathrooms: number | null
  status: string
}

type InvMilestone = { name: string; percentage: number; monthNumber: number | null }

type InvPlan = {
  id: string
  name: string
  downPaymentPct: number | null
  installmentYears: number | null
  description: string | null
  milestones: InvMilestone[]
}

const UNIT_TYPES = ['APARTMENT', 'VILLA', 'TOWNHOUSE', 'DUPLEX', 'PENTHOUSE', 'STUDIO'] as const
const UNIT_TYPE_AR: Record<string, string> = {
  APARTMENT: 'شقة',
  VILLA: 'فيلا',
  TOWNHOUSE: 'تاونهاوس',
  DUPLEX: 'دوبلكس',
  PENTHOUSE: 'بنتهاوس',
  STUDIO: 'استوديو',
}
const LISTING_TYPES = ['SALE', 'RENT'] as const

function ProjectInventory({ projectId, slug, projectName }: { projectId: string; slug: string; projectName: string }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [section, setSection] = useState<'units' | 'plans'>('units')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [units, setUnits] = useState<InvUnit[]>([])
  const [plans, setPlans] = useState<InvPlan[]>([])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        // Owner-preview door: returns full units + paymentPlans even for
        // PENDING projects when the caller owns them.
        const res = await fetch(`/api/projects/${encodeURIComponent(slug)}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as {
          project?: { units?: Record<string, unknown>[]; paymentPlans?: Record<string, unknown>[] }
        }
        if (cancelled) return
        const rawUnits = data.project?.units ?? []
        const rawPlans = data.project?.paymentPlans ?? []
        setUnits(
          rawUnits.map((u) => ({
            id: String(u.id),
            name: String(u.name ?? ''),
            unitType: String(u.unitType ?? ''),
            listingType: String(u.listingType ?? ''),
            area: (u.area as number | null) ?? null,
            price: (u.price as number | null) ?? null,
            bedrooms: (u.bedrooms as number | null) ?? null,
            bathrooms: (u.bathrooms as number | null) ?? null,
            status: String(u.status ?? ''),
          }))
        )
        setPlans(
          rawPlans.map((p) => ({
            id: String(p.id),
            name: String(p.name ?? ''),
            downPaymentPct: (p.downPaymentPct as number | null) ?? null,
            installmentYears: (p.installmentYears as number | null) ?? null,
            description: (p.description as string | null) ?? null,
            milestones: Array.isArray(p.milestones)
              ? (p.milestones as Record<string, unknown>[]).map((m) => ({
                  name: String(m.name ?? ''),
                  percentage: Number(m.percentage ?? 0),
                  monthNumber: (m.monthNumber as number | null) ?? null,
                }))
              : [],
          }))
        )
      } catch {
        if (!cancelled) setError(ar ? 'معرفناش نجيب الوحدات وخطط الدفع — حاول تاني.' : 'Failed to load units & plans — retry.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, slug])

  return (
    <div>
      <div className="mb-3 flex gap-1 rounded-full border border-white/10 bg-black/30 p-1">
        {(
          [
            { id: 'units', label: ar ? 'الوحدات' : 'Units', icon: <Home className="h-3.5 w-3.5" /> },
            { id: 'plans', label: ar ? 'خطط الدفع' : 'Plans', icon: <CreditCard className="h-3.5 w-3.5" /> },
          ] as const
        ).map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              section === s.id ? 'bg-estate-gold text-[#0F1A2C]' : 'text-gray-400 hover:text-white'
            )}
          >
            {s.icon} {s.label} ({s.id === 'units' ? units.length : plans.length})
          </button>
        ))}
      </div>

      {loading ? (
        <p className="flex items-center justify-center gap-2 py-6 text-xs text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> {ar ? 'بيحمّل...' : 'Loading...'}
        </p>
      ) : error ? (
        <div className="py-4 text-center">
          <p className="text-xs text-red-300">{error}</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true)
              setError(null)
              fetch(`/api/projects/${encodeURIComponent(slug)}`)
                .then((r) => {
                  if (!r.ok) throw new Error()
                  return r.json()
                })
                .then((data: { project?: { units?: InvUnit[]; paymentPlans?: InvPlan[] } }) => {
                  setUnits((data.project?.units as InvUnit[]) ?? [])
                  setPlans((data.project?.paymentPlans as unknown as InvPlan[]) ?? [])
                })
                .catch(() => setError(ar ? 'معرفناش نجيب الوحدات وخطط الدفع — حاول تاني.' : 'Failed to load units & plans — retry.'))
                .finally(() => setLoading(false))
            }}
            className="mt-2 rounded-full border border-white/10 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/5"
          >
            {ar ? 'حاول تاني' : 'Retry'}
          </button>
        </div>
      ) : section === 'units' ? (
        <UnitsManager projectId={projectId} projectName={projectName} units={units} onChange={setUnits} />
      ) : (
        <PlansManager projectId={projectId} units={units} plans={plans} onChange={setPlans} />
      )}
    </div>
  )
}

function UnitsManager({
  projectId,
  projectName,
  units,
  onChange,
}: {
  projectId: string
  projectName: string
  units: InvUnit[]
  onChange: (next: InvUnit[]) => void
}) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [showAdd, setShowAdd] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  // Add form
  const [name, setName] = useState('')
  const [unitType, setUnitType] = useState<string>('APARTMENT')
  const [listingType, setListingType] = useState<string>('SALE')
  const [area, setArea] = useState('')
  const [price, setPrice] = useState('')
  const [bedrooms, setBedrooms] = useState('')
  const [bathrooms, setBathrooms] = useState('')
  // Edit form (name + price only — keeps it completable)
  const [editName, setEditName] = useState('')
  const [editPrice, setEditPrice] = useState('')

  const resetAdd = () => {
    setName('')
    setUnitType('APARTMENT')
    setListingType('SALE')
    setArea('')
    setPrice('')
    setBedrooms('')
    setBathrooms('')
  }

  const add = async () => {
    setError(null)
    if (!name.trim() || !area.trim() || !price.trim()) {
      setError(ar ? 'اكتب اسم الوحدة والمساحة والسعر.' : 'Enter unit name, area and price.')
      return
    }
    const areaN = Number(area)
    const priceN = Number(price)
    if (!Number.isFinite(areaN) || areaN <= 0 || !Number.isFinite(priceN) || priceN < 0) {
      setError(ar ? 'المساحة والسعر لازم يبقوا أرقام مظبوطة.' : 'Area and price must be valid numbers.')
      return
    }
    setBusy(true)
    try {
      const { ok, status, data } = await mut(`/api/developer/projects/${projectId}/units`, 'POST', {
        name: name.trim(),
        unitType,
        listingType,
        area: areaN,
        price: priceN,
        bedrooms: bedrooms.trim() ? Number(bedrooms) : undefined,
        bathrooms: bathrooms.trim() ? Number(bathrooms) : undefined,
      })
      if (!ok || !data?.unit) {
        setError(friendlyError(apiErrorMessage(data, status), ar))
        return
      }
      const u = data.unit as Record<string, unknown>
      onChange([
        {
          id: String(u.id),
          name: String(u.name ?? name.trim()),
          unitType: String(u.unitType ?? unitType),
          listingType: String(u.listingType ?? listingType),
          area: (u.area as number | null) ?? areaN,
          price: (u.price as number | null) ?? priceN,
          bedrooms: (u.bedrooms as number | null) ?? null,
          bathrooms: (u.bathrooms as number | null) ?? null,
          status: String(u.status ?? 'AVAILABLE'),
        },
        ...units,
      ])
      resetAdd()
      setShowAdd(false)
    } catch {
      setError(ar ? 'معرفناش نضيف الوحدة — حاول تاني.' : 'Failed to add the unit — retry.')
    } finally {
      setBusy(false)
    }
  }

  const saveEdit = async (id: string) => {
    setError(null)
    const patch: Record<string, unknown> = {}
    if (editName.trim()) patch.name = editName.trim()
    if (editPrice.trim()) {
      const n = Number(editPrice)
      if (!Number.isFinite(n) || n < 0) {
        setError(ar ? 'السعر لازم يبقى رقم موجب.' : 'Price must be a positive number.')
        return
      }
      patch.price = n
    }
    if (Object.keys(patch).length === 0) {
      setEditingId(null)
      return
    }
    setBusy(true)
    try {
      const { ok, status, data } = await mut(`/api/developer/projects/${projectId}/units`, 'PATCH', { id, ...patch })
      if (!ok || !data?.unit) {
        setError(friendlyError(apiErrorMessage(data, status), ar))
        return
      }
      const u = data.unit as Record<string, unknown>
      onChange(units.map((x) => (x.id === id ? { ...x, name: String(u.name ?? x.name), price: (u.price as number | null) ?? x.price } : x)))
      setEditingId(null)
    } catch {
      setError(ar ? 'معرفناش نحدّث الوحدة — حاول تاني.' : 'Failed to update the unit — retry.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (u: InvUnit) => {
    if (!confirm(ar ? `امسح الوحدة «${u.name}» من ${projectName}؟` : `Delete unit “${u.name}” from ${projectName}?`)) return
    setDeletingId(u.id)
    setError(null)
    try {
      const { ok, status, data } = await mut(`/api/developer/projects/${projectId}/units?id=${encodeURIComponent(u.id)}`, 'DELETE')
      if (!ok) {
        setError(friendlyError(apiErrorMessage(data, status), ar))
        return
      }
      // Soft-delete → HIDDEN: keep the row so the state stays truthful.
      onChange(units.map((x) => (x.id === u.id ? { ...x, status: 'HIDDEN' } : x)))
    } catch {
      setError(ar ? 'معرفناش نمسح الوحدة — حاول تاني.' : 'Failed to delete the unit — retry.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div>
      {error && (
        <p className="mb-3 flex items-start gap-2 rounded-2xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => { setError(null); setShowAdd(!showAdd) }}
        className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-estate-gold/40 px-3 py-1.5 text-xs font-bold text-estate-gold transition-colors hover:bg-estate-gold/10"
      >
        <Plus className="h-3.5 w-3.5" /> {ar ? 'زوّد وحدة' : 'Add unit'}
      </button>

      {showAdd && (
        <div className="mb-3 grid gap-2 rounded-2xl border border-white/10 bg-black/30 p-3 sm:grid-cols-2">
          <Field label={ar ? 'اسم الوحدة *' : 'Unit name *'} className="sm:col-span-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="A-101" className={inputCls} />
          </Field>
          <Field label={ar ? 'النوع *' : 'Type *'}>
            <select value={unitType} onChange={(e) => setUnitType(e.target.value)} className={inputCls}>
              {UNIT_TYPES.map((t) => (
                <option key={t} value={t} className="bg-[#0d1626]">{ar ? UNIT_TYPE_AR[t] : t}</option>
              ))}
            </select>
          </Field>
          <Field label={ar ? 'بيع ولا إيجار *' : 'Listing *'}>
            <select value={listingType} onChange={(e) => setListingType(e.target.value)} className={inputCls}>
              {LISTING_TYPES.map((t) => (
                <option key={t} value={t} className="bg-[#0d1626]">{ar ? (t === 'SALE' ? 'بيع' : 'إيجار') : t}</option>
              ))}
            </select>
          </Field>
          <Field label={ar ? 'المساحة (م²) *' : 'Area (sqm) *'}>
            <input value={area} onChange={(e) => setArea(e.target.value)} inputMode="decimal" placeholder="0" className={inputCls} />
          </Field>
          <Field label={ar ? 'السعر (جنيه) *' : 'Price (EGP) *'}>
            <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="0" className={inputCls} />
          </Field>
          <Field label={ar ? 'أوض النوم' : 'Bedrooms'}>
            <input value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} inputMode="numeric" placeholder="0" className={inputCls} />
          </Field>
          <Field label={ar ? 'الحمامات' : 'Bathrooms'}>
            <input value={bathrooms} onChange={(e) => setBathrooms(e.target.value)} inputMode="numeric" placeholder="0" className={inputCls} />
          </Field>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" onClick={() => { setShowAdd(false); resetAdd() }} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/5">
              {ar ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={add}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-full bg-estate-gold px-4 py-1.5 text-xs font-bold text-[#0F1A2C] disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {ar ? 'احفظ الوحدة' : 'Save unit'}
            </button>
          </div>
        </div>
      )}

      {units.length === 0 ? (
        <Empty text={ar ? 'لسه مفيش وحدات متسجلة على المشروع ده.' : 'No units on this project yet.'} />
      ) : (
        <ul className="space-y-2">
          {units.map((u) => (
            <li key={u.id} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
              {editingId === u.id ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder={u.name} className={inputCls} />
                  <input value={editPrice} onChange={(e) => setEditPrice(e.target.value)} inputMode="decimal" placeholder={String(u.price ?? '')} className={inputCls} />
                  <div className="flex justify-end gap-2 sm:col-span-2">
                    <button type="button" onClick={() => setEditingId(null)} className="rounded-full border border-white/10 px-3 py-1 text-xs text-gray-300 hover:bg-white/5">
                      {ar ? 'إلغاء' : 'Cancel'}
                    </button>
                    <button type="button" onClick={() => saveEdit(u.id)} disabled={busy} className="rounded-full bg-estate-gold px-3 py-1 text-xs font-bold text-[#0F1A2C] disabled:opacity-50">
                      {ar ? 'احفظ' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-white">
                      {u.name}
                      {u.status === 'HIDDEN' && <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-gray-400">{ar ? 'ممسوحة' : 'Removed'}</span>}
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      {ar ? UNIT_TYPE_AR[u.unitType] || u.unitType : u.unitType} · {u.area ?? '—'} {ar ? 'م²' : 'sqm'} · {u.price != null ? formatEGP(Math.round(u.price)) : '—'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label={ar ? 'عدّل' : 'Edit'}
                      onClick={() => { setEditName(u.name); setEditPrice(u.price != null ? String(u.price) : ''); setEditingId(u.id) }}
                      className="rounded-full p-1.5 text-gray-400 hover:bg-white/10 hover:text-white"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={ar ? 'امسح' : 'Delete'}
                      disabled={deletingId === u.id || u.status === 'HIDDEN'}
                      onClick={() => remove(u)}
                      className="rounded-full p-1.5 text-gray-400 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"
                    >
                      {deletingId === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function parseMilestones(raw: string): { ok: boolean; milestones: { name: string; percentage: number; monthNumber: number | null }[] } {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  const milestones: { name: string; percentage: number; monthNumber: number | null }[] = []
  for (const line of lines) {
    const parts = line.split('|').map((s) => s.trim())
    const [mName, pctRaw, monthRaw] = parts
    const pct = Number(pctRaw)
    if (!mName || !Number.isFinite(pct) || pct <= 0) return { ok: false, milestones: [] }
    const month = monthRaw ? Number(monthRaw) : null
    milestones.push({ name: mName, percentage: pct, monthNumber: month !== null && Number.isFinite(month) ? month : null })
  }
  return { ok: true, milestones }
}

function milestonesToText(ms: InvMilestone[]): string {
  return ms.map((m) => (m.monthNumber != null ? `${m.name} | ${m.percentage} | ${m.monthNumber}` : `${m.name} | ${m.percentage}`)).join('\n')
}

// 7) Plan templates — fill downPct/years only (name stays yours).
// Values: 10/90 → 10% down over 8 yrs · 20/80 → 20% down over 7 yrs ·
// 30/70 → 30% down over 6 yrs.
const PLAN_TEMPLATES = [
  { label: '10/90', down: 10, years: 8 },
  { label: '20/80', down: 20, years: 7 },
  { label: '30/70', down: 30, years: 6 },
] as const

function PlansManager({
  projectId,
  units,
  plans,
  onChange,
}: {
  projectId: string
  units: InvUnit[]
  plans: InvPlan[]
  onChange: (next: InvPlan[]) => void
}) {
  void units
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [showAdd, setShowAdd] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [downPct, setDownPct] = useState('')
  const [years, setYears] = useState('')
  const [desc, setDesc] = useState('')
  const [msText, setMsText] = useState('')
  const [editName, setEditName] = useState('')
  const [editDown, setEditDown] = useState('')
  const [editYears, setEditYears] = useState('')
  const [editMsText, setEditMsText] = useState('')

  const resetAdd = () => {
    setName('')
    setDownPct('')
    setYears('')
    setDesc('')
    setMsText('')
  }

  const add = async () => {
    setError(null)
    if (!name.trim() || !downPct.trim() || !years.trim()) {
      setError(ar ? 'اكتب اسم الخطة والمقدم وسنين التقسيط.' : 'Enter plan name, down payment and years.')
      return
    }
    const downN = Number(downPct)
    const yearsN = Number(years)
    if (!Number.isFinite(downN) || downN < 0 || !Number.isFinite(yearsN) || yearsN < 0) {
      setError(ar ? 'المقدم والسنين لازم يبقوا أرقام مظبوطة.' : 'Down payment and years must be valid numbers.')
      return
    }
    const parsed = parseMilestones(msText)
    if (!parsed.ok) {
      setError(ar ? 'صيغة الدفعات غلط — كل سطر: الاسم | النسبة | رقم الشهر (اختياري).' : 'Bad milestones format — each line: name | percentage | month (optional).')
      return
    }
    setBusy(true)
    try {
      const { ok, status, data } = await mut(`/api/developer/projects/${projectId}/plans`, 'POST', {
        name: name.trim(),
        downPaymentPct: downN,
        installmentYears: yearsN,
        description: desc.trim() || undefined,
        milestones: parsed.milestones.length > 0 ? parsed.milestones : undefined,
      })
      if (!ok || !data?.plan) {
        setError(friendlyError(apiErrorMessage(data, status), ar))
        return
      }
      const p = data.plan as Record<string, unknown>
      onChange([
        {
          id: String(p.id),
          name: String(p.name ?? name.trim()),
          downPaymentPct: (p.downPaymentPct as number | null) ?? downN,
          installmentYears: (p.installmentYears as number | null) ?? yearsN,
          description: (p.description as string | null) ?? null,
          milestones: Array.isArray(p.milestones)
            ? (p.milestones as Record<string, unknown>[]).map((m) => ({
                name: String(m.name ?? ''),
                percentage: Number(m.percentage ?? 0),
                monthNumber: (m.monthNumber as number | null) ?? null,
              }))
            : parsed.milestones,
        },
        ...plans,
      ])
      resetAdd()
      setShowAdd(false)
    } catch {
      setError(ar ? 'معرفناش نضيف الخطة — حاول تاني.' : 'Failed to add the plan — retry.')
    } finally {
      setBusy(false)
    }
  }

  const saveEdit = async (id: string) => {
    setError(null)
    const patch: Record<string, unknown> = {}
    if (editName.trim()) patch.name = editName.trim()
    if (editDown.trim()) {
      const n = Number(editDown)
      if (!Number.isFinite(n) || n < 0) {
        setError(ar ? 'المقدم لازم يبقى رقم موجب.' : 'Down payment must be a positive number.')
        return
      }
      patch.downPaymentPct = n
    }
    if (editYears.trim()) {
      const n = Number(editYears)
      if (!Number.isFinite(n) || n < 0) {
        setError(ar ? 'السنين لازم تبقى رقم موجب.' : 'Years must be a positive number.')
        return
      }
      patch.installmentYears = n
    }
    let nextMs: InvMilestone[] | null = null
    if (editMsText.trim()) {
      const parsed = parseMilestones(editMsText)
      if (!parsed.ok) {
        setError(ar ? 'صيغة الدفعات غلط — كل سطر: الاسم | النسبة | رقم الشهر (اختياري).' : 'Bad milestones format — each line: name | percentage | month (optional).')
        return
      }
      patch.milestones = parsed.milestones
      nextMs = parsed.milestones
    }
    if (Object.keys(patch).length === 0) {
      setEditingId(null)
      return
    }
    setBusy(true)
    try {
      const { ok, status, data } = await mut(`/api/developer/projects/${projectId}/plans`, 'PATCH', { id, ...patch })
      if (!ok || !data?.plan) {
        setError(friendlyError(apiErrorMessage(data, status), ar))
        return
      }
      const p = data.plan as Record<string, unknown>
      onChange(
        plans.map((x) =>
          x.id === id
            ? {
                ...x,
                name: String(p.name ?? x.name),
                downPaymentPct: (p.downPaymentPct as number | null) ?? x.downPaymentPct,
                installmentYears: (p.installmentYears as number | null) ?? x.installmentYears,
                milestones: nextMs ?? x.milestones,
              }
            : x
        )
      )
      setEditingId(null)
    } catch {
      setError(ar ? 'معرفناش نحدّث الخطة — حاول تاني.' : 'Failed to update the plan — retry.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (p: InvPlan) => {
    if (!confirm(ar ? `امسح خطة الدفع «${p.name}»؟` : `Delete payment plan “${p.name}”?`)) return
    setDeletingId(p.id)
    setError(null)
    try {
      const { ok, status, data } = await mut(`/api/developer/projects/${projectId}/plans?id=${encodeURIComponent(p.id)}`, 'DELETE')
      if (!ok) {
        setError(friendlyError(apiErrorMessage(data, status), ar))
        return
      }
      onChange(plans.filter((x) => x.id !== p.id))
    } catch {
      setError(ar ? 'معرفناش نمسح الخطة — حاول تاني.' : 'Failed to delete the plan — retry.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div>
      {error && (
        <p className="mb-3 flex items-start gap-2 rounded-2xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => { setError(null); setShowAdd(!showAdd) }}
        className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-estate-gold/40 px-3 py-1.5 text-xs font-bold text-estate-gold transition-colors hover:bg-estate-gold/10"
      >
        <Plus className="h-3.5 w-3.5" /> {ar ? 'زوّد خطة دفع' : 'Add plan'}
      </button>

      {showAdd && (
        <div className="mb-3 grid gap-2 rounded-2xl border border-white/10 bg-black/30 p-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">{ar ? 'قوالب جاهزة (بتملا المقدم والسنين)' : 'Ready templates (fill down payment & years)'}</p>
            <div className="flex flex-wrap gap-1.5">
              {PLAN_TEMPLATES.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => { setDownPct(String(t.down)); setYears(String(t.years)); setError(null) }}
                  className="rounded-full border border-estate-gold/40 px-3 py-1.5 text-xs font-bold text-estate-gold transition-colors hover:bg-estate-gold/10"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <Field label={ar ? 'اسم الخطة *' : 'Plan name *'} className="sm:col-span-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={ar ? 'مثال: 10% مقدم على 8 سنين' : 'e.g. 10% down over 8 years'} className={inputCls} />
          </Field>
          <Field label={ar ? 'المقدم (%) *' : 'Down payment (%) *'}>
            <input value={downPct} onChange={(e) => setDownPct(e.target.value)} inputMode="decimal" placeholder="0" className={inputCls} />
          </Field>
          <Field label={ar ? 'سنين التقسيط *' : 'Installment years *'}>
            <input value={years} onChange={(e) => setYears(e.target.value)} inputMode="numeric" placeholder="0" className={inputCls} />
          </Field>
          <Field label={ar ? 'الوصف' : 'Description'} className="sm:col-span-2">
            <input value={desc} onChange={(e) => setDesc(e.target.value)} className={inputCls} />
          </Field>
          <Field label={ar ? 'الدفعات (سطر لكل دفعة: الاسم | النسبة | الشهر)' : 'Milestones (one per line: name | % | month)'} className="sm:col-span-2">
            <textarea value={msText} onChange={(e) => setMsText(e.target.value)} rows={3} placeholder={ar ? 'تعاقد | 10 | 0' : 'Signing | 10 | 0'} className={inputCls} dir="ltr" />
          </Field>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" onClick={() => { setShowAdd(false); resetAdd() }} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/5">
              {ar ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={add}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-full bg-estate-gold px-4 py-1.5 text-xs font-bold text-[#0F1A2C] disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {ar ? 'احفظ الخطة' : 'Save plan'}
            </button>
          </div>
        </div>
      )}

      {plans.length === 0 ? (
        <Empty text={ar ? 'لسه مفيش خطط دفع متسجلة على المشروع ده.' : 'No payment plans on this project yet.'} />
      ) : (
        <ul className="space-y-2">
          {plans.map((p) => (
            <li key={p.id} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
              {editingId === p.id ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label={ar ? 'الاسم' : 'Name'} className="sm:col-span-2">
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder={p.name} className={inputCls} />
                  </Field>
                  <Field label={ar ? 'المقدم (%)' : 'Down (%)'}>
                    <input value={editDown} onChange={(e) => setEditDown(e.target.value)} inputMode="decimal" placeholder={String(p.downPaymentPct ?? '')} className={inputCls} />
                  </Field>
                  <Field label={ar ? 'السنين' : 'Years'}>
                    <input value={editYears} onChange={(e) => setEditYears(e.target.value)} inputMode="numeric" placeholder={String(p.installmentYears ?? '')} className={inputCls} />
                  </Field>
                  <Field label={ar ? 'الدفعات (بتستبدل القديمة)' : 'Milestones (replaces old)'} className="sm:col-span-2">
                    <textarea value={editMsText} onChange={(e) => setEditMsText(e.target.value)} rows={3} className={inputCls} dir="ltr" />
                  </Field>
                  <div className="flex justify-end gap-2 sm:col-span-2">
                    <button type="button" onClick={() => setEditingId(null)} className="rounded-full border border-white/10 px-3 py-1 text-xs text-gray-300 hover:bg-white/5">
                      {ar ? 'إلغاء' : 'Cancel'}
                    </button>
                    <button type="button" onClick={() => saveEdit(p.id)} disabled={busy} className="rounded-full bg-estate-gold px-3 py-1 text-xs font-bold text-[#0F1A2C] disabled:opacity-50">
                      {ar ? 'احفظ' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-white">{p.name}</p>
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      {ar ? `مقدم ${p.downPaymentPct ?? '—'}% · ${p.installmentYears ?? '—'} سنين` : `${p.downPaymentPct ?? '—'}% down · ${p.installmentYears ?? '—'} yrs`}
                      {p.milestones.length > 0 && (ar ? ` · ${p.milestones.length} دفعات` : ` · ${p.milestones.length} milestones`)}
                    </p>
                    {p.milestones.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {p.milestones.map((m, i) => (
                          <li key={i} className="text-[11px] text-gray-400">
                            {m.name} — {m.percentage}%{m.monthNumber != null ? (ar ? ` (شهر ${m.monthNumber})` : ` (month ${m.monthNumber})`) : ''}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label={ar ? 'عدّل' : 'Edit'}
                      onClick={() => { setEditName(p.name); setEditDown(''); setEditYears(''); setEditMsText(milestonesToText(p.milestones)); setEditingId(p.id) }}
                      className="rounded-full p-1.5 text-gray-400 hover:bg-white/10 hover:text-white"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={ar ? 'امسح' : 'Delete'}
                      disabled={deletingId === p.id}
                      onClick={() => remove(p)}
                      className="rounded-full p-1.5 text-gray-400 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"
                    >
                      {deletingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ─── Leads ────────────────────────────────────────────── */

function LeadsTab({ leads }: { leads: LeadRow[] }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('ALL')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return leads.filter((l) => {
      if (status !== 'ALL' && l.status !== status) return false
      if (!q) return true
      return (
        l.name.toLowerCase().includes(q) ||
        l.phone.includes(q) ||
        (l.email || '').toLowerCase().includes(q) ||
        (l.projectName || '').toLowerCase().includes(q) ||
        l.brokerName.toLowerCase().includes(q)
      )
    })
  }, [leads, query, status])

  const statuses = [...new Set(leads.map((l) => l.status))].sort()

  return (
    <Panel title={ar ? `الليدز على مشاريعك (${filtered.length})` : `Leads on your projects (${filtered.length})`}>
      <QuickReplies />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={ar ? 'دوّر على ليد أو بروكر أو مشروع...' : 'Search lead, broker or project…'}
            className="w-full rounded-xl border border-white/10 bg-black/30 py-2 pl-9 pr-3 text-sm text-white placeholder:text-gray-500 focus:border-estate-gold/60 focus:outline-none"
          />
        </label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label={ar ? 'رشّح بالحالة' : 'Filter by status'}
          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-estate-gold/60 focus:outline-none"
        >
          <option value="ALL">{ar ? 'كل الحالات' : 'All statuses'}</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {ar ? STATUS_LABEL_AR[s] || s : s}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <Empty text={ar ? 'مفيش ليدز مطابقة للفلاتر دي.' : 'No leads match these filters.'} />
      ) : (
        <div className="overflow-x-auto rounded-2xl">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="pb-3 pr-3 font-medium">{ar ? 'الليد' : 'Lead'}</th>
                <th className="pb-3 pr-3 font-medium">{ar ? 'المشروع' : 'Project'}</th>
                <th className="pb-3 pr-3 font-medium">{ar ? 'البروكر' : 'Broker'}</th>
                <th className="pb-3 pr-3 font-medium">{ar ? 'الحماية' : 'Protection'}</th>
                <th className="pb-3 pr-3 font-medium">{ar ? 'الحالة' : 'Status'}</th>
                <th className="pb-3 font-medium">{ar ? 'اتستلمت' : 'Received'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((lead) => (
                <tr key={lead.id}>
                  <td className="py-3 pr-3">
                    <p className="font-medium text-white">{lead.name}</p>
                    <p className="flex items-center gap-1 text-xs text-gray-500">
                      <Mail className="h-3 w-3" /> {lead.phone}
                    </p>
                  </td>
                  <td className="py-3 pr-3 text-gray-300">
                    {lead.projectSlug ? (
                      <Link href={`/projects/${lead.projectSlug}`} className="hover:text-estate-gold">
                        {lead.projectName}
                      </Link>
                    ) : (
                      lead.projectName || '—'
                    )}
                  </td>
                  <td className="py-3 pr-3 text-gray-300">{lead.brokerName}</td>
                  <td className="py-3 pr-3 text-xs text-gray-400">
                    {lead.protectionExpiresAt
                      ? (ar ? `لحد ${new Date(lead.protectionExpiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : `until ${new Date(lead.protectionExpiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`)
                      : '—'}
                  </td>
                  <td className="py-3 pr-3">
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', STYLE[lead.status] || 'bg-white/10 text-gray-300')}>
                      {ar ? STATUS_LABEL_AR[lead.status] || lead.status : lead.status}
                    </span>
                  </td>
                  <td className="py-3 text-xs text-gray-400">
                    {new Date(lead.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

/* ─── Deals & commissions ──────────────────────────────── */

function DealsTab({ deals, commissions }: { deals: DealRow[]; commissions: CommissionRow[] }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const paid = commissions.filter((c) => c.status === 'PAID').reduce((s, c) => s + c.totalAmount, 0)
  const total = commissions.reduce((s, c) => s + c.totalAmount, 0)

  return (
    <div className="space-y-5">
      <Panel title={ar ? 'العمولات' : 'Commissions'}>
        <div className="mb-4 grid grid-cols-3 gap-3">
          <MiniStat label={ar ? 'الإجمالي' : 'Total'} value={formatEGP(Math.round(total))} />
          <MiniStat label={ar ? 'المدفوع' : 'Paid'} value={formatEGP(Math.round(paid))} accent />
          <MiniStat label={ar ? 'المستحق' : 'Outstanding'} value={formatEGP(Math.round(total - paid))} />
        </div>
        {commissions.length === 0 ? (
          <Empty text={ar ? 'لسه مفيش عمولات متسجلة.' : 'No commissions recorded yet.'} />
        ) : (
          <ul className="divide-y divide-white/5">
            {commissions.slice(0, 12).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate text-white">{c.projectName}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(c.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-estate-gold">{formatEGP(Math.round(c.totalAmount))}</span>
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', STYLE[c.status] || 'bg-white/10 text-gray-300')}>
                    {ar ? STATUS_LABEL_AR[c.status] || c.status : c.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={ar ? `الصفقات (${deals.length})` : `Deals (${deals.length})`}>
        {deals.length === 0 ? (
          <Empty text={ar ? 'لسه مفيش صفقات متسجلة.' : 'No deals recorded yet.'} />
        ) : (
          <div className="overflow-x-auto rounded-2xl">
            <table className="w-full min-w-[42rem] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="pb-3 pr-3 font-medium">{ar ? 'المشروع' : 'Project'}</th>
                  <th className="pb-3 pr-3 font-medium">{ar ? 'الوحدة' : 'Unit'}</th>
                  <th className="pb-3 pr-3 font-medium">{ar ? 'البروكر' : 'Broker'}</th>
                  <th className="pb-3 pr-3 font-medium">{ar ? 'القيمة' : 'Value'}</th>
                  <th className="pb-3 font-medium">{ar ? 'الحالة' : 'Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {deals.map((d) => (
                  <tr key={d.id}>
                    <td className="py-3 pr-3 font-medium text-white">{d.projectName}</td>
                    <td className="py-3 pr-3 text-gray-300">{d.unitName || '—'}</td>
                    <td className="py-3 pr-3 text-gray-300">{d.brokerName}</td>
                    <td className="py-3 pr-3 text-white">
                      {d.dealValue ? formatEGP(Math.round(d.dealValue)) : '—'}
                    </td>
                    <td className="py-3">
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', STYLE[d.status] || 'bg-white/10 text-gray-300')}>
                        {ar ? STATUS_LABEL_AR[d.status] || d.status : d.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}

/* ─── Partnership ──────────────────────────────────────── */

function PartnershipTab({ partnership }: { partnership: Partnership }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  if (!partnership) {
    return (
      <Panel title={ar ? 'الشراكة' : 'Partnership'}>
        <Empty text={ar ? 'لسه مفيش طلب شراكة متسجل. فريق المنصة هيفتح واحد لما شركتك تتسجل.' : 'No partnership request on file yet. The platform team will open one when your company is onboarded.'} />
      </Panel>
    )
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title={ar ? 'الحالة' : 'Status'}>
        <div className="flex items-center gap-3">
          <span className={cn('rounded-full px-3 py-1 text-sm font-semibold', STYLE[partnership.status] || 'bg-white/10 text-gray-300')}>
            {ar ? PARTNERSHIP_LABEL_AR[partnership.status] || partnership.status : partnership.status}
          </span>
          <span className={cn('text-xs', partnership.isActive ? 'text-emerald-400' : 'text-red-400')}>
            {partnership.isActive ? (ar ? 'سارية' : 'In effect') : (ar ? 'مش سارية' : 'Inactive')}
          </span>
        </div>

        <dl className="mt-4 space-y-2 text-sm">
          <Row label={ar ? 'نطاق المشاريع' : 'Project scope'} value={partnership.allProjectsApproved ? (ar ? 'كل المشاريع' : 'All projects') : (ar ? `${partnership.approvedCount} معتمدين` : `${partnership.approvedCount} approved`)} />
          <Row label={ar ? 'حماية الليدز' : 'Lead protection'} value={partnership.leadProtectionDays != null ? (ar ? `${partnership.leadProtectionDays} يوم` : `${partnership.leadProtectionDays} days`) : (ar ? 'الافتراضي' : 'Default')} />
          <Row label={ar ? 'البداية' : 'Start'} value={partnership.startDate ? new Date(partnership.startDate).toLocaleDateString('en-GB') : '—'} />
          <Row label={ar ? 'النهاية' : 'End'} value={partnership.endDate ? new Date(partnership.endDate).toLocaleDateString('en-GB') : '—'} />
          <Row label={ar ? 'آخر تحديث' : 'Last updated'} value={new Date(partnership.updatedAt).toLocaleDateString('en-GB')} />
        </dl>
      </Panel>

      <Panel title={ar ? 'الشروط وملاحظة المراجعة' : 'Terms & review note'}>
        {partnership.terms ? (
          <p className="whitespace-pre-line text-sm leading-relaxed text-gray-300">{partnership.terms}</p>
        ) : (
          <Empty text={ar ? 'مفيش شروط متسجلة.' : 'No terms recorded.'} />
        )}
        {partnership.reviewNote && (
          <div className="mt-4 rounded-2xl border border-estate-gold/25 bg-estate-gold/[0.07] p-3">
            <p className="text-[11px] uppercase tracking-wide text-estate-gold">{ar ? 'ملاحظة مراجعة المدير' : 'CEO review note'}</p>
            <p className="mt-1 text-sm text-gray-200">{partnership.reviewNote}</p>
          </div>
        )}
      </Panel>
    </div>
  )
}

/* ─── Primitives ───────────────────────────────────────── */

function Stat({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  accent?: boolean
}) {
  return (
    <div className="rounded-2xl border border-estate-gold/15 bg-white/[0.04] p-4 transition-colors hover:border-estate-gold/40 dark:border-[#D4A843]/15">
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <span className="text-estate-gold">{icon}</span>
        {label}
      </div>
      <p className={cn('font-display mt-2 text-xl', accent ? 'text-estate-gold' : 'text-white')}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-gray-500">{sub}</p>}
    </div>
  )
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className={cn('text-sm font-bold', accent ? 'text-emerald-400' : 'text-white')}>{value}</p>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">{title}</h2>
      {children}
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-white">{value}</dd>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-gray-500">{text}</p>
}

/* ─── Owner preview + share-preview (token page) ───────
   Contract: GET /api/developer/projects/[id]/preview-link → 200 {url}
   where url = {origin}/api/developer/preview/{token} (signed, 7-day).
   That minted URL is the JSON API door, not a human page — so the UI
   extracts the token and opens/shares the website page
   /developer/preview/{token} (same token, same 7-day expiry). */

async function fetchPreviewToken(projectId: string): Promise<{ url: string; token: string }> {
  const res = await fetch(`/api/developer/projects/${projectId}/preview-link`, { headers: { ...CSRF_HEADERS } })
  let data: { url?: unknown } | null = null
  try {
    data = (await res.json()) as { url?: unknown }
  } catch {
    data = null
  }
  if (!res.ok || typeof data?.url !== 'string') throw new Error(`HTTP ${res.status}`)
  const token = data.url.split('/').pop() || ''
  if (!token) throw new Error('empty token')
  return { url: data.url, token }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      return true
    } catch {
      return false
    }
  }
}

function PreviewActions({ projectId, projectName }: { projectId: string; projectName: string }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [busy, setBusy] = useState<'preview' | 'share' | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 4) Owner preview entry — mints a FRESH token per click and opens the
  // read-only token page in a new tab.
  const openPreview = async () => {
    setBusy('preview')
    setError(null)
    try {
      const { token } = await fetchPreviewToken(projectId)
      window.open(`/developer/preview/${encodeURIComponent(token)}`, '_blank', 'noopener')
    } catch {
      setError(ar ? 'معرفناش نطلّع لينك المعاينة — حاول تاني.' : 'Failed to mint a preview link — retry.')
    } finally {
      setBusy(null)
    }
  }

  // 5) Share preview — copy link + WhatsApp + 7-day note.
  const makeShare = async () => {
    setBusy('share')
    setError(null)
    setCopied(false)
    try {
      const { token } = await fetchPreviewToken(projectId)
      setShareUrl(`${window.location.origin}/developer/preview/${encodeURIComponent(token)}`)
    } catch {
      setError(ar ? 'معرفناش نطلّع لينك المشاركة — حاول تاني.' : 'Failed to mint a share link — retry.')
    } finally {
      setBusy(null)
    }
  }

  const waHref = shareUrl
    ? `https://wa.me/?text=${encodeURIComponent(`${ar ? `بص على مشروع ${projectName} (معاينة خاصة):` : `Take a look at ${projectName} (private preview):`}\n${shareUrl}`)}`
    : ''

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy === 'preview'}
          onClick={openPreview}
          className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:border-estate-gold/40 hover:text-white disabled:opacity-50"
        >
          {busy === 'preview' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
          {ar ? 'معاينة المالك' : 'Owner preview'}
        </button>
        <button
          type="button"
          disabled={busy === 'share'}
          onClick={makeShare}
          className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:border-estate-gold/40 hover:text-white disabled:opacity-50"
        >
          {busy === 'share' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
          {ar ? 'مشاركة المعاينة' : 'Share preview'}
        </button>
      </div>
      {error && <p className="mt-2 text-[11px] text-red-400">{error}</p>}
      {shareUrl && (
        <div className="mt-2 rounded-2xl border border-white/10 bg-black/30 p-3">
          <input
            readOnly
            value={shareUrl}
            onFocus={(e) => e.target.select()}
            dir="ltr"
            className="w-full rounded-xl border border-white/10 bg-black/30 px-2.5 py-1.5 text-[11px] text-gray-300 focus:border-estate-gold/60 focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => { setCopied(await copyText(shareUrl)) }}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-full border border-white/15 px-3 py-1.5 text-xs text-gray-200 transition-colors hover:bg-white/10"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? (ar ? 'اتنسخ!' : 'Copied!') : (ar ? 'انسخ اللينك' : 'Copy link')}
            </button>
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-full bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-[#0b3d20] transition-colors hover:brightness-110"
            >
              <Send className="h-3.5 w-3.5" />
              {ar ? 'واتساب' : 'WhatsApp'}
            </a>
          </div>
          <p className="mt-2 text-[11px] text-gray-500">{ar ? 'اللينك شغال ٧ أيام من لحظة ما اتعمل.' : 'This link works for 7 days from minting.'}</p>
        </div>
      )}
    </div>
  )
}

/* ─── Per-project stats row/cards ──────────────────────
   Contract: GET /api/developer/projects/[id]/stats
   → {views, inquiries, leads, unitsTotal, unitsAvailable} */

type ProjectStatsData = {
  views: number
  inquiries: number
  leads: number
  unitsTotal: number
  unitsAvailable: number
}

async function fetchProjectStats(projectId: string): Promise<ProjectStatsData> {
  const res = await fetch(`/api/developer/projects/${projectId}/stats`, { headers: { ...CSRF_HEADERS } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as Partial<ProjectStatsData>
  return {
    views: Number(data.views) || 0,
    inquiries: Number(data.inquiries) || 0,
    leads: Number(data.leads) || 0,
    unitsTotal: Number(data.unitsTotal) || 0,
    unitsAvailable: Number(data.unitsAvailable) || 0,
  }
}

function ProjectStats({ projectId }: { projectId: string }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [stats, setStats] = useState<ProjectStatsData | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchProjectStats(projectId)
      .then((s) => { if (!cancelled) setStats(s) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  if (failed) {
    return <p className="text-[11px] text-gray-500">{ar ? 'معرفناش نجيب إحصائيات المشروع.' : 'Could not load project stats.'}</p>
  }
  if (!stats) {
    return (
      <p className="flex items-center gap-2 text-[11px] text-gray-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {ar ? 'بيحمّل الإحصائيات...' : 'Loading stats...'}
      </p>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      <MiniStat label={ar ? 'مشاهدات' : 'Views'} value={stats.views.toLocaleString()} />
      <MiniStat label={ar ? 'استفسارات' : 'Inquiries'} value={stats.inquiries.toLocaleString()} />
      <MiniStat label={ar ? 'ليدز' : 'Leads'} value={String(stats.leads)} />
      <MiniStat label={ar ? 'كل الوحدات' : 'All units'} value={String(stats.unitsTotal)} />
      <MiniStat label={ar ? 'وحدات متاحة' : 'Available'} value={String(stats.unitsAvailable)} accent />
    </div>
  )
}

/* ─── Completion % (pure client checklist) ─────────────
   cover / descAr / gallery≥3 / price / plans≥1 / units≥1 / location —
   computed client-side from the owner door GET /api/projects/[slug]
   (same door ProjectInventory already uses). No new API. */

function parseGallery(v: unknown): string[] {
  try {
    const parsed = typeof v === 'string' ? JSON.parse(v) : v
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string' && x.length > 0) : []
  } catch {
    return []
  }
}

function ProjectCompletion({ slug }: { slug: string }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [checks, setChecks] = useState<{ label: string; done: boolean }[]>([])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/projects/${encodeURIComponent(slug)}`)
      .then((r) => {
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then((data: { project?: Record<string, unknown> }) => {
        if (cancelled) return
        const p = data.project ?? {}
        const units = Array.isArray(p.units) ? p.units : []
        const plans = Array.isArray(p.paymentPlans) ? p.paymentPlans : []
        const descAr = typeof p.descriptionArabic === 'string' ? p.descriptionArabic.trim() : ''
        setChecks([
          { label: ar ? 'الغلاف' : 'Cover', done: !!p.coverImage },
          { label: ar ? 'الوصف العربي' : 'Arabic description', done: descAr.length > 0 },
          { label: ar ? 'المعرض (٣ صور+)' : 'Gallery (3+ images)', done: parseGallery(p.gallery).length >= 3 },
          { label: ar ? 'السعر' : 'Price', done: p.startPrice != null },
          { label: ar ? 'خطة دفع (١+)' : 'Payment plan (1+)', done: plans.length >= 1 },
          { label: ar ? 'وحدة (١+)' : 'Unit (1+)', done: units.length >= 1 },
          {
            label: ar ? 'الموقع' : 'Location',
            done: !!(p.address || p.governorateId || p.cityId || p.districtId),
          },
        ])
      })
      .catch(() => { if (!cancelled) setFailed(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-[11px] text-gray-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {ar ? 'بيحسب نسبة الاكتمال...' : 'Computing completion...'}
      </p>
    )
  }
  if (failed || checks.length === 0) {
    return <p className="text-[11px] text-gray-500">{ar ? 'معرفناش نحسب نسبة الاكتمال.' : 'Could not compute completion.'}</p>
  }
  const done = checks.filter((c) => c.done).length
  const pct = Math.round((done / checks.length) * 100)
  const missing = checks.filter((c) => !c.done).map((c) => c.label)
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-white">{ar ? 'اكتمال المشروع' : 'Project completion'}</span>
        <span className="font-bold text-estate-gold">{pct}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full bg-estate-gold" style={{ width: `${pct}%` }} />
      </div>
      {missing.length > 0 ? (
        <p className="mt-1.5 text-[11px] text-gray-400">
          {ar ? `ناقص: ${missing.join('، ')}` : `Missing: ${missing.join(', ')}`}
        </p>
      ) : (
        <p className="mt-1.5 text-[11px] text-emerald-400">{ar ? 'كله تمام — المشروع كامل.' : 'All complete.'}</p>
      )}
    </div>
  )
}

/* ─── CSV bulk import ──────────────────────────────────
   Contract: POST /api/developer/projects/[id]/units/bulk
   ← {units:[...full unit fields...]} cap 200
   → 201 {created, failed:[{index,error}]} */

const CSV_TEMPLATE_HEADER =
  'name,unitType,listingType,area,price,bedrooms,bathrooms,floor,unitNumber,currency,finishingType'

// Minimal comma/quote parse: quoted fields, "" escapes, CRLF/newlines in quotes.
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') { row.push(field); field = '' }
    else if (ch === '\n') { row.push(field); field = ''; rows.push(row); row = [] }
    else if (ch !== '\r') field += ch
  }
  row.push(field)
  rows.push(row)
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

const CSV_NUM_FIELDS = new Set(['area', 'price', 'floor', 'bedrooms', 'bathrooms', 'netArea'])

function CsvImport({ projectId, projectName }: { projectId: string; projectName: string }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ created: number; failed: { index: number; error: string }[] } | null>(null)
  const [staged, setStaged] = useState<Record<string, unknown>[] | null>(null)

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE_HEADER + '\nA-101,APARTMENT,SALE,120,3500000,3,2,1,,EGP,SEMI_FINISHED\n'], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'units-template.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const onFile = async (f: File | undefined) => {
    setError(null)
    setResult(null)
    setStaged(null)
    if (!f) return
    const text = await f.text()
    const rows = parseCsv(text)
    if (rows.length === 0) {
      setError(ar ? 'الملف فاضي.' : 'The file is empty.')
      return
    }
    const header = rows[0].map((h) => h.trim())
    const idx = (name: string): number => header.indexOf(name)
    if (idx('name') < 0 || idx('unitType') < 0 || idx('listingType') < 0 || idx('area') < 0 || idx('price') < 0) {
      setError(ar ? 'الهيدر لازم يبقى فيه: name,unitType,listingType,area,price.' : 'Header must include: name,unitType,listingType,area,price.')
      return
    }
    if (rows.length - 1 > 200) {
      setError(ar ? `أكتر من ٢٠٠ وحدة (${rows.length - 1}) — قسّم الملف على كذا مرة.` : `More than 200 units (${rows.length - 1}) — split the file.`)
      return
    }
    const units: Record<string, unknown>[] = []
    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r]
      const get = (name: string): string => {
        const i = idx(name)
        return i >= 0 ? (cells[i] ?? '').trim() : ''
      }
      const u: Record<string, unknown> = {
        name: get('name'),
        unitType: get('unitType'),
        listingType: get('listingType'),
      }
      for (const n of CSV_NUM_FIELDS) {
        const raw = get(n)
        if (raw) u[n] = Number(raw)
      }
      for (const s of ['nameArabic', 'unitNumber', 'currency', 'finishingType', 'phaseId', 'floorPlan']) {
        const raw = get(s)
        if (raw) u[s] = raw
      }
      const sample = get('isSample').toLowerCase()
      if (sample === 'true' || sample === 'false') u.isSample = sample === 'true'
      units.push(u)
    }
    setStaged(units)
  }

  const send = async () => {
    if (!staged) return
    setBusy(true)
    setError(null)
    try {
      const { ok, status, data } = await mut(`/api/developer/projects/${projectId}/units/bulk`, 'POST', { units: staged })
      if (!ok) {
        setError(status === 400 ? (ar ? 'الطلب مرفوض — راجع عدد الصفوف (أقصى ٢٠٠) وشكل الحقول.' : 'Request rejected — check the 200-row cap and field shapes.') : (ar ? 'معرفناش نبعت الوحدات — حاول تاني.' : 'Failed to send units — retry.'))
        return
      }
      setResult({
        created: Number((data as Record<string, unknown>)?.created) || 0,
        failed: Array.isArray((data as Record<string, unknown>)?.failed) ? ((data as Record<string, unknown>).failed as { index: number; error: string }[]) : [],
      })
      setStaged(null)
    } catch {
      setError(ar ? 'معرفناش نبعت الوحدات — حاول تاني.' : 'Failed to send units — retry.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5">
      <p className="text-xs font-semibold text-white">{ar ? `استيراد وحدات (CSV) — ${projectName}` : `Import units (CSV) — ${projectName}`}</p>
      <p className="mt-1 break-words text-[11px] text-gray-500" dir="ltr">{CSV_TEMPLATE_HEADER}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={downloadTemplate}
          className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/5"
        >
          <Download className="h-3.5 w-3.5" /> {ar ? 'نزّل القالب' : 'Template'}
        </button>
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-estate-gold/40 px-3 py-1.5 text-xs font-bold text-estate-gold hover:bg-estate-gold/10">
          <Upload className="h-3.5 w-3.5" /> {ar ? 'اختار ملف .csv' : 'Pick .csv'}
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {staged && (
          <button
            type="button"
            onClick={send}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-full bg-estate-gold px-4 py-1.5 text-xs font-bold text-[#0F1A2C] disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {ar ? `ابعت ${staged.length} وحدة` : `Send ${staged.length} units`}
          </button>
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-gray-500">{ar ? 'أقصى ٢٠٠ وحدة في المرة — الصفوف البايظة بتتعدّى وأخطاؤها بتتعرض تحت.' : 'Max 200 units per batch — bad rows are skipped and their errors listed.'}</p>
      {error && <p className="mt-2 text-[11px] text-red-400">{error}</p>}
      {result && (
        <div className="mt-2 text-[11px]">
          <p className="text-emerald-400">{ar ? `اتسجّل ${result.created} وحدة.` : `${result.created} units created.`}</p>
          {result.failed.length > 0 && (
            <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-red-300">
              {result.failed.map((f) => (
                <li key={f.index} dir="auto">{ar ? `صف ${f.index + 1}: ${f.error}` : `Row ${f.index + 1}: ${f.error}`}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── Bulk images ──────────────────────────────────────
   Contract: multi-file → POST /api/developer/upload (field `file`)
   → PATCH /api/developer/projects/[id] with existing + new gallery URLs.
   Per-file upload failures are listed below; copy-all stays as a fallback
   (when the gallery PATCH fails, nothing uploaded is lost). Edits to a
   published project go live immediately. */

function BulkImages({ projectId, slug, projectName }: { projectId: string; slug: string; projectName: string }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [busy, setBusy] = useState(false)
  const [urls, setUrls] = useState<string[]>([])
  const [fails, setFails] = useState<string[]>([])
  const [copied, setCopied] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [galleryError, setGalleryError] = useState<string | null>(null)

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setBusy(true)
    setFails([])
    setCopied(false)
    setNotice(null)
    setGalleryError(null)
    const done: string[] = []
    const bad: string[] = []
    for (const f of Array.from(files)) {
      try {
        const form = new FormData()
        form.append('file', f)
        const res = await fetch('/api/developer/upload', { method: 'POST', headers: { ...CSRF_HEADERS }, body: form })
        let data: { url?: unknown; error?: unknown } | null = null
        try { data = (await res.json()) as { url?: unknown; error?: unknown } } catch { data = null }
        if (!res.ok || typeof data?.url !== 'string') {
          bad.push(`${f.name}: ${ar ? 'فشل الرفع' : 'Upload failed'}`)
        } else done.push(data.url)
      } catch {
        bad.push(`${f.name}: ${ar ? 'فشل الرفع' : 'Upload failed'}`)
      }
    }
    setUrls((prev) => [...prev, ...done])
    setFails(bad)
    if (done.length > 0) {
      // Append to the project gallery: existing + new URLs.
      try {
        const prev = await fetch(`/api/projects/${encodeURIComponent(slug)}`, { headers: { ...CSRF_HEADERS } })
        const detail = (await prev.json().catch(() => null)) as { project?: Record<string, unknown> } | null
        if (!prev.ok || !detail?.project) throw new Error('load')
        const merged = [...parseGallery(detail.project.gallery), ...done]
        const { ok: patched, status, data } = await mut(`/api/developer/projects/${projectId}`, 'PATCH', { gallery: merged })
        if (!patched) {
          setGalleryError(friendlyError(apiErrorMessage(data, status), ar))
        } else {
          setNotice(ar ? `اتضافت ${done.length} صور لجاليري «${projectName}».` : `Added ${done.length} photo${done.length === 1 ? '' : 's'} to “${projectName}” gallery.`)
        }
      } catch {
        setGalleryError(ar ? 'الصور اترفعت بس الجاليري متحدّثش — انسخ اللينكات واحتفظ بيها.' : 'Photos uploaded but the gallery was not updated — copy the links to keep them.')
      }
    }
    setBusy(false)
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5">
      <p className="text-xs font-semibold text-white">{ar ? `صور بالجملة — ${projectName}` : `Bulk images — ${projectName}`}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-estate-gold/40 px-3 py-1.5 text-xs font-bold text-estate-gold hover:bg-estate-gold/10">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {ar ? 'اختار صور' : 'Pick images'}
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
        </label>
        {urls.length > 0 && (
          <button
            type="button"
            onClick={async () => { setCopied(await copyText(urls.join('\n'))) }}
            className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/5"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            {ar ? `انسخ ${urls.length} لينكات` : `Copy ${urls.length} links`}
          </button>
        )}
      </div>
      {notice && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-emerald-300">
          <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> {notice}
        </p>
      )}
      {urls.length > 0 && (
        <ul className="mt-2 max-h-28 space-y-0.5 overflow-y-auto text-[11px] text-gray-400" dir="ltr">
          {urls.map((u) => (<li key={u} className="truncate">{u}</li>))}
        </ul>
      )}
      {galleryError && (
        <p className="mt-2 text-[11px] text-amber-300">{galleryError}</p>
      )}
      {fails.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[11px] text-red-300">
          {fails.map((f) => (<li key={f} dir="auto">{f}</li>))}
        </ul>
      )}
    </div>
  )
}

/* ─── Activity timeline ────────────────────────────────
   Contract: GET /api/developer/projects/[id]/activity → {logs}
   (ceo/activity item shape; may be []). Empty → honest line. */

type ActivityLog = {
  id: string
  action: string
  createdAt: string
  user?: { name: string | null; email?: string } | null
}

function ProjectActivity({ projectId }: { projectId: string }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [logs, setLogs] = useState<ActivityLog[]>([])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/developer/projects/${projectId}/activity`, { headers: { ...CSRF_HEADERS } })
      .then((r) => {
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then((data: { logs?: ActivityLog[] }) => {
        if (!cancelled) setLogs(Array.isArray(data.logs) ? data.logs : [])
      })
      .catch(() => { if (!cancelled) setFailed(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-white">
        <History className="h-3.5 w-3.5 text-estate-gold" /> {ar ? 'آخر النشاطات' : 'Recent activity'}
      </p>
      {loading ? (
        <p className="mt-2 flex items-center gap-2 text-[11px] text-gray-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {ar ? 'بيحمّل...' : 'Loading...'}
        </p>
      ) : failed ? (
        <p className="mt-2 text-[11px] text-gray-500">{ar ? 'معرفناش نجيب النشاط.' : 'Could not load activity.'}</p>
      ) : logs.length === 0 ? (
        <p className="mt-2 text-[11px] text-gray-500">{ar ? 'مفيش نشاط متسجل للمشروع ده لسه.' : 'No activity recorded for this project yet.'}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {logs.map((l) => (
            <li key={l.id} className="flex items-start gap-2 text-[11px]">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-estate-gold" />
              <div className="min-w-0">
                <p className="font-medium text-gray-200">{l.action}</p>
                <p className="text-gray-500">
                  {l.user?.name || l.user?.email || (ar ? 'النظام' : 'System')} · {new Date(l.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ─── Compare my projects ──────────────────────────────
   Reuses the per-project stats endpoint, fetched lazily per expanded row. */

function CompareTab({ projects }: { projects: ProjectRow[] }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [cache, setCache] = useState<Record<string, ProjectStatsData>>({})
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [failedId, setFailedId] = useState<string | null>(null)

  const toggle = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    setFailedId(null)
    if (cache[id]) return
    setLoadingId(id)
    try {
      const s = await fetchProjectStats(id)
      setCache((c) => ({ ...c, [id]: s }))
    } catch {
      setFailedId(id)
    } finally {
      setLoadingId(null)
    }
  }

  if (projects.length === 0) {
    return (
      <Panel title={ar ? 'مقارنة مشاريعي' : 'Compare my projects'}>
        <Empty text={ar ? 'مفيش مشاريع تقارن بينها لسه.' : 'No projects to compare yet.'} />
      </Panel>
    )
  }

  return (
    <Panel title={ar ? `مقارنة مشاريعي (${projects.length})` : `Compare my projects (${projects.length})`}>
      <div className="overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="pb-3 pr-3 font-medium">{ar ? 'المشروع' : 'Project'}</th>
              <th className="pb-3 pr-3 font-medium">{ar ? 'الحالة' : 'Status'}</th>
              <th className="pb-3 pr-3 font-medium">{ar ? 'مشاهدات' : 'Views'}</th>
              <th className="pb-3 pr-3 font-medium">{ar ? 'ليدز' : 'Leads'}</th>
              <th className="pb-3 pr-3 font-medium">{ar ? 'وحدات (متاح/كلي)' : 'Units (avail/total)'}</th>
              <th className="pb-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {projects.map((p) => {
              const s = cache[p.id]
              const expanded = expandedId === p.id
              return (
                <Fragment key={p.id}>
                  <tr>
                    <td className="py-3 pr-3 font-medium text-white">{p.name}</td>
                    <td className="py-3 pr-3">
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', STYLE[p.approvalStatus] || 'bg-white/10 text-gray-300')}>
                        {ar ? APPROVAL_AR[p.approvalStatus] || p.approvalStatus : p.approvalStatus}
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-gray-300">{s ? s.views.toLocaleString() : '—'}</td>
                    <td className="py-3 pr-3 text-gray-300">{s ? String(s.leads) : '—'}</td>
                    <td className="py-3 pr-3 text-gray-300">{s ? `${s.unitsAvailable}/${s.unitsTotal}` : '—'}</td>
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        onClick={() => toggle(p.id)}
                        className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-xs text-gray-300 hover:bg-white/5"
                        aria-expanded={expanded}
                      >
                        {loadingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />}
                        {ar ? 'التفاصيل' : 'Details'}
                      </button>
                    </td>
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={6} className="pb-3">
                        {failedId === p.id ? (
                          <p className="text-[11px] text-gray-500">{ar ? 'معرفناش نجيب إحصائيات المشروع ده.' : 'Could not load this project’s stats.'}</p>
                        ) : s ? (
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                            <MiniStat label={ar ? 'مشاهدات' : 'Views'} value={s.views.toLocaleString()} />
                            <MiniStat label={ar ? 'استفسارات' : 'Inquiries'} value={s.inquiries.toLocaleString()} />
                            <MiniStat label={ar ? 'ليدز' : 'Leads'} value={String(s.leads)} />
                            <MiniStat label={ar ? 'كل الوحدات' : 'All units'} value={String(s.unitsTotal)} />
                            <MiniStat label={ar ? 'وحدات متاحة' : 'Available'} value={String(s.unitsAvailable)} accent />
                          </div>
                        ) : (
                          <p className="flex items-center gap-2 text-[11px] text-gray-500">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {ar ? 'بيحمّل...' : 'Loading...'}
                          </p>
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
    </Panel>
  )
}

/* ─── Viewings month-grid calendar ─────────────────────
   Source: GET /api/viewings (DEVELOPER scope = appointments on my
   projects only). Tap a day → that day's list below the grid. */

type DevViewing = {
  id: string
  scheduledAt: string
  status: string
  meetingType?: string | null
  contactPhone?: string | null
  duration?: number | null
  project?: { name: string; slug?: string } | null
  unit?: { name: string; project?: { name: string } | null } | null
}

const WEEK_AR = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة']
const WEEK_EN = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']

function dayKey(y: number, m: number, d: number): string {
  return `${y}-${m + 1}-${d}`
}

function ViewingsTab() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [viewings, setViewings] = useState<DevViewing[]>([])
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/viewings', { headers: { ...CSRF_HEADERS } })
      .then((r) => {
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then((data: { viewings?: DevViewing[] }) => {
        if (!cancelled) setViewings(Array.isArray(data.viewings) ? data.viewings : [])
      })
      .catch(() => { if (!cancelled) setFailed(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const y = month.getFullYear()
  const m = month.getMonth()
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  // Saturday-start offset: JS getDay() Sun=0..Sat=6 → Sat=0..Fri=6.
  const leadBlanks = (new Date(y, m, 1).getDay() + 1) % 7

  const byDay = new Map<string, DevViewing[]>()
  for (const v of viewings) {
    const d = new Date(v.scheduledAt)
    if (Number.isNaN(d.getTime())) continue
    if (d.getFullYear() !== y || d.getMonth() !== m) continue
    const k = dayKey(y, m, d.getDate())
    const list = byDay.get(k)
    if (list) list.push(v)
    else byDay.set(k, [v])
  }

  const todayK = dayKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())
  const selectedList = selected ? (byDay.get(selected) ?? []) : []
  const week = ar ? WEEK_AR : WEEK_EN

  return (
    <Panel title={ar ? 'معاينات مشاريعي' : 'My projects’ viewings'}>
      {loading ? (
        <p className="flex items-center gap-2 py-6 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> {ar ? 'بيحمّل المعاينات...' : 'Loading viewings...'}
        </p>
      ) : failed ? (
        <Empty text={ar ? 'معرفناش نجيب المعاينات — حدّث الصفحة وحاول تاني.' : 'Could not load viewings — refresh and retry.'} />
      ) : viewings.length === 0 ? (
        <Empty text={ar ? 'مفيش معاينات محجوزة على مشاريعك لسه.' : 'No viewings booked on your projects yet.'} />
      ) : (
        <div>
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setMonth(new Date(y, m - 1, 1))}
              className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/5"
            >
              {ar ? 'الشهر اللي فات' : 'Prev'}
            </button>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-white">
              <CalendarDays className="h-4 w-4 text-estate-gold" />
              {new Date(y, m, 1).toLocaleDateString(ar ? 'ar-EG' : 'en-US', { month: 'long', year: 'numeric' })}
            </p>
            <button
              type="button"
              onClick={() => setMonth(new Date(y, m + 1, 1))}
              className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/5"
            >
              {ar ? 'الشهر الجاي' : 'Next'}
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {week.map((w) => (
              <p key={w} className="pb-1 text-[11px] font-medium text-gray-500">{w}</p>
            ))}
            {Array.from({ length: leadBlanks }).map((_, i) => (
              <span key={`b-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const d = i + 1
              const k = dayKey(y, m, d)
              const count = byDay.get(k)?.length ?? 0
              const isToday = k === todayK
              const isSel = k === selected
              return (
                <button
                  key={k}
                  type="button"
                  disabled={count === 0}
                  onClick={() => setSelected(isSel ? null : k)}
                  aria-pressed={isSel}
                  className={cn(
                    'flex min-h-[2.5rem] flex-col items-center justify-center rounded-xl border text-xs transition-colors',
                    isSel
                      ? 'border-estate-gold bg-estate-gold/15 text-white'
                      : count > 0
                        ? 'border-white/10 bg-white/[0.04] text-white hover:border-estate-gold/50'
                        : 'border-transparent text-gray-600',
                    isToday && 'ring-1 ring-estate-gold/60'
                  )}
                >
                  <span className="font-semibold">{d}</span>
                  {count > 0 && (
                    <span className="mt-0.5 rounded-full bg-estate-gold/20 px-1.5 text-[10px] font-bold text-estate-gold">
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          {selected && (
            <div className="mt-4 border-t border-white/10 pt-3">
              <p className="mb-2 text-xs font-semibold text-white">
                {ar ? `معاينات يوم ${selected}` : `Viewings on ${selected}`} ({selectedList.length})
              </p>
              {selectedList.length === 0 ? (
                <p className="text-[11px] text-gray-500">{ar ? 'مفيش معاينات في اليوم ده.' : 'No viewings that day.'}</p>
              ) : (
                <ul className="space-y-2">
                  {selectedList
                    .slice()
                    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
                    .map((v) => (
                      <li key={v.id} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold text-estate-gold">
                            {new Date(v.scheduledAt).toLocaleTimeString(ar ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', STYLE[v.status] || 'bg-white/10 text-gray-300')}>
                            {ar ? STATUS_LABEL_AR[v.status] || v.status : v.status}
                          </span>
                        </div>
                        <p className="mt-1 text-gray-200">
                          {v.project?.name || v.unit?.project?.name || (ar ? 'مشروعك' : 'Your project')}
                          {v.unit?.name ? ` — ${v.unit.name}` : ''}
                        </p>
                        <p className="mt-0.5 text-[11px] text-gray-500" dir="auto">
                          {v.meetingType === 'online' ? (ar ? 'أونلاين' : 'Online') : (ar ? 'حضور' : 'In person')}
                          {v.contactPhone ? ` · ${v.contactPhone}` : ''}
                        </p>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}

/* ─── Quick replies ────────────────────────────────────
   Verified: neither LeadsTab here nor the dashboard inquiries page
   renders an inquiry reply input — so templates are copy-buttons
   (tap → copied → paste into phone/WhatsApp). */

const QUICK_REPLIES: { labelAr: string; labelEn: string; textAr: string; textEn: string }[] = [
  {
    labelAr: 'ترحيب',
    labelEn: 'Greeting',
    textAr: 'أهلاً بيك، شكراً لاهتمامك بمشروعنا — تحب نحدد لك معاينة؟',
    textEn: 'Hi, thanks for your interest in our project — shall we schedule a viewing for you?',
  },
  {
    labelAr: 'تأكيد معاينة',
    labelEn: 'Confirm viewing',
    textAr: 'تم تأكيد معاينتك — هنستناك في المعاد المتفق عليه.',
    textEn: 'Your viewing is confirmed — we’ll see you at the agreed time.',
  },
  {
    labelAr: 'تفاصيل سعر',
    labelEn: 'Price details',
    textAr: 'ابعتلي رقم الوحدة اللي عجبتك وأقولك سعرها وخطط السداد المتاحة.',
    textEn: 'Send me the unit number you liked and I’ll share its price and available payment plans.',
  },
  {
    labelAr: 'متابعة',
    labelEn: 'Follow-up',
    textAr: 'معاك فريق المبيعات — لسه مهتم بالوحدة؟ لو عندك أي سؤال أنا موجود.',
    textEn: 'Hi, this is the sales team — are you still interested in the unit? Happy to answer anything.',
  },
  {
    labelAr: 'طلب أوراق',
    labelEn: 'Docs request',
    textAr: 'عشان نكمل الحجز محتاجين صورة البطاقة ورقم تليفون للتواصل.',
    textEn: 'To proceed with the reservation we’ll need a copy of your ID and a contact number.',
  },
]

function QuickReplies() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  return (
    <div className="mb-4 rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5">
      <p className="text-xs font-semibold text-white">{ar ? 'ردود سريعة' : 'Quick replies'}</p>
      <p className="mt-0.5 text-[11px] text-gray-500">
        {ar ? 'مفيش خانة رد هنا — دوس على الرد يتنسخ والصقه في تليفونك أو واتساب.' : 'No reply box here — tap a reply to copy it, then paste into your phone or WhatsApp.'}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {QUICK_REPLIES.map((q, i) => (
          <button
            key={q.labelEn}
            type="button"
            onClick={async () => {
              const ok = await copyText(ar ? q.textAr : q.textEn)
              if (ok) {
                setCopiedIdx(i)
                setTimeout(() => setCopiedIdx((c) => (c === i ? null : c)), 1600)
              }
            }}
            className="inline-flex items-center gap-1 rounded-full border border-estate-gold/40 px-3 py-1.5 text-xs font-medium text-estate-gold transition-colors hover:bg-estate-gold/10"
          >
            {copiedIdx === i ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            {ar ? q.labelAr : q.labelEn}
          </button>
        ))}
      </div>
    </div>
  )
}
