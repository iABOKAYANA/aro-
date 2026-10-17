'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Users, Shield, ShieldAlert, ShieldOff, AlertTriangle, Handshake, DollarSign,
  Loader2, TrendingUp, RefreshCw, Building2, UserCheck, Percent,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatEGP, cn } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import { statusLabel } from '@/components/ceo/ceo-charts'
import ForecastPanel from './forecast-panel'

interface Stats {
  leads: {
    total: number
    new: number
    activeProtected: number
    expiringSoon: number
    expiredProtection: number
    duplicateReview: number
    transferred: number
    statusBreakdown: Record<string, number>
    recent: Array<{ id: string; leadCode: string | null; name: string; status: string; createdAt: string }>
  }
  deals: {
    total: number
    reservations: number
    contracts: number
    sold: number
    cancelled: number
    totalValue: number
  }
  commissions: {
    totalRecords: number
    totalAmount: number
    estateaiShare: number
    brokerShare: number
    pendingAmount: number
    pendingBrokerShare: number
    paidAmount: number
    paidBrokerShare: number
    openDisputes: number
    disputeList: Array<{
      id: string
      status: string
      totalAmount: number
      deal: { id: string; dealValue: number | null; lead: { leadCode: string | null; name: string } | null; project: { name: string } | null }
    }>
  }
  protection: {
    config: { defaultDays: number; expiringSoonDays: number; allowRenewal: boolean; renewalDays: number; expirationBehavior: string }
    active: number
    expiringSoon: number
    expired: number
    expiringList: Array<{
      id: string
      leadCode: string | null
      name: string
      status: string
      protectionExpiresAt: string
      broker: { user: { name: string | null } } | null
    }>
  }
  platform: { brokerCount: number; developerCount: number; conversionRate: number }
}

const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  CONTACTED: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  QUALIFIED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  VIEWING: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  INTERESTED: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
  RESERVATION: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  CONTRACT: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  SOLD: 'bg-green-500/15 text-green-400 border-green-500/30',
  LOST: 'bg-red-500/15 text-red-400 border-red-500/30',
  CANCELLED: 'bg-red-500/15 text-red-400 border-red-500/30',
  EXPIRED: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
}

function StatCard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string | number; accent: string }) {
  return (
    <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-black p-4">
      <div className="flex items-center gap-2">
        <Icon className={cn('h-4 w-4', accent)} />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className="mt-1 truncate text-xl font-bold text-foreground">{value}</p>
    </div>
  )
}

