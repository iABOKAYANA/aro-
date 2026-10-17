'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import {
  Users, UserCheck, Building2, Target, MessageSquare, TrendingUp,
  Activity, ArrowUpRight, Loader2,
} from 'lucide-react'
import CeoCharts from '@/components/ceo/ceo-charts'
import CeoMeetingRequests from '@/app/ceo/components/ceo-meeting-requests'
import { useLanguage } from '@/lib/language-context'
import { Reveal } from '@/components/design'

interface Stats {
  totalUsers: number
  totalBrokers: number
  totalProjects: number
  totalLeads: number
  newLeadsToday: number
  newLeadsThisWeek: number
  totalInquiries: number
  conversionRate: number
  activeProjects: number
  availableUnits: number
  totalFavorites: number
  totalViewings: number
  leadsByMonth: { month: string; count: number }[]
  usersByMonth: { month: string; count: number }[]
  inquiriesByMonth: { month: string; count: number }[]
  topProjects: { id: string; name: string; inquiryCount: number; viewCount: number; favoriteCount: number }[]
  propertyTypeDemand: { type: string; count: number; avgPrice: number | null }[]
  usersByRole: { role: string; count: number }[]
  leadsByStatus: { status: string; count: number }[]
  topLocations: { name: string; count: number }[]
  brokerPerformance: {
    id: string
    user: { name: string; email: string }
    totalDeals: number
    rating: number
    _count: { leads: number }
  }[]
}

const statConfig: { key: string; label: string; labelAr: string; icon: React.ElementType; color: string; suffix?: string }[] = [
  { key: 'totalUsers', label: 'Total Users', labelAr: 'كل المستخدمين', icon: Users, color: 'from-estate-gold/20 to-estate-gold/5' },
  { key: 'totalBrokers', label: 'Total Brokers', labelAr: 'كل البروكرز', icon: UserCheck, color: 'from-estate-gold/20 to-estate-gold/5' },
  { key: 'totalProjects', label: 'Total Projects', labelAr: 'كل المشاريع', icon: Building2, color: 'from-estate-copper/25 to-estate-copper/5' },
  { key: 'totalLeads', label: 'Total Leads', labelAr: 'كل الليدز', icon: Target, color: 'from-estate-gold/20 to-estate-gold/5' },
  { key: 'totalInquiries', label: 'Total Inquiries', labelAr: 'كل الاستفسارات', icon: MessageSquare, color: 'from-estate-copper/25 to-estate-copper/5' },
  { key: 'conversionRate', label: 'Conversion Rate', labelAr: 'نسبة التحويل', icon: TrendingUp, color: 'from-estate-gold/20 to-estate-gold/5', suffix: '%' },
]

export default function CEOOverviewPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/ceo/stats')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load stats')
        return res.json()
      })
      .then(setStats)
      .catch((e) => {
        console.error('Failed to load CEO stats:', e)
        setError(ar ? 'معرفناش نجيب الإحصائيات — حاول تاني.' : 'Failed to load stats')
      })
      .finally(() => setLoading(false))
  }, [ar])

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Reveal>
          <p className="section-kicker">{ar ? 'لوحة المدير · نظرة عامة' : 'CEO Console · Overview'}</p>
          <h1 className="font-display display-3 text-foreground">{ar ? 'نظرة عامة للمدير' : 'CEO Overview'}</h1>
          <p className="mt-1 text-sm text-gray-400">{ar ? 'داشبورد الإدارة وأهم المؤشرات' : 'Executive dashboard & key performance indicators'}</p>
          <hr className="gold-hairline mt-4" />
        </Reveal>
        <div className="flex items-center gap-2 rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-1.5">
          <Activity className="h-4 w-4 text-estate-gold" />
          <span className="text-xs text-gray-400">{ar ? 'داتا لايف' : 'Live Data'}</span>
        </div>
      </div>

      <CeoMeetingRequests />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {statConfig.map(({ key, label, labelAr, icon: Icon, color, suffix }) => {
          const value = stats[key as keyof Stats] as number
          return (
            <Card
              key={key}
              className="group relative overflow-hidden rounded-2xl border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm transition-all hover:bg-card dark:hover:bg-[#0A0A0A] hover:shadow-lg hover:shadow-estate-gold/5"
            >
              <CardContent className="p-5">
                <div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-0 transition-opacity group-hover:opacity-100`} />
                <div className="relative">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-card dark:bg-[#0A0A0A]">
                      <Icon className="h-5 w-5 text-estate-gold" />
                    </div>
                    {key === 'totalLeads' && stats.newLeadsToday > 0 && (
                      <div className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5">
                        <ArrowUpRight className="h-3 w-3 text-emerald-400" />
                        <span className="text-[10px] font-medium text-emerald-400">{stats.newLeadsToday} {ar ? 'النهاردة' : 'today'}</span>
                      </div>
                    )}
                  </div>
                  <p className="text-2xl font-bold text-foreground">
                    {typeof value === 'number' && value % 1 !== 0 ? `${value}` : value?.toLocaleString()}{suffix || ''}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">{ar ? labelAr : label}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Secondary stats */}
      <Reveal delay={80} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Active Projects', labelAr: 'مشاريع شغالة', value: stats.activeProjects, icon: Building2 },
          { label: 'Available Units', labelAr: 'وحدات متاحة', value: stats.availableUnits, icon: Target },
          { label: 'Total Favorites', labelAr: 'كل المفضلات', value: stats.totalFavorites, icon: Users },
          { label: 'Total Viewings', labelAr: 'كل المعاينات', value: stats.totalViewings, icon: MessageSquare },
        ].map(({ label, labelAr: labelA, value, icon: Icon }) => (
          <Card key={label} className="rounded-2xl border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-estate-gold/10">
                <Icon className="h-5 w-5 text-estate-gold" />
              </div>
              <div>
                <p className="text-lg font-bold text-foreground">{value?.toLocaleString()}</p>
                <p className="text-xs text-gray-400">{ar ? labelA : label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </Reveal>

      {/* Weekly lead indicator */}
      <Card className="rounded-2xl border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
        <CardContent className="flex items-center gap-4 p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10">
            <Target className="h-5 w-5 text-emerald-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-gray-400">{ar ? 'الأسبوع ده' : 'This Week'}</p>
            <p className="text-lg font-bold text-foreground">{ar ? `${stats.newLeadsThisWeek} ليدز جداد` : `${stats.newLeadsThisWeek} new leads`}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-400">{ar ? 'جداد النهاردة' : 'New Today'}</p>
            <p className="text-lg font-bold text-estate-gold">{stats.newLeadsToday}</p>
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <CeoCharts stats={stats} />
    </div>
  )
}
