import { z } from 'zod'
import { randomBytes } from 'crypto'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { localizeMany, localizeUrl } from '@/lib/localize-media'
import { stripNawyPromo } from '@/lib/promo-strip'
import { collapseJammedDuplicates } from '@/lib/text-repair'

// ────────────────────────────────────────────────────────────────
// Bulk project import from nawy.com (Egyptian real-estate catalog).
// Source: public sitemap (robots.txt allows crawling) + each page's
// embedded `__NEXT_DATA__` payload, which carries the fully
// structured compound record. Facts (name / developer / area /
// prices / payment plans) are imported; images & brochure URLs are
// hot-linked to their original host (source recorded in keywords).
// ────────────────────────────────────────────────────────────────

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

export interface NawyCatalogItem {
  id: number
  enUrl: string
  arUrl: string | null
}

// ─── zod: loose shape of the embedded compound record ───────────
const nawyPaymentPlanZ = z
  .object({
    installmentPercentage: z.number().nullish(),
    downPaymentPercentage: z.number().nullish(),
    years: z.number().nullish(),
    isBackLoaded: z.boolean().nullish(),
    discount: z.number().nullish(),
  })
  .passthrough()

export const nawyCompoundZ = z
  .object({
    id: z.number(),
    name: z.string(),
    displayName: z.string().nullish(),
    slug: z.string(),
    slugAr: z.string().nullish(),
    description: z.string().nullish(),
    metaTitle: z.string().nullish(),
    metaDescription: z.string().nullish(),
    coverImageUrl: z.string().nullish(),
    images: z.array(z.string()).nullish(),
    masterPlan: z.string().nullish(),
    brochureUrl: z.string().nullish(),
    video: z.any().nullish(),
    lat: z.number().nullish(),
    long: z.number().nullish(),
    areaName: z.string().nullish(),
    parentAreaName: z.string().nullish(),
    areaSlug: z.string().nullish(),
    developerName: z.string().nullish(),
    developerLogoUrl: z.string().nullish(),
    prices: z.any().nullish(),
    paymentPlans: z.array(nawyPaymentPlanZ).nullish(),
    amenities: z.array(z.any()).nullish(),
    propertiesCount: z.number().nullish(),
    isLaunch: z.boolean().nullish(),
    allowIndexing: z.boolean().nullish(),
  })
  .passthrough()

export type NawyCompound = z.infer<typeof nawyCompoundZ>

// ─── type evidence: pageProps.availablePropertyTypes + prices/plans ──
// Nawy display names → our search enum (src/lib/validations.ts). Only
// confident mappings; anything else is dropped rather than guessed.
// Twinhouse → TOWNHOUSE (semi-detached attached unit; TWIN_HOUSE exists
// nowhere in the search enum / web / mobile filters) and Family House →
// VILLA (standalone house). Chalet → CHALET (Egyptian coastal holiday unit,
// e.g. Sahel / Sokhna / Gouna) and Cabin → CHALET (a cabin is a small
// holiday unit, same use as a chalet). Loft → APARTMENT (open-plan
// apartment; no LOFT value exists anywhere in the search enum / web /
// mobile filters / stored propertyTypes, verified Oct 2026).
const NAWY_TYPE_MAP: Record<string, string> = {
  apartment: 'APARTMENT',
  villa: 'VILLA',
  townhouse: 'TOWNHOUSE',
  twinhouse: 'TOWNHOUSE', // EG twin house = semi-detached; closest searchable type
  'twin house': 'TOWNHOUSE', // Nawy spacing variant, same as above
  'family house': 'VILLA', // standalone house = villa
  penthouse: 'PENTHOUSE',
  studio: 'STUDIO',
  duplex: 'DUPLEX',
  chalet: 'CHALET', // EG coastal holiday unit
  cabin: 'CHALET', // small holiday unit, same use as a chalet
  loft: 'APARTMENT', // open-plan apartment; no LOFT in search
  medical: 'MEDICAL',
  administrative: 'ADMINISTRATIVE',
  office: 'ADMINISTRATIVE', // EG admin units are offices
  retail: 'COMMERCIAL', // retail is commercial use
}

export interface NawyTypeEvidence {
  propertyTypes: string[]
  listingTypes: string[]
}

