import type { Metadata } from 'next'
import { SITE_NAME, SITE_URL, languageAlternates } from '@/lib/site'

/**
 * Shared SEO helpers — Arabic-first metadata + JSON-LD for public pages.
 *
 * RULE: real values only. Every builder omits null/missing fields and never
 * invents copy. When a project has no Arabic name, English is used as-is
 * (no machine translation); when it has no price, price segments are dropped.
 */

export interface SeoProjectLike {
  slug: string
  name: string
  nameArabic?: string | null
  description?: string | null
  descriptionArabic?: string | null
  metaTitle?: string | null
  metaDescription?: string | null
  startPrice?: number | null
  endPrice?: number | null
  totalArea?: number | null
  compoundArea?: number | null
  coverImage?: string | null
  deliveryDate?: Date | string | null
  developer?: { companyName: string; companyNameArabic?: string | null } | null
  city?: { name: string; nameArabic?: string | null } | null
  governorate?: { name: string; nameArabic?: string | null } | null
  updatedAt?: Date | string | null
}

export interface AreaRange {
  minArea: number | null
  maxArea: number | null
}

/** Make any stored image path absolute for OG/JSON-LD consumers. */
export function absoluteImage(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null
  const trimmed = url.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `${SITE_URL}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`
}

function trimNum(n: number): string {
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? String(r) : String(r)
}

/** Compact price: `8.5 مليون جنيه` / `EGP 8.5M`. Empty string when unknown. */
export function formatPriceShort(value: number | null | undefined, locale: 'ar' | 'en'): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return ''
  if (value >= 1_000_000) {
    const s = trimNum(value / 1_000_000)
    return locale === 'ar' ? `${s} مليون جنيه` : `EGP ${s}M`
  }
  if (value >= 1_000) {
    const s = trimNum(value / 1_000)
    return locale === 'ar' ? `${s} ألف جنيه` : `EGP ${s}K`
  }
  return locale === 'ar'
    ? `${Math.round(value)} جنيه`
    : `EGP ${Math.round(value).toLocaleString('en-US')}`
}

/** `120–250 م²` / `120–250 sqm`. Empty string when unknown. */
export function formatAreaRange(range: AreaRange | null | undefined, locale: 'ar' | 'en'): string {
  if (!range) return ''
  const { minArea, maxArea } = range
  if (typeof minArea === 'number' && minArea > 0 && typeof maxArea === 'number' && maxArea > 0) {
    if (minArea === maxArea) return locale === 'ar' ? `${minArea} م²` : `${minArea} sqm`
    return locale === 'ar' ? `${minArea}–${maxArea} م²` : `${minArea}–${maxArea} sqm`
  }
  if (typeof minArea === 'number' && minArea > 0)
    return locale === 'ar' ? `من ${minArea} م²` : `from ${minArea} sqm`
  if (typeof maxArea === 'number' && maxArea > 0)
    return locale === 'ar' ? `حتى ${maxArea} م²` : `up to ${maxArea} sqm`
  return ''
}

function pickName(p: SeoProjectLike): { ar: string | null; en: string } {
  const ar = typeof p.nameArabic === 'string' && p.nameArabic.trim() ? p.nameArabic.trim() : null
  return { ar, en: p.name }
}

function pickCity(p: SeoProjectLike): { ar: string | null; en: string | null } {
  if (!p.city) return { ar: null, en: null }
  const ar =
    typeof p.city.nameArabic === 'string' && p.city.nameArabic.trim() ? p.city.nameArabic.trim() : null
  return { ar, en: p.city.name || null }
}

function pickDeveloper(p: SeoProjectLike): { ar: string | null; en: string | null } {
  if (!p.developer) return { ar: null, en: null }
  const ar =
    typeof p.developer.companyNameArabic === 'string' && p.developer.companyNameArabic.trim()
      ? p.developer.companyNameArabic.trim()
      : null
  return { ar, en: p.developer.companyName || null }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return `${s.slice(0, max - 1).trimEnd()}…`
}

/**
 * Project detail title — owner `metaTitle` wins; otherwise Arabic-first with
 * real price/city/developer segments (missing pieces are dropped, never faked).
 */
export function projectTitle(p: SeoProjectLike): string {
  if (p.metaTitle && p.metaTitle.trim()) return p.metaTitle.trim()
  const { ar, en } = pickName(p)
  const name = ar ?? en
  const city = pickCity(p)
  const dev = pickDeveloper(p)
  const price = formatPriceShort(p.startPrice, ar ? 'ar' : 'en')
  const cityName = (ar ? city.ar ?? city.en : city.en ?? city.ar) ?? null
  const devName = (ar ? dev.ar ?? dev.en : dev.en ?? dev.ar) ?? null
  const parts = [name]
  if (cityName) parts.push(ar ? `في ${cityName}` : `in ${cityName}`)
  if (price) parts.push(ar ? `يبدأ من ${price}` : `from ${price}`)
  if (devName) parts.push(devName)
  return truncate(parts.join(' | '), 140)
}

/**
 * Project detail description — owner `metaDescription` wins; otherwise
 * Arabic-first with real price/area/city/developer facts.
 */
