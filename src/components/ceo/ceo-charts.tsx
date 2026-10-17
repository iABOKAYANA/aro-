'use client'

import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { useLanguage } from '@/lib/language-context'
import { Reveal } from '@/components/design'

const GOLD = '#D4A843'
const GOLD_LIGHT = '#E8C56D'
const GOLD_DIM = '#B8923A'
const COPPER = '#C9956A'
const GOLD_PALE = '#F0D089'
const GOLD_DEEP = '#8C6D2B'
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

interface Stats {
  leadsByMonth: { month: string; count: number }[]
  usersByMonth: { month: string; count: number }[]
  inquiriesByMonth: { month: string; count: number }[]
  topProjects: { id: string; name: string; inquiryCount: number; viewCount: number; favoriteCount: number }[]
  propertyTypeDemand: { type: string; count: number; avgPrice: number | null }[]
  usersByRole: { role: string; count: number }[]
  leadsByStatus: { status: string; count: number }[]
  topLocations: { name: string; count: number }[]
}

const ROLE_COLORS: Record<string, string> = {
  BUYER: '#D4A843',
  BROKER: '#C9956A',
  DEVELOPER: '#E8C56D',
  ADMIN: '#B8923A',
  CEO: '#8C6D2B',
  SELLER: '#F0D089',
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

const ROLE_AR: Record<string, string> = {
  BUYER: 'مشتري',
  BROKER: 'بروكر',
  DEVELOPER: 'مطوّر',
  ADMIN: 'أدمن',
  CEO: 'المدير',
  SELLER: 'بايع',
}

const STATUS_AR: Record<string, string> = {
  NEW: 'جديد',
  CONTACTED: 'تم التواصل',
  QUALIFIED: 'مؤهل',
  NEGOTIATING: 'بيتفاوض',
  CONVERTED: 'اتحوّل',
  LOST: 'ضايع',
  UNANSWERED: 'مردّش',
  PENDING: 'مستنّي',
  ACTIVE: 'نشط',
  INACTIVE: 'مش نشط',
  SUSPENDED: 'موقوف',
  REJECTED: 'مرفوض',
  DISABLED: 'معطّل',
  APPROVED: 'متوافق عليه',
  ACCEPTED: 'اتقبل',
  EXPIRED: 'خلص',
  REVOKED: 'مسحوبة',
  BLOCKED: 'محظور',
  VERIFIED: 'متوثّق',
  UNVERIFIED: 'مش متوثّق',
  VIEWING: 'معاينة',
  INTERESTED: 'مهتم',
  RESERVATION: 'حجز',
  CONTRACT: 'تعاقد',
  SOLD: 'اتباع',
  CANCELLED: 'ملغي',
  UNDER_REVIEW: 'قيد المراجعة',
  DRAFT: 'مسودة',
  PUBLISHED: 'منشور',
  HIDDEN: 'مستخبي',
  ARCHIVED: 'مؤرشف',
  RESOLVED: 'اتحلّت',
  CLOSED: 'اتقفلت',
  REQUESTED: 'اتطلبت',
  CONFIRMED: 'متأكدة',
  COMPLETED: 'اتعملت',
  NO_SHOW: 'مجاش',
  READ: 'اتقري',
  REPLIED: 'اترد عليه',
  AVAILABLE: 'متاحة',
  RESERVED: 'محجوزة',
  COMING_SOON: 'جاي قريب',
  SOLD_OUT: 'اتباع كله',
}

export function roleLabel(role: string, ar: boolean) {
  return ar ? ROLE_AR[role] || role : role
}

export function statusLabel(status: string, ar: boolean) {
  return ar ? STATUS_AR[status] || status : status
}

export default function CeoCharts({ stats }: { stats: Stats }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Leads over time */}
      <ChartCard title={ar ? 'الليدز عبر الوقت' : 'Leads Over Time'}>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={stats.leadsByMonth}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_SOFT} />
            <XAxis dataKey="month" tick={{ fill: '#6B7280', fontSize: 12 }} stroke={GRID} />
            <YAxis tick={{ fill: '#6B7280', fontSize: 12 }} stroke={GRID} />
            <Tooltip {...tooltipStyle} />
            <Line type="monotone" dataKey="count" stroke={GOLD} strokeWidth={2} dot={{ fill: GOLD, r: 4 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* User registrations over time */}
      <ChartCard title={ar ? 'تسجيلات اليوزرز' : 'User Registrations'}>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={stats.usersByMonth}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_SOFT} />
            <XAxis dataKey="month" tick={{ fill: '#6B7280', fontSize: 12 }} stroke={GRID} />
            <YAxis tick={{ fill: '#6B7280', fontSize: 12 }} stroke={GRID} />
            <Tooltip {...tooltipStyle} />
            <Line type="monotone" dataKey="count" stroke={GOLD_LIGHT} strokeWidth={2} dot={{ fill: GOLD_LIGHT, r: 4 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Inquiries over time */}
      <ChartCard title={ar ? 'الاستفسارات عبر الوقت' : 'Inquiries Over Time'}>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={stats.inquiriesByMonth}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_SOFT} />
            <XAxis dataKey="month" tick={{ fill: '#6B7280', fontSize: 12 }} stroke={GRID} />
            <YAxis tick={{ fill: '#6B7280', fontSize: 12 }} stroke={GRID} />
            <Tooltip {...tooltipStyle} />
            <Line type="monotone" dataKey="count" stroke={GOLD_DIM} strokeWidth={2} dot={{ fill: GOLD_DIM, r: 4 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Top projects by inquiry count */}
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

      {/* Property type demand */}
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

      {/* Users by role distribution */}
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
                <Cell key={entry.role} fill={ROLE_COLORS[entry.role] || GOLD} />
              ))}
            </Pie>
            <Tooltip {...tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Leads by status */}
      <ChartCard title={ar ? 'الليدز حسب الحالة' : 'Leads by Status'}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={stats.leadsByStatus}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_SOFT} />
            <XAxis dataKey="status" tick={{ fill: '#6B7280', fontSize: 11 }} stroke={GRID} />
            <YAxis tick={{ fill: '#6B7280', fontSize: 12 }} stroke={GRID} />
            <Tooltip {...tooltipStyle} />
            <Bar dataKey="count" fill={GOLD} radius={[4, 4, 0, 0]}>
              {stats.leadsByStatus.map((_, i) => (
                <Cell key={i} fill={i % 2 === 0 ? GOLD : GOLD_LIGHT} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Top locations by project count */}
      <ChartCard title={ar ? 'أحسن مناطق حسب المشاريع' : 'Top Locations by Projects'}>
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
  )
}