// `pageProps` of the compound page (sibling of `compound` in __NEXT_DATA__).
export function extractTypeEvidence(pageProps: unknown): NawyTypeEvidence {
  const pp = (pageProps || {}) as Record<string, unknown>
  const out: NawyTypeEvidence = { propertyTypes: [], listingTypes: [] }
  const apt = pp.availablePropertyTypes
  if (Array.isArray(apt)) {
    for (const t of apt) {
      const rec = (t || {}) as Record<string, unknown>
      const name = typeof rec.name === 'string' ? rec.name.trim().toLowerCase() : ''
      const count = typeof rec.propertiesCount === 'number' ? rec.propertiesCount : 0
      if (!name || count <= 0) continue // no available units of this type
      const mapped = NAWY_TYPE_MAP[name]
      if (mapped && !out.propertyTypes.includes(mapped)) out.propertyTypes.push(mapped)
    }
    out.propertyTypes.sort()
  }
  const compound = (pp.compound || {}) as Record<string, unknown>
  const prices = (compound.prices || {}) as Record<string, unknown>
  const plans = compound.paymentPlans
  if (prices.developerStartingPrice) out.listingTypes.push('SALE')
  if (Array.isArray(plans) && plans.length > 0) out.listingTypes.push('INSTALLMENT')
  if (prices.resaleStartingPrice) out.listingTypes.push('RESALE')
  return out
}

// ─── helpers ────────────────────────────────────────────────────

function stripHtml(html?: string | null): string {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function toNum(v: unknown): number | null {
  if (typeof v === 'number' && isFinite(v)) return v
  if (typeof v === 'string') {
    const digits = v.replace(/[^\d]/g, '')
    if (digits) return Number(digits)
  }
  return null
}

function trunc(s: string | null | undefined, n: number): string | null {
  if (!s) return null
  const t = s.trim()
  return t ? (t.length > n ? t.slice(0, n - 1) + '…' : t) : null
}

// Sentence-aware truncation for long-form text (descriptions/taglines).
// The upstream page text can exceed the column budget, so instead of
// trunc() cutting mid-sentence, cut at the last sentence-ending
// punctuation ([.!?؟]) before the limit — falling back to the last
// space when the slice holds no sentence boundary. "…" is appended
// only when the text was actually longer than the limit.
function truncSentence(s: string | null | undefined, n: number): string | null {
  if (!s) return null
  const t = s.trim()
  if (!t) return null
  if (t.length <= n) return t
  const cut = t.slice(0, n)
  for (let i = cut.length - 1; i > 0; i--) {
    const ch = cut[i]
    if (ch !== '.' && ch !== '!' && ch !== '?' && ch !== '؟') continue
    const nxt = cut[i + 1]
    if (nxt !== undefined && !/\s/.test(nxt)) continue // e.g. "4.5": not a sentence boundary
    return cut.slice(0, i + 1).trimEnd() + '…'
  }
  const sp = cut.lastIndexOf(' ')
  return (sp > 0 ? cut.slice(0, sp) : cut).trimEnd() + '…'
}

function httpsUrl(u?: string | null): string | null {
  if (!u) return null
  const t = u.trim()
  if (!t) return null
  return t.startsWith('http') ? t : 'https://' + t
}

export function slugFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/\/$/, '')
    return decodeURIComponent(path.split('/').pop() || '')
  } catch {
    return ''
  }
}

async function pool<T, R>(arr: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(arr.length)
  let i = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, arr.length)) }, async () => {
    while (i < arr.length) {
      const k = i++
      out[k] = await fn(arr[k])
    }
  })
  await Promise.all(workers)
  return out
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
// looser key: drops leading el/al/the and a trailing " City" so
// "El Sheikh Zayed" ≡ "Sheikh Zayed" and "6th of October City" ≡ "6th of October"
const normArea = (s: string) => norm(s).replace(/^(el|al|the) /, '').replace(/ city$/, '')
const citySlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

