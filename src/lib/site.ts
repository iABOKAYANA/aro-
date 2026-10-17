/**
 * Canonical site URL — used by sitemap/robots/OG/canonical tags so every
 * absolute link agrees on one origin.
 *
 * Override with NEXT_PUBLIC_SITE_URL when deploying to a staging domain.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://estateai.eg'
).replace(/\/$/, '')

export const SITE_NAME = 'GHAYA REAL ESTATE'

export const LOCALES = ['en', 'ar'] as const
export type Locale = (typeof LOCALES)[number]

/**
 * hreflang alternates for a given path.
 *
 * The site switches language client-side (`src/lib/language-context.tsx`), so
 * both language variants are the same route with a `?lang=` query — search
 * engines still get an explicit pairing and a clean `x-default`.
 */
export function languageAlternates(path: string): {
  canonical: string
  languages: Record<string, string>
} {
  const normalized = path.startsWith('/') ? path : `/${path}`
  const url = normalized === '/' ? `${SITE_URL}/` : `${SITE_URL}${normalized}`

  return {
    canonical: url,
    languages: {
      en: `${url}?lang=en`,
      ar: `${url}?lang=ar`,
      'x-default': url,
    },
  }
}
