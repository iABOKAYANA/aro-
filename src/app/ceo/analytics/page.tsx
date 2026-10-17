'use client'

import { useEffect, useState } from 'react'
import { Loader2, BarChart3, TrendingUp, Users, Building2, Eye, Heart, MessageSquare, CalendarCheck, FileText, Award } from 'lucide-react'
import CeoAnalyticsCharts from '@/components/ceo/ceo-analytics-charts'
import { useLanguage } from '@/lib/language-context'
import { Reveal } from '@/components/design'

interface Stats {
  totalUsers: number
  totalBrokers: number
  totalProjects: number
  totalLeads: number
  totalInquiries: number
  conversionRate: number
  totalFavorites: number
  totalViewings: number
  leadsByMonth: { month: string; count: number }[]
  usersByMonth: { month: string; count: number }[]
  inquiriesByMonth: { month: string; count: number }[]
  leadsByStatus: { status: string; count: number }[]
  inquiriesByStatus: { status: string; count: number }[]
  usersByRole: { role: string; count: number }[]
  topProjects: { id: string; name: string; inquiryCount: number; viewCount: number; favoriteCount: number }[]
  propertyTypeDemand: { type: string; count: number; avgPrice: number | null }[]
  topLocations: { name: string; count: number }[]
  brokerPerformance: {
    id: string
    user: { name: string; email: string }
    totalDeals: number
    rating: number
    _count: { leads: number }
  }[]
}

// ─── Engagement (measured-only, from GET /api/ceo/engagement) ───
interface EngagementStage {
  key: string
  label: string
  labelAr: string
  count: number
  conversionFromPrev: number | null
  source: string
}

interface EngagementTopProject {
  id: string
  name: string
  eventViews: number
  saves: number
  inquiries: number
  viewings: number
  leads: number
  deals: number
  counterViews: number
  counterFavorites: number
  counterInquiries: number
}

interface EngagementTrendDay {
  date: string
  views: number
  saves: number
  inquiries: number
  viewings: number
  deals: number
}

interface Engagement {
  range: { from: string; to: string; days: number }
  funnel: EngagementStage[]
  totals: {
    uniqueViewers: number
    favorites: number
    watches: number
    inquiries: number
    leads: number
    aiChats: number
    notificationsTotal: number
    notificationsRead: number
  }
  topProjects: EngagementTopProject[]
  trend: EngagementTrendDay[]
  empty: string[]
}

const ENG_ICONS: Record<string, typeof Eye> = {
  VIEWS: Eye,
  SAVES: Heart,
  INQUIRIES: MessageSquare,
  VIEWINGS: CalendarCheck,
  RESERVATIONS: FileText,
  CONTRACTS: FileText,
  SOLD: Award,
}

