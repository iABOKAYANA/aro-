'use client'

import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Building2, Users, MessageSquare, BarChart3, Settings, Search, Brain, Heart, Calendar, Home, Handshake } from 'lucide-react'
import { useLanguage } from '@/lib/language-context'
import NotificationBell from '@/components/notification-bell'

import type { LucideIcon } from 'lucide-react'

const sidebarLinks: { href: string; labelKey: string; icon: LucideIcon; roles?: string[]; hideFor?: string[] }[] = [
  { href: '/dashboard', labelKey: 'dash.overview', icon: LayoutDashboard, hideFor: ['DEVELOPER'] },
  { href: '/dashboard/projects', labelKey: 'dash.projects', icon: Building2, roles: ['DEVELOPER', 'ADMIN'] },
  { href: '/dashboard/units', labelKey: 'dash.units', icon: Home, roles: ['DEVELOPER', 'ADMIN'] },
  { href: '/dashboard/leads', labelKey: 'dash.leads', icon: Users, roles: ['BROKER', 'DEVELOPER', 'ADMIN'] },
  { href: '/dashboard/deals', labelKey: 'dash.deals', icon: Handshake, roles: ['BROKER', 'DEVELOPER', 'ADMIN'] },
  { href: '/dashboard/inquiries', labelKey: 'dash.inquiries', icon: MessageSquare, roles: ['BROKER', 'ADMIN'] },
  { href: '/dashboard/viewings', labelKey: 'dash.viewings', icon: Calendar, roles: ['BROKER', 'ADMIN'] },
  { href: '/dashboard/favorites', labelKey: 'nav.favorites', icon: Heart },
  { href: '/dashboard/analytics', labelKey: 'dash.analytics', icon: BarChart3, roles: ['BROKER', 'DEVELOPER', 'ADMIN'] },
  { href: '/ai-tools', labelKey: 'nav.aiTools', icon: Brain },
  { href: '/dashboard/settings', labelKey: 'dash.settings', icon: Settings },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const { lang, t } = useLanguage()

  if (status === 'loading') {
    return <div className="flex min-h-[60vh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-estate-gold border-t-transparent" /></div>
  }

  if (!session?.user) redirect('/auth/login?callbackUrl=/dashboard')

  const userRole = (session.user as any).role

  // CEO/ADMIN act as every role — full CRM dashboard without switching accounts.
  const isSuperRole = userRole === 'CEO' || userRole === 'ADMIN'
  const filteredLinks = sidebarLinks.filter(
    (link) =>
      (isSuperRole || !link.roles || link.roles.includes(userRole)) &&
      (isSuperRole || !link.hideFor || !link.hideFor.includes(userRole))
  )

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      <aside className="hidden w-64 border-r border-estate-gold/10 bg-muted/30 dark:border-[#262626] dark:bg-[#0A0A0A] lg:block">
        <div className="sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto p-4">
          <div className="mb-6">
            <p className="section-kicker">{t('dash.welcomeBack')}</p>
            <p className="font-display mt-2 text-lg">{session.user.name}</p>
            <span className="mt-1 inline-block rounded-full bg-estate-gold/10 px-2 py-0.5 text-xs font-medium text-estate-gold capitalize">
              {userRole?.toLowerCase()}
            </span>
          </div>

          <nav className="space-y-1">
            {filteredLinks.map((link) => {
              const isActive = pathname === link.href
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-3 rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-estate-gold/10 text-estate-gold shadow-[inset_0_0_0_1px_var(--tw-shadow-color)] shadow-estate-gold/20'
                      : 'text-muted-foreground hover:bg-estate-gold/5 hover:text-estate-gold'
                  }`}
                >
                  <link.icon className="h-4 w-4" />
                  {t(link.labelKey)}
                </Link>
              )
            })}
          </nav>
        </div>
      </aside>

      <div className="flex-1">
        <div className="border-b border-estate-gold/10 bg-muted/30 px-6 py-3 dark:border-[#262626] dark:bg-[#0A0A0A]">
          <div className="flex items-center justify-between">
            <div className="relative max-w-md flex-1">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                placeholder={t('dash.searchPlaceholder')}
                className="h-10 w-full rounded-xl border bg-background ps-10 pe-4 text-sm focus:outline-none focus:ring-2 focus:ring-estate-gold"
              />
            </div>
            <div className="flex items-center gap-3">
              <NotificationBell linkHref="/dashboard/leads" />
            </div>
          </div>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}
