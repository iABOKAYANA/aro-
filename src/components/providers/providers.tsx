'use client'

import { ThemeProvider } from 'next-themes'
import { LanguageProvider } from '@/lib/language-context'
import { SessionProvider } from '@/components/providers/session-provider'
import { CurrencyProvider } from '@/components/currency/currency-provider'
import { CompareProvider } from '@/lib/compare'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { PageWidgets } from '@/components/layout/page-widgets'
import { WhatsAppBubble } from '@/components/layout/whatsapp-bubble'
import type { ReactNode } from 'react'
import type { AppType } from '@/lib/app-type'

export function Providers({ children, appType = 'all' }: { children: ReactNode; appType?: AppType }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange={false}
      storageKey="estateai-theme"
    >
      <LanguageProvider>
        <CurrencyProvider>
          <CompareProvider>
            <SessionProvider>
              <Navbar appType={appType} />
              <main className="flex-1">{children}</main>
              <Footer appType={appType} />
              <PageWidgets />
              <WhatsAppBubble />
            </SessionProvider>
          </CompareProvider>
        </CurrencyProvider>
      </LanguageProvider>
    </ThemeProvider>
  )
}
