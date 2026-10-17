'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  Users,
  Briefcase,
  Wallet,
  FolderKanban,
  Search,
  Loader2,
  CalendarClock,
  BadgeCheck,
  AlertTriangle,
  ArrowUpRight,
  Bell,
  Eye,
  Pencil,
  X,
  Copy,
  Check,
  ExternalLink,
  Phone,
  Mail,
  Shield,
} from 'lucide-react'
import { formatEGP, cn } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import { Reveal, SectionHeader } from '@/components/design'

/* ─── Props (all serialised on the server) ─────────────── */

type LeadRow = {
  id: string
  leadCode: string | null
  name: string
  email: string | null
  phone: string
  status: string
  source: string
  budgetMin: number | null
  budgetMax: number | null
  notes: string | null
  nextFollowUp: string | null
  lastActivityAt: string | null
  protectionStartsAt: string | null
  protectionExpiresAt: string | null
  protectionDays: number | null
  createdAt: string
  projectName: string | null
  projectSlug: string | null
  unitName: string | null
  developerName: string | null
}

type DealRow = {
  id: string
  status: string
  dealValue: number | null
  createdAt: string
  projectName: string
  developerName: string
  unitName: string | null
  commissionAmount: number | null
  commissionStatus: string | null
}

type CommissionRow = {
  id: string
  status: string
  totalAmount: number
  brokerAmount: number
  dueDate: string | null
  paidDate: string | null
  createdAt: string
  projectName: string
  dealStatus: string
}

type ProjectRow = {
  id: string
  name: string
  slug: string
  coverImage: string | null
  location: string | null
  startPrice: number | null
  developerName: string
  scope: string
  expiresAt: string | null
}

type ViewingRow = {
  id: string
  scheduledAt: string
  duration: number
  status: string
  meetingType: string
  meetingLink: string | null
  contactPhone: string | null
  notes: string | null
  projectName: string | null
  projectSlug: string | null
  unitName: string | null
  leadName: string | null
}

type AccessRuleRow = {
  id: string
  scope: string
  access: string
  developerName: string
  projectName: string | null
  projectSlug: string | null
  expiresAt: string | null
  notes: string | null
}

type CommissionRuleRow = {
  id: string
  name: string
  brokerPct: number
  totalPct: number
  estateaiPct: number
  isDefault: boolean
  developerName: string | null
  projectName: string | null
}

type PartnershipInfo = {
  accessRules: AccessRuleRow[]
  commissionRules: CommissionRuleRow[]
  protectedLeads: number
  expiringLeads: number
}

type Props = {
  profile: {
    id: string
    agencyName: string | null
    agencyNameArabic: string | null
    licenseNumber: string | null
    bio: string | null
    phone: string | null
    isVerified: boolean
    rating: number
    reviewCount: number
    yearsExperience: number | null
    totalDeals: number
    commissionRate: number | null
    accountStatus: string
    isActive: boolean
  }
  viewer: { name: string; role: string }
  partnership: PartnershipInfo
  stats: {
    totalLeads: number
    statusCounts: Record<string, number>
    activeLeads: number
    deals: number
    totalValue: number
    commissionTotal: number
    commissionPaid: number
    commissionPending: number
    projects: number
  }
  pipeline: { status: string; count: number }[]
  leads: LeadRow[]
  deals: DealRow[]
  commissions: CommissionRow[]
  projects: ProjectRow[]
  upcomingViewings: ViewingRow[]
  pastViewings: ViewingRow[]
}

const LEAD_STATUSES = [
  'NEW', 'CONTACTED', 'QUALIFIED', 'VIEWING', 'NEGOTIATION', 'CONVERTED', 'LOST',
] as const

const STATUS_STYLE: Record<string, string> = {
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
  LOST_DEAL: 'bg-red-500/15 text-red-400',
  PENDING: 'bg-amber-500/15 text-amber-400',
  APPROVED: 'bg-blue-500/15 text-blue-400',
  INVOICED: 'bg-violet-500/15 text-violet-400',
  DUE: 'bg-orange-500/15 text-orange-400',
  PAID: 'bg-emerald-500/15 text-emerald-400',
  DISPUTED: 'bg-red-500/15 text-red-400',
  REQUESTED: 'bg-blue-500/15 text-blue-400',
  CONFIRMED: 'bg-emerald-500/15 text-emerald-400',
  COMPLETED: 'bg-estate-gold/15 text-estate-gold',
  NO_SHOW: 'bg-orange-500/15 text-orange-400',
  SCHEDULED: 'bg-sky-500/15 text-sky-400',
}

// Viewing statuses arrive in mixed case ('scheduled' default vs 'REQUESTED').
// Normalise lookups so both spellings resolve to the same chip.
function statusStyle(status: string): string {
  return STATUS_STYLE[status] || STATUS_STYLE[status.toUpperCase()] || 'bg-white/10 text-gray-300'
}

function statusLabel(status: string, ar: boolean): string {
  if (!ar) return status
  return STATUS_LABEL_AR[status] || STATUS_LABEL_AR[status.toUpperCase()] || status
}

const TABS = ['Overview', 'Leads', 'Deals', 'Commissions', 'Projects', 'Viewings', 'Inquiries', 'Partnership', 'Notifications', 'Profile'] as const
type Tab = (typeof TABS)[number]

const TAB_LABEL_AR: Record<Tab, string> = {
  Overview: 'نظرة عامة',
  Leads: 'الليدز',
  Deals: 'الصفقات',
  Commissions: 'العمولات',
  Projects: 'المشاريع',
  Viewings: 'المعاينات',
  Inquiries: 'الاستفسارات',
  Partnership: 'الشراكة',
  Notifications: 'التنبيهات',
  Profile: 'حسابي',
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
  LOST_DEAL: 'صفقة ضايعة',
  PENDING: 'مستني',
  APPROVED: 'متوافق عليه',
  INVOICED: 'اتفوتر',
  DUE: 'مستحق',
  PAID: 'مدفوع',
  DISPUTED: 'متنازع عليه',
  REQUESTED: 'مطلوب',
  CONFIRMED: 'متأكد',
  COMPLETED: 'خلص',
  NO_SHOW: 'محدش جه',
  SCHEDULED: 'متحدد',
}

const ACCOUNT_STATUS_AR: Record<string, string> = {
  ACTIVE: 'نشط',
  SUSPENDED: 'موقوف',
  PENDING: 'مستني',
}

const CSRF_HEADERS: Record<string, string> = { 'X-Requested-With': 'XMLHttpRequest' }

/** Map a raw English API error to friendly Egyptian-colloquial copy. */
function friendlyApiError(raw: string, ar: boolean): string {
  const e = (raw || '').toLowerCase()
  if (e.includes('unauthorized') || e.includes('forbidden') || e.includes('session'))
    return ar ? 'جلستك خلصت — سجّل دخول تاني.' : 'Your session expired — sign in again.'
  if (e.includes('not found'))
    return ar ? 'الحاجة دي مش موجودة — حدّث الصفحة وحاول تاني.' : 'That item no longer exists — refresh and retry.'
  if (e.includes('invalid transition') || e.includes('only upcoming'))
    return ar ? 'الحركة دي متنفعش على الحالة الحالية.' : 'That move is not allowed from its current state.'
  if (e.includes('past viewing'))
    return ar ? 'المعاينات اللي فاتت مينفعش تتحرك.' : 'Past viewings cannot be changed.'
  if (e.includes('future date') || e.includes('valid date'))
    return ar ? 'اختار معاد جاي صحيح.' : 'Pick a valid future date and time.'
  if (e.includes('phone'))
    return ar ? 'رقم التليفون مش مظبوط — راجعه وحاول تاني.' : 'That phone number looks off — check it and retry.'
  if (e.includes('nothing to update'))
    return ar ? 'مفيش حاجة تتحدّث.' : 'Nothing to update.'
  return ar ? 'معرفناش نكمّل العملية — حاول تاني.' : 'Something went wrong — please retry.'
}

async function apiJson(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: Record<string, any> | null }> {
  const res = await fetch(path, {
    ...init,
    headers: { ...CSRF_HEADERS, ...(init?.headers || {}) },
  })
  let data: Record<string, any> | null = null
  try {
    data = (await res.json()) as Record<string, any>
  } catch {
    data = null
  }
  return { ok: res.ok, status: res.status, data }
}

const SCOPE_LABEL_AR: Record<string, string> = {
  ALL: 'الكل',
  FULL: 'كاملة',
  LIMITED: 'محدودة',
}

