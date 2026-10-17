'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  BarChart3, TrendingUp, Users, Building2, Eye, MessageSquare, Shield, ShieldAlert,
  ShieldOff, Handshake, DollarSign, Loader2, FileText,
} from 'lucide-react'
import { formatEGP, cn } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import { Reveal, SectionHeader } from '@/components/design'

interface LeadStats {
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

interface GrowthSummary {
  deals: number
  soldValue: number
  reservations: number
  contracts: number
  commissionPaid: number
  commissionPending: number
}

const SOURCE_LABEL_AR: Record<string, string> = {
  Website: 'الموقع',
  'Direct Call': 'مكالمة مباشرة',
  Referral: 'ترشيح',
  'Social Media': 'سوشيال ميديا',
}

export default function DashboardAnalyticsPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [leadStats, setLeadStats] = useState<LeadStats | null>(null)
  const [growth, setGrowth] = useState<GrowthSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [statsRes, dealsRes, commRes] = await Promise.all([
          fetch('/api/leads/stats'),
          fetch('/api/deals'),
          fetch('/api/commissions'),
        ])
        const statsData = statsRes.ok ? await statsRes.json() : null
        const dealsData = dealsRes.ok ? await dealsRes.json() : { deals: [] }
        const commData = commRes.ok ? await commRes.json() : { commissions: [] }

        const deals: any[] = dealsData.deals || []
        const commissions: any[] = commData.commissions || []

        let paid = 0
        let pending = 0
        for (const c of commissions) {
          const share = c.brokerAmount ?? c.totalAmount ?? 0
          if (c.status === 'PAID') paid += share
          else if (c.status !== 'CANCELLED') pending += share
        }