// Major Nawy areas that don't exist yet in our City table. Only
// created under governorates (new governorates themselves only when
// GOV_FIXES says so). Keys must equal normArea(areaName).
const CITY_FIXES: Record<string, { govKey: string; name: string; ar: string }> = {
  // under existing governorates
  '6th of october': { govKey: 'giza', name: '6th of October City', ar: 'مدينة 6 أكتوبر' },
  'new capital': { govKey: 'cairo', name: 'New Capital City', ar: 'العاصمة الإدارية الجديدة' },
  'new zayed': { govKey: 'giza', name: 'New Zayed', ar: 'نيو زايد' },
  'shorouk': { govKey: 'cairo', name: 'El Shorouk', ar: 'الشروق' },
  'mostakbal': { govKey: 'cairo', name: 'Mostakbal City', ar: 'مدينة المستقبل' },
  // Cairo districts → link to City "Cairo" (shared name, see resolveCity)
  'new heliopolis': { govKey: 'cairo', name: 'Cairo', ar: 'القاهرة' },
  'central cairo': { govKey: 'cairo', name: 'Cairo', ar: 'القاهرة' },
  'maadi': { govKey: 'cairo', name: 'Cairo', ar: 'القاهرة' },
  'heliopolis': { govKey: 'cairo', name: 'Cairo', ar: 'القاهرة' },
  'mokattam': { govKey: 'cairo', name: 'Cairo', ar: 'القاهرة' },
  'old cairo': { govKey: 'cairo', name: 'Cairo', ar: 'القاهرة' },
  // north-coast / red-sea / suez areas under new governorates
  'ras el hekma': { govKey: 'matrouh', name: 'Ras El Hekma', ar: 'رأس الحكمة' },
  'sidi abdel rahman': { govKey: 'matrouh', name: 'Sidi Abdel Rahman', ar: 'سيدي عبد الرحمن' },
  'alamein': { govKey: 'matrouh', name: 'Al Alamein', ar: 'العلمين' },
  'sidi heneish': { govKey: 'matrouh', name: 'Sidi Heneish', ar: 'سيدي هنيش' },
  'dabaa': { govKey: 'matrouh', name: 'Al Dabaa', ar: 'الضبعة' },
  'el-hamam': { govKey: 'matrouh', name: 'El-Hamam', ar: 'الحمام' },
  'ain sokhna': { govKey: 'suez', name: 'Ain Sokhna', ar: 'عين السخنة' },
  'ras sudr': { govKey: 'suez', name: 'Ras Sudr', ar: 'رأس سدر' },
  'gouna': { govKey: 'red sea', name: 'El Gouna', ar: 'الجونة' },
  'sahl hasheesh': { govKey: 'red sea', name: 'Sahl Hasheesh', ar: 'ساحل هشيش' },
  'makadi': { govKey: 'red sea', name: 'Makadi', ar: 'مكادي' },
  'somabay': { govKey: 'red sea', name: 'Somabay', ar: 'سوما باي' },
}

// Governorates to create when a CITY_FIXES entry references them.
const GOV_FIXES: Record<string, { name: string; ar: string }> = {
  matrouh: { name: 'Matrouh', ar: 'مرسى مطروح' },
  suez: { name: 'Suez', ar: 'السويس' },
  'red sea': { name: 'Red Sea', ar: 'البحر الأحمر' },
}

// ─── catalog (sitemap) ──────────────────────────────────────────

let catalogCache: { at: number; items: NawyCatalogItem[] } | null = null

export async function fetchNawyCatalog(force = false): Promise<NawyCatalogItem[]> {
  if (!force && catalogCache && Date.now() - catalogCache.at < 10 * 60_000) return catalogCache.items

  const idxRes = await fetch('https://www.nawy.com/sitemap.xml', { signal: AbortSignal.timeout(15_000) })
  if (!idxRes.ok) throw new Error(`sitemap index HTTP ${idxRes.status}`)
  const idx = await idxRes.text()
  const files = [...idx.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1])
    .filter((u) => /compounds-\d+\.xml$/.test(u))
  if (!files.length) throw new Error('no compound sitemap files found')

  const locs: string[] = []
  for (const f of files) {
    const r = await fetch(f, { signal: AbortSignal.timeout(15_000) })
    if (!r.ok) throw new Error(`sitemap ${f} HTTP ${r.status}`)
    const xml = await r.text()
    locs.push(...[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]))
  }

  const en = new Map<number, string>()
  const ar = new Map<number, string>()
  for (const u of locs) {
    const mAr = u.match(/\/ar\/compound\/(\d+)-/)
    if (mAr) {
      ar.set(Number(mAr[1]), u)
      continue
    }
    const mEn = u.match(/\/compound\/(\d+)-[^/]+$/)
    if (mEn) en.set(Number(mEn[1]), u)
  }

  const items: NawyCatalogItem[] = [...en.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([id, enUrl]) => ({ id, enUrl, arUrl: ar.get(id) ?? null }))

  catalogCache = { at: Date.now(), items }
  return items
}

