import type { Metadata } from 'next'
import Script from 'next/script'
import { headers } from 'next/headers'
import { amiri, inter, plexSansArabic } from './fonts'
import { SITE_NAME, SITE_URL } from '@/lib/site'
import { getAppMode, getAppType, type AppMode, type AppType } from '@/lib/app-type'
// Rendered on the server so crawlers and social scrapers actually see page
// content. Every provider inside only touches localStorage/window inside
// effects, so hydration stays stable.
import { Providers } from '@/components/providers/providers'
import { getFeatureFlags } from '@/lib/feature-flags'
import { notFound } from 'next/navigation'
// Fonts live in ./fonts (next/font/google, arabic+latin subsets verified).
// `inter` stays first in `font-sans` so Latin rendering is unchanged;
// Arabic glyphs fall through to Plex Sans Arabic via unicode-range.
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  icons: { icon: '/images/ghaya-logo.svg', apple: '/images/ghaya-logo.png' },
  applicationName: SITE_NAME,
  title: {
    default: 'GHAYA REAL ESTATE | Smart Real Estate Solutions',
    template: '%s | GHAYA REAL ESTATE',
  },
  description: 'Egypt\'s leading AI-powered real estate platform. Find properties, compounds, and projects with smart search and AI recommendations.',
  keywords: ['real estate', 'Egypt', 'properties', 'compounds', 'Cairo', 'AI', 'smart search'],
  alternates: {
    canonical: `${SITE_URL}/`,
    languages: {
      en: `${SITE_URL}/?lang=en`,
      ar: `${SITE_URL}/?lang=ar`,
      'x-default': `${SITE_URL}/`,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    alternateLocale: ['ar_EG'],
    url: `${SITE_URL}/`,
    siteName: SITE_NAME,
    title: 'GHAYA REAL ESTATE | Smart Real Estate Solutions',
    description:
      "Egypt's leading AI-powered real estate platform. Find properties, compounds and projects with smart search and AI recommendations.",
    images: [
      { url: `${SITE_URL}/og`, width: 1200, height: 630, alt: SITE_NAME },
      { url: `${SITE_URL}/images/ghaya-logo.png`, width: 512, height: 512, alt: SITE_NAME },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GHAYA REAL ESTATE | Smart Real Estate Solutions',
    description:
      "Egypt's leading AI-powered real estate platform. Find properties, compounds and projects with smart search and AI recommendations.",
    images: [`${SITE_URL}/og`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  category: 'real estate',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // SSR-safe chrome split: middleware stamps `x-app-type`/`x-app-mode` on
  // every request it runs on, but its matcher does not cover public pages
  // (e.g. `/`), so fall back to deriving the same values from the `Host`
  // header / `APP_MODE` env. Either way the values are fixed server-side and
  // passed down as props — no flash, no hydration mismatch. Unknown values
  // fail open to 'all' (today's chrome).
  const requestHeaders = headers()
  const stamped = requestHeaders.get('x-app-type')
  const appType: AppType =
    stamped === 'public' || stamped === 'console' || stamped === 'all'
      ? stamped
      : getAppType(requestHeaders.get('host'))
  // Deployment mode, exposed alongside the app type (same stamp-or-derive
  // pattern; any server component can also read `x-app-mode` directly).
  const stampedMode = requestHeaders.get('x-app-mode')
  const appMode: AppMode =
    stampedMode === 'public' || stampedMode === 'console' || stampedMode === 'all'
      ? stampedMode
      : getAppMode()
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || 'G-XCMI4XQEB1'
  // Feature switches: pages whose feature the CEO turned OFF are killed HERE,
  // before any HTML streams — so they answer with a genuine 404, not
  // a 200 wrapped around a not-found UI. The page-level checks stay as a
  // second net (they still get the flag fresh per request).
  const flags = await getFeatureFlags()
  const pathname = requestHeaders.get('x-pathname') || ''
  if (pathname === '/prices' && !flags.price_explorer) notFound()
  if (pathname === '/guides/buying-offplan' && !flags.buying_guide) notFound()
  if (pathname.startsWith('/track/') && !flags.inquiry_tracking) notFound()
  return (
    <html lang="en" dir="ltr" className={`${inter.variable} ${amiri.variable} ${plexSansArabic.variable}`} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased" data-app-mode={appMode} data-app-type={appType}>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaId}');`}
        </Script>
        <Providers appType={appType} initialFlags={await getFeatureFlags()}>
          {children}
        </Providers>
      </body>
    </html>
  )
}