export default function BrokerPortal(props: Props) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [tab, setTab] = useState<Tab>('Overview')

  const suspended = props.profile.accountStatus !== 'ACTIVE' || !props.profile.isActive

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      <div className="container px-4 py-8">
        {/* Header */}
        <Reveal>
        <div className="relative mb-6 overflow-hidden rounded-2xl border border-estate-gold/20 bg-gradient-to-r from-[#0F1A2C] to-[#16233f] p-6 text-white dark:border-[#D4A843]/20 dark:from-black dark:to-[#0A0A0A]">
          <div className="mashrabiya pointer-events-none absolute inset-0 opacity-30" aria-hidden="true" />
          <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <SectionHeader
                kicker={ar ? 'بوابة البروكر' : 'Broker portal'}
                title={ar ? `أهلاً بيك يا ${props.viewer.name.split(' ')[0]}` : `Welcome back, ${props.viewer.name.split(' ')[0]}`}
              />
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-white/70">
                {props.profile.agencyName && <span>{props.profile.agencyName}</span>}
                {props.profile.licenseNumber && (
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">
                    {ar ? `رخصة ${props.profile.licenseNumber}` : `License ${props.profile.licenseNumber}`}
                  </span>
                )}
                {props.profile.isVerified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">
                    <BadgeCheck className="h-3.5 w-3.5" /> {ar ? 'موثّق' : 'Verified'}
                  </span>
                )}
                {props.profile.rating > 0 && (
                  <span className="rounded-full bg-estate-gold/20 px-2 py-0.5 text-xs text-estate-gold">
                    ★ {props.profile.rating.toFixed(1)} ({props.profile.reviewCount})
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
            <NotifBell onOpen={() => setTab('Notifications')} />
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-xs font-medium transition-colors hover:bg-white/20"
            >
              {ar ? 'اللوحة الكاملة' : 'Full dashboard'} <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
            </div>
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
          <Stat icon={<Users className="h-4 w-4" />} label={ar ? 'ليدز نشطة' : 'Active leads'} value={String(props.stats.activeLeads)} sub={ar ? `الإجمالي ${props.stats.totalLeads}` : `${props.stats.totalLeads} total`} />
          <Stat icon={<Briefcase className="h-4 w-4" />} label={ar ? 'الصفقات' : 'Deals'} value={String(props.stats.deals)} sub={ar ? `القيمة ${formatEGP(Math.round(props.stats.totalValue))}` : `${formatEGP(Math.round(props.stats.totalValue))} value`} />
          <Stat icon={<Wallet className="h-4 w-4" />} label={ar ? 'العمولة المحصلة' : 'Commission earned'} value={formatEGP(Math.round(props.stats.commissionPaid))} sub={ar ? `${formatEGP(Math.round(props.stats.commissionPending))} مستنية` : `${formatEGP(Math.round(props.stats.commissionPending))} pending`} accent />
          <Stat icon={<FolderKanban className="h-4 w-4" />} label={ar ? 'مشاريع معتمدة' : 'Approved projects'} value={String(props.stats.projects)} sub={ar ? 'تقدر تبيعها' : 'you can sell'} />
        </div>
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
                tab === t
                  ? 'bg-estate-gold text-[#0F1A2C]'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              )}
            >
              {ar ? TAB_LABEL_AR[t] : t}
            </button>
          ))}
        </div>

        {tab === 'Overview' && <Reveal><Overview {...props} onOpenTab={setTab} /></Reveal>}
        {tab === 'Leads' && <Reveal><LeadsTab leads={props.leads} /></Reveal>}
        {tab === 'Deals' && <Reveal><DealsTab deals={props.deals} /></Reveal>}
        {tab === 'Commissions' && <Reveal><CommissionsTab commissions={props.commissions} /></Reveal>}
        {tab === 'Projects' && <Reveal><ProjectsTab projects={props.projects} /></Reveal>}
        {tab === 'Viewings' && <Reveal><ViewingsTab upcoming={props.upcomingViewings} past={props.pastViewings} leads={props.leads} /></Reveal>}
        {tab === 'Inquiries' && <Reveal><InquiriesTab /></Reveal>}
        {tab === 'Partnership' && <Reveal><PartnershipTab partnership={props.partnership} /></Reveal>}
        {tab === 'Notifications' && <Reveal><NotificationsTab /></Reveal>}
        {tab === 'Profile' && <Reveal><ProfileTab profile={props.profile} viewer={props.viewer} /></Reveal>}
      </div>
    </div>
  )
}

/* ─── Notification bell (header entry → Notifications tab) ─── */