// ─── page fetch + parse ─────────────────────────────────────────

export interface NawyPage {
  compound: unknown
  types: NawyTypeEvidence
}

export async function fetchNawyPage(url: string): Promise<NawyPage> {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, 'accept-language': 'en,en;q=0.9' },
    signal: AbortSignal.timeout(20_000),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()
  const marker = html.indexOf('<script id="__NEXT_DATA__"')
  if (marker < 0) throw new Error('page layout changed (__NEXT_DATA__ missing)')
  const s = html.indexOf('>', marker) + 1
  const e = html.indexOf('</script>', s)
  const json = JSON.parse(html.slice(s, e))
  const pageProps = json?.props?.pageProps
  const compound = pageProps?.compound
  if (!compound) throw new Error('no compound data in page')
  return { compound, types: extractTypeEvidence(pageProps) }
}

export function parseCompound(raw: unknown): NawyCompound {
  return nawyCompoundZ.parse(raw)
}

// ─── mapping Nawy compound → our Project shape ──────────────────

interface Mapped {
  data: Record<string, unknown>
  display: {
    slug: string
    name: string
    nameArabic: string | null
    developer: string
    developerArabic: string | null
    area: string
    startPrice: number | null
    downPaymentPct: number | null
    years: number | null
    images: number
    isLaunch: boolean
  }
}

function mapCompound(
  en: NawyCompound,
  ar: NawyCompound | null,
  opts: { publish: boolean; enUrl: string; types?: NawyTypeEvidence }
): Mapped {
  const prices = (en.prices || {}) as Record<string, unknown>
  const startPrice = toNum(prices.developerStartingPrice) ?? toNum(prices.resaleStartingPrice)
  const plans = en.paymentPlans || []
  const firstPlan = plans[0]

  const area = [en.areaName, en.parentAreaName].filter(Boolean).join(', ')
  const lat = en.lat ?? null
  const long = en.long ?? null

  // Genuine Nawy launches count as new; older catalogue entries are
  // back-dated so they don't flood the "New Launches" 30-day window.
  const createdAt = en.isLaunch
    ? new Date()
    : new Date(Date.now() - (365 + (en.id % 120)) * 86_400_000)

  const data: Record<string, unknown> = {
    name: en.name.trim(),
    nameArabic: trunc(ar?.name, 200),
    slug: en.slug.trim(),
    tagline: truncSentence(collapseJammedDuplicates(stripNawyPromo(stripHtml(en.metaDescription))), 180),
    taglineArabic: truncSentence(collapseJammedDuplicates(stripNawyPromo(stripHtml(ar?.metaDescription))), 180),
    description: truncSentence(collapseJammedDuplicates(stripNawyPromo(stripHtml(en.description))), 6000),
    descriptionArabic: truncSentence(collapseJammedDuplicates(stripNawyPromo(stripHtml(ar?.description))), 6000),
    coverImage: httpsUrl(en.coverImageUrl),
    gallery: JSON.stringify((en.images || []).slice(0, 20)),
    videoUrl: typeof en.video === 'string' ? en.video : ((en.video as { url?: string })?.url ?? null),
    latitude: lat,
    longitude: long,
    googleMapsUrl: lat != null && long != null ? `https://www.google.com/maps?q=${lat},${long}` : null,
    address: area || null,
    status: en.isLaunch ? 'COMING_SOON' : 'UNDER_CONSTRUCTION',
    approvalStatus: opts.publish ? 'PUBLISHED' : 'DRAFT',
    isActive: opts.publish,
    publishedAt: opts.publish ? createdAt : null,
    totalUnits: en.propertiesCount ?? null,
    completionPercent: 0,
    startPrice,
    downPaymentMin: firstPlan ? (firstPlan.downPaymentPercentage ?? null) : null,
    installmentYears: firstPlan ? (firstPlan.years ?? null) : null,
    metaTitle: trunc(en.metaTitle, 200),
    metaDescription: trunc(en.metaDescription, 300),
    keywords: JSON.stringify(['nawy', `source:${opts.enUrl}`]),
    propertyTypes: JSON.stringify(opts.types?.propertyTypes ?? []),
    listingTypes: JSON.stringify(opts.types?.listingTypes ?? []),
    createdAt,
  }

  return {
    data,
    display: {
      slug: en.slug.trim(),
      name: en.name.trim(),
      nameArabic: trunc(ar?.name, 60),
      developer: (en.developerName || '').trim(),
      developerArabic: trunc(ar?.developerName, 80),
      area,
      startPrice,
      downPaymentPct: firstPlan?.downPaymentPercentage ?? null,
      years: firstPlan?.years ?? null,
      images: en.images?.length ?? 0,
      isLaunch: !!en.isLaunch,
    },
  }
}