export default function OverviewTab() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState({ developerId: '', brokerId: '', projectId: '', from: '', to: '' })
  const [brokers, setBrokers] = useState<Array<{ id: string; user: { name: string | null } }>>([])
  const [developers, setDevelopers] = useState<Array<{ id: string; companyName: string }>>([])
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([])

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v) })
    fetch(`/api/ceo/growth-stats?${params.toString()}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || 'Failed')
        return r.json()
      })
      .then(setStats)
      .catch((e) => {
        console.error('Failed to load growth stats:', e)
        setError(ar ? 'معرفناش نجيب الإحصائيات — حاول تاني.' : 'Failed to load stats')
      })
      .finally(() => setLoading(false))
  }, [filters, ar])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    Promise.all([
      fetch('/api/ceo/brokers').then((r) => (r.ok ? r.json() : { brokers: [] })).catch(() => ({ brokers: [] })),
      fetch('/api/ceo/developers').then((r) => (r.ok ? r.json() : { developers: [] })).catch(() => ({ developers: [] })),
      fetch('/api/projects?limit=100').then((r) => (r.ok ? r.json() : { projects: [] })).catch(() => ({ projects: [] })),
    ]).then(([b, d, p]) => {
      setBrokers(b.brokers || [])
      setDevelopers(d.developers || [])
      setProjects(p.projects || [])
    })
  }, [])

  const selectCls = 'rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-gray-300 outline-none'

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-black p-3">
        <select className={selectCls} value={filters.developerId} onChange={(e) => setFilters({ ...filters, developerId: e.target.value })}>
          <option value="">{ar ? 'كل المطوّرين' : 'All developers'}</option>
          {developers.map((d) => <option key={d.id} value={d.id}>{d.companyName}</option>)}
        </select>
        <select className={selectCls} value={filters.brokerId} onChange={(e) => setFilters({ ...filters, brokerId: e.target.value })}>
          <option value="">{ar ? 'كل البروكرز' : 'All brokers'}</option>
          {brokers.map((b) => <option key={b.id} value={b.id}>{b.user?.name || b.id}</option>)}
        </select>
        <select className={selectCls} value={filters.projectId} onChange={(e) => setFilters({ ...filters, projectId: e.target.value })}>
          <option value="">{ar ? 'كل المشاريع' : 'All projects'}</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input type="date" className={selectCls} value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        <input type="date" className={selectCls} value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        <Button variant="outline" size="sm" className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]" onClick={load}>
          <RefreshCw className="mr-1 h-4 w-4" />{ar ? 'حدّث' : 'Refresh'}
        </Button>
        {(filters.developerId || filters.brokerId || filters.projectId || filters.from || filters.to) && (
          <Button variant="ghost" size="sm" className="text-gray-400" onClick={() => setFilters({ developerId: '', brokerId: '', projectId: '', from: '', to: '' })}>
            {ar ? 'امسح الفلاتر' : 'Clear filters'}
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" /> {ar ? 'بيحمّل التحليلات…' : 'Loading analytics...'}
        </div>
      ) : stats ? (
        <div className="space-y-6">
          {/* Leads */}
          <section>
            <h2 className="section-kicker mb-3 flex items-center gap-2">
              <Users className="h-4 w-4" /> {ar ? 'الليدز' : 'Leads'}
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
              <StatCard icon={Users} label={ar ? 'كل الليدز' : 'Total leads'} value={stats.leads.total} accent="text-blue-400" />
              <StatCard icon={TrendingUp} label={ar ? 'جداد' : 'New'} value={stats.leads.new} accent="text-cyan-400" />
              <StatCard icon={Shield} label={ar ? 'محميين ونشطين' : 'Active protected'} value={stats.leads.activeProtected} accent="text-green-400" />
              <StatCard icon={ShieldAlert} label={ar ? 'هيخلصوا قريب' : 'Expiring soon'} value={stats.leads.expiringSoon} accent="text-amber-400" />
              <StatCard icon={ShieldOff} label={ar ? 'خلصت حمايتهم' : 'Expired'} value={stats.leads.expiredProtection} accent="text-red-400" />
              <StatCard icon={AlertTriangle} label={ar ? 'مراجعة التكرار' : 'Duplicate review'} value={stats.leads.duplicateReview} accent="text-orange-400" />
              <StatCard icon={Handshake} label={ar ? 'اتنقلوا' : 'Transferred'} value={stats.leads.transferred} accent="text-purple-400" />
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {Object.entries(stats.leads.statusBreakdown).map(([status, count]) => (
                <Badge key={status} className={cn('border', STATUS_COLORS[status] || 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-400')}>
                  {statusLabel(status, ar)}: {count}
                </Badge>
              ))}
            </div>
          </section>

          {/* Deals */}
          <section>
            <h2 className="section-kicker mb-3 flex items-center gap-2">
              <Handshake className="h-4 w-4" /> {ar ? 'الصفقات' : 'Deals'}
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
              <StatCard icon={Handshake} label={ar ? 'كل الصفقات' : 'Total deals'} value={stats.deals.total} accent="text-blue-400" />
              <StatCard icon={Shield} label={ar ? 'الحجوزات' : 'Reservations'} value={stats.deals.reservations} accent="text-orange-400" />
              <StatCard icon={Users} label={ar ? 'التعاقدات' : 'Contracts'} value={stats.deals.contracts} accent="text-indigo-400" />
              <StatCard icon={DollarSign} label={ar ? 'المباعة' : 'Sold'} value={stats.deals.sold} accent="text-green-400" />
              <StatCard icon={AlertTriangle} label={ar ? 'ملغية/ضايعة' : 'Cancelled/Lost'} value={stats.deals.cancelled} accent="text-red-400" />
              <StatCard icon={DollarSign} label={ar ? 'القيمة الكلية' : 'Total value'} value={formatEGP(stats.deals.totalValue)} accent="text-emerald-400" />
              <StatCard icon={Percent} label={ar ? 'التحويل' : 'Conversion'} value={`${stats.platform.conversionRate}%`} accent="text-estate-gold" />
            </div>
          </section>

          {/* Commission */}
          <section>
            <h2 className="section-kicker mb-3 flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> {ar ? 'العمولة' : 'Commission'}
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
              <StatCard icon={DollarSign} label={ar ? 'المتوقع كله' : 'Expected total'} value={formatEGP(stats.commissions.totalAmount)} accent="text-emerald-400" />
              <StatCard icon={Building2} label={ar ? 'نصيب إستيت' : 'EstateAI share'} value={formatEGP(stats.commissions.estateaiShare)} accent="text-estate-gold" />
              <StatCard icon={UserCheck} label={ar ? 'نصيب البروكر' : 'Broker share'} value={formatEGP(stats.commissions.brokerShare)} accent="text-blue-400" />
              <StatCard icon={ShieldAlert} label={ar ? 'مستنّي' : 'Pending'} value={formatEGP(stats.commissions.pendingAmount)} accent="text-amber-400" />
              <StatCard icon={Shield} label={ar ? 'مدفوع' : 'Paid'} value={formatEGP(stats.commissions.paidAmount)} accent="text-green-400" />
              <StatCard icon={AlertTriangle} label={ar ? 'نزاعات مفتوحة' : 'Open disputes'} value={stats.commissions.openDisputes} accent="text-red-400" />
              <StatCard icon={Users} label={ar ? 'بروكرز / مطوّرين' : 'Brokers / Devs'} value={`${stats.platform.brokerCount} / ${stats.platform.developerCount}`} accent="text-gray-400" />
            </div>
          </section>

          {/* Expiring soon list */}
          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-black">
              <div className="border-b border-border dark:border-[#262626] px-4 py-3 text-sm font-semibold text-foreground">
                {ar ? `الحماية بتخلص قريب (أول ${stats.protection.config.expiringSoonDays} يوم)` : `Protection expiring soon (next ${stats.protection.config.expiringSoonDays} days)`}
              </div>
              <div className="max-h-72 overflow-y-auto">
                {stats.protection.expiringList.length === 0 ? (
                  <p className="p-4 text-sm text-gray-500">{ar ? 'مفيش حاجة بتخلص — تمام.' : 'Nothing expiring — good.'}</p>
                ) : (
                  stats.protection.expiringList.map((lead) => (
                    <div key={lead.id} className="flex items-center justify-between gap-2 border-b border-border dark:border-[#262626] px-4 py-2.5 text-sm last:border-b-0">
                      <div className="min-w-0">
                        <p className="truncate text-gray-300">
                          {lead.leadCode && <span className="font-mono text-estate-gold">{lead.leadCode}</span>} {lead.name}
                        </p>
                        <p className="text-xs text-gray-500">{ar ? 'البروكر:' : 'Broker:'} {lead.broker?.user?.name || '—'}</p>
                      </div>
                      <span className="shrink-0 text-xs font-medium text-amber-400">
                        {new Date(lead.protectionExpiresAt).toLocaleDateString(ar ? 'ar-EG' : 'en-US')}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-black">
              <div className="border-b border-border dark:border-[#262626] px-4 py-3 text-sm font-semibold text-foreground">
                {ar ? 'نزاعات العمولة' : 'Commission disputes'} {stats.commissions.openDisputes > 0 ? `(${stats.commissions.openDisputes})` : ''}
              </div>
              <div className="max-h-72 overflow-y-auto">
                {stats.commissions.disputeList.length === 0 ? (
                  <p className="p-4 text-sm text-gray-500">{ar ? 'مفيش نزاعات مفتوحة.' : 'No open disputes.'}</p>
                ) : (
                  stats.commissions.disputeList.map((row) => (
                    <div key={row.id} className="flex items-center justify-between gap-2 border-b border-border dark:border-[#262626] px-4 py-2.5 text-sm last:border-b-0">
                      <div className="min-w-0">
                        <p className="truncate text-gray-300">
                          {row.deal.lead?.leadCode && <span className="font-mono text-estate-gold">{row.deal.lead.leadCode}</span>}{' '}
                          {row.deal.lead?.name || '—'}
                        </p>
                        <p className="text-xs text-gray-500">{row.deal.project?.name || ''}</p>
                      </div>
                      <span className="shrink-0 text-sm font-medium text-red-400">{formatEGP(row.totalAmount)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <ForecastPanel />
        </div>
      ) : null}
    </div>
  )
}
