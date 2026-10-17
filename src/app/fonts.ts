import { Amiri, IBM_Plex_Sans_Arabic, Inter } from 'next/font/google'

// Existing Latin workhorse — kept first in `font-sans` so English
// rendering is pixel-identical until pages opt into new tokens.
export const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

// DISTINCTIVE Arabic display face for H1 / hero headlines.
// Picked Amiri over Aref Ruqaa: classical Naskh with high-contrast strokes
// reads as luxury, stays legible at huge editorial sizes, and ships real
// arabic+latin subsets (400/700 + italics) so EN headlines get the same
// editorial serif character. Aref Ruqaa was rejected: gorgeous Ruqaa
// calligraphy, but weak below large sizes and a minimal Latin set that
// would cause fallback flicker on English pages.
// Verified: subsets ['arabic','latin','latin-ext'], weights ['400','700'].
// `style: 'normal'` only — Amiri ITALIC was loaded (2 styles x 3 subsets =
// 6 files, ~269KB, ~248KB of it preloaded on every page) but is never
// rendered: `grep italic src` finds exactly 2 hits (ceo/press + ceo/blog
// excerpt <p>s) and both sit in `font-sans` (Inter/Plex, which have no
// italic face at all → synthetic oblique, unchanged), 0 hits co-occur with
// `font-display`, no `font-style: italic` in globals.css, and there are no
// `<em>`/`<i>` tags in the codebase. `.display-*`/`.cine-title` are 400/700
// normal only.
export const amiri = Amiri({
  subsets: ['arabic', 'latin'],
  weight: ['400', '700'],
  style: 'normal',
  variable: '--font-display',
  display: 'swap',
})

// Clean Arabic body face. Picked IBM Plex Sans Arabic over Tajawal: full
// 100–700 weight range, Latin/Arabic designed as one system (true parity),
// neutral geometric body that pairs with high-contrast Amiri display.
// We load 400/500/600/700 only to bound payload.
// Verified: subsets ['arabic','cyrillic-ext','latin','latin-ext'].
export const plexSansArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans-ar',
  display: 'swap',
})

// Usage: <html className={`${inter.variable} ${amiri.variable} ${plexSansArabic.variable}`}>
// Display headlines: className="font-display display-1"
// Arabic body inherits automatically via the `font-sans` tailwind family.