// ─── reference data: developers + cities (JS case-insensitive) ──

let devCache: { at: number; list: { id: string; companyName: string }[] } | null = null
let cityCache: { at: number; list: { id: string; name: string; governorateId: string }[] } | null = null
let govCache: { at: number; list: { id: string; name: string }[] } | null = null

async function loadDevelopers() {
  if (!devCache || Date.now() - devCache.at > 60_000) {
    const list = await db.developerProfile.findMany({ select: { id: true, companyName: true } })
    devCache = { at: Date.now(), list }
  }
  return devCache.list
}

async function loadCities() {
  if (!cityCache || Date.now() - cityCache.at > 60_000) {
    const list = await db.city.findMany({ select: { id: true, name: true, governorateId: true } })
    cityCache = { at: Date.now(), list }
  }
  return cityCache.list
}

async function loadGovernorates() {
  if (!govCache || Date.now() - govCache.at > 60_000) {
    const list = await db.governorate.findMany({ select: { id: true, name: true } })
    govCache = { at: Date.now(), list }
  }
  return govCache.list
}

async function resolveGovernorate(govKey: string): Promise<{ id: string; name: string } | null> {
  const list = await loadGovernorates()
  const found = list.find((g) => normArea(g.name) === govKey) ?? list.find((g) => norm(g.name) === govKey)
  if (found) return found
  const fix = GOV_FIXES[govKey]
  if (!fix) return null
  const gov = await db.governorate.create({
    data: { name: fix.name, nameArabic: fix.ar, nameSlug: citySlug(fix.name) },
  })
  govCache = null
  return gov
}

// Resolve a project location: exact/normalized city match → parent
// area match → CITY_FIXES (create missing city under a governorate).
// Returns null when nothing matches (address text is still stored).
async function resolveCity(
  areaName: string | null | undefined,
  parentName: string | null | undefined,
  byKey: Map<string, { id: string; name: string; governorateId: string }>
): Promise<{ id: string; governorateId: string } | null> {
  const candidates = [areaName, parentName]
    .filter((s): s is string => !!s && !!s.trim())
    .flatMap((s) => [normArea(s), norm(s)])

  for (const key of candidates) {
    const hit = byKey.get(key)
    if (hit) return hit
  }
  for (const key of candidates) {
    const fix = CITY_FIXES[key]
    if (!fix) continue
    // reuse a fix city already resolved under another key
    // (e.g. all Cairo districts share City "Cairo")
    const sameName = byKey.get(normArea(fix.name))
    if (sameName) {
      byKey.set(key, sameName)
      return sameName
    }
    const gov = await resolveGovernorate(fix.govKey)
    if (!gov) continue
    const city = await db.city.create({
      data: {
        name: fix.name,
        nameArabic: fix.ar,
        nameSlug: citySlug(fix.name),
        governorateId: gov.id,
      },
    })
    const row = { id: city.id, name: city.name, governorateId: city.governorateId }
    byKey.set(key, row)
    byKey.set(normArea(city.name), row)
    byKey.set(norm(city.name), row)
    cityCache = null
    return row
  }
  return null
}

async function resolveDeveloper(
  companyName: string,
  companyNameArabic: string | null,
  logo: string | null,
  cache: Map<string, string>
): Promise<string> {
  const key = norm(companyName)
  const hit = cache.get(key)
  if (hit) return hit
  const list = await loadDevelopers()
  const found = list.find((d) => norm(d.companyName) === key)
  if (found) {
    cache.set(key, found.id)
    return found.id
  }
  const user = await db.user.create({
    data: {
      email: `nawy-dev-${randomBytes(4).toString('hex')}@nawy-import.test`,
      name: companyName,
      role: 'DEVELOPER',
      isActive: false,
    },
  })
  const profile = await db.developerProfile.create({
    data: {
      userId: user.id,
      companyName,
      companyNameArabic,
      // Localize the logo; keeps the hotlink when the download fails.
      logo: await localizeUrl(httpsUrl(logo), 'logo'),
    },
  })
  devCache = null // reload so later items in the batch see it
  cache.set(key, profile.id)
  return profile.id
}

