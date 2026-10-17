'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useLanguage } from '@/lib/language-context'
import {
  Search, Handshake, DollarSign, Loader2, Inbox, Eye, Plus, X, RefreshCw,
  Calendar, Building2, Users, ShieldCheck, AlertTriangle, Star,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatEGP, cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────
interface CommissionInfo {
  id: string
  status: string
  totalPct: number
  totalAmount: number
  brokerPct?: number
  brokerAmount?: number
  estateaiPct?: number
  estateaiAmount?: number
  dueDate: string | null
  paidDate: string | null
  currency: string
}

interface DealRow {
  id: string
  status: string
  dealValue: number | null
  currency: string
  source: string
  reservationDate: string | null
  contractDate: string | null
  saleDate: string | null
  createdAt: string
  lead: { id: string; leadCode: string | null; name: string; status: string } | null
  broker: { id: string; user: { name: string | null } } | null
  developer: { id: string; companyName: string } | null
  project: { id: string; name: string } | null
  unit: { id: string; name: string } | null
  commission: CommissionInfo | null
}

const DEAL_STATUSES = ['RESERVATION', 'CONTRACT', 'SOLD', 'CANCELLED', 'LOST']

const DEAL_COLORS: Record<string, string> = {
  RESERVATION: 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400',
  CONTRACT: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-400',
  SOLD: 'border-green-600/30 bg-green-600/10 text-green-700 dark:text-green-400',
  CANCELLED: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400',
  LOST: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400',
}

const COMMISSION_COLORS: Record<string, string> = {
  PENDING: 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  APPROVED: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
  INVOICED: 'border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-400',
  DUE: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  PAID: 'border-green-600/30 bg-green-600/10 text-green-700 dark:text-green-400',
  CANCELLED: 'border-gray-500/30 bg-gray-500/10 text-gray-600 dark:text-gray-400',
  DISPUTED: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400',
}

export default function DashboardDealsPage() {
  const { data: session } = useSession()
  const { lang } = useLanguage()
  const role = ((session?.user as any)?.role as string) || ''
  const canReport = role === 'DEVELOPER' || role === 'CEO' || role === 'ADMIN'

  const [deals, setDeals] = useState<DealRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [detail, setDetail] = useState<DealRow | null>(null)
  const [showReport, setShowReport] = useState(false)

  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (statusFilter) params.set('status', statusFilter)
    fetch(`/api/deals?${params.toString()}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || 'Failed')
        return r.json()
      })
      .then((data) => setDeals(data.deals || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [search, statusFilter])

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [load, search])

  const totals = deals.reduce(
    (acc, d) => {
      if (d.status === 'SOLD') acc.sold += d.dealValue || 0
      if (d.status === 'RESERVATION') acc.reservations += 1
      if (d.status === 'CONTRACT') acc.contracts += 1
      if (d.commission) {
        acc.commissionTotal += d.commission.totalAmount
        if (d.commission.status === 'PAID') acc.commissionPaid += d.commission.totalAmount
        if (d.commission.brokerAmount !== undefined) {
          acc.brokerShare += d.commission.status === 'PAID' ? d.commission.brokerAmount : 0
          acc.brokerPending += d.commission.status !== 'PAID' ? d.commission.brokerAmount : 0
        }
      }
      return acc
    },
    { sold: 0, reservations: 0, contracts: 0, commissionTotal: 0, commissionPaid: 0, brokerShare: 0, brokerPending: 0 }
  )

  const statCards = [
    { icon: Handshake, label: t('Total deals', 'إجمالي الصفقات'), value: String(deals.length), accent: 'text-blue-500' },
    { icon: Calendar, label: t('Reservations', 'حجوزات'), value: String(totals.reservations), accent: 'text-orange-500' },
    { icon: ShieldCheck, label: t('Contracts', 'عقود'), value: String(totals.contracts), accent: 'text-indigo-500' },
    { icon: DollarSign, label: t('Sold value', 'قيمة المبيعات'), value: formatEGP(totals.sold), accent: 'text-green-500' },
    { icon: AlertTriangle, label: t('Commission pending', 'عمولات معلقة'), value: formatEGP(totals.brokerPending || totals.commissionTotal - totals.commissionPaid), accent: 'text-amber-500' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('Deals & Commissions', 'الصفقات والعمولات')}</h1>
          <p className="text-muted-foreground">
            {t('Attributed deals from protected leads with server-calculated commissions', 'صفقات مسندة من عملاء محميين بعمولات محسوبة في السيرفر')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="mr-1 h-4 w-4" />{t('Refresh', 'تحديث')}
          </Button>
          {canReport && (
            <Button className="bg-estate-gold text-white hover:bg-estate-gold-dark" size="sm" onClick={() => setShowReport(true)}>
              <Plus className="mr-1 h-4 w-4" />{t('Report transaction', 'تسجيل معاملة')}
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {statCards.map((card) => (
          <Card key={card.label} className="card-hover">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <card.icon className={cn('h-4 w-4', card.accent)} />
                <span className="text-xs text-muted-foreground">{card.label}</span>
              </div>
              <p className="mt-1 truncate text-xl font-bold">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('Search lead code, client or project...', 'ابحث بكود العميل أو اسمه أو المشروع...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border bg-background px-3 py-2 text-sm"
        >
          <option value="">{t('All statuses', 'كل الحالات')}</option>
          {DEAL_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {error && (
        <Card className="border-red-500/30">
          <CardContent className="flex items-center justify-between p-4 text-sm text-red-600 dark:text-red-400">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={load}>{t('Retry', 'إعادة المحاولة')}</Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> {t('Loading deals...', 'جارِ تحميل الصفقات...')}
        </div>
      ) : deals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Inbox className="mx-auto h-12 w-12 text-muted-foreground/30" />
            <p className="mt-4 text-muted-foreground">
              {statusFilter || search
                ? t('No deals match these filters', 'لا توجد صفقات مطابقة')
                : t('No deals yet — deals are created when a lead reaches Reservation or above', 'لا توجد صفقات بعد — تُنشأ عند وصول العميل للحجز فأعلى')}
            </p>
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
                  <th className="px-4 py-3">{t('Project / Unit', 'المشروع / الوحدة')}</th>
                  <th className="px-4 py-3">{t('Deal status', 'حالة الصفقة')}</th>
                  <th className="px-4 py-3">{t('Value', 'القيمة')}</th>
                  <th className="px-4 py-3">{t('Commission', 'العمولة')}</th>
                  <th className="px-4 py-3 text-right">{t('Actions', 'إجراءات')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {deals.map((deal) => (
                  <tr key={deal.id} className="transition hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <p className="font-medium">{deal.lead?.name || '—'}</p>
                      <p className="text-xs text-muted-foreground">
                        {deal.lead?.leadCode && <span className="font-mono">{deal.lead.leadCode}</span>}
                        {deal.broker && <span> · {deal.broker.user?.name}</span>}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs">{deal.project?.name || '—'}</p>
                      {deal.unit && <p className="text-xs text-muted-foreground">{deal.unit.name}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={DEAL_COLORS[deal.status] || ''}>{deal.status}</Badge>
                      <p className="mt-1 text-[10px] uppercase text-muted-foreground">{deal.source.replace(/_/g, ' ')}</p>
                    </td>
                    <td className="px-4 py-3">
                      {deal.dealValue ? formatEGP(deal.dealValue) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {deal.commission ? (
                        <div>
                          <Badge className={COMMISSION_COLORS[deal.commission.status] || ''}>
                            {deal.commission.status}
                          </Badge>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatEGP(deal.commission.brokerAmount ?? deal.commission.totalAmount)}
                            {deal.commission.brokerAmount !== undefined && ` · ${deal.commission.brokerPct ?? ''}%`}
                          </p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setDetail(deal)}>
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
            {deals.map((deal) => (
              <Card key={deal.id} className="card-hover">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{deal.lead?.name || '—'}</h3>
                        <Badge className={DEAL_COLORS[deal.status] || ''}>{deal.status}</Badge>
                      </div>
                      {deal.lead?.leadCode && <p className="font-mono text-xs text-muted-foreground">{deal.lead.leadCode}</p>}
                      <p className="mt-1 text-sm text-muted-foreground">
                        <Building2 className="mr-1 inline h-3.5 w-3.5" />
                        {deal.project?.name || '—'}{deal.unit ? ` · ${deal.unit.name}` : ''}
                      </p>
                    </div>
                    <div className="text-end">
                      <p className="text-sm font-semibold">{deal.dealValue ? formatEGP(deal.dealValue) : '—'}</p>
                      {deal.commission && (
                        <Badge className={cn('mt-1', COMMISSION_COLORS[deal.commission.status] || '')}>
                          {deal.commission.status}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <Button variant="outline" size="sm" onClick={() => setDetail(deal)}>
                      <Eye className="mr-1 h-3.5 w-3.5" />{t('View', 'عرض')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {detail && (
        <DealDetailModal lang={lang} deal={detail} onClose={() => setDetail(null)} />
      )}
      {showReport && (
        <ReportDealModal
          lang={lang}
          onClose={() => setShowReport(false)}
          onDone={() => { setShowReport(false); load() }}
        />
      )}
    </div>
  )
}

// ─── Deal Detail Modal ────────────────────────────────────
function DealDetailModal({ lang, deal, onClose }: { lang: string; deal: DealRow; onClose: () => void }) {
  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en)
  const c = deal.commission
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex items-center justify-between gap-3 border-b py-2 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-end font-medium">{value}</span>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {t('Deal', 'صفقة')}
            {deal.lead?.leadCode && <span className="ml-2 font-mono text-sm text-muted-foreground">{deal.lead.leadCode}</span>}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          <Badge className={DEAL_COLORS[deal.status] || ''}>{deal.status}</Badge>
          <Badge variant="outline">{deal.source.replace(/_/g, ' ')}</Badge>
        </div>

        <div>
          {row(t('Client', 'العميل'), deal.lead?.name || '—')}
          {row(t('Broker', 'البروكر'), <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{deal.broker?.user?.name || '—'}</span>)}
          {row(t('Developer', 'المطور'), deal.developer?.companyName || '—')}
          {row(t('Project', 'المشروع'), <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{deal.project?.name || '—'}</span>)}
          {deal.unit && row(t('Unit', 'الوحدة'), deal.unit.name)}
          {row(t('Deal value', 'قيمة الصفقة'), deal.dealValue ? formatEGP(deal.dealValue) : '—')}
          {deal.reservationDate && row(t('Reservation date', 'تاريخ الحجز'), new Date(deal.reservationDate).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US'))}
          {deal.contractDate && row(t('Contract date', 'تاريخ العقد'), new Date(deal.contractDate).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US'))}
          {deal.saleDate && row(t('Sale date', 'تاريخ البيع'), new Date(deal.saleDate).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US'))}
        </div>

        {c && (
          <div className="mt-4 rounded-2xl border bg-muted/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="inline-flex items-center gap-1 text-sm font-semibold">
                <DollarSign className="h-4 w-4 text-estate-gold" />
                {t('Commission', 'العمولة')}
              </span>
              <Badge className={COMMISSION_COLORS[c.status] || ''}>{c.status}</Badge>
            </div>
            <div>
              {row(`${t('Total', 'الإجمالي')} (${c.totalPct}%)`, formatEGP(c.totalAmount))}
              {c.brokerAmount !== undefined && row(`${t('Broker share', 'حصة البروكر')} (${c.brokerPct}%)`, formatEGP(c.brokerAmount))}
              {c.estateaiAmount !== undefined && row(`${t('EstateAI share', 'حصة EstateAI')} (${c.estateaiPct}%)`, formatEGP(c.estateaiAmount))}
              {c.dueDate && row(t('Due date', 'موعد الاستحقاق'), new Date(c.dueDate).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US'))}
              {c.paidDate && row(t('Paid date', 'تاريخ الدفع'), new Date(c.paidDate).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US'))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {t('* الأرقام محسوبة في السيرفر من قواعد العمولة المعتمدة.', '* Amounts are computed server-side from the configured rules.')}
            </p>
          </div>
        )}

        {deal.status === 'SOLD' && deal.broker && (
          <RateBrokerBox lang={lang} deal={deal} />
        )}

        <div className="mt-4 flex justify-end">
          <Button variant="outline" onClick={onClose}>{t('Close', 'إغلاق')}</Button>
        </div>
      </div>
    </div>
  )
}

// ─── Rate broker — the client rates a SOLD deal's broker ─────────────
// Eligibility (caller is the deal's client, one rating per deal) is enforced
// server-side by POST /api/broker-reviews; 403/409 surface here as words.
function RateBrokerBox({ lang, deal }: { lang: string; deal: DealRow }) {
  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en)
  const [stars, setStars] = useState(0)
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [rated, setRated] = useState(false)
  const [complaint, setComplaint] = useState<string | null>(null)
  const [checkFailed, setCheckFailed] = useState(false)
  const [recheck, setRecheck] = useState(0)

  const brokerId = deal.broker?.id

  useEffect(() => {
    if (!brokerId) return
    setCheckFailed(false)
    fetch(`/api/broker-reviews?brokerId=${brokerId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        const list = (data.reviews || []) as Array<{ dealId?: string | null; deal?: { id: string } | null }>
        if (list.some((r) => (r.dealId ?? r.deal?.id) === deal.id)) setRated(true)
      })
      .catch(() => setCheckFailed(true))
  }, [brokerId, deal.id, recheck])

  const submit = async () => {
    if (!brokerId || stars < 1 || sending) return
    setSending(true)
    setComplaint(null)
    try {
      const res = await fetch('/api/broker-reviews', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brokerId,
          dealId: deal.id,
          rating: stars,
          ...(comment.trim() ? { comment: comment.trim() } : {}),
        }),
      })
      if (res.status === 409) {
        setRated(true)
        return
      }
      const data = await res.json().catch(() => ({}))
      if (res.status === 403) {
        setComplaint(t('Only the client of this deal can rate its broker.', 'العميل بتاع الصفقة دي بس هو اللي يقدر يقيّم الوسيط.'))
        return
      }
      if (!res.ok) throw new Error(data.error || 'Failed')
      setDone(true)
    } catch {
      setComplaint(t('Could not send your rating.', 'مقدرناش نبعت تقييمك.'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mt-4 rounded-2xl border bg-muted/30 p-3">
      <p className="text-sm font-semibold">
        {t('Rate your broker', 'قيّم الوسيط بتاعك')}
        <span className="ml-1 font-normal text-muted-foreground">
          ({deal.broker?.user?.name || t('Broker', 'الوسيط')})
        </span>
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t('Sold! Tell us how your broker did on this deal.', 'مبروك الصفقة! قولّنا الوسيط كان عامل إزاي معاك في البيعة دي.')}
      </p>

      {done ? (
        <p className="mt-2 text-sm text-green-600 dark:text-green-400">
          {t('Thanks! Your rating was sent and will show after review.', 'شكراً! تقييمك اتبعت وهيظهر بعد المراجعة.')} ✓
        </p>
      ) : rated ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {t('This deal was already rated.', 'الصفقة دي اتقيّمت قبل كده.')}
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          {checkFailed && (
            <p className="text-xs text-muted-foreground">
              {t('Could not check if this deal was already rated.', 'مقدرناش نتأكد إن الصفقة دي اتقيّمت ولا لأ.')}
              {' '}
              <button
                type="button"
                onClick={() => setRecheck((k) => k + 1)}
                className="font-medium text-estate-gold hover:underline"
              >
                {t('Retry', 'حاول تاني')}
              </button>
            </p>
          )}
          <div className="flex items-center gap-1" role="radiogroup" aria-label={t('Pick a star rating', 'اختار عدد النجوم')}>
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={stars === s}
                aria-label={`${s} / 5`}
                onClick={() => { setStars(s); setComplaint(null) }}
                className="p-0.5"
              >
                <Star
                  className={cn(
                    'h-6 w-6',
                    s <= stars ? 'fill-estate-gold text-estate-gold' : 'text-gray-500'
                  )}
                />
              </button>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder={t('Tell us about working with them (optional)…', 'احكيلنا عن تعاملك معاه (اختياري)…')}
            className="w-full rounded-2xl border bg-background px-3 py-2 text-sm"
          />
          {complaint && <p className="text-xs text-red-600 dark:text-red-400">{complaint}</p>}
          {stars < 1 && !complaint && (
            <p className="text-xs text-muted-foreground">
              {t('Pick a star rating first.', 'اختار عدد النجوم الأول.')}
            </p>
          )}
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={submit}
              disabled={stars < 1 || sending}
              className="bg-estate-gold text-white hover:bg-estate-gold-dark"
            >
              {sending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {t('Send the rating', 'ابعت التقييم')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Report Transaction Modal (Section 10 workflow) ──────
function ReportDealModal({ lang, onClose, onDone }: { lang: string; onClose: () => void; onDone: () => void }) {
  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en)
  const [leadKey, setLeadKey] = useState('')
  const [matches, setMatches] = useState<Array<{ id: string; leadCode: string | null; name: string; protectionStatus?: string }>>([])
  const [selected, setSelected] = useState<{ id: string; leadCode: string | null; name: string } | null>(null)
  const [searching, setSearching] = useState(false)
  const [form, setForm] = useState({ status: 'RESERVATION', dealValue: '', projectId: '', notes: '' })
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([])
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'error' | 'info' | 'success'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/projects?limit=100')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setProjects(data.projects || []))
      .catch(() => setProjects([]))
  }, [])

  const searchLead = async () => {
    if (leadKey.trim().length < 2) return
    setSearching(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/leads?search=${encodeURIComponent(leadKey.trim())}&limit=5`)
      const data = await res.json().catch(() => ({}))
      const found = data.leads || []
      setMatches(found)
      if (found.length === 1) setSelected(found[0])
      else if (found.length === 0) {
        setMessage({ type: 'error', text: t('No protected lead found for this search.', 'لا يوجد عميل محمي مطابق للبحث.') })
        setSelected(null)
      } else {
        setMessage({ type: 'info', text: t('Multiple matches — pick one below.', 'نتائج متعددة — اختر واحدًا بالأسفل.') })
      }
    } catch {
      setMessage({ type: 'error', text: t('Search failed', 'فشل البحث') })
    } finally {
      setSearching(false)
    }
  }

  const submit = async () => {
    setMessage(null)
    if (!selected) { setMessage({ type: 'error', text: t('Find and select the protected lead first', 'ابحث واختر العميل المحمي أولاً') }); return }
    if (!form.dealValue || Number(form.dealValue) <= 0) { setMessage({ type: 'error', text: t('Enter a valid deal value', 'أدخل قيمة صفقة صحيحة') }); return }

    setSubmitting(true)
    try {
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: selected.id,
          status: form.status,
          dealValue: Number(form.dealValue),
          projectId: form.projectId || undefined,
          notes: form.notes || undefined,
          source: 'OFF_PLATFORM_REPORT',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || t('Failed to link deal', 'فشل ربط الصفقة') })
        return
      }
      setMessage({ type: 'success', text: t('Deal linked to protected lead — commission calculated', 'تم ربط الصفقة بالعميل المحمي — وتم احتساب العمولة') })
      setTimeout(() => onDone(), 800)
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
          <h2 className="text-lg font-semibold">{t('Report transaction & link to lead', 'تسجيل معاملة وربطها بعميل')}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border bg-muted/30 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">{t('Workflow', 'سير العمل')}:</p>
            <p>{t('Search Lead ID / client → verify protected lead → link deal → server calculates commission → CRM updated.', 'ابحث بكود العميل أو اسمه → تحقق من الحماية → اربط الصفقة → يحسب السيرفر العمولة → يتحدّث CRM.')}</p>
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t('Find protected lead (EA-xxxxx / name / phone)', 'ابحث عن العميل المحمي (EA-xxxxx / الاسم / الموبايل)')}</label>
            <div className="flex gap-2">
              <input className={field} value={leadKey} onChange={(e) => setLeadKey(e.target.value)} placeholder="EA-10482" />
              <Button variant="outline" onClick={searchLead} disabled={searching}>
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            {matches.length > 1 && (
              <div className="mt-2 max-h-32 space-y-1 overflow-y-auto rounded-2xl border p-1">
                {matches.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setSelected(m)}
                    className={cn(
                      'block w-full rounded-xl px-2 py-1.5 text-start text-xs hover:bg-muted',
                      selected?.id === m.id && 'bg-estate-gold/10 text-estate-gold'
                    )}
                  >
                    {m.leadCode && <span className="font-mono">{m.leadCode}</span>} — {m.name}
                  </button>
                ))}
              </div>
            )}
            {selected && (
              <div className="mt-2 flex items-center gap-2 rounded-2xl border border-green-500/30 bg-green-500/10 p-2 text-xs text-green-700 dark:text-green-400">
                <ShieldCheck className="h-4 w-4" />
                <span>{selected.leadCode && <span className="font-mono">{selected.leadCode}</span>} — {selected.name}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t('Transaction type', 'نوع المعاملة')}</label>
              <select className={field} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {DEAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t('Deal value (EGP)', 'قيمة الصفقة (ج.م)')} *</label>
              <input className={field} type="number" value={form.dealValue} onChange={(e) => setForm({ ...form, dealValue: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t('Project (defaults to lead project)', 'المشروع (افتراضيًا مشروع العميل)')}</label>
            <select className={field} value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
              <option value="">{t('— From linked lead —', '— من العميل المرتبط —')}</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t('Notes', 'ملاحظات')}</label>
            <input className={field} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
              {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Handshake className="mr-1 h-4 w-4" />}
              {t('Link & calculate', 'ربط وحساب')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
