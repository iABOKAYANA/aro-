/**
 * Canonical site URL — used by sitemap/robots/OG/canonical tags so every
 * absolute link agrees on one origin.
 *
 * Override with NEXT_PUBLIC_SITE_URL when deploying to a staging domain.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://ghayaestate.com'
).replace(/\/$/, '')

export const SITE_NAME = 'GHAYA REAL ESTATE'

export const LOCALES = ['en', 'ar'] as const
export type Locale = (typeof LOCALES)[number]

/**
 * Canonical URL for a public path. Language currently switches client-side;
 * `?lang=` does not produce a distinct server-rendered translation, so do not
 * emit misleading hreflang alternates until localized SSR routes exist.
 */
export function languageAlternates(path: string): { canonical: string } {
  const normalized = path.startsWith('/') ? path : `/${path}`
  const url = normalized === '/' ? `${SITE_URL}/` : `${SITE_URL}${normalized}`

  return { canonical: url }
}