// ─── preview (no writes) ────────────────────────────────────────

export interface PreviewEntry {
  url: string
  slug: string | null
  name: string | null
  nameArabic: string | null
  developer: string | null
  area: string | null
  startPrice: number | null
  downPaymentPct: number | null
  years: number | null
  images: number
  isLaunch: boolean
  exists: boolean
  error: string | null
}

export async function previewCompounds(
  items: NawyCatalogItem[],
  opts: { includeAr: boolean }
): Promise<PreviewEntry[]> {
  const slugs = items.map((i) => slugFromUrl(i.enUrl)).filter(Boolean)
  const existing = await db.project.findMany({ where: { slug: { in: slugs } }, select: { slug: true } })
  const existingSet = new Set(existing.map((p) => p.slug))

  return pool(items, 3, async (it): Promise<PreviewEntry> => {
    try {
      const page = await fetchNawyPage(it.enUrl)
      const en = parseCompound(page.compound)
      const ar =
        opts.includeAr && it.arUrl
          ? await fetchNawyPage(it.arUrl)
              .then((r) => parseCompound(r.compound))
              .catch(() => null)
          : null
      const m = mapCompound(en, ar, { publish: false, enUrl: it.enUrl, types: page.types })
      return { url: it.enUrl, ...m.display, exists: existingSet.has(m.display.slug), error: null }
    } catch (err) {
      return {
        url: it.enUrl,
        slug: slugFromUrl(it.enUrl) || null,
        name: null,
        nameArabic: null,
        developer: null,
        area: null,
        startPrice: null,
        downPaymentPct: null,
        years: null,
        images: 0,
        isLaunch: false,
        exists: false,
        error: err instanceof Error ? err.message : 'fetch failed',
      }
    }
  })
}

// ─── import (writes) ────────────────────────────────────────────

export interface ImportResult {
  imported: { slug: string; name: string; developer: string }[]
  skipped: { slug: string; reason: string }[]
  errors: { url: string; error: string }[]
}

