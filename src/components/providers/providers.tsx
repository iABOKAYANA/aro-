'use client'

import { ThemeProvider } from 'next-themes'
import { LanguageProvider } from '@/lib/language-context'
import { SessionProvider } from '@/components/providers/session-provider'
import { CurrencyProvider } from '@/components/currency/currency-provider'
import { CompareProvider } from '@/lib/compare'
import { FlagsProvider } from '@/components/flags/flags-provider'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { PageWidgets } from '@/components/layout/page-widgets'
import { WhatsAppBubble } from '@/components/layout/whatsapp-bubble'
import { VisitSourceTracker } from '@/components/analytics/visit-source-tracker'
import { InstallPwaBanner } from '@/components/pwa/install-pwa-banner'
import { useFeatureFlag } from '@/components/flags/flags-provider'
import { useLanguage } from '@/lib/language-context'
import type { ReactNode } from 'react'
import type { AppType } from '@/lib/app-type'

function PwaBannerGate() {
  const on = useFeatureFlag('pwa_install')
  if (!on) return null
  return <InstallPwaBanner />
}

function SkipToMain() {
  const { lang } = useLanguage()
  return (
    <a className="skip-link" href="#main-content">
      {lang === 'ar' ? 'تخطّي إلى المحتوى الرئيسي' : 'Skip to main content'}
    </a>
  )
}
export function Providers({
  children,
  appType = 'all',
  initialFlags,
  initialLanguage = 'en',
}: {
  children: ReactNode
  appType?: AppType
  initialFlags?: Record<string, boolean>
  initialLanguage?: 'en' | 'ar'
}) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange={false}
      storageKey="estateai-theme"
    >
      <LanguageProvider initialLanguage={initialLanguage}>
        <SkipToMain />
        <FlagsProvider initial={initialFlags}>
          <CurrencyProvider>
          <CompareProvider>
            <SessionProvider>
              <VisitSourceTracker />
              <Navbar appType={appType} />
              <main id="main-content" tabIndex={-1} className="flex-1">{children}</main>
              <Footer appType={appType} />
              <PageWidgets />
              <WhatsAppBubble />
              <PwaBannerGate />
            </SessionProvider>
          </CompareProvider>
          </CurrencyProvider>
        </FlagsProvider>
      </LanguageProvider>
    </ThemeProvider>
  )
}
