'use client'

import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { Menu, X, Globe, User, LogOut, LayoutDashboard, Heart, Sun, Moon, Monitor, BellRing } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import { BrandLogo } from '@/components/layout/brand-logo'
import CurrencySwitcher from '@/components/currency/currency-switcher'
import NotificationBell from '@/components/notification-bell'
import type { AppType } from '@/lib/app-type'

export function Navbar({ appType = 'all' }: { appType?: AppType }) {
  const { data: session, status } = useSession()
  const { lang, setLang, t } = useLanguage()
  const { theme, setTheme } = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  // next-themes resolves `theme` from localStorage only on the client (it is
  // `undefined` during SSR), so the icon must not branch on it until after
  // mount — otherwise server and client render different SVGs on first paint.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const user = session?.user as any
  const isRtl = lang === 'ar'
  // Chrome split: on the PUBLIC host every staff entry is hidden (the public
  // host also 307s /ceo /broker /developer /dashboard/* to the console host,
  // so these links would be dead there anyway). 'console' and 'all' (dev)
  // keep the full chrome — staff need project pages for preview.
  const showStaff = appType !== 'public'
  // Zero-login public site: no sign-in button, no avatar/user menu, no
  // account links, no bell, no saved/favorites entries. Logged-in sessions
  // effectively can't exist there, so no user-menu ever renders on public.
  const showAuth = appType !== 'public'

  const allNavLinks = isRtl
    ? [
        { href: '/projects', label: 'المشاريع' },
        { href: '/offers', label: 'العروض' },
        { href: '/saved', label: 'المحفوظات' },
        { href: '/ai-tools', label: 'اكتشف' },
        { href: '/about', label: 'من نحن' },
        { href: '/ai-tools/chat', label: 'مساعدك العقاري' },
      ]
    : [
        { href: '/projects', label: 'Projects' },
        { href: '/offers', label: 'Offers' },
        { href: '/saved', label: 'Saved' },
        { href: '/ai-tools', label: 'Discover' },
        { href: '/about', label: 'About' },
        { href: '/ai-tools/chat', label: 'Your Assistant' },
      ]
  // Public host: the saved/favorites entry is an account surface — hidden
  // with the rest of the auth chrome (`/saved` itself stays anonymous-first).
  const navLinks = showAuth ? allNavLinks : allNavLinks.filter((l) => l.href !== '/saved')

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:border-[#262626] dark:bg-black/95 dark:supports-[backdrop-filter]:bg-black/60">
      <div className="container flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <BrandLogo hideWordmarkOnMobile />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href + link.label}
              href={link.href}
              className="text-sm font-medium text-gray-600 underline-offset-4 transition-colors hover:text-estate-gold hover:underline hover:decoration-estate-gold/60 dark:text-gray-300 dark:hover:text-[#E8C56D]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
            className="flex items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 sm:px-3 dark:border-[#262626] dark:text-gray-300 dark:hover:bg-[#0A0A0A]"
          >
            <Globe className="h-3.5 w-3.5" />
            <span>{lang === 'en' ? 'العربية' : 'EN'}</span>
          </button>

          <CurrencySwitcher />

          {showStaff && session && <NotificationBell linkHref="/dashboard" />}

          <div className="relative hidden sm:block">
            <button
              onClick={() => setThemeMenuOpen(!themeMenuOpen)}
              className="flex items-center justify-center rounded-full border border-gray-200 p-2 text-gray-500 transition-colors hover:bg-gray-50 dark:border-[#262626] dark:text-gray-400 dark:hover:bg-[#0A0A0A]"
            >
              {!mounted || theme === undefined ? <Monitor className="h-4 w-4" /> : theme === 'dark' ? <Moon className="h-4 w-4" /> : theme === 'light' ? <Sun className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
            </button>
            {themeMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setThemeMenuOpen(false)} />
                <div className={`absolute top-full z-50 mt-2 w-36 overflow-hidden rounded-2xl border border-estate-gold/25 bg-white shadow-xl shadow-estate-gold/5 dark:border-[#D4A843]/25 dark:bg-[#0A0A0A] ${isRtl ? 'left-0' : 'right-0'}`}>
                  <button
                    onClick={() => { setTheme('light'); setThemeMenuOpen(false) }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-[#1a1a1a] ${theme === 'light' ? 'text-estate-gold font-medium' : 'text-gray-700 dark:text-gray-300'}`}
                  >
                    <Sun className="h-4 w-4" /> {lang === 'ar' ? 'فاتح' : 'Light'}
                  </button>
                  <button
                    onClick={() => { setTheme('dark'); setThemeMenuOpen(false) }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-[#1a1a1a] ${theme === 'dark' ? 'text-estate-gold font-medium' : 'text-gray-700 dark:text-gray-300'}`}
                  >
                    <Moon className="h-4 w-4" /> {lang === 'ar' ? 'غامق' : 'Dark'}
                  </button>
                  <button
                    onClick={() => { setTheme('system'); setThemeMenuOpen(false) }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-[#1a1a1a] ${theme === 'system' ? 'text-estate-gold font-medium' : 'text-gray-700 dark:text-gray-300'}`}
                  >
                    <Monitor className="h-4 w-4" /> {lang === 'ar' ? 'النظام' : 'System'}
                  </button>
                </div>
              </>
            )}
          </div>

          {showAuth && (status === 'loading' ? (
            <div className="h-9 w-9 animate-pulse rounded-full bg-gray-200 dark:bg-[#0A0A0A]" />
          ) : session ? (
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors hover:bg-gray-50 dark:hover:bg-[#0A0A0A]"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-estate-gold text-xs font-bold text-[#0F1A2C] ring-2 ring-estate-gold/40">
                  {user?.name ? getInitials(user.name) : '?'}
                </div>
              </button>

              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                  <div className={`absolute top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-estate-gold/25 bg-white shadow-xl shadow-estate-gold/5 dark:border-[#D4A843]/25 dark:bg-[#0A0A0A] ${isRtl ? 'left-0' : 'right-0'}`}>
                    <div className="border-b border-gray-100 px-4 py-3 dark:border-[#262626]">
                      <p className="font-display text-sm font-medium">{user?.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{user?.email}</p>
                      <p className="mt-0.5 text-xs font-medium capitalize text-estate-gold">{user?.role?.toLowerCase()}</p>
                    </div>
                    <div className="py-1">
                      {showStaff && (
                        <>
                      {(user?.role === 'CEO' || user?.role === 'ADMIN') && (
                        <Link
                          href="/ceo"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-estate-gold hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"
                        >
                          <LayoutDashboard className="h-4 w-4" />
                          {t('nav.ceoDashboard')}
                        </Link>
                      )}
                      {user?.role === 'BROKER' && (
                        <Link
                          href="/broker"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-estate-gold hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"
                        >
                          <LayoutDashboard className="h-4 w-4" />
                          {t('nav.brokerPortal')}
                        </Link>
                      )}
                      {user?.role === 'DEVELOPER' && (
                        <Link
                          href="/developer"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-estate-gold hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"
                        >
                          <LayoutDashboard className="h-4 w-4" />
                          {t('nav.developerPortal')}
                        </Link>
                      )}
                      <Link
                        href="/dashboard"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"
                      >
                        <LayoutDashboard className="h-4 w-4" />
                        {t('nav.dashboard')}
                      </Link>
                      <Link
                        href="/dashboard/favorites"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"
                      >
                        <Heart className="h-4 w-4" />
                        {t('nav.favorites')}
                      </Link>
                        </>
                      )}
                      <Link
                        href="/saved-searches"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"
                      >
                        <BellRing className="h-4 w-4" />
                        {t('nav.savedSearches')}
                      </Link>
                    </div>
                    <div className="border-t border-gray-100 py-1 dark:border-[#262626]">
                      <button
                        onClick={() => {
                          setUserMenuOpen(false)
                          signOut({ callbackUrl: '/' })
                        }}
                        className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                      >
                        <LogOut className="h-4 w-4" />
                        {t('nav.signOut')}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <Link
              href="/auth/login"
              className="gold-shimmer flex items-center gap-2 rounded-full bg-estate-gold px-4 py-2 text-sm font-medium text-[#0F1A2C] transition-colors hover:bg-estate-gold-dark"
            >
              <User className="h-4 w-4" />
              {isRtl ? 'تسجيل الدخول' : 'Sign In'}
            </Link>
          ))}

          <button
            className="flex items-center justify-center rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-[#1a1a1a] md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="max-h-[calc(100vh-4rem)] max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-gray-200 bg-white px-4 py-4 dark:border-[#262626] dark:bg-black md:hidden">
          <nav className="flex flex-col gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href + link.label}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                {link.label}
              </Link>
            ))}
            {showAuth && (session ? (
              <>
                {showStaff && (
                <Link href="/dashboard" onClick={() => setMobileOpen(false)} className="py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('nav.dashboard')}
                </Link>
                )}
                <button
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className="py-2.5 text-start text-sm font-medium text-red-500"
                >
                  {t('nav.signOut')}
                </button>
              </>
            ) : (
              <Link
                href="/auth/login"
                onClick={() => setMobileOpen(false)}
                className="gold-shimmer mt-1 flex items-center justify-center gap-2 rounded-full bg-estate-gold px-4 py-2.5 text-sm font-medium text-[#0F1A2C]"
              >
                {isRtl ? 'تسجيل الدخول' : 'Sign In'}
              </Link>
            ))}
            <div className="flex items-center gap-2 border-t border-gray-100 pt-3 dark:border-[#262626] sm:hidden">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {lang === 'ar' ? 'المظهر' : 'Theme'}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setTheme('light')}
                  aria-label="Light theme"
                  className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${theme === 'light' ? 'bg-estate-gold/15 text-estate-gold' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-[#0A0A0A]'}`}
                >
                  <Sun className="h-3.5 w-3.5" /> {lang === 'ar' ? 'فاتح' : 'Light'}
                </button>
                <button
                  onClick={() => setTheme('dark')}
                  aria-label="Dark theme"
                  className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${theme === 'dark' ? 'bg-estate-gold/15 text-estate-gold' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-[#0A0A0A]'}`}
                >
                  <Moon className="h-3.5 w-3.5" /> {lang === 'ar' ? 'غامق' : 'Dark'}
                </button>
                <button
                  onClick={() => setTheme('system')}
                  aria-label="System theme"
                  className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${theme === 'system' ? 'bg-estate-gold/15 text-estate-gold' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-[#0A0A0A]'}`}
                >
                  <Monitor className="h-3.5 w-3.5" /> {lang === 'ar' ? 'النظام' : 'System'}
                </button>
              </div>
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