export async function importCompounds(
  items: NawyCatalogItem[],
  opts: { publish: boolean; includeAr: boolean }
): Promise<ImportResult> {
  const result: ImportResult = { imported: [], skipped: [], errors: [] }

  // fast path: skip existing slugs without fetching anything
  const slugs = items.map((i) => slugFromUrl(i.enUrl)).filter(Boolean)
  const existing = await db.project.findMany({ where: { slug: { in: slugs } }, select: { slug: true } })
  const existingSet = new Set(existing.map((p) => p.slug))
  const rest = items.filter((i) => !existingSet.has(slugFromUrl(i.enUrl)))
  for (const s of slugs) if (existingSet.has(s)) result.skipped.push({ slug: s, reason: 'slug exists' })

  // fetch + parse (concurrency 3, polite)
  type Loaded = {
    it: NawyCatalogItem
    en?: NawyCompound
    ar?: NawyCompound | null
    types?: NawyTypeEvidence
    error?: string
  }
  const loaded: Loaded[] = await pool(rest, 3, async (it): Promise<Loaded> => {
    try {
      const page = await fetchNawyPage(it.enUrl)
      const en = parseCompound(page.compound)
      const ar =
        opts.includeAr && it.arUrl
          ? await fetchNawyPage(it.arUrl)
              .then((r) => parseCompound(r.compound))
              .catch(() => null)
          : null
      return { it, en, ar, types: page.types }
    } catch (err) {
      return { it, error: err instanceof Error ? err.message : 'fetch failed' }
    }
  })

  for (const l of loaded) {
    if (l.error) result.errors.push({ url: l.it.enUrl, error: l.error })
  }
  const ok = loaded.filter((l) => l.en) as {
    it: NawyCatalogItem
    en: NawyCompound
    ar: NawyCompound | null
    types?: NawyTypeEvidence
  }[]

  // second dedup: same name + same developer already in DB
  const names = [...new Set(ok.map((c) => c.en.name.trim()))]
  const dupRows = names.length
    ? await db.project.findMany({ where: { name: { in: names } }, select: { name: true, developerId: true } })
    : []
  const dupSet = new Set(dupRows.map((r) => `${norm(r.name)}|${r.developerId}`))

  const devCacheMap = new Map<string, string>()
  const cities = await loadCities()
  const cityByKey = new Map<string, { id: string; name: string; governorateId: string }>()
  for (const c of cities) {
    cityByKey.set(norm(c.name), c)
    cityByKey.set(normArea(c.name), c)
  }

  for (const c of ok) {
    const { it, en, ar } = c
    try {
      const developerId = await resolveDeveloper(
        (en.developerName || 'Unknown Developer').trim(),
        trunc(ar?.developerName, 200),
        en.developerLogoUrl ?? null,
        devCacheMap
      )
      const dupKey = `${norm(en.name)}|${developerId}`
      if (dupSet.has(dupKey)) {
        result.skipped.push({ slug: en.slug, reason: 'name+developer exists' })
        continue
      }

      const mapped = mapCompound(en, ar, { publish: opts.publish, enUrl: it.enUrl, types: c.types })
      const city = await resolveCity(en.areaName, en.parentAreaName, cityByKey)

      // Localize every media URL before writing; each keeps its
      // hotlink when its download fails (never blocks the import).
      let galleryRaw: string[] = []
      try {
        const g = JSON.parse(mapped.data.gallery as string)
        if (Array.isArray(g)) galleryRaw = g.filter((s): s is string => typeof s === 'string')
      } catch {
        galleryRaw = []
      }
      const mpHref = httpsUrl(en.masterPlan)
      const brHref = httpsUrl(en.brochureUrl)
      const [coverLocal, galleryLocal, mpLocal, brLocal] = await Promise.all([
        localizeUrl(mapped.data.coverImage as string | null, 'cover'),
        localizeMany(galleryRaw, 'gallery', 5),
        mpHref ? localizeUrl(mpHref, 'masterplan') : Promise.resolve<string | null>(null),
        brHref ? localizeUrl(brHref, 'brochure') : Promise.resolve<string | null>(null),
      ])

      const plans = en.paymentPlans || []
      const amenityNames = [
        ...new Set(
          (en.amenities || [])
            .map((a) => (typeof a === 'string' ? a : ((a as { name?: string })?.name ?? '')))
            .map((s) => s.trim())
            .filter(Boolean)
        ),
      ]

      const createData: Record<string, unknown> = {
        ...mapped.data,
        coverImage: coverLocal,
        gallery: JSON.stringify(galleryLocal),
        developerId,
        cityId: city?.id ?? null,
        governorateId: city?.governorateId ?? null,
        paymentPlans:
          plans.length > 0
            ? {
                create: plans.map((p, i) => ({
                  name: `${p.years ?? '—'} years · ${p.downPaymentPercentage ?? '—'}% down`,
                  downPaymentPct: p.downPaymentPercentage ?? 0,
                  installmentYears: p.years ?? 0,
                  cashDiscount: p.discount ?? null,
                  isDefault: i === 0,
                  sortOrder: i,
                })),
              }
            : undefined,
        masterPlanImages: mpLocal
          ? { create: [{ url: mpLocal, caption: 'Master Plan', sortOrder: 0 }] }
          : undefined,
        brochures: brLocal
          ? { create: [{ url: brLocal, name: `${en.name.trim()} Brochure` }] }
          : undefined,
        amenities:
          amenityNames.length > 0
            ? {
                create: amenityNames.map((name) => ({
                  amenity: {
                    connectOrCreate: {
                      where: { name },
                      create: { name, nameArabic: name },
                    },
                  },
                })),
              }
            : undefined,
      }
      for (const k of Object.keys(createData)) {
        if (createData[k] === undefined) delete createData[k]
      }

      const created = await db.project.create({ data: createData as Prisma.ProjectCreateInput })
      dupSet.add(dupKey)
      result.imported.push({
        slug: created.slug,
        name: created.name,
        developer: (en.developerName || '').trim(),
      })
    } catch (err) {
      result.errors.push({
        url: it.enUrl,
        error: err instanceof Error ? err.message : 'insert failed',
      })
    }
  }

  return result
}
