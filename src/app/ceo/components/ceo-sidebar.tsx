'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLanguage } from '@/lib/language-context'
import {
  LayoutDashboard,
  Users,
  HelpCircle,
  FolderOpen,
  Building2,
  UserCheck,
  BarChart3,
  Sparkles,
  Settings,
  Shield,
  ChevronDown,
  UserPlus,
  Handshake,
  Rocket,
  FolderTree,
  CloudDownload,
  CalendarCheck,
  DollarSign,
  CreditCard,
  Boxes,
  AlertTriangle,
  FileText,
  FileSpreadsheet,
  Newspaper,
  Briefcase,
  Contact,
  ShieldCheck,
  Send,
  Inbox,
  ScrollText,
  ToggleRight,
  MessageCircleQuestion,
  type LucideIcon,
} from 'lucide-react'

type SideLink = { label: string; labelAr: string; href: string; icon: LucideIcon }
type Group = { title: string; titleAr: string; links: SideLink[] }

const groups: Group[] = [
  {
    title: 'Main',
    titleAr: 'الرئيسية',
    links: [
      { label: 'Overview', labelAr: 'نظرة عامة', href: '/ceo', icon: LayoutDashboard },
      { label: 'CRM Dashboard', labelAr: 'لوحة الـ CRM', href: '/dashboard', icon: Handshake },
      { label: 'Analytics', labelAr: 'التحليلات', href: '/ceo/analytics', icon: BarChart3 },
      { label: 'AI Center', labelAr: 'مركز الذكاء الاصطناعي', href: '/ceo/ai', icon: Sparkles },
    ],
  },
  {
    title: 'People',
    titleAr: 'الناس',
    links: [
      { label: 'Users', labelAr: 'المستخدمين', href: '/ceo/users', icon: Users },
      { label: 'Create User', labelAr: 'اعمل يوزر جديد', href: '/ceo/create-user', icon: UserPlus },
      { label: 'Invitations', labelAr: 'الدعوات', href: '/ceo/invitations', icon: Send },
      { label: 'Access Requests', labelAr: 'طلبات الصلاحية', href: '/ceo/access-requests', icon: ShieldCheck },
      { label: 'Brokers', labelAr: 'البروكرز', href: '/ceo/brokers', icon: UserCheck },
      { label: 'Developers', labelAr: 'المطوّرين', href: '/ceo/developers', icon: Building2 },
    ],
  },
  {
    title: 'Sales',
    titleAr: 'المبيعات',
    links: [
      { label: 'Leads', labelAr: 'الليدز', href: '/ceo/leads', icon: Users },
      { label: 'Deals & Growth', labelAr: 'الصفقات والنمو', href: '/ceo/deals', icon: Handshake },
      { label: 'Inquiries', labelAr: 'الاستفسارات', href: '/ceo/inquiries', icon: HelpCircle },
      { label: 'Viewings', labelAr: 'المعاينات', href: '/ceo/viewings', icon: CalendarCheck },
      { label: 'Q&A', labelAr: 'أسئلة الزوار', href: '/ceo/questions', icon: MessageCircleQuestion },
    ],
  },
  {
    title: 'Inventory',
    titleAr: 'المخزون',
    links: [
      { label: 'Projects', labelAr: 'المشاريع', href: '/ceo/projects', icon: FolderOpen },
      { label: 'All Projects', labelAr: 'كل المشاريع', href: '/ceo/all-projects', icon: FolderTree },
      { label: 'Units', labelAr: 'الوحدات', href: '/ceo/units', icon: Boxes },
      { label: 'Pricing', labelAr: 'الأسعار', href: '/ceo/pricing', icon: DollarSign },
      { label: 'Payment Plans', labelAr: 'أنظمة الدفع', href: '/ceo/payment-plans', icon: CreditCard },
      { label: 'Areas Survey', labelAr: 'مسح المناطق', href: '/ceo/areas-survey', icon: FileSpreadsheet },
      { label: 'Inventory Gaps', labelAr: 'نواقص المخزون', href: '/ceo/gaps', icon: AlertTriangle },
      { label: 'New Launches', labelAr: 'اللانشات الجديدة', href: '/ceo/new-launches', icon: Rocket },
      { label: 'Import Nawy', labelAr: 'استيراد من ناوي', href: '/ceo/import/nawy', icon: CloudDownload },
    ],
  },
  {
    title: 'Content & inbound',
    titleAr: 'المحتوى والوارد',
    links: [
      { label: 'Blog', labelAr: 'المقالات', href: '/ceo/blog', icon: FileText },
      { label: 'Press', labelAr: 'الصحافة', href: '/ceo/press', icon: Newspaper },
      { label: 'Jobs', labelAr: 'الوظايف', href: '/ceo/jobs', icon: Briefcase },
      { label: 'Contact submissions', labelAr: 'رسايل التواصل', href: '/ceo/contacts', icon: Contact },
    ],
  },
  {
    title: 'System',
    titleAr: 'السيستم',
    links: [
      { label: 'Email Outbox', labelAr: 'البريد الصادر', href: '/ceo/outbox', icon: Inbox },
      { label: 'Feature switches', labelAr: 'مفاتيح الميزات', href: '/ceo/features', icon: ToggleRight },
      { label: 'Audit Log', labelAr: 'سجل التدقيق', href: '/ceo/audit', icon: ScrollText },
      { label: 'Settings', labelAr: 'الإعدادات', href: '/ceo/settings', icon: Settings },
    ],
  },
]

