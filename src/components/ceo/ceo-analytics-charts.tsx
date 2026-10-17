'use client'

import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { formatEGP } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { useLanguage } from '@/lib/language-context'
import { roleLabel, statusLabel } from './ceo-charts'
import { Reveal } from '@/components/design'

const GOLD = '#D4A843'
const GOLD_LIGHT = '#E8C56D'
const GOLD_DIM = '#B8923A'
const COPPER = '#C9956A'
// Mode-adaptive grid/axis strokes (neutral gray reads on black and white).
const GRID = 'rgba(128,128,128,0.35)'
const GRID_SOFT = 'rgba(128,128,128,0.2)'

const tooltipStyle = {
  contentStyle: {
    backgroundColor: '#000000',
    border: '1px solid #262626',
    borderRadius: '8px',
    color: '#fff',
    fontSize: 12,
  },
  itemStyle: { color: GOLD },
  labelStyle: { color: '#9CA3AF' },
}

const STATUS_COLORS: Record<string, string> = {
  NEW: '#D4A843',
  CONTACTED: '#E8C56D',
  QUALIFIED: '#C9956A',
  NEGOTIATING: '#B8923A',
  CONVERTED: '#22C55E',
  LOST: '#EF4444',
  UNANSWERED: '#6B7280',
}

interface Stats {
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
  totalUsers: number
  totalBrokers: number
  totalProjects: number
  totalLeads: number
  totalInquiries: number
  conversionRate: number
  totalFavorites: number
  totalViewings: number
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="font-display text-xl font-semibold text-foreground">{children}</h2>
      <hr className="gold-hairline mt-3 opacity-70" />
    </div>
  )
}

function ChartCard({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Reveal>
      <div className={`rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm p-6 ${className}`}>
        <h3 className="section-kicker mb-3">{title}</h3>
        <hr className="gold-hairline mb-4 opacity-60" />
        {children}
      </div>
    </Reveal>
  )
}

function StatMini({ label, value, color = 'text-estate-gold' }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-4 text-center">
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="mt-1 text-xs text-gray-400">{label}</p>
    </div>
  )
}