export default function CEOAnalyticsPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [engagement, setEngagement] = useState<Engagement | null>(null)
  const [engLoading, setEngLoading] = useState(true)
  const [engFailed, setEngFailed] = useState(false)

  useEffect(() => {
    fetch('/api/ceo/stats')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load analytics')
        return res.json()
      })
      .then(setStats)
      .catch((e) => {
        console.error('Failed to load analytics:', e)
        setError(ar ? 'معرفناش نجيب التحليلات — حاول تاني.' : 'Failed to load analytics')
      })
      .finally(() => setLoading(false))
  }, [ar])

  useEffect(() => {
    fetch('/api/ceo/engagement?days=30')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load engagement')
        return res.json()
      })
      .then(setEngagement)
      .catch((e) => {
        console.error('Failed to load engagement:', e)
        setEngFailed(true)
      })
      .finally(() => setEngLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-estate-gold" />
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <p className="text-red-400">{error || (ar ? 'مفيش داتا متاحة' : 'No data available')}</p>
      </div>
    )
  }

  const totalLeadsConverted = stats.leadsByStatus.find(l => l.status === 'CONVERTED')?.count || 0
  const totalLeadsLost = stats.leadsByStatus.find(l => l.status === 'LOST')?.count || 0
  const totalLeadsNew = stats.leadsByStatus.find(l => l.status === 'NEW')?.count || 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Reveal>
          <p className="section-kicker">{ar ? 'لوحة المدير · تحليلات' : 'CEO Console · Analytics'}</p>
          <h1 className="font-display display-3 text-foreground">{ar ? 'التحليلات' : 'Analytics'}</h1>
          <p className="mt-1 text-sm text-gray-400">{ar ? 'تحليلات تفصيلية لكل مؤشرات الشغل' : 'Deep-dive analytics across all business metrics'}</p>
          <hr className="gold-hairline mt-4" />
        </Reveal>
        <div className="flex items-center gap-2 rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-1.5">
          <BarChart3 className="h-4 w-4 text-estate-gold" />
          <span className="text-xs text-gray-400">{ar ? 'داشبورد التحليلات' : 'Analytics Dashboard'}</span>
        </div>
      </div>

      {/* Quick KPIs */}
      <Reveal className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: 'Conversion Rate', labelAr: 'نسبة التحويل', value: `${stats.conversionRate}%`, icon: TrendingUp, color: 'text-emerald-400' },
          { label: 'New Leads', labelAr: 'ليدز جداد', value: totalLeadsNew, icon: Users, color: 'text-estate-gold' },
          { label: 'Converted Leads', labelAr: 'ليدز اتحوّلت', value: totalLeadsConverted, icon: TrendingUp, color: 'text-emerald-400' },
          { label: 'Lost Leads', labelAr: 'ليدز ضاعت', value: totalLeadsLost, icon: Building2, color: 'text-red-400' },
          { label: 'Total Viewings', labelAr: 'كل المعاينات', value: stats.totalViewings, icon: BarChart3, color: 'text-estate-gold' },
        ].map(({ label, labelAr: labelA, value, icon: Icon, color }) => (
          <div key={label} className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm p-4 text-center">
            <Icon className={`mx-auto mb-2 h-5 w-5 ${color}`} />
            <p className={`text-xl font-bold ${color}`}>{typeof value === 'number' ? value.toLocaleString() : value}</p>
            <p className="mt-1 text-xs text-gray-400">{ar ? labelA : label}</p>
          </div>
        ))}
      </Reveal>

      {/* Detailed Charts */}
      <CeoAnalyticsCharts stats={stats} />

      {/* Engagement — measured-only funnel from real event rows */}
      <Reveal>
        <p className="section-kicker">{ar ? 'التفاعل · أحداث حقيقية فقط' : 'Engagement · measured events only'}</p>
        <h2 className="font-display text-xl font-semibold text-foreground">{ar ? 'تفاعل المشترين (آخر ٣٠ يوم)' : 'Buyer engagement (last 30 days)'}</h2>
        <p className="mt-1 text-xs text-gray-400">
          {ar
            ? 'كل رقم جاي من جدول حقيقي (المصدر مكتوب تحت كل كارت). الجداول الفاضية بتظهر صفر — مفيش أرقام وهمية.'
            : 'Every number traces to a real table (source under each card). Empty tables show honest zeros — no placeholders.'}
        </p>
        <hr className="gold-hairline mt-3 opacity-70" />
      </Reveal>

      {engLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-estate-gold" />
        </div>
      ) : engFailed || !engagement ? (
        <p className="text-center text-sm text-red-400">{ar ? 'معرفناش نجيب التفاعل — حاول تاني.' : 'Failed to load engagement'}</p>
      ) : (
        <div className="space-y-6">
          {/* Funnel cards */}
          <Reveal className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {engagement.funnel.map((stage) => {
              const Icon = ENG_ICONS[stage.key] || BarChart3
              return (
                <div key={stage.key} className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm p-4 text-center">
                  <Icon className="mx-auto mb-2 h-5 w-5 text-estate-gold" />
                  <p className="text-xl font-bold text-estate-gold">{stage.count.toLocaleString()}</p>
                  <p className="mt-1 text-xs text-gray-400">{ar ? stage.labelAr : stage.label}</p>
                  <p className="mt-1 text-[11px] text-gray-500">
                    {stage.conversionFromPrev === null
                      ? (ar ? '— مفيش تحويل محسوب' : '— no conversion')
                      : `${stage.conversionFromPrev}% ${ar ? 'تحويل من اللي قبله' : 'from prev'}`}
                  </p>
                  <p className="mt-1 text-[10px] text-gray-600" dir="ltr">{stage.source}</p>
                </div>
              )
            })}
            <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm p-4 text-center">
              <Users className="mx-auto mb-2 h-5 w-5 text-estate-gold" />
              <p className="text-xl font-bold text-estate-gold">{engagement.totals.uniqueViewers.toLocaleString()}</p>
              <p className="mt-1 text-xs text-gray-400">{ar ? 'زوار مميزين' : 'Unique viewers'}</p>
              <p className="mt-1 text-[11px] text-gray-500">{engagement.totals.aiChats.toLocaleString()} {ar ? 'محادثة AI' : 'AI chats'}</p>
              <p className="mt-1 text-[10px] text-gray-600" dir="ltr">UserEvent.userId + anonId · AIConversation.createdAt</p>
            </div>
          </Reveal>
          {engagement.funnel.every((s) => s.count === 0) && (
            <p className="text-center text-xs text-gray-500">
              {ar ? 'مفيش أحداث تفاعل في آخر ٣٠ يوم — كل المراحل صفر بجد.' : 'No engagement events in the last 30 days — all stages are honest zeros.'}
            </p>
          )}
          <p className="text-center text-[11px] text-gray-500">
            {ar ? 'قراءة الإشعارات: ' : 'Notification reads: '}
            <span dir="ltr">({engagement.totals.notificationsRead}/{engagement.totals.notificationsTotal} · Notification.isRead)</span>
          </p>

          {/* Top projects table */}
          <Reveal>
            <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm p-6">
              <h3 className="section-kicker mb-3">{ar ? 'أحسن مشاريع حسب المشاهدات الحقيقية' : 'Top projects by real views'}</h3>
              <hr className="gold-hairline mb-4 opacity-60" />
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border dark:border-[#262626]">
                      <th className="px-4 py-3 font-medium text-gray-400">#</th>
                      <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'المشروع' : 'Project'}</th>
                      <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'مشاهدات (أحداث)' : 'Views (events)'}</th>
                      <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'حفظ' : 'Saves'}</th>
                      <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'استفسارات' : 'Inquiries'}</th>
                      <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'معاينات' : 'Viewings'}</th>
                      <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'ليدز' : 'Leads'}</th>
                      <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'صفقات' : 'Deals'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {engagement.topProjects.map((p, i) => (
                      <tr key={p.id} className="border-b border-border dark:border-[#262626]">
                        <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                        <td className="px-4 py-3 font-medium text-foreground">{p.name}</td>
                        <td className="px-4 py-3 text-gray-300">{p.eventViews.toLocaleString()}</td>
                        <td className="px-4 py-3 text-gray-300">{p.saves.toLocaleString()}</td>
                        <td className="px-4 py-3 text-gray-300">{p.inquiries.toLocaleString()}</td>
                        <td className="px-4 py-3 text-gray-300">{p.viewings.toLocaleString()}</td>
                        <td className="px-4 py-3 text-gray-300">{p.leads.toLocaleString()}</td>
                        <td className="px-4 py-3 text-gray-300">{p.deals.toLocaleString()}</td>
                      </tr>
                    ))}
                    {engagement.topProjects.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                          {ar ? 'لسه مفيش مشاهدات مربوطة بمشروع في الفترة دي.' : 'No project-linked views in this range yet.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[10px] text-gray-600" dir="ltr">
                Sources: UserEvent.entityId → Project.id (UNIT_VIEW via Unit.projectId) · Viewing.projectId · Lead.projectId · Deal.projectId
              </p>
            </div>
          </Reveal>

          {/* 30-day trend */}
          <Reveal>
            <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm p-6">
              <h3 className="section-kicker mb-3">{ar ? 'الاتجاه اليومي (٣٠ يوم)' : 'Daily trend (30 days)'}</h3>
              <hr className="gold-hairline mb-4 opacity-60" />
              <div className="space-y-1.5">
                {engagement.trend.map((d) => {
                  const max = Math.max(1, ...engagement.trend.map((t) => t.views))
                  return (
                    <div key={d.date} className="flex items-center gap-3 text-xs">
                      <span className="w-24 shrink-0 text-gray-500" dir="ltr">{d.date}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-border/40 dark:bg-[#262626]/60">
                        <div className="h-full rounded-full bg-estate-gold" style={{ width: `${(d.views / max) * 100}%` }} />
                      </div>
                      <span className="w-40 shrink-0 text-gray-400" dir="ltr">
                        {d.views}v · {d.saves}s · {d.inquiries}i · {d.viewings}w · {d.deals}d
                      </span>
                    </div>
                  )
                })}
              </div>
              <p className="mt-3 text-[10px] text-gray-600" dir="ltr">
                v=UserEvent PROJECT_VIEW/UNIT_VIEW · s=Favorite.createdAt + Watch.createdAt · i=Inquiry.createdAt + Lead.createdAt · w=Viewing.createdAt · d=Deal.createdAt
              </p>
            </div>
          </Reveal>
        </div>
      )}
    </div>
  )
}