// Flattened for the "is this page active" check below.
const allLinks = groups.flatMap((g) => g.links)

export default function CEOSidebar({ userName, userEmail }: { userName?: string | null; userEmail?: string | null }) {
  const pathname = usePathname()
  const { lang } = useLanguage()
  const ar = lang === 'ar'

  return (
    <aside className="flex w-64 flex-col border-r border-border dark:border-[#262626] bg-card dark:bg-black">
      <div className="flex h-16 items-center gap-2.5 border-b border-border dark:border-[#262626] px-5">
        <div className="gold-shimmer flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-estate-gold to-estate-gold-dark shadow-lg shadow-estate-gold/20">
          <Shield className="h-5 w-5 text-[#0F1A2C]" />
        </div>
        <div>
          <span className="font-display text-sm font-bold tracking-wide text-foreground">CEO</span>
          <span className="font-display ml-1 text-sm font-bold text-estate-gold">{ar ? 'لوحة المدير' : 'Dashboard'}</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="section-kicker mb-1.5 px-3">
                {ar ? group.titleAr : group.title}
              </p>
              <div className="space-y-1">
                {group.links.map((link) => {
                  const isActive =
                    link.href === '/ceo'
                      ? pathname === '/ceo'
                      : pathname.startsWith(link.href)
                  const Icon = link.icon

                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`
                    group flex items-center gap-3 rounded-full px-3 py-2 text-sm font-medium transition-all duration-200
                    ${
                      isActive
                        ? 'bg-estate-gold/15 text-estate-gold shadow-[inset_0_0_20px_rgba(212,168,67,0.05)]'
                        : 'text-gray-400 hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-gray-200'
                    }
                  `}
                    >
                      <Icon
                        className={`h-5 w-5 flex-shrink-0 transition-colors ${
                          isActive ? 'text-estate-gold' : 'text-gray-500 group-hover:text-gray-300'
                        }`}
                      />
                      <span>{ar ? link.labelAr : link.label}</span>
                      {isActive && (
                        <div className="ml-auto h-1.5 w-1.5 rounded-full bg-estate-gold shadow-[0_0_8px_rgba(212,168,67,0.6)]" />
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div className="border-t border-border dark:border-[#262626] p-3">
        <hr className="gold-hairline mb-3 opacity-60" />
        <div className="flex items-center gap-3 rounded-2xl bg-card dark:bg-[#0A0A0A] px-3 py-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-estate-gold to-estate-gold-dark text-sm font-bold text-[#0F1A2C]">
            {userName?.charAt(0) ?? 'C'}
          </div>
          <div className="flex-1 truncate">
            <p className="truncate text-sm font-medium text-foreground">{userName ?? (ar ? 'المدير' : 'CEO')}</p>
            <p className="truncate text-xs text-gray-500">{userEmail ?? ''}</p>
          </div>
          <ChevronDown className="h-4 w-4 text-gray-500" />
        </div>
      </div>
    </aside>
  )
}

/** Exported so tests/lint can assert every page under /ceo is reachable. */
export const CEOSidebarHrefs = allLinks.map((l) => l.href)