export default function CeoAnalyticsCharts({ stats }: { stats: Stats }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const totalLeadsByStatus = stats.leadsByStatus.reduce((s, l) => s + l.count, 0)

  const conversionFunnel = [
    { stage: 'Total Leads', stageAr: 'كل الليدز', count: stats.totalLeads },
    { stage: 'Inquiries', stageAr: 'الاستفسارات', count: stats.totalInquiries },
    { stage: 'Converted', stageAr: 'اللي اتحوّلوا', count: stats.leadsByStatus.find(l => l.status === 'CONVERTED')?.count || 0 },
  ]

  const avgPriceByType = stats.propertyTypeDemand
    .filter(p => p.avgPrice != null)
    .map(p => ({ type: p.type, avgPrice: Math.round(p.avgPrice!), count: p.count }))

  return (
    <div className="space-y-8">
      {/* Summary cards */}
      <div>
        <SectionTitle>{ar ? 'نظرة عامة سريعة' : 'Summary Overview'}</SectionTitle>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatMini label={ar ? 'كل المستخدمين' : 'Total Users'} value={stats.totalUsers} />
          <StatMini label={ar ? 'كل البروكرز' : 'Total Brokers'} value={stats.totalBrokers} color="text-estate-gold" />
          <StatMini label={ar ? 'مشاريع شغالة' : 'Active Projects'} value={stats.totalProjects} color="text-estate-copper" />
          <StatMini label={ar ? 'كل الليدز' : 'Total Leads'} value={stats.totalLeads} color="text-estate-gold" />
          <StatMini label={ar ? 'كل الاستفسارات' : 'Total Inquiries'} value={stats.totalInquiries} color="text-estate-gold" />
          <StatMini label={ar ? 'نسبة التحويل' : 'Conversion Rate'} value={`${stats.conversionRate}%`} color="text-emerald-400" />
        </div>
      </div>

      {/* Lead Analytics */}
      <div className="space-y-4">
        <SectionTitle>{ar ? 'تحليلات الليدز' : 'Lead Analytics'}</SectionTitle>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Lead status breakdown */}
          <ChartCard title={ar ? 'توزيعة حالات الليدز' : 'Lead Status Breakdown'}>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={stats.leadsByStatus}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="count"
                  nameKey="status"
                  label={({ status, percent }) => `${statusLabel(status, ar)} ${(percent * 100).toFixed(0)}%`}
                >
                  {stats.leadsByStatus.map((entry) => (
                    <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || GOLD} />
                  ))}
                </Pie>
                <Tooltip {...tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Conversion funnel */}
          <ChartCard title={ar ? 'مسار التحويل' : 'Conversion Funnel'}>
            <div className="flex flex-col items-center justify-center gap-4 py-8">
              {conversionFunnel.map((step, i) => {
                const widthPct = 100 - i * 25
                return (
                  <div key={step.stage} className="text-center" style={{ width: `${widthPct}%` }}>
                    <div className="mx-auto rounded-2xl bg-estate-gold/10 border border-estate-gold/20 px-6 py-3">
                      <p className="text-sm font-medium text-gray-400">{ar ? step.stageAr : step.stage}</p>
                      <p className="text-2xl font-bold text-foreground">{step.count.toLocaleString()}</p>
                    </div>
                    {i < conversionFunnel.length - 1 && (
                      <div className="mx-auto my-2 h-6 w-px bg-border dark:bg-[#262626]" />
                    )}
                  </div>
                )
              })}
            </div>
          </ChartCard>

          {/* Lead trends over time */}
          <ChartCard title={ar ? 'اتجاه الليدز (٦ شهور)' : 'Lead Trends (6 months)'}>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={stats.leadsByMonth}>
                <defs>
                  <linearGradient id="leadGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={GOLD} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={GOLD} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_SOFT} />
                <XAxis dataKey="month" tick={{ fill: '#6B7280', fontSize: 12 }} stroke={GRID} />
                <YAxis tick={{ fill: '#6B7280', fontSize: 12 }} stroke={GRID} />
                <Tooltip {...tooltipStyle} />
                <Area type="monotone" dataKey="count" stroke={GOLD} fill="url(#leadGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Leads by status bar */}
          <ChartCard title={ar ? 'الليدز حسب الحالة' : 'Leads by Status'}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.leadsByStatus}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_SOFT} />
                <XAxis dataKey="status" tick={{ fill: '#6B7280', fontSize: 11 }} stroke={GRID} />
                <YAxis tick={{ fill: '#6B7280', fontSize: 12 }} stroke={GRID} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {stats.leadsByStatus.map((entry) => (
                    <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || GOLD} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>

      {/* User Analytics */}
      <div className="space-y-4">
        <SectionTitle>{ar ? 'تحليلات اليوزرز' : 'User Analytics'}</SectionTitle>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartCard title={ar ? 'اليوزرز حسب الدور' : 'Users by Role'}>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={stats.usersByRole}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="count"
                  nameKey="role"
                  label={({ role, percent }) => `${roleLabel(role, ar)} ${(percent * 100).toFixed(0)}%`}
                >
                  {stats.usersByRole.map((entry) => (
                    <Cell
                      key={entry.role}
                      fill={
                        entry.role === 'BUYER' ? GOLD
                          : entry.role === 'BROKER' ? COPPER
                          : entry.role === 'DEVELOPER' ? GOLD_DIM
                          : entry.role === 'ADMIN' ? GOLD_LIGHT
                          : GOLD_DIM
                      }
                    />
                  ))}
                </Pie>
                <Tooltip {...tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title={ar ? 'اتجاه التسجيلات (٦ شهور)' : 'Registration Trends (6 months)'}>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={stats.usersByMonth}>
                <defs>
                  <linearGradient id="userGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COPPER} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COPPER} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_SOFT} />
                <XAxis dataKey="month" tick={{ fill: '#6B7280', fontSize: 12 }} stroke={GRID} />
                <YAxis tick={{ fill: '#6B7280', fontSize: 12 }} stroke={GRID} />
                <Tooltip {...tooltipStyle} />
                <Area type="monotone" dataKey="count" stroke={COPPER} fill="url(#userGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>

      {/* Property Analytics */}
      <div className="space-y-4">
        <SectionTitle>{ar ? 'تحليلات العقارات' : 'Property Analytics'}</SectionTitle>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartCard title={ar ? 'الطلب حسب نوع العقار' : 'Property Type Demand'}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.propertyTypeDemand}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_SOFT} />
                <XAxis dataKey="type" tick={{ fill: '#6B7280', fontSize: 11 }} stroke={GRID} />
                <YAxis tick={{ fill: '#6B7280', fontSize: 12 }} stroke={GRID} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="count" fill={GOLD} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title={ar ? 'متوسط السعر حسب النوع' : 'Average Price by Type'}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={avgPriceByType}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_SOFT} />
                <XAxis dataKey="type" tick={{ fill: '#6B7280', fontSize: 11 }} stroke={GRID} />
                <YAxis tick={{ fill: '#6B7280', fontSize: 12 }} stroke={GRID} tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`} />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(value: number) => [formatEGP(value), ar ? 'متوسط السعر' : 'Avg Price']}
                />
                <Bar dataKey="avgPrice" fill={GOLD_LIGHT} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title={ar ? 'أحسن مناطق بعدد المشاريع' : 'Top Locations by Project Count'}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.topLocations} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_SOFT} />
                <XAxis type="number" tick={{ fill: '#6B7280', fontSize: 12 }} stroke={GRID} />
                <YAxis dataKey="name" type="category" width={120} tick={{ fill: '#9CA3AF', fontSize: 11 }} stroke={GRID} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="count" fill={GOLD_DIM} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>

      {/* Broker Performance */}
      <div className="space-y-4">
        <SectionTitle>{ar ? 'أداء البروكرز' : 'Broker Performance'}</SectionTitle>
        <Card className="overflow-hidden rounded-2xl border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border dark:border-[#262626]">
                  <th className="px-6 py-4 font-medium text-gray-400">#</th>
                  <th className="px-6 py-4 font-medium text-gray-400">{ar ? 'البروكر' : 'Broker'}</th>
                  <th className="px-6 py-4 font-medium text-gray-400">{ar ? 'الليدز' : 'Leads'}</th>
                  <th className="px-6 py-4 font-medium text-gray-400">{ar ? 'الصفقات' : 'Deals'}</th>
                  <th className="px-6 py-4 font-medium text-gray-400">{ar ? 'التقييم' : 'Rating'}</th>
                </tr>
              </thead>
              <tbody>
                {stats.brokerPerformance.map((broker, i) => (
                  <tr key={broker.id} className="border-b border-border dark:border-[#262626] transition-colors hover:bg-card dark:hover:bg-[#0A0A0A]">
                    <td className="px-6 py-4 text-gray-500">{i + 1}</td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-foreground">{broker.user.name}</p>
                        <p className="text-xs text-gray-500">{broker.user.email}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-300">{broker._count.leads}</td>
                    <td className="px-6 py-4 text-gray-300">{broker.totalDeals}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        <span className="text-estate-gold">{broker.rating.toFixed(1)}</span>
                        <span className="text-xs text-gray-500">/ 5</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {stats.brokerPerformance.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">{ar ? 'مفيش داتا بروكرز متاحة' : 'No broker data available'}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Project Analytics */}
      <div className="space-y-4">
        <SectionTitle>{ar ? 'تحليلات المشاريع' : 'Project Analytics'}</SectionTitle>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartCard title={ar ? 'أحسن مشاريع حسب الاستفسارات' : 'Top Projects by Inquiries'}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.topProjects} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_SOFT} />
                <XAxis type="number" tick={{ fill: '#6B7280', fontSize: 12 }} stroke={GRID} />
                <YAxis dataKey="name" type="category" width={120} tick={{ fill: '#9CA3AF', fontSize: 11 }} stroke={GRID} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="inquiryCount" fill={GOLD} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title={ar ? 'أحسن مشاريع حسب المشاهدات والمفضلة' : 'Top Projects by Views & Favorites'}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.topProjects}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_SOFT} />
                <XAxis dataKey="name" tick={{ fill: '#6B7280', fontSize: 10 }} stroke={GRID} angle={-30} textAnchor="end" height={80} />
                <YAxis tick={{ fill: '#6B7280', fontSize: 12 }} stroke={GRID} />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ color: '#9CA3AF', fontSize: 12 }} />
                <Bar dataKey="viewCount" name={ar ? 'مشاهدات' : 'Views'} fill={GOLD_DIM} radius={[4, 4, 0, 0]} />
                <Bar dataKey="favoriteCount" name={ar ? 'مفضلات' : 'Favorites'} fill={GOLD} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>

      {/* Inquiry trends */}
      <div className="space-y-4">
        <SectionTitle>{ar ? 'تحليلات الاستفسارات' : 'Inquiry Analytics'}</SectionTitle>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartCard title={ar ? 'اتجاه الاستفسارات (٦ شهور)' : 'Inquiry Trends (6 months)'}>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={stats.inquiriesByMonth}>
                <defs>
                  <linearGradient id="inquiryGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={GOLD_DIM} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={GOLD_DIM} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_SOFT} />
                <XAxis dataKey="month" tick={{ fill: '#6B7280', fontSize: 12 }} stroke={GRID} />
                <YAxis tick={{ fill: '#6B7280', fontSize: 12 }} stroke={GRID} />
                <Tooltip {...tooltipStyle} />
                <Area type="monotone" dataKey="count" stroke={GOLD_DIM} fill="url(#inquiryGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title={ar ? 'توزيعة حالات الاستفسارات' : 'Inquiry Status Breakdown'}>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={stats.inquiriesByStatus}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="count"
                  nameKey="status"
                  label={({ status, percent }) => `${statusLabel(status, ar)} ${(percent * 100).toFixed(0)}%`}
                >
                  {stats.inquiriesByStatus.map((entry) => (
                    <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || GOLD} />
                  ))}
                </Pie>
                <Tooltip {...tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>
    </div>
  )
}