export function projectDescription(p: SeoProjectLike, area?: AreaRange | null): string {
  if (p.metaDescription && p.metaDescription.trim()) return p.metaDescription.trim()
  const { ar, en } = pickName(p)
  const name = ar ?? en
  const city = pickCity(p)
  const dev = pickDeveloper(p)
  const cityName = (ar ? city.ar ?? city.en : city.en ?? city.ar) ?? null
  const devName = (ar ? dev.ar ?? dev.en : dev.en ?? dev.ar) ?? null
  const price = formatPriceShort(p.startPrice, ar ? 'ar' : 'en')
  const areaStr = formatAreaRange(area, ar ? 'ar' : 'en')
  if (ar) {
    const bits: string[] = [`تفاصيل ${name}`]
    if (cityName) bits.push(`في ${cityName}`)
    if (devName) bits.push(`من ${devName}`)
    const facts: string[] = []
    if (price) facts.push(`الأسعار تبدأ من ${price}`)
    if (areaStr) facts.push(`المساحات ${areaStr}`)
    if (facts.length > 0) bits.push(`${facts.join('، ')}.`)
    bits.push('اعرف خطط السداد ومواعيد الاستلام على غاية العقارية.')
    return truncate(bits.join(' ').replace(/\s+/g, ' '), 320)
  }
  const bits: string[] = [`${name}`]
  if (cityName) bits.push(`in ${cityName}`)
  if (devName) bits.push(`by ${devName}`)
  const facts: string[] = []
  if (price) facts.push(`prices from ${price}`)
  if (areaStr) facts.push(`areas ${areaStr}`)
  if (facts.length > 0) bits.push(`— ${facts.join(', ')}.`)
  bits.push('Payment plans and delivery details on GHAYA Real Estate.')
  return truncate(bits.join(' ').replace(/\s+/g, ' '), 320)
}

/** Per-project OG image: real cover when present, else a dynamic branded card. */
export function projectOgImage(p: SeoProjectLike): { url: string; width: number; height: number; alt: string } {
  const cover = absoluteImage(p.coverImage)
  if (cover) return { url: cover, width: 1200, height: 630, alt: p.nameArabic || p.name }
  const { ar, en } = pickName(p)
  const price = formatPriceShort(p.startPrice, 'en')
  const params = new URLSearchParams({
    t: en.slice(0, 90),
    s: (price || 'Projects and compounds in Egypt').slice(0, 120),
  })
  return { url: `${SITE_URL}/og?${params.toString()}`, width: 1200, height: 630, alt: SITE_NAME }
}

/** Full per-project metadata: canonical + hreflang (lang=? mechanism) + OG. */
export function projectMetadata(p: SeoProjectLike, area?: AreaRange | null): Metadata {
  const title = projectTitle(p)
  const description = projectDescription(p, area)
  const url = `${SITE_URL}/projects/${p.slug}`
  const img = projectOgImage(p)
  return {
    title,
    description,
    alternates: languageAlternates(`/projects/${p.slug}`),
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale: 'ar_EG',
      alternateLocale: ['en_US'],
      images: [{ url: img.url, width: img.width, height: img.height, alt: img.alt }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [img.url],
    },
  }
}

/**
 * Structured data for a project detail page.
 *
 * Decision: `RealEstateListing` as the primary entity (a project/compound is
 * a multi-unit development, not a single sellable item — marking it as a
 * schema.org `Product` would misrepresent it and risks Google ignoring the
 * rich result). The listing embeds an `Offer` with the real EGP starting
 * price when one exists, plus address + broker organization. Null fields are
 * omitted, never fabricated.
 */
export function projectJsonLd(p: SeoProjectLike, area?: AreaRange | null): Record<string, unknown> {
  const { ar, en } = pickName(p)
  const city = pickCity(p)
  const gov = p.governorate
    ? {
        ar:
          typeof p.governorate.nameArabic === 'string' && p.governorate.nameArabic.trim()
            ? p.governorate.nameArabic.trim()
            : null,
        en: p.governorate.name || null,
      }
    : { ar: null, en: null }
  const dev = pickDeveloper(p)
  const description = projectDescription(p, area)
  const image = absoluteImage(p.coverImage)
  const url = `${SITE_URL}/projects/${p.slug}`

  const address: Record<string, unknown> = { '@type': 'PostalAddress', addressCountry: 'EG' }
  const locality = city.ar ?? city.en
  if (locality) address.addressLocality = locality
  const region = gov.ar ?? gov.en
  if (region) address.addressRegion = region

  const listing: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: ar ?? en,
    description,
    url,
    address,
    broker: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
    },
  }
  if (ar && en && ar !== en) listing.alternateName = en
  if (image) listing.image = image
  if (dev.en ?? dev.ar) {
    const seller: Record<string, unknown> = {
      '@type': 'Organization',
      name: (dev.ar ?? dev.en) as string,
    }
    listing.seller = seller
  }
  if (typeof p.startPrice === 'number' && p.startPrice > 0) {
    const offer: Record<string, unknown> = {
      '@type': 'Offer',
      priceCurrency: 'EGP',
      price: p.startPrice,
      availability: 'https://schema.org/InStock',
      url,
    }
    listing.offers = offer
  }
  if (p.deliveryDate) {
    const d = p.deliveryDate instanceof Date ? p.deliveryDate.toISOString() : String(p.deliveryDate)
    if (d) listing.availabilityStarts = d
  }
  return listing
}

/** Homepage `Organization` + `WebSite` (+`SearchAction`) graph. */
export function organizationJsonLd(): Record<string, unknown> {
  const logo = `${SITE_URL}/images/ghaya-logo.png`
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: SITE_NAME,
        alternateName: 'غاية العقارية',
        url: SITE_URL,
        logo: { '@type': 'ImageObject', url: logo, width: 512, height: 512 },
        sameAs: [] as string[],
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        name: SITE_NAME,
        alternateName: 'غاية العقارية',
        url: SITE_URL,
        inLanguage: ['ar-EG', 'en'],
        publisher: { '@id': `${SITE_URL}/#organization` },
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${SITE_URL}/projects?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  }
}