function NotifBell({ onOpen }: { onOpen: () => void }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch('/api/notifications?limit=1', { headers: { ...CSRF_HEADERS } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.unreadCount === 'number') {
          setUnread(data.unreadCount)
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={ar ? 'التنبيهات' : 'Notifications'}
      className="relative inline-flex items-center rounded-full bg-white/10 p-2.5 transition-colors hover:bg-white/20"
    >
      <Bell className="h-4 w-4" />
      {unread > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  )
}

/* ─── Overview ─────────────────────────────────────────── */

function Overview(props: Props & { onOpenTab: (t: Tab) => void }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const max = Math.max(1, ...props.pipeline.map((p) => p.count))
  const recent = props.leads.slice(0, 6)
  const upcoming = props.upcomingViewings.slice(0, 5)

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <Panel title={ar ? 'خط الليدز' : 'Lead pipeline'}>
          <div className="space-y-3">
            {props.pipeline.map((step) => (
              <div key={step.status} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-xs text-gray-400">{ar ? STATUS_LABEL_AR[step.status] || step.status : step.status}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/5">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      step.status === 'CONVERTED' ? 'bg-emerald-500' : 'bg-estate-gold'
                    )}
                    style={{ width: `${(step.count / max) * 100}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-xs font-semibold text-white">
                  {step.count}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={ar ? 'أحدث الليدز' : 'Recent leads'}>
          {recent.length === 0 ? (
            <Empty text={ar ? 'لسه مفيش ليدز متسجلة عليك.' : 'No leads assigned to you yet.'} />
          ) : (
            <ul className="divide-y divide-white/5">
              {recent.map((lead) => (
                <li key={lead.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{lead.name}</p>
                    <p className="truncate text-xs text-gray-500">
                      {lead.projectName || lead.developerName || lead.source}
                    </p>
                  </div>
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', STATUS_STYLE[lead.status] || 'bg-white/10 text-gray-300')}>
                    {ar ? STATUS_LABEL_AR[lead.status] || lead.status : lead.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="space-y-5">
        <Panel
          title={ar ? 'المعاينات الجاية' : 'Upcoming viewings'}
          action={
            <button
              type="button"
              onClick={() => props.onOpenTab('Viewings')}
              className="text-[11px] font-medium text-estate-gold hover:underline"
            >
              {ar ? 'كل المعاينات' : 'All viewings'}
            </button>
          }
        >
          {upcoming.length === 0 ? (
            <Empty text={ar ? 'مفيش معاينات متحددة.' : 'No viewings scheduled.'} />
          ) : (
            <ul className="space-y-3">
              {upcoming.map((v) => (
                <li key={v.id} className="flex items-start gap-2 text-sm">
                  <CalendarClock className="mt-0.5 h-4 w-4 flex-shrink-0 text-estate-gold" />
                  <div>
                    <p className="text-white">
                      {v.leadName ? `${v.leadName} · ` : ''}
                      {new Date(v.scheduledAt).toLocaleString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                    <p className="text-xs text-gray-500">
                      {[v.projectName, v.unitName].filter(Boolean).join(' — ') || (v.meetingType === 'online'
                        ? (ar ? 'أونلاين' : 'online')
                        : (ar ? 'حضور شخصي' : v.meetingType.replace('_', ' ')))}
                      {' · '}{ar ? STATUS_LABEL_AR[v.status] || v.status : v.status}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title={ar ? 'حماية الليدز' : 'Lead protection'}
          action={
            <button
              type="button"
              onClick={() => props.onOpenTab('Partnership')}
              className="text-[11px] font-medium text-estate-gold hover:underline"
            >
              {ar ? 'تفاصيل الشراكة' : 'Partnership details'}
            </button>
          }
        >
          <dl className="space-y-2 text-sm">
            <Row label={ar ? 'ليدز تحت الحماية' : 'Protected leads'} value={String(props.partnership.protectedLeads)} />
            <Row label={ar ? 'بتخلص خلال ٧ أيام' : 'Expiring in 7 days'} value={String(props.partnership.expiringLeads)} />
            <Row label={ar ? 'قواعد الصلاحية' : 'Access grants'} value={String(props.partnership.accessRules.length)} />
          </dl>
        </Panel>

        <Panel title={ar ? 'حسابك' : 'Your account'}>
          <dl className="space-y-2 text-sm">
            <Row label={ar ? 'الخبرة' : 'Experience'} value={props.profile.yearsExperience ? (ar ? `${props.profile.yearsExperience} سنين` : `${props.profile.yearsExperience} yrs`) : '—'} />
            <Row label={ar ? 'صفقات متسجلة' : 'Deals recorded'} value={String(props.profile.totalDeals)} />
            <Row
              label={ar ? 'نسبة العمولة' : 'Commission rate'}
              value={props.profile.commissionRate != null ? `${props.profile.commissionRate}%` : '—'}
            />
            <Row label={ar ? 'الحالة' : 'Status'} value={ar ? ACCOUNT_STATUS_AR[props.profile.accountStatus] || props.profile.accountStatus : props.profile.accountStatus} />
          </dl>
          <button
            type="button"
            onClick={() => props.onOpenTab('Profile')}
            className="mt-3 w-full rounded-full border border-white/10 px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-estate-gold/40 hover:text-white"
          >
            {ar ? 'شوف حسابك وعدّله' : 'View and edit your profile'}
          </button>
        </Panel>

        <ClientRatings brokerId={props.profile.id} />
      </div>
    </div>
  )
}

/* ─── Client ratings — approved broker reviews ────────── */
// `brokerId` is this portal's BrokerProfile id; GET /api/broker-reviews
// resolves it to the broker's User id server-side.

type BrokerReviewRow = {
  id: string
  rating: number
  comment: string | null
  createdAt: string
  rater: { id: string; name: string | null } | null
}

function ClientRatings({ brokerId }: { brokerId: string }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [reviews, setReviews] = useState<BrokerReviewRow[] | null>(null)
  const [average, setAverage] = useState<number | null>(null)
  const [count, setCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setError(null)
    setReviews(null)
    fetch(`/api/broker-reviews?brokerId=${brokerId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('Failed to load ratings')
        return r.json()
      })
      .then((data) => {
        if (cancelled) return
        setReviews(data.reviews || [])
        setAverage(typeof data.average === 'number' ? data.average : null)
        setCount(typeof data.count === 'number' ? data.count : 0)
      })
      .catch((e) => {
        console.error('Broker ratings load failed:', e)
        if (!cancelled) setError(ar ? 'معرفناش نجيب التقييمات — جرب تاني.' : 'Could not load the ratings — try again.')
      })
    return () => {
      cancelled = true
    }
  }, [brokerId, attempt, ar])

  const summary = useMemo(() => {
    if (reviews === null || error) return null
    if (reviews.length === 0) return ar ? 'لسه مفيش تقييمات ظاهرة — تقييمات العملا المعتمدة هتظهر هنا.' : 'No visible ratings yet — approved client ratings will show here.'
    return null
  }, [reviews, error, ar])

  return (
    <Panel title={ar ? `تقييمات العملا${count > 0 ? ` (${count})` : ''}` : `Client ratings${count > 0 ? ` (${count})` : ''}`}>
      {reviews === null && !error ? (
        <p className="py-4 text-center text-sm text-gray-500">{ar ? 'بنحمّل التقييمات...' : 'Loading ratings…'}</p>
      ) : error ? (
        <div className="py-4 text-center">
          <p className="text-sm text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => setAttempt((a) => a + 1)}
            className="mt-2 rounded-full border border-white/10 px-4 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:border-estate-gold/40 hover:text-white"
          >
            {ar ? 'حاول تاني' : 'Retry'}
          </button>
        </div>
      ) : summary ? (
        <Empty text={summary} />
      ) : (
        <div className="space-y-3">
          {average != null && (
            <p className="text-sm text-white">
              <span className="font-bold text-estate-gold">★ {average.toFixed(1)}</span>
              <span className="text-gray-500">{ar ? `من 5 · ${count} تقييمات` : ` out of 5 · ${count} ratings`}</span>
            </p>
          )}
          <ul className="divide-y divide-white/5">
            {reviews!.map((r) => (
              <li key={r.id} className="py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-white">{r.rater?.name || (ar ? 'عميل' : 'Client')}</p>
                  <span className="shrink-0 rounded-full bg-estate-gold/15 px-2 py-0.5 text-[11px] font-semibold text-estate-gold">
                    ★ {r.rating}
                  </span>
                </div>
                {r.comment && <p className="mt-1 text-xs text-gray-400">{r.comment}</p>}
                <p className="mt-0.5 text-[11px] text-gray-600">
                  {new Date(r.createdAt).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  )
}

/* ─── Leads ────────────────────────────────────────────── */

function LeadsTab({ leads }: { leads: LeadRow[] }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [rows, setRows] = useState<LeadRow[]>(leads)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<string>('ALL')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((l) => {
      if (status !== 'ALL' && l.status !== status) return false
      if (!q) return true
      return (
        l.name.toLowerCase().includes(q) ||
        l.phone.includes(q) ||
        (l.email || '').toLowerCase().includes(q) ||
        (l.projectName || '').toLowerCase().includes(q)
      )
    })
  }, [rows, query, status])

  async function changeStatus(lead: LeadRow, next: string) {
    if (next === lead.status) return
    if (next === 'LOST' && !confirm(ar ? `تعلّم الليد «${lead.name}» كضايع؟` : `Mark “${lead.name}” as lost?`)) return
    const previous = lead.status
    setSavingId(lead.id)
    setError(null)
    // Optimistic — roll back if the server rejects it.
    setRows((prev) => prev.map((r) => (r.id === lead.id ? { ...r, status: next } : r)))
    try {
      const { ok, data } = await apiJson('/api/broker/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lead.id, status: next }),
      })
      if (!ok) throw new Error((data?.error as string) || 'Update failed')
    } catch (e) {
      console.error('Lead status update failed:', e)
      setError(friendlyApiError(e instanceof Error ? e.message : '', ar))
      setRows((prev) => prev.map((r) => (r.id === lead.id ? { ...r, status: previous } : r)))
    } finally {
      setSavingId(null)
    }
  }

  return (
    <Panel title={ar ? `الليدز (${filtered.length})` : `Leads (${filtered.length})`}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={ar ? 'دوّر بالاسم أو التليفون أو الإيميل أو المشروع...' : 'Search name, phone, email or project…'}
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
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ar ? STATUS_LABEL_AR[s] || s : s}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p className="mb-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}

      {filtered.length === 0 ? (
        <Empty text={ar ? 'مفيش ليدز مطابقة للفلاتر دي.' : 'No leads match these filters.'} />
      ) : (
        <div className="overflow-x-auto rounded-2xl">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="pb-3 pr-3 font-medium">{ar ? 'الليد' : 'Lead'}</th>
                <th className="pb-3 pr-3 font-medium">{ar ? 'المشروع' : 'Project'}</th>
                <th className="pb-3 pr-3 font-medium">{ar ? 'الميزانية' : 'Budget'}</th>
                <th className="pb-3 pr-3 font-medium">{ar ? 'المتابعة الجاية' : 'Next follow-up'}</th>
                <th className="pb-3 pr-3 font-medium">{ar ? 'الحالة' : 'Status'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((lead) => (
                <tr key={lead.id} className="align-middle">
                  <td className="py-3 pr-3">
                    <button
                      type="button"
                      onClick={() => setDetailId(lead.id)}
                      className="group flex items-center gap-1.5 text-left font-medium text-white hover:text-estate-gold"
                    >
                      <span className="group-hover:underline">{lead.name}</span>
                      <Eye className="h-3.5 w-3.5 text-gray-500 group-hover:text-estate-gold" />
                    </button>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {lead.phone}
                      {lead.email ? ` · ${lead.email}` : ''}
                      {lead.leadCode ? ` · ${lead.leadCode}` : ''}
                    </p>
                  </td>
                  <td className="py-3 pr-3 text-gray-300">
                    {lead.projectSlug ? (
                      <Link href={`/projects/${lead.projectSlug}`} className="hover:text-estate-gold">
                        {lead.projectName}
                      </Link>
                    ) : (
                      lead.projectName || lead.developerName || '—'
                    )}
                  </td>
                  <td className="py-3 pr-3 text-gray-300">
                    {lead.budgetMin || lead.budgetMax
                      ? `${lead.budgetMin ? formatEGP(Math.round(lead.budgetMin)) : '—'} – ${
                          lead.budgetMax ? formatEGP(Math.round(lead.budgetMax)) : '—'
                        }`
                      : '—'}
                  </td>
                  <td className="py-3 pr-3 text-xs text-gray-400">
                    {lead.nextFollowUp
                      ? new Date(lead.nextFollowUp).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                        })
                      : '—'}
                  </td>
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          STATUS_STYLE[lead.status] || 'bg-white/10 text-gray-300'
                        )}
                      >
                        {ar ? STATUS_LABEL_AR[lead.status] || lead.status : lead.status}
                      </span>
                      <select
                        aria-label={ar ? `غيّر حالة ${lead.name}` : `Change status for ${lead.name}`}
                        value={lead.status}
                        disabled={savingId === lead.id}
                        onChange={(e) => changeStatus(lead, e.target.value)}
                        className="rounded-xl border border-white/10 bg-black/40 px-1.5 py-1 text-[11px] text-gray-300 focus:border-estate-gold/60 focus:outline-none disabled:opacity-50"
                      >
                        {savingId === lead.id && <option>{ar ? STATUS_LABEL_AR[lead.status] || lead.status : lead.status}</option>}
                        {LEAD_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {ar ? STATUS_LABEL_AR[s] || s : s}
                          </option>
                        ))}
                      </select>
                      {savingId === lead.id && (
                        <Loader2 className="h-3 w-3 animate-spin text-estate-gold" />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {detailId && (
        <LeadDetailModal
          leadId={detailId}
          onClose={() => setDetailId(null)}
          onSaved={(patch) =>
            setRows((prev) => prev.map((r) => (r.id === detailId ? { ...r, ...patch } : r)))
          }
        />
      )}
    </Panel>
  )
}

/* ─── Lead detail modal (scoped GET /api/leads/[id]) ─────
// Brokers get 'full' access to their own leads there, so the modal reuses
// that endpoint instead of a new one: contact, protection window, linked
// deal, activity — plus follow-up + notes editing via PATCH
// /api/broker/leads (ownership-scoped, same guard as the inline select).
*/

type LeadDetail = {
  id: string
  leadCode: string | null
  name: string
  phone: string
  email: string | null
  status: string
  source: string
  budgetMin: number | null
  budgetMax: number | null
  notes: string | null
  nextFollowUp: string | null
  protectionStartsAt: string | null
  protectionExpiresAt: string | null
  protectionDays: number | null
  protectionStatus?: string
  createdAt: string
  project?: { name: string; slug: string } | null
  unit?: { name: string } | null
  developer?: { companyName: string } | null
  deals?: { id: string; status: string; dealValue: number | null }[]
  viewings?: { id: string; scheduledAt: string; status: string }[]
  activities?: { id: string; type: string; content: string | null; createdAt: string }[]
}

function LeadDetailModal({
  leadId,
  onClose,
  onSaved,
}: {
  leadId: string
  onClose: () => void
  onSaved: (patch: Partial<LeadRow>) => void
}) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [detail, setDetail] = useState<LeadDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [followUp, setFollowUp] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedTick, setSavedTick] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/leads/${leadId}`, { headers: { ...CSRF_HEADERS } })
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({} as Record<string, unknown>))
          throw new Error(typeof d.error === 'string' ? d.error : 'Load failed')
        }
        return r.json()
      })
      .then((data) => {
        if (cancelled) return
        const lead = data.lead as LeadDetail
        setDetail(lead)
        setFollowUp(lead.nextFollowUp ? lead.nextFollowUp.slice(0, 16) : '')
        setNotes(lead.notes || '')
      })
      .catch((e) => {
        console.error('Lead detail load failed:', e)
        if (!cancelled) setError(friendlyApiError(e instanceof Error ? e.message : '', ar))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [leadId, ar])

  async function save() {
    if (!detail) return
    setSaving(true)
    setSaveError(null)
    try {
      const { ok, data } = await apiJson('/api/broker/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: detail.id,
          nextFollowUp: followUp ? new Date(followUp).toISOString() : null,
          notes,
        }),
      })
      if (!ok) throw new Error((data?.error as string) || 'Update failed')
      setDetail((d) =>
        d
          ? {
              ...d,
              nextFollowUp: (data?.nextFollowUp as string | null) ?? null,
              notes: (data?.notes as string | null) ?? null,
            }
          : d
      )
      onSaved({
        nextFollowUp: (data?.nextFollowUp as string | null) ?? null,
        notes: (data?.notes as string | null) ?? null,
      })
      setSavedTick(true)
      setTimeout(() => setSavedTick(false), 2000)
    } catch (e) {
      console.error('Lead detail save failed:', e)
      setSaveError(friendlyApiError(e instanceof Error ? e.message : '', ar))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/10 bg-[#111111] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-white">
            {loading ? (ar ? 'جارِ التحميل...' : 'Loading...') : detail?.name}
            {detail?.leadCode && (
              <span className="ml-2 font-mono text-sm text-gray-500">{detail.leadCode}</span>
            )}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={ar ? 'اقفل' : 'Close'}
            className="rounded-full p-1.5 text-gray-400 hover:bg-white/5 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin text-estate-gold" />
            {ar ? 'بنحمّل بيانات الليد...' : 'Loading lead details...'}
          </div>
        ) : error || !detail ? (
          <div className="py-6 text-center">
            <p className="text-sm text-red-400">{error || (ar ? 'معرفناش نجيب الليد.' : 'Could not load the lead.')}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 rounded-full border border-white/10 px-4 py-1.5 text-xs font-medium text-gray-300 hover:border-estate-gold/40 hover:text-white"
            >
              {ar ? 'اقفل' : 'Close'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', statusStyle(detail.status))}>
                {statusLabel(detail.status, ar)}
              </span>
              {detail.protectionStatus && detail.protectionStatus !== 'NONE' ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
                  <Shield className="h-3 w-3" />
                  {ar ? `حماية لحد ${detail.protectionExpiresAt ? new Date(detail.protectionExpiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}` : `Protected${detail.protectionExpiresAt ? ` till ${new Date(detail.protectionExpiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}`}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-gray-400">
                  <Shield className="h-3 w-3" />
                  {ar ? 'بدون حماية' : 'No protection'}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <p className="flex items-center gap-2 text-gray-200">
                <Phone className="h-4 w-4 shrink-0 text-gray-500" />
                <span dir="ltr">{detail.phone}</span>
              </p>
              {detail.email && (
                <p className="flex items-center gap-2 text-gray-200">
                  <Mail className="h-4 w-4 shrink-0 text-gray-500" />
                  <span dir="ltr" className="truncate">{detail.email}</span>
                </p>
              )}
              <p className="text-gray-300">
                {detail.project?.slug ? (
                  <Link href={`/projects/${detail.project.slug}`} className="hover:text-estate-gold">
                    {detail.project.name}
                  </Link>
                ) : (
                  detail.project?.name || detail.developer?.companyName || (ar ? 'بدون مشروع' : 'No project')
                )}
                {detail.unit ? ` — ${detail.unit.name}` : ''}
              </p>
              {(detail.budgetMin || detail.budgetMax) && (
                <p className="text-gray-300">
                  {detail.budgetMin ? formatEGP(Math.round(detail.budgetMin)) : '—'}
                  {' – '}
                  {detail.budgetMax ? formatEGP(Math.round(detail.budgetMax)) : '—'}
                </p>
              )}
            </div>

            {detail.protectionStartsAt && detail.protectionExpiresAt && (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 font-medium text-white">
                    <Shield className="h-4 w-4 text-emerald-400" />
                    {ar ? 'فترة الحماية' : 'Protection window'}
                  </span>
                  <span className="text-xs text-gray-500">
                    {detail.protectionDays} {ar ? 'يوم' : 'days'}
                  </span>
                </div>
                <div className="mt-1 flex justify-between text-xs text-gray-500">
                  <span>{new Date(detail.protectionStartsAt).toLocaleDateString('en-GB')}</span>
                  <span>{new Date(detail.protectionExpiresAt).toLocaleDateString('en-GB')}</span>
                </div>
              </div>
            )}

            {detail.deals && detail.deals.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm">
                <p className="font-medium text-white">{ar ? 'الصفقة المرتبطة' : 'Linked deal'}</p>
                <p className="mt-0.5 text-gray-400">
                  {statusLabel(detail.deals[0].status, ar)}
                  {detail.deals[0].dealValue ? ` — ${formatEGP(Math.round(detail.deals[0].dealValue))}` : ''}
                </p>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs text-gray-500">{ar ? 'المتابعة الجاية' : 'Next follow-up'}</span>
                <input
                  type="datetime-local"
                  value={followUp}
                  onChange={(e) => setFollowUp(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-estate-gold/60 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-gray-500">{ar ? 'ملاحظات' : 'Notes'}</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  placeholder={ar ? 'اكتب ملاحظة عن الليد...' : 'Add a note about this lead...'}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-estate-gold/60 focus:outline-none"
                />
              </label>
            </div>

            {saveError && (
              <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {saveError}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-full bg-estate-gold px-4 py-2 text-xs font-bold text-[#0F1A2C] transition-colors hover:bg-estate-gold/90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : savedTick ? <Check className="h-3.5 w-3.5" /> : null}
                {savedTick ? (ar ? 'اتحفظت' : 'Saved') : (ar ? 'احفظ' : 'Save')}
              </button>
              {detail.viewings && detail.viewings.length > 0 && (
                <p className="text-[11px] text-gray-500">
                  {ar ? `${detail.viewings.length} معاينات مرتبطة` : `${detail.viewings.length} linked viewings`}
                </p>
              )}
            </div>

            {detail.activities && detail.activities.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium text-white">{ar ? 'آخر نشاط' : 'Recent activity'}</p>
                <ul className="space-y-2 text-sm">
                  {detail.activities.slice(0, 6).map((a) => (
                    <li key={a.id} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
                      <p className="text-xs font-medium text-gray-300">{a.type.replace(/_/g, ' ')}</p>
                      {a.content && <p className="mt-0.5 text-xs text-gray-500" dir="auto">{a.content}</p>}
                      <p className="mt-0.5 text-[11px] text-gray-600">
                        {new Date(a.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Deals ────────────────────────────────────────────── */

function DealsTab({ deals }: { deals: DealRow[] }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  if (deals.length === 0) return <Panel title={ar ? 'الصفقات' : 'Deals'}><Empty text={ar ? 'لسه مفيش صفقات محسوبة عليك.' : 'No deals attributed to you yet.'} /></Panel>

  return (
    <Panel title={ar ? `الصفقات (${deals.length})` : `Deals (${deals.length})`}>
      <div className="overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[44rem] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="pb-3 pr-3 font-medium">{ar ? 'المشروع' : 'Project'}</th>
              <th className="pb-3 pr-3 font-medium">{ar ? 'الوحدة' : 'Unit'}</th>
              <th className="pb-3 pr-3 font-medium">{ar ? 'القيمة' : 'Value'}</th>
              <th className="pb-3 pr-3 font-medium">{ar ? 'العمولة' : 'Commission'}</th>
              <th className="pb-3 pr-3 font-medium">{ar ? 'الحالة' : 'Status'}</th>
              <th className="pb-3 font-medium">{ar ? 'التاريخ' : 'Date'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {deals.map((deal) => (
              <tr key={deal.id}>
                <td className="py-3 pr-3">
                  <p className="font-medium text-white">{deal.projectName}</p>
                  <p className="text-xs text-gray-500">{deal.developerName}</p>
                </td>
                <td className="py-3 pr-3 text-gray-300">{deal.unitName || '—'}</td>
                <td className="py-3 pr-3 text-white">
                  {deal.dealValue ? formatEGP(Math.round(deal.dealValue)) : '—'}
                </td>
                <td className="py-3 pr-3 text-estate-gold">
                  {deal.commissionAmount != null ? formatEGP(Math.round(deal.commissionAmount)) : '—'}
                </td>
                <td className="py-3 pr-3">
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', STATUS_STYLE[deal.status] || 'bg-white/10 text-gray-300')}>
                    {ar ? STATUS_LABEL_AR[deal.status] || deal.status : deal.status}
                  </span>
                </td>
                <td className="py-3 text-xs text-gray-400">
                  {new Date(deal.createdAt).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

/* ─── Commissions ──────────────────────────────────────── */

function CommissionsTab({ commissions }: { commissions: CommissionRow[] }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const total = commissions.reduce((s, c) => s + c.brokerAmount, 0)
  const paid = commissions.filter((c) => c.status === 'PAID').reduce((s, c) => s + c.brokerAmount, 0)

  return (
    <Panel title={ar ? `العمولات (${commissions.length})` : `Commissions (${commissions.length})`}>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MiniStat label={ar ? 'الإجمالي' : 'Total'} value={formatEGP(Math.round(total))} />
        <MiniStat label={ar ? 'المدفوع' : 'Paid'} value={formatEGP(Math.round(paid))} accent />
        <MiniStat label={ar ? 'المستحق' : 'Outstanding'} value={formatEGP(Math.round(total - paid))} />
      </div>

      {commissions.length === 0 ? (
        <Empty text={ar ? 'لسه مفيش عمولات متسجلة.' : 'No commissions recorded yet.'} />
      ) : (
        <div className="overflow-x-auto rounded-2xl">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="pb-3 pr-3 font-medium">{ar ? 'المشروع' : 'Project'}</th>
                <th className="pb-3 pr-3 font-medium">{ar ? 'حصتك' : 'Your share'}</th>
                <th className="pb-3 pr-3 font-medium">{ar ? 'الإجمالي' : 'Total'}</th>
                <th className="pb-3 pr-3 font-medium">{ar ? 'الاستحقاق' : 'Due'}</th>
                <th className="pb-3 font-medium">{ar ? 'الحالة' : 'Status'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {commissions.map((c) => (
                <tr key={c.id}>
                  <td className="py-3 pr-3 font-medium text-white">{c.projectName}</td>
                  <td className="py-3 pr-3 font-semibold text-estate-gold">
                    {formatEGP(Math.round(c.brokerAmount))}
                  </td>
                  <td className="py-3 pr-3 text-gray-400">{formatEGP(Math.round(c.totalAmount))}</td>
                  <td className="py-3 pr-3 text-xs text-gray-400">
                    {c.dueDate
                      ? new Date(c.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                      : '—'}
                  </td>
                  <td className="py-3">
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', STATUS_STYLE[c.status] || 'bg-white/10 text-gray-300')}>
                      {ar ? STATUS_LABEL_AR[c.status] || c.status : c.status}
                    </span>
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

/* ─── Projects ─────────────────────────────────────────── */

function ProjectsTab({ projects }: { projects: ProjectRow[] }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  if (projects.length === 0) {
    return (
      <Panel title={ar ? 'مشاريع معتمدة' : 'Approved projects'}>
        <Empty text={ar ? 'لسه معندكش صلاحية على مشاريع. فريق المنصة بيدي الصلاحية لكل مطور أو مشروع.' : "You don't have project access yet. The platform team grants access per developer or per project."} />
      </Panel>
    )
  }

  return (
    <Panel title={ar ? `مشاريع تقدر تبيعها (${projects.length})` : `Projects you can sell (${projects.length})`}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/projects/${p.slug}`}
            className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-colors hover:border-estate-gold/40"
          >
            <div className="relative aspect-[16/9] bg-white/5">
              {p.coverImage && (
                <Image
                  src={p.coverImage}
                  alt={p.name}
                  fill
                  sizes="(max-width: 640px) 100vw, 33vw"
                  className="object-cover"
                />
              )}
              <span className="absolute left-2 top-2 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white backdrop-blur">
                {ar ? `صلاحية ${SCOPE_LABEL_AR[p.scope] || p.scope}` : `${p.scope} access`}
              </span>
            </div>
            <div className="p-3">
              <p className="truncate text-sm font-semibold text-white group-hover:text-estate-gold">
                {p.name}
              </p>
              <p className="truncate text-xs text-gray-500">
                {[p.developerName, p.location].filter(Boolean).join(' · ')}
              </p>
              <p className="mt-1 text-sm font-bold text-estate-gold">
                {p.startPrice ? (ar ? `من ${formatEGP(Math.round(p.startPrice))}` : `from ${formatEGP(Math.round(p.startPrice))}`) : (ar ? 'السعر عند الطلب' : 'Price on request')}
              </p>
              {p.expiresAt && (
                <p className="mt-1 text-[11px] text-amber-400">
                  {ar ? `الصلاحية بتخلص ${new Date(p.expiresAt).toLocaleDateString('en-GB')}` : `Access expires ${new Date(p.expiresAt).toLocaleDateString('en-GB')}`}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </Panel>
  )
}

/* ─── Viewings (upcoming/past + schedule/reschedule/cancel) ─── */

function ViewingsTab({ upcoming, past, leads }: { upcoming: ViewingRow[]; past: ViewingRow[]; leads: LeadRow[] }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [sub, setSub] = useState<'upcoming' | 'past'>('upcoming')
  const [rows, setRows] = useState<ViewingRow[]>([...upcoming, ...past])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rescheduleId, setRescheduleId] = useState<string | null>(null)
  const [newDate, setNewDate] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Schedule-new form state
  const [leadId, setLeadId] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [meetingType, setMeetingType] = useState<'in_person' | 'online'>('in_person')
  const [scheduling, setScheduling] = useState(false)

  const now = Date.now()
  const list = (sub === 'upcoming' ? rows.filter((v) => new Date(v.scheduledAt).getTime() >= now) : rows.filter((v) => new Date(v.scheduledAt).getTime() < now))
    .slice()
    .sort((a, b) =>
      sub === 'upcoming'
        ? +new Date(a.scheduledAt) - +new Date(b.scheduledAt)
        : +new Date(b.scheduledAt) - +new Date(a.scheduledAt)
    )

  function upsertRow(next: ViewingRow) {
    setRows((prev) => {
      const exists = prev.some((v) => v.id === next.id)
      return exists ? prev.map((v) => (v.id === next.id ? next : v)) : [next, ...prev]
    })
  }

  async function cancelViewing(v: ViewingRow) {
    if (!confirm(ar ? `تلغي معاينة ${v.leadName || ''} يوم ${new Date(v.scheduledAt).toLocaleDateString('en-GB')}؟` : `Cancel the viewing for ${v.leadName || 'this lead'} on ${new Date(v.scheduledAt).toLocaleDateString('en-GB')}?`)) return
    setBusyId(v.id)
    setError(null)
    try {
      const { ok, data } = await apiJson(`/api/broker/viewings?id=${v.id}`, { method: 'DELETE' })
      if (!ok) throw new Error((data?.error as string) || 'Cancel failed')
      if (data?.viewing) upsertRow(data.viewing as ViewingRow)
      else setRows((prev) => prev.map((r) => (r.id === v.id ? { ...r, status: 'CANCELLED' } : r)))
    } catch (e) {
      console.error('Cancel viewing failed:', e)
      setError(friendlyApiError(e instanceof Error ? e.message : '', ar))
    } finally {
      setBusyId(null)
    }
  }

  async function rescheduleViewing(v: ViewingRow) {
    if (!newDate) {
      setError(ar ? 'اختار المعاد الجديد الأول.' : 'Pick the new date and time first.')
      return
    }
    setBusyId(v.id)
    setError(null)
    try {
      const { ok, data } = await apiJson('/api/broker/viewings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: v.id, scheduledAt: new Date(newDate).toISOString() }),
      })
      if (!ok) throw new Error((data?.error as string) || 'Reschedule failed')
      if (data?.viewing) upsertRow(data.viewing as ViewingRow)
      setRescheduleId(null)
      setNewDate('')
    } catch (e) {
      console.error('Reschedule viewing failed:', e)
      setError(friendlyApiError(e instanceof Error ? e.message : '', ar))
    } finally {
      setBusyId(null)
    }
  }

  async function scheduleViewing() {
    if (!leadId) {
      setError(ar ? 'اختار الليد الأول.' : 'Pick a lead first.')
      return
    }
    if (!date || !time) {
      setError(ar ? 'اختار اليوم والساعة.' : 'Pick a day and a time.')
      return
    }
    setScheduling(true)
    setError(null)
    try {
      const { ok, data } = await apiJson('/api/broker/viewings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          scheduledAt: new Date(`${date}T${time}`).toISOString(),
          meetingType,
        }),
      })
      if (!ok) throw new Error((data?.error as string) || 'Schedule failed')
      if (data?.viewing) upsertRow(data.viewing as ViewingRow)
      setShowForm(false)
      setLeadId('')
      setDate('')
      setTime('')
      setSub('upcoming')
    } catch (e) {
      console.error('Schedule viewing failed:', e)
      setError(friendlyApiError(e instanceof Error ? e.message : '', ar))
    } finally {
      setScheduling(false)
    }
  }

  async function copyLink(v: ViewingRow) {
    if (!v.meetingLink) return
    try {
      await navigator.clipboard.writeText(v.meetingLink)
      setCopiedId(v.id)
      setTimeout(() => setCopiedId((c) => (c === v.id ? null : c)), 2000)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <Panel
      title={ar ? 'معايناتي' : 'My viewings'}
      action={
        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          className="rounded-full bg-estate-gold px-3 py-1.5 text-[11px] font-bold text-[#0F1A2C] hover:bg-estate-gold/90"
        >
          {ar ? '+ حدّد معاينة' : '+ Schedule'}
        </button>
      }
    >
      {showForm && (
        <div className="mb-4 rounded-2xl border border-estate-gold/30 bg-estate-gold/[0.05] p-4">
          <p className="mb-3 text-xs font-semibold text-white">{ar ? 'معاينة جديدة لليد بتاعك' : 'New viewing for one of your leads'}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-gray-500">{ar ? 'الليد' : 'Lead'}</span>
              <select
                value={leadId}
                onChange={(e) => setLeadId(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-estate-gold/60 focus:outline-none"
              >
                <option value="">{ar ? 'اختار...' : 'Pick...'}</option>
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} · {l.phone}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-xs text-gray-500">{ar ? 'اليوم' : 'Day'}</span>
                <input
                  type="date"
                  value={date}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-estate-gold/60 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-gray-500">{ar ? 'الساعة' : 'Time'}</span>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-estate-gold/60 focus:outline-none"
                />
              </label>
            </div>
            <div className="flex items-center gap-2">
              {(['in_person', 'online'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setMeetingType(t)}
                  aria-pressed={meetingType === t}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    meetingType === t
                      ? 'border-estate-gold bg-estate-gold/15 text-estate-gold'
                      : 'border-white/10 text-gray-400 hover:text-white'
                  )}
                >
                  {t === 'online' ? (ar ? 'أونلاين' : 'Online') : (ar ? 'حضور شخصي' : 'In person')}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={scheduleViewing}
                disabled={scheduling}
                className="inline-flex items-center gap-1.5 rounded-full bg-estate-gold px-4 py-2 text-xs font-bold text-[#0F1A2C] hover:bg-estate-gold/90 disabled:opacity-50"
              >
                {scheduling && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {ar ? 'أكّد المعاينة' : 'Confirm viewing'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-full border border-white/10 px-4 py-2 text-xs text-gray-300 hover:text-white"
              >
                {ar ? 'إلغي' : 'Dismiss'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4 flex gap-2">
        {(['upcoming', 'past'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setSub(k)}
            className={cn(
              'rounded-full border px-4 py-1.5 text-xs font-medium transition-colors',
              sub === k
                ? 'border-estate-gold bg-estate-gold/10 text-estate-gold'
                : 'border-white/10 text-gray-400 hover:text-white'
            )}
          >
            {ar ? (k === 'upcoming' ? 'الجاية' : 'اللي فاتت') : k}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}

      {list.length === 0 ? (
        <Empty
          text={
            sub === 'upcoming'
              ? (ar ? 'مفيش معاينات جاية — حدّد معاينة لليد من الزرار اللي فوق.' : 'No upcoming viewings — schedule one for a lead above.')
              : (ar ? 'مفيش معاينات فاتت.' : 'No past viewings.')
          }
        />
      ) : (
        <ul className="space-y-3">
          {list.map((v) => {
            const d = new Date(v.scheduledAt)
            const canAct = ['REQUESTED', 'CONFIRMED', 'SCHEDULED', 'SCHEDULED_APPOINTMENT'].includes(v.status.toUpperCase()) && d.getTime() > now
            const rescheduling = rescheduleId === v.id
            return (
              <li key={v.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-white">{v.leadName || (ar ? 'معاينة' : 'Viewing')}</p>
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', statusStyle(v.status))}>
                        {statusLabel(v.status, ar)}
                      </span>
                      <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-gray-400">
                        {v.meetingType === 'online' ? (ar ? 'أونلاين' : 'Online') : (ar ? 'حضور شخصي' : 'In person')}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-400">
                      {[v.projectName, v.unitName].filter(Boolean).join(' — ') || '—'}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                      <span>
                        {d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                        {' · '}
                        {d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {v.contactPhone && <span dir="ltr">{v.contactPhone}</span>}
                    </p>
                    {v.notes && <p className="mt-1 text-xs text-gray-500" dir="auto">{v.notes}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {v.meetingLink && v.status.toUpperCase() !== 'CANCELLED' && (
                      <>
                        <button
                          type="button"
                          onClick={() => copyLink(v)}
                          className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-gray-300 hover:border-estate-gold/40 hover:text-white"
                        >
                          {copiedId === v.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                          {copiedId === v.id ? (ar ? 'اتنسخ' : 'Copied') : (ar ? 'انسخ اللينك' : 'Copy link')}
                        </button>
                        <a
                          href={v.meetingLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-full bg-estate-gold px-3 py-1.5 text-[11px] font-bold text-[#0F1A2C] hover:bg-estate-gold/90"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          {ar ? 'ادخل' : 'Join'}
                        </a>
                      </>
                    )}
                    {canAct && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setError(null)
                            setNewDate(v.scheduledAt.slice(0, 16))
                            setRescheduleId(rescheduling ? null : v.id)
                          }}
                          className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-gray-300 hover:border-estate-gold/40 hover:text-white"
                        >
                          {ar ? 'غيّر المعاد' : 'Reschedule'}
                        </button>
                        <button
                          type="button"
                          onClick={() => cancelViewing(v)}
                          disabled={busyId === v.id}
                          className="rounded-full border border-red-500/30 px-3 py-1.5 text-[11px] text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                        >
                          {busyId === v.id ? (ar ? '...' : '...') : (ar ? 'إلغي' : 'Cancel')}
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {rescheduling && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                    <input
                      type="datetime-local"
                      value={newDate}
                      min={new Date().toISOString().slice(0, 16)}
                      onChange={(e) => setNewDate(e.target.value)}
                      className="rounded-xl border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-white focus:border-estate-gold/60 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => rescheduleViewing(v)}
                      disabled={busyId === v.id}
                      className="inline-flex items-center gap-1 rounded-full bg-estate-gold px-3 py-1.5 text-[11px] font-bold text-[#0F1A2C] hover:bg-estate-gold/90 disabled:opacity-50"
                    >
                      {busyId === v.id && <Loader2 className="h-3 w-3 animate-spin" />}
                      {ar ? 'أكّد المعاد الجديد' : 'Confirm new time'}
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

/* ─── Inquiries assigned to me (GET /api/inquiries, role-scoped) ─── */

type InquiryRow = {
  id: string
  name: string
  phone: string
  email: string | null
  message: string | null
  type: string
  status: string
  createdAt: string
  unit?: { name: string; slug: string } | null
}

const INQUIRY_STATUS_AR: Record<string, string> = {
  NEW: 'جديد',
  CONTACTED: 'تم التواصل',
  RESOLVED: 'اتحل',
  CLOSED: 'اتقفل',
}

function InquiriesTab() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [inquiries, setInquiries] = useState<InquiryRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    setInquiries(null)
    fetch('/api/inquiries?limit=50', { headers: { ...CSRF_HEADERS } })
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({} as Record<string, unknown>))
          throw new Error(typeof d.error === 'string' ? d.error : 'Load failed')
        }
        return r.json()
      })
      .then((data) => {
        if (!cancelled) setInquiries(Array.isArray(data.inquiries) ? data.inquiries : [])
      })
      .catch((e) => {
        console.error('Broker inquiries load failed:', e)
        if (!cancelled) setError(friendlyApiError(e instanceof Error ? e.message : '', ar))
      })
    return () => {
      cancelled = true
    }
  }, [attempt, ar])

  async function copyPhone(inq: InquiryRow) {
    try {
      await navigator.clipboard.writeText(inq.phone)
      setCopiedId(inq.id)
      setTimeout(() => setCopiedId((c) => (c === inq.id ? null : c)), 1600)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <Panel title={ar ? `الاستفسارات المتحولة عليّا (${inquiries?.length ?? '…'})` : `Inquiries assigned to me (${inquiries?.length ?? '…'})`}>
      {inquiries === null && !error ? (
        <p className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin text-estate-gold" />
          {ar ? 'بنحمّل الاستفسارات...' : 'Loading inquiries...'}
        </p>
      ) : error || inquiries === null ? (
        <div className="py-6 text-center">
          <p className="text-sm text-red-400">{error || (ar ? 'معرفناش نجيب الاستفسارات.' : 'Could not load inquiries.')}</p>
          <button
            type="button"
            onClick={() => setAttempt((a) => a + 1)}
            className="mt-2 rounded-full border border-white/10 px-4 py-1.5 text-xs font-medium text-gray-300 hover:border-estate-gold/40 hover:text-white"
          >
            {ar ? 'حاول تاني' : 'Retry'}
          </button>
        </div>
      ) : inquiries.length === 0 ? (
        <Empty text={ar ? 'مفيش استفسارات متحولة عليك لسه — أول ما حد يطلبك هتظهر هنا.' : 'No inquiries routed to you yet — they will show up here when assigned.'} />
      ) : (
        <ul className="space-y-3">
          {inquiries.map((inq) => (
            <li key={inq.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-white">{inq.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
                    <span dir="ltr">{inq.phone}</span>
                    {inq.email && <span dir="ltr">{inq.email}</span>}
                    {inq.unit && (
                      <Link href={`/units/${inq.unit.slug}`} className="text-estate-gold hover:underline">
                        {inq.unit.name}
                      </Link>
                    )}
                  </p>
                </div>
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', statusStyle(inq.status))}>
                  {ar ? INQUIRY_STATUS_AR[inq.status] || inq.status : inq.status}
                </span>
              </div>
              {inq.message && <p className="mt-2 text-sm text-gray-300" dir="auto">{inq.message}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => copyPhone(inq)}
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-gray-300 hover:border-estate-gold/40 hover:text-white"
                >
                  {copiedId === inq.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedId === inq.id ? (ar ? 'اتنسخ' : 'Copied') : (ar ? 'انسخ الرقم' : 'Copy number')}
                </button>
                <a
                  href={`tel:${inq.phone.replace(/\s/g, '')}`}
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-gray-300 hover:border-estate-gold/40 hover:text-white"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {ar ? 'اتصل' : 'Call'}
                </a>
                <span className="ml-auto text-[11px] text-gray-600">
                  {new Date(inq.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/* ─── Partnership (read-only: access grants + commission terms) ─── */

function PartnershipTab({ partnership }: { partnership: PartnershipInfo }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'

  return (
    <div className="space-y-5">
      <Panel title={ar ? 'حماية الليدز بتاعتك' : 'Your lead protection'}>
        <div className="grid grid-cols-2 gap-3">
          <MiniStat label={ar ? 'ليدز تحت الحماية' : 'Protected leads'} value={String(partnership.protectedLeads)} accent />
          <MiniStat label={ar ? 'بتخلص خلال ٧ أيام' : 'Expiring in 7 days'} value={String(partnership.expiringLeads)} />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-gray-500">
          {ar
            ? 'الليد المسجل عليك محمي من التحويل لوسيط تاني لحد ما فترته تخلص — التفاصيل لكل ليد في تاب الليدز (دوس على اسم الليد).'
            : 'A lead registered to you is protected from reassignment until its window ends — per-lead detail lives in the Leads tab (tap a lead name).'}
        </p>
      </Panel>

      <Panel title={ar ? `شروط العمولة (${partnership.commissionRules.length})` : `Commission terms (${partnership.commissionRules.length})`}>
        {partnership.commissionRules.length === 0 ? (
          <Empty text={ar ? 'مفيش شروط عمولة متسجلة — اسأل إدارة المنصة.' : 'No commission terms on record — ask the platform team.'} />
        ) : (
          <div className="overflow-x-auto rounded-2xl">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="pb-3 pr-3 font-medium">{ar ? 'القاعدة' : 'Rule'}</th>
                  <th className="pb-3 pr-3 font-medium">{ar ? 'النطاق' : 'Scope'}</th>
                  <th className="pb-3 pr-3 font-medium">{ar ? 'حصتك' : 'Your share'}</th>
                  <th className="pb-3 font-medium">{ar ? 'الإجمالي' : 'Total'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {partnership.commissionRules.map((r) => (
                  <tr key={r.id}>
                    <td className="py-3 pr-3 font-medium text-white">
                      {r.name}
                      {r.isDefault && (
                        <span className="ml-2 rounded-full bg-estate-gold/15 px-2 py-0.5 text-[10px] font-semibold text-estate-gold">
                          {ar ? 'الأساسية' : 'Default'}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-xs text-gray-400">
                      {r.projectName || r.developerName || (ar ? 'كل المنصة' : 'Platform-wide')}
                    </td>
                    <td className="py-3 pr-3 font-semibold text-estate-gold">{r.brokerPct}%</td>
                    <td className="py-3 text-gray-300">{r.totalPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title={ar ? `صلاحيات المشاريع (${partnership.accessRules.length})` : `Project access grants (${partnership.accessRules.length})`}>
        {partnership.accessRules.length === 0 ? (
          <Empty text={ar ? 'لسه معندكش صلاحية على مشاريع. فريق المنصة بيدي الصلاحية لكل مطور أو مشروع.' : "You don't have project access yet. The platform team grants access per developer or per project."} />
        ) : (
          <ul className="space-y-2">
            {partnership.accessRules.map((rule) => (
              <li key={rule.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-white">
                    {rule.projectName ? (
                      rule.projectSlug ? (
                        <Link href={`/projects/${rule.projectSlug}`} className="hover:text-estate-gold">
                          {rule.projectName}
                        </Link>
                      ) : rule.projectName
                    ) : (
                      rule.developerName || (ar ? 'كل مشاريع المطور' : 'All developer projects')
                    )}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {rule.developerName}
                    {rule.scope === 'DEVELOPER' ? (ar ? ' · كل المشاريع' : ' · all projects') : ''}
                    {rule.notes ? ` · ${rule.notes}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                    {ar ? (rule.scope === 'DEVELOPER' ? 'مطور كامل' : 'مشروع') : rule.scope}
                  </span>
                  {rule.expiresAt && (
                    <span className="text-[11px] text-amber-400">
                      {ar ? `لحد ${new Date(rule.expiresAt).toLocaleDateString('en-GB')}` : `till ${new Date(rule.expiresAt).toLocaleDateString('en-GB')}`}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

/* ─── Notifications (GET /api/notifications, mark-read) ─── */

type NotificationRow = {
  id: string
  type: string
  title: string
  message: string
  link: string | null
  isRead: boolean
  createdAt: string
}

function NotificationsTab() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [items, setItems] = useState<NotificationRow[] | null>(null)
  const [unread, setUnread] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [marking, setMarking] = useState(false)

  useEffect(() => {
    let cancelled = false
    setError(null)
    setItems(null)
    fetch('/api/notifications?limit=50', { headers: { ...CSRF_HEADERS } })
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({} as Record<string, unknown>))
          throw new Error(typeof d.error === 'string' ? d.error : 'Load failed')
        }
        return r.json()
      })
      .then((data) => {
        if (cancelled) return
        setItems(Array.isArray(data.notifications) ? data.notifications : [])
        setUnread(typeof data.unreadCount === 'number' ? data.unreadCount : 0)
      })
      .catch((e) => {
        console.error('Broker notifications load failed:', e)
        if (!cancelled) setError(friendlyApiError(e instanceof Error ? e.message : '', ar))
      })
    return () => {
      cancelled = true
    }
  }, [attempt, ar])

  async function markAllRead() {
    setMarking(true)
    try {
      const { ok, data } = await apiJson('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      if (!ok) throw new Error((data?.error as string) || 'Update failed')
      setItems((prev) => (prev ? prev.map((n) => ({ ...n, isRead: true })) : prev))
      setUnread(0)
    } catch (e) {
      console.error('Mark notifications read failed:', e)
      setError(friendlyApiError(e instanceof Error ? e.message : '', ar))
    } finally {
      setMarking(false)
    }
  }

  return (
    <Panel
      title={ar ? `التنبيهات${unread > 0 ? ` (${unread} جديد)` : ''}` : `Notifications${unread > 0 ? ` (${unread} new)` : ''}`}
      action={
        unread > 0 ? (
          <button
            type="button"
            onClick={markAllRead}
            disabled={marking}
            className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-gray-300 hover:border-estate-gold/40 hover:text-white disabled:opacity-50"
          >
            {marking ? (ar ? '...' : '...') : (ar ? 'علّم الكل كمقروء' : 'Mark all read')}
          </button>
        ) : undefined
      }
    >
      {items === null && !error ? (
        <p className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin text-estate-gold" />
          {ar ? 'بنحمّل التنبيهات...' : 'Loading notifications...'}
        </p>
      ) : error || items === null ? (
        <div className="py-6 text-center">
          <p className="text-sm text-red-400">{error || (ar ? 'معرفناش نجيب التنبيهات.' : 'Could not load notifications.')}</p>
          <button
            type="button"
            onClick={() => setAttempt((a) => a + 1)}
            className="mt-2 rounded-full border border-white/10 px-4 py-1.5 text-xs font-medium text-gray-300 hover:border-estate-gold/40 hover:text-white"
          >
            {ar ? 'حاول تاني' : 'Retry'}
          </button>
        </div>
      ) : items.length === 0 ? (
        <Empty text={ar ? 'مفيش تنبيهات لسه — الليدز والمعاينات والعمولات الجديدة هتوصلك هنا.' : 'No notifications yet — new leads, viewings and commissions will land here.'} />
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li
              key={n.id}
              className={cn(
                'rounded-2xl border px-3 py-2.5',
                n.isRead ? 'border-white/5 bg-black/10' : 'border-estate-gold/30 bg-estate-gold/[0.05]'
              )}
            >
              <div className="flex items-start gap-2">
                {!n.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-estate-gold" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white" dir="auto">{n.title}</p>
                  <p className="mt-0.5 text-xs text-gray-400" dir="auto">{n.message}</p>
                  <p className="mt-1 text-[11px] text-gray-600">
                    {new Date(n.createdAt).toLocaleString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                  {n.link && (
                    <Link href={n.link} className="mt-1 inline-block text-[11px] font-medium text-estate-gold hover:underline">
                      {ar ? 'افتح التفاصيل' : 'Open details'}
                    </Link>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/* ─── Profile (view + edit my own data) ────────────────── */

type ProfileShape = Props['profile'] & { agencyNameArabic?: string | null; bio?: string | null; phone?: string | null }

function ProfileTab({ profile, viewer }: { profile: ProfileShape; viewer: { name: string; role: string } }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(viewer.name || '')
  const [phone, setPhone] = useState(profile.phone || '')
  const [agencyName, setAgencyName] = useState(profile.agencyName || '')
  const [agencyNameArabic, setAgencyNameArabic] = useState(profile.agencyNameArabic || '')
  const [licenseNumber, setLicenseNumber] = useState(profile.licenseNumber || '')
  const [bio, setBio] = useState(profile.bio || '')
  const [yearsExperience, setYearsExperience] = useState(
    profile.yearsExperience != null ? String(profile.yearsExperience) : ''
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [current, setCurrent] = useState({ name: viewer.name || '', phone: profile.phone || '', agencyName: profile.agencyName || '', agencyNameArabic: profile.agencyNameArabic || '', licenseNumber: profile.licenseNumber || '', bio: profile.bio || '', yearsExperience: profile.yearsExperience })

  async function save() {
    if (!name.trim()) {
      setError(ar ? 'اكتب اسمك.' : 'Enter your name.')
      return
    }
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const { ok, data } = await apiJson('/api/broker/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || null,
          agencyName: agencyName.trim() || null,
          agencyNameArabic: agencyNameArabic.trim() || null,
          licenseNumber: licenseNumber.trim() || null,
          bio: bio.trim() || null,
          yearsExperience: yearsExperience.trim() === '' ? null : Number(yearsExperience),
        }),
      })
      if (!ok) throw new Error((data?.error as string) || 'Update failed')
      const p = (data?.profile || {}) as Record<string, unknown>
      const u = (data?.user || {}) as Record<string, unknown>
      setCurrent({
        name: typeof u.name === 'string' ? u.name : name.trim(),
        phone: typeof u.phone === 'string' ? u.phone : phone.trim(),
        agencyName: typeof p.agencyName === 'string' ? p.agencyName : agencyName.trim(),
        agencyNameArabic: typeof p.agencyNameArabic === 'string' ? p.agencyNameArabic : agencyNameArabic.trim(),
        licenseNumber: typeof p.licenseNumber === 'string' ? p.licenseNumber : licenseNumber.trim(),
        bio: typeof p.bio === 'string' ? p.bio : bio.trim(),
        yearsExperience: typeof p.yearsExperience === 'number' ? p.yearsExperience : profile.yearsExperience,
      })
      setEditing(false)
      setNotice(ar ? 'اتحفظت بياناتك.' : 'Your details were saved.')
    } catch (e) {
      console.error('Broker profile save failed:', e)
      setError(friendlyApiError(e instanceof Error ? e.message : '', ar))
    } finally {
      setSaving(false)
    }
  }

  const field =
    'w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-estate-gold/60 focus:outline-none'

  return (
    <div className="space-y-5">
      <Panel
        title={ar ? 'بياناتي' : 'My details'}
        action={
          !editing ? (
            <button
              type="button"
              onClick={() => {
                setError(null)
                setNotice(null)
                setEditing(true)
              }}
              className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-gray-300 hover:border-estate-gold/40 hover:text-white"
            >
              <Pencil className="h-3.5 w-3.5" />
              {ar ? 'عدّل' : 'Edit'}
            </button>
          ) : undefined
        }
      >
        {notice && (
          <p className="mb-3 flex items-center gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            <Check className="h-4 w-4 shrink-0" /> {notice}
          </p>
        )}
        {error && (
          <p className="mb-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}
        {!editing ? (
          <dl className="space-y-2 text-sm">
            <Row label={ar ? 'الاسم' : 'Name'} value={current.name || '—'} />
            <Row label={ar ? 'التليفون' : 'Phone'} value={current.phone || '—'} />
            <Row label={ar ? 'الشركة' : 'Agency'} value={current.agencyName || '—'} />
            {current.agencyNameArabic ? <Row label={ar ? 'الشركة (عربي)' : 'Agency (Arabic)'} value={current.agencyNameArabic} /> : null}
            <Row label={ar ? 'الرخصة' : 'License'} value={current.licenseNumber || '—'} />
            <Row
              label={ar ? 'الخبرة' : 'Experience'}
              value={current.yearsExperience != null ? (ar ? `${current.yearsExperience} سنين` : `${current.yearsExperience} yrs`) : '—'}
            />
            {current.bio ? (
              <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-gray-500">{ar ? 'نبذة' : 'Bio'}</p>
                <p className="mt-1 text-sm leading-relaxed text-gray-200" dir="auto">{current.bio}</p>
              </div>
            ) : null}
          </dl>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-gray-500">{ar ? 'الاسم *' : 'Name *'}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={field} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-gray-500">{ar ? 'التليفون' : 'Phone'}</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" maxLength={20} placeholder="+20..." className={field} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-gray-500">{ar ? 'الشركة' : 'Agency'}</span>
              <input value={agencyName} onChange={(e) => setAgencyName(e.target.value)} maxLength={200} className={field} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-gray-500">{ar ? 'الشركة (عربي)' : 'Agency (Arabic)'}</span>
              <input value={agencyNameArabic} onChange={(e) => setAgencyNameArabic(e.target.value)} maxLength={200} className={field} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-gray-500">{ar ? 'الرخصة' : 'License'}</span>
              <input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} maxLength={100} className={field} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-gray-500">{ar ? 'سنين الخبرة' : 'Years of experience'}</span>
              <input
                value={yearsExperience}
                onChange={(e) => setYearsExperience(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
                inputMode="numeric"
                dir="ltr"
                placeholder="0"
                className={field}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs text-gray-500">{ar ? 'نبذة' : 'Bio'}</span>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={2000} className={field} />
            </label>
            <div className="flex items-center gap-2 sm:col-span-2">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-full bg-estate-gold px-4 py-2 text-xs font-bold text-[#0F1A2C] hover:bg-estate-gold/90 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {ar ? 'احفظ' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false)
                  setError(null)
                  setName(current.name)
                  setPhone(current.phone)
                  setAgencyName(current.agencyName)
                  setAgencyNameArabic(current.agencyNameArabic)
                  setLicenseNumber(current.licenseNumber)
                  setBio(current.bio)
                  setYearsExperience(current.yearsExperience != null ? String(current.yearsExperience) : '')
                }}
                className="rounded-full border border-white/10 px-4 py-2 text-xs text-gray-300 hover:text-white"
              >
                {ar ? 'إلغي' : 'Cancel'}
              </button>
            </div>
          </div>
        )}
      </Panel>

      <Panel title={ar ? 'من المنصة (مش بتتعدل)' : 'From the platform (read-only)'}>
        <dl className="space-y-2 text-sm">
          <Row
            label={ar ? 'نسبة العمولة' : 'Commission rate'}
            value={profile.commissionRate != null ? `${profile.commissionRate}%` : '—'}
          />
          <Row
            label={ar ? 'التقييم' : 'Rating'}
            value={profile.rating > 0 ? `★ ${profile.rating.toFixed(1)} (${profile.reviewCount})` : '—'}
          />
          <Row label={ar ? 'صفقات متسجلة' : 'Deals recorded'} value={String(profile.totalDeals)} />
          <Row
            label={ar ? 'موثّق' : 'Verified'}
            value={profile.isVerified ? (ar ? 'أيوه' : 'Yes') : (ar ? 'لأ' : 'No')}
          />
          <Row label={ar ? 'الحالة' : 'Status'} value={ar ? ACCOUNT_STATUS_AR[profile.accountStatus] || profile.accountStatus : profile.accountStatus} />
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-gray-500">
          {ar
            ? 'العمولة والتقييم والتوثيق بتحددهم إدارة المنصة — لو في حاجة غلط كلّمهم.'
            : 'Commission, rating and verification are set by the platform team — contact them if anything looks wrong.'}
        </p>
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
      <p className={cn('font-display mt-2 text-xl', accent ? 'text-estate-gold' : 'text-white')}>
        {value}
      </p>
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

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">{title}</h2>
        {action}
      </div>
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