        if (!cancelled) {
          setLeadStats(statsData?.stats || null)
          setGrowth({
            deals: deals.length,
            soldValue: deals.filter((d) => d.status === 'SOLD').reduce((s, d) => s + (d.dealValue || 0), 0),
            reservations: deals.filter((d) => d.status === 'RESERVATION').length,
            contracts: deals.filter((d) => d.status === 'CONTRACT').length,
            commissionPaid: paid,
            commissionPending: pending,
          })
        }
      } catch {
        if (!cancelled) setLeadStats(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const reportCards = leadStats
    ? [
        { icon: Users, label: ar ? 'الليدز المتسجلة' : 'Registered leads', value: String(leadStats.totalLeads), accent: 'text-blue-500' },
        { icon: Shield, label: ar ? 'ليدز محمية' : 'Protected leads', value: String(leadStats.activeProtected), accent: 'text-green-500' },
        { icon: ShieldAlert, label: ar ? 'حمايتها هتخلص قريب' : 'Expiring soon', value: String(leadStats.expiringSoon), accent: 'text-amber-500' },
        { icon: ShieldOff, label: ar ? 'حمايتها خلصت' : 'Expired protection', value: String(leadStats.expired), accent: 'text-red-500' },
        { icon: Eye, label: ar ? 'المعاينات' : 'Viewings', value: String(leadStats.viewings), accent: 'text-purple-500' },
        { icon: FileText, label: ar ? 'الحجوزات' : 'Reservations', value: String(leadStats.reservations), accent: 'text-orange-500' },
        { icon: Handshake, label: ar ? 'الصفقات المتباعة' : 'Sold deals', value: String(leadStats.sold), accent: 'text-emerald-600' },
        { icon: DollarSign, label: ar ? 'عمولة مدفوعة' : 'Commission paid', value: growth ? formatEGP(growth.commissionPaid) : '—', accent: 'text-green-600' },
        { icon: DollarSign, label: ar ? 'عمولة مستنية' : 'Commission pending', value: growth ? formatEGP(growth.commissionPending) : '—', accent: 'text-amber-600' },
        { icon: BarChart3, label: ar ? 'إجمالي قيمة الصفقات' : 'Total deal value', value: growth ? formatEGP(growth.soldValue) : '—', accent: 'text-estate-gold' },
      ]
    : []

  return (
    <div className="space-y-6">
      <Reveal>
        <SectionHeader
          kicker={ar ? 'تقارير الأداء' : 'Performance reports'}
          title={ar ? 'التحليلات' : 'Analytics'}
          description={ar ? 'نظرة عامة على أداء المنصة' : 'Platform performance overview'}
        />
      </Reveal>

      {/* Real growth reports (server-scoped to your role) */}
      <Reveal>
      <Card className="border-estate-gold/20 dark:border-[#D4A843]/20 dark:bg-[#0A0A0A]">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-5 w-5 text-estate-gold" />
            {ar ? 'تقارير حماية الليدز والصفقات' : 'Lead Protection & Deal Reports'}
            <span className="ml-auto text-xs font-normal text-muted-foreground">{ar ? 'على قد حسابك' : 'scoped to your account'}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> {ar ? 'بنحمّل التقارير...' : 'Loading reports...'}
            </div>
          ) : !leadStats ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{ar ? 'التقارير مش متاحة — حدّث الصفحة وجرب تاني.' : 'Reports unavailable — try refreshing.'}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {reportCards.map((card) => (
                <div key={card.label} className="rounded-2xl border border-estate-gold/15 bg-muted/20 p-3 transition-colors hover:border-estate-gold/40 dark:border-[#D4A843]/15">
                  <div className="flex items-center gap-1.5">
                    <card.icon className={cn('h-4 w-4', card.accent)} />
                    <span className="text-xs text-muted-foreground">{card.label}</span>
                  </div>
                  <p className="mt-1 truncate text-xl font-bold">{card.value}</p>
                </div>
              ))}
            </div>
          )}
          {leadStats && (
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>{ar ? 'جديد' : 'New'}: <strong>{leadStats.newLeads}</strong></span>
              <span>· {ar ? 'مؤهل' : 'Qualified'}: <strong>{leadStats.qualified}</strong></span>
              <span>· {ar ? 'مراجعة مكرر' : 'Duplicate review'}: <strong>{leadStats.duplicateReview}</strong></span>
              <span>· {ar ? 'عقود' : 'Contracts'}: <strong>{leadStats.contracts}</strong></span>
              <span>· {ar ? 'ضايع' : 'Lost'}: <strong>{leadStats.lost}</strong></span>
            </div>
          )}
        </CardContent>
      </Card>
      </Reveal>

      <hr className="gold-hairline" />

      {/* Legacy overview cards (unchanged) */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="border-estate-gold/20 dark:border-[#D4A843]/20 dark:bg-[#0A0A0A]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{ar ? 'إجمالي مشاهدات الصفحات' : 'Total Page Views'}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl">28,220</p>
            <p className="mt-1 flex items-center text-xs text-green-600">
              <TrendingUp className="mr-1 h-3 w-3" />{ar ? '+18% عن الشهر اللي فات' : '+18% from last month'}
            </p>
          </CardContent>
        </Card>
        <Card className="border-estate-gold/20 dark:border-[#D4A843]/20 dark:bg-[#0A0A0A]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{ar ? 'تحويل الاستفسارات' : 'Inquiry Conversion'}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl">12.5%</p>
            <p className="mt-1 flex items-center text-xs text-green-600">
              <TrendingUp className="mr-1 h-3 w-3" />{ar ? '+3% عن الشهر اللي فات' : '+3% from last month'}
            </p>
          </CardContent>
        </Card>
        <Card className="border-estate-gold/20 dark:border-[#D4A843]/20 dark:bg-[#0A0A0A]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{ar ? 'متوسط وقت الرد' : 'Avg. Response Time'}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl">2.4 {ar ? 'ساعة' : 'hrs'}</p>
            <p className="mt-1 text-xs text-muted-foreground">{ar ? 'المستهدف: أقل من ساعة' : 'Target: under 1 hour'}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Reveal>
        <Card className="border-estate-gold/20 dark:border-[#D4A843]/20 dark:bg-[#0A0A0A]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display">
              <BarChart3 className="h-5 w-5 text-estate-gold" />
              {ar ? 'أكتر المشاريع مشاهدة' : 'Top Projects by Views'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { name: 'SODIC Eastown', views: 15420, pct: 100 },
              { name: 'Mountain View iCity', views: 12800, pct: 83 },
            ].map((p) => (
              <div key={p.name}>
                <div className="flex items-center justify-between text-sm">
                  <span>{p.name}</span>
                  <span className="text-muted-foreground">{p.views.toLocaleString()} {ar ? 'مشاهدة' : 'views'}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-muted">
                  <div className="h-full rounded-full bg-estate-gold" style={{ width: `${p.pct}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        </Reveal>

        <Reveal delay={120}>
        <Card className="border-estate-gold/20 dark:border-[#D4A843]/20 dark:bg-[#0A0A0A]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display">
              <MessageSquare className="h-5 w-5 text-estate-gold" />
              {ar ? 'مصادر الاستفسارات' : 'Inquiry Sources'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { source: 'Website', count: 45 },
              { source: 'Direct Call', count: 23 },
              { source: 'Referral', count: 15 },
              { source: 'Social Media', count: 12 },
            ].map((s) => (
              <div key={s.source} className="flex items-center justify-between text-sm">
                <span>{ar ? SOURCE_LABEL_AR[s.source] || s.source : s.source}</span>
                <span className="font-medium">{s.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        </Reveal>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Building2 className="h-4 w-4" />
        <span>
          {ar
            ? 'تقارير النمو اللي فوق محسوبة من السيرفر على قد صلاحياتك (البروكر: الليدز بتوعه · المطور: المؤسسة بتاعته).'
            : 'Growth reports above are computed server-side from your role scope (broker: own leads · developer: own organization).'}
        </span>
      </div>
    </div>
  )
}
