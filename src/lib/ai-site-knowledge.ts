import { db } from '@/lib/db'
import { PUBLIC_PROJECT_WHERE } from '@/lib/project-visibility'
import { toolGetProjectDetails } from '@/lib/ai-tools'

// ─── GHAYA site-knowledge grounding (RAG-style, no fine-tuning) ─────
// qwen2.5:3b knows NOTHING about GHAYA out of the box (baseline: it
// invented "جدة وطنجة" as coverage areas). This module grounds the buyer
// AI in real site data through TWO layers:
//
//   STATIC  — baked facts copied from real repo sources (contact page,
//             booking modal + /api/viewings, ai-tools catalogue). Changed
//             only by editing this file alongside the source page.
//   DYNAMIC — small capped DB queries per question (areas, cheapest,
//             project-by-name). Live per call with a short TTL cache so
//             answers never go stale, and one question can never dump the
//             1.8k-project catalog into the prompt.
//
// Fact-listing intents (areas / cheapest / booking / calculators / a named
// project) are answered DETERMINISTICALLY from this data — no LLM round
// trip — because the small model demonstrably hallucinates even with data
// in context. Comparison + general search keep the existing LLM/tool flow.

export type SiteIntentKind =
  | 'GREETING'
  | 'WHERE_AREAS'
  | 'DEVELOPERS'
  | 'CHEAPEST'
  | 'BEST'
  | 'HOW_TO_BOOK'
  | 'CALCULATOR'
  | 'PROJECT_ABOUT'
  | 'ABOUT_SITE'
  | 'CONTACT_INFO'
  | 'BLOG'
  | 'PRESS'
  | 'CAREERS'
  | 'OFFERS'
  | 'SITE_HELP'
  | 'COMPARISON'
  | 'GENERAL'

// ─── STATIC layer ─────────────────────────────────────────────
// Sources (do not invent — update here when the source page changes):
//   CONTACT  ← src/app/(public)/contact/page.tsx
//   BOOKING  ← src/components/viewings/booking-modal.tsx + POST /api/viewings
//   CALCS    ← src/app/(public)/ai-tools/ai-tools-view.tsx (status:'live' only)
//   IDENTITY ← src/app/(public)/about/about-view.tsx
//   ABOUT    ← src/app/(public)/about/about-view.tsx (mission + features + why-egypt)
//   LEGAL    ← terms-view.tsx / privacy-view.tsx / cookies-view.tsx (summaries + links only —
//              full legal text is too heavy for the prompt; pages stay authoritative)
//   PLATFORM ← /compare, /saved, /saved-searches, /broker, /developer/submit,
//              /offers page copy, /locations page copy (one-line each + links)
//   FAQ      ← src/app/(public)/faq/faq-data.ts (14 Q&As; page is authoritative,
//              grounding points at /faq via PLATFORM.faq so Ayn answers from it)
// NOTE on single-source-of-truth: the page components above are 'use client'
// (hooks + icons) and cannot be imported into this server module, so static
// copy is MIRRORED here with a ← pointer per block (same convention as the
// original CONTACT/BOOKING blocks). DB-backed content (areas, developers,
// blog, press, jobs, offers) is NEVER mirrored — it is queried live per
// question with a short TTL, so it stays in sync with zero manual edits.
// Rebuild on deploy picks up static edits; no cron needed (reported).

export const SITE_IDENTITY_LINE =
  'غاية العقارية (GHAYA REAL ESTATE) — منصة مصر للعقارات بالذكاء الاصطناعي: سيرش ذكي، إعلانات موثوقة متراجعة، بروكرز خبرة، وحاسبات عقارية.'

const CONTACT = {
  phone: '+20 2 1234 5678',
  email: 'info@estateai.eg',
  addressAr: 'القاهرة الجديدة، القاهرة، مصر',
  addressEn: 'New Cairo, Cairo, Egypt',
  hoursAr: 'الحد - الخميس: 9 الصبح - 6 المغرب',
  hoursEn: 'Sun - Thu: 9AM - 6PM',
}

// Booking flow, mirrored from BookingButton (booking-modal.tsx):
// no login required, needs project/unit + date + time slot + name + phone.
const BOOKING_STEPS_AR = [
  'افتح صفحة المشروع اللي عجبك.',
  'دوس زرار «احجز معاينة».',
  'اختار نوع المعاينة: زيارة على الطبيعة أو اجتماع أونلاين.',
  'اختار اليوم والوقت المناسب ليك.',
  'اكتب اسمك ورقم تليفونك (من غير ما تسجل دخول).',
  'أكّد الحجز — وهتلاقي تأكيد + زرار واتساب لمتابعة المعاد.',
]
const BOOKING_STEPS_EN = [
  'Open the project page you like.',
  'Click "Book a viewing".',
  'Pick the type: in-person visit or online meeting.',
  'Pick the day and time slot that suits you.',
  'Enter your name and phone number (no sign-in needed).',
  'Confirm — you get a confirmation plus a WhatsApp follow-up button.',
]

const CALCULATORS = [
  { ar: 'حاسبة التمويل والأقساط', en: 'Mortgage Calculator', href: '/ai-tools/mortgage', useAr: 'تقارن قرض البنك وتقسيط المطور والكاش — لما تسأل عن القسط أو المقدم', useEn: 'compare bank loan vs developer installments vs cash' },
  { ar: 'حاسبة الاستثمار', en: 'Investment Calculator', href: '/ai-tools/investment', useAr: 'تحسب العائد ونسبة الإيجار والكاش فلو — لما تفكر تشتري عشان تستثمر', useEn: 'ROI, rental yield and cash flow for investment thinking' },
  { ar: 'أقدر أشتري إيه؟', en: 'Affordability Calculator', href: '/ai-tools/affordability', useAr: 'تبدأ من مرتبك وتعرف أغلى شقة البنك ممكن يمولهالك', useEn: 'work backwards from your salary to what a bank would finance' },
  { ar: 'أأجر ولا أشتري؟', en: 'Rent or Buy?', href: '/ai-tools/rentbuy', useAr: 'تقارن إجمالي الإيجار بتكلفة الشراء وتعرف سنة التعادل', useEn: 'compare total rent vs buying cost and find the breakeven year' },
  { ar: 'حاسبة سعر العقار', en: 'Price Estimator', href: '/ai-tools/price-estimator', useAr: 'تعرف السعر العادل لأي عقار بتحليل السوق', useEn: 'fair price estimates from market analysis' },
  { ar: 'البحث بالذكاء الاصطناعي', en: 'AI Property Search', href: '/ai-tools/search', useAr: 'اوصف اللي نفسك فيه بكلام عادي وهنلاقيلك العقارات المناسبة فورًا', useEn: 'describe what you want in natural language, get matching properties instantly' },
  { ar: 'المساعد العقاري الذكي', en: 'AI Property Assistant', href: '/ai-tools/chat', useAr: 'شات معايا عشان ترشيحات على مقاسك', useEn: 'chat with me for personalized recommendations' },
]

// status:'coming_soon' in ai-tools-view.tsx — named honestly so the model
// never sends users to a dead tool.
const COMING_SOON_AR = ['تحليل السوق (/ai-tools/market-analysis)', 'دليل المناطق الذكي (/ai-tools/neighborhood)']
const COMING_SOON_EN = ['Market Analysis (/ai-tools/market-analysis)', 'Neighborhood Guide (/ai-tools/neighborhood)']

// ─── ABOUT facts (mirrored ← about-view.tsx) ─────────────────
const ABOUT_MISSION_AR = 'غاية نازلة تغيّر سوق العقارات في مصر، بالذكاء الاصطناعي ومعرفة حقيقية بالسوق هنا.'
const ABOUT_MISSION_EN = 'GHAYA is on a mission to transform the Egyptian real estate market with AI plus deep local expertise.'
const ABOUT_FEATURES_AR = [
  'سيرش بالذكاء الاصطناعي — دوّر بكلام عادي',
  'إعلانات موثوقة — كل عقار ومطوّر متراجع',
  'رؤية للسوق — أرقام وتريندات أول بأول',
  'بروكرز خبرة — وسطاء مرخّصين',
  'ترشيحات ذكية — على مقاس ذوقك',
  'جولات افتراضية — اتفرج من بيتك (صفحة المشروع ← جولة)',
]
const ABOUT_FEATURES_EN = [
  'AI-powered search in natural language',
  'Verified listings — every property and developer reviewed',
  'Market insights — live numbers and trends',
  'Expert licensed brokers',
  'Smart matching to your taste',
  'Virtual tours from home (project page → tour)',
]
const ABOUT_WHY_EGYPT_AR = 'سوق مصر من أسرع أسواق المنطقة — العاصمة الإدارية والمدن الجديدة وتطوير البنية التحتية.'
const ABOUT_WHY_EGYPT_EN = 'Egypt is one of the fastest-growing MENA markets — New Administrative Capital, new cities, infrastructure.'

// ─── LEGAL summaries (← terms/privacy/cookies-view.tsx; pages authoritative)
const LEGAL_AR = [
  '• **الشروط** (/terms — آخر تحديث يناير 2026): المنصة للتصفح والبحث والاستفسار عن عقارات مصر؛ ترشيحات الذكاء الاصطناعي معلوماتية مش استشارة مالية/قانونية؛ للأسئلة: legal@estateai.eg',
  '• **الخصوصية** (/privacy): بنجمع الاسم والتليفون وتفضيلات البحث عشان الترشيحات؛ مش بنبيع بياناتك؛ تمسح بياناتك أي وقت عبر privacy@estateai.eg',
  '• **الكوكيز** (/cookies): أساسية للتشغيل + تفضيلات (اللغة/الثيم) + تحليلات؛ تتحكم فيهم من المتصفح',
]
const LEGAL_EN = [
  '• **Terms** (/terms — updated Jan 2026): browse/search/inquire about Egypt properties; AI picks are informational, not financial/legal advice; questions: legal@estateai.eg',
  '• **Privacy** (/privacy): we collect name/phone/search prefs for recommendations; never sold; delete anytime via privacy@estateai.eg',
  '• **Cookies** (/cookies): essential + preferences (language/theme) + analytics; controlled from your browser',
]

// ─── PLATFORM one-liners (← compare/saved/broker/developer/offers/locations pages)
const PLATFORM_AR = {
  compare: 'تقارن لحد 4 مشاريع جنب بعض من /compare، وتشير المقارنة بلينك.',
  saved: 'تحفظ المشاريع في /saved على جهازك مباشرة من غير حساب — أما عمليات البحث المحفوظة والتنبيهات في /saved-searches فمحتاجة حساب.',
  broker: 'وسيط؟ ادخل على /broker.',
  developer: 'مطوّر؟ ابعت مشروعك من /developer/submit.',
  offers: 'خصومات الكاش بتنزل في /offers (خطط سداد بخصم كاش أكبر من صفر).',
  locations: 'تتصفح المدن والمناطق من /locations، وتفاصيل خدمات كل منطقة من /areas.',
  tour: 'الجولات الافتراضية جوّه صفحة المشروع (/projects/اسم-المشروع ← جولة).',
  faq: 'إجابات سريعة على الأسئلة الشائعة (الحجز والأسعار والمناطق والحسابات وعين والتواصل) في /faq.',
}
const PLATFORM_EN = {
  compare: 'Compare up to 4 projects side by side at /compare, shareable via link.',
  saved: 'Save projects at /saved right on your device with no account — but saved searches and alerts at /saved-searches need an account.',
  broker: 'A broker? Head to /broker.',
  developer: 'A developer? Submit your project at /developer/submit.',
  offers: 'Cash discounts land at /offers (payment plans with a cash discount above zero).',
  locations: 'Browse cities and regions at /locations, per-area services at /areas.',
  tour: 'Virtual tours live inside the project page (/projects/<slug> → tour).',
  faq: 'Quick answers to common questions (booking, prices, areas, accounts, Ayn, contact) at /faq.',
}

// ─── DYNAMIC layer (live, TTL-cached) ─────────────────────────
// Choice: LIVE per question with a 5–10 min in-memory TTL (not baked).
// Why: the catalog changes on every import; a baked city list goes stale
// silently, while one aggregate query per question-class is cheap
// (<100ms on SQLite) and always reflects PUBLISHED inventory. TTL only
// dedupes bursts in the same conversation.

const AREAS_TTL_MS = 5 * 60_000
const CHEAPEST_TTL_MS = 5 * 60_000
const NAMES_TTL_MS = 10 * 60_000

export interface AreaStat {
  name: string
  nameArabic: string | null
  slug: string
  governorate: string | null
  governorateArabic: string | null
  projectCount: number
  minPrice: number | null
  maxPrice: number | null
  avgPrice: number | null
}

export interface DeveloperStat {
  companyName: string
  companyNameArabic: string | null
  projectCount: number
  minPrice: number | null
}

let areasCache: { at: number; data: AreaStat[] } | null = null
let cheapestCache: { at: number; data: Array<{ name: string; nameArabic: string | null; slug: string; startPrice: number; city: string | null }> } | null = null
let namesCache: { at: number; data: Array<{ name: string; nameArabic: string | null; slug: string }> } | null = null
let developersCache: { at: number; data: DeveloperStat[] } | null = null
const DEVELOPERS_TTL_MS = 10 * 60_000

export async function getAreasSnapshot(): Promise<AreaStat[]> {
  if (areasCache && Date.now() - areasCache.at < AREAS_TTL_MS) return areasCache.data
  const projects = await db.project.findMany({
    where: { ...PUBLIC_PROJECT_WHERE, cityId: { not: null } },
    select: {
      startPrice: true,
      city: {
        select: {
          name: true,
          nameArabic: true,
          nameSlug: true,
          governorate: { select: { name: true, nameArabic: true } },
        },
      },
    },
  })
  const grouped = new Map<string, AreaStat & { priceSum: number; pricedCount: number }>()
  for (const p of projects) {
    const city = p.city
    if (!city?.name) continue
    const slug = city.nameSlug || city.name.toLowerCase().replace(/\s+/g, '-')
    let entry = grouped.get(slug)
    if (!entry) {
      entry = {
        name: city.name,
        nameArabic: city.nameArabic ?? null,
        slug,
        governorate: city.governorate?.name ?? null,
        governorateArabic: city.governorate?.nameArabic ?? null,
        projectCount: 0,
        minPrice: null,
        maxPrice: null,
        avgPrice: null,
        priceSum: 0,
        pricedCount: 0,
      }
      grouped.set(slug, entry)
    }
    entry.projectCount += 1
    if (typeof p.startPrice === 'number' && Number.isFinite(p.startPrice)) {
      entry.minPrice = entry.minPrice === null ? p.startPrice : Math.min(entry.minPrice, p.startPrice)
      entry.maxPrice = entry.maxPrice === null ? p.startPrice : Math.max(entry.maxPrice, p.startPrice)
      entry.priceSum += p.startPrice
      entry.pricedCount += 1
    }
  }
  const data: AreaStat[] = [...grouped.values()]
    .map(({ priceSum, pricedCount, ...rest }) => ({
      ...rest,
      avgPrice: pricedCount > 0 ? Math.round(priceSum / pricedCount) : null,
    }))
    .sort((a, b) => b.projectCount - a.projectCount)
  areasCache = { at: Date.now(), data }
  return data
}

// ─── Developers snapshot (live) ─────────────────────────────
// Company names + published project counts, computed from real rows.
// Powers the DEVELOPERS deterministic answer so the model never invents
// a developer roster.
export async function getDevelopersSnapshot(limit = 20): Promise<{ items: DeveloperStat[]; total: number }> {
  if (developersCache && Date.now() - developersCache.at < DEVELOPERS_TTL_MS) {
    return { items: developersCache.data.slice(0, limit), total: developersCache.data.length }
  }
  const projects = await db.project.findMany({
    where: PUBLIC_PROJECT_WHERE,
    select: {
      startPrice: true,
      developer: { select: { companyName: true, companyNameArabic: true } },
    },
  })
  const grouped = new Map<string, DeveloperStat>()
  for (const p of projects) {
    const name = p.developer?.companyName?.trim()
    if (!name) continue
    let entry = grouped.get(name)
    if (!entry) {
      entry = { companyName: name, companyNameArabic: p.developer?.companyNameArabic ?? null, projectCount: 0, minPrice: null }
      grouped.set(name, entry)
    }
    entry.projectCount += 1
    if (typeof p.startPrice === 'number' && Number.isFinite(p.startPrice)) {
      entry.minPrice = entry.minPrice === null ? p.startPrice : Math.min(entry.minPrice, p.startPrice)
    }
  }
  const data = [...grouped.values()].sort((a, b) => b.projectCount - a.projectCount)
  developersCache = { at: Date.now(), data }
  return { items: data.slice(0, limit), total: data.length }
}

export async function getCheapestProjects(k = 3) {
  if (cheapestCache && Date.now() - cheapestCache.at < CHEAPEST_TTL_MS) return cheapestCache.data.slice(0, k)
  const rows = await db.project.findMany({
    where: { ...PUBLIC_PROJECT_WHERE, startPrice: { not: null } },
    select: { name: true, nameArabic: true, slug: true, startPrice: true, city: { select: { name: true, nameArabic: true } } },
    orderBy: { startPrice: 'asc' },
    take: Math.max(k, 5),
  })
  const data = rows.map((r) => ({
    name: r.name,
    nameArabic: r.nameArabic,
    slug: r.slug,
    startPrice: r.startPrice as number,
    city: r.city?.nameArabic || r.city?.name || null,
  }))
  cheapestCache = { at: Date.now(), data }
  return data.slice(0, k)
}

export interface PopularProject {
  name: string
  nameArabic: string | null
  slug: string
  startPrice: number | null
  city: string | null
  inquiryCount: number
  viewCount: number
  favoriteCount: number
}

// "Best / most popular" = engagement-ranked. All counters are 0 in the
// current DB (no traffic ingested yet) — callers must handle that honestly
// instead of presenting rank #1 as a recommendation.
export async function getPopularProjects(k = 3): Promise<{ items: PopularProject[]; hasSignal: boolean }> {
  const rows = await db.project.findMany({
    where: PUBLIC_PROJECT_WHERE,
    select: {
      name: true, nameArabic: true, slug: true, startPrice: true,
      inquiryCount: true, viewCount: true, favoriteCount: true,
      city: { select: { name: true, nameArabic: true } },
    },
    orderBy: [{ inquiryCount: 'desc' }, { viewCount: 'desc' }, { favoriteCount: 'desc' }],
    take: k,
  })
  const items: PopularProject[] = rows.map((r) => ({
    name: r.name,
    nameArabic: r.nameArabic,
    slug: r.slug,
    startPrice: r.startPrice,
    city: r.city?.nameArabic || r.city?.name || null,
    inquiryCount: r.inquiryCount || 0,
    viewCount: r.viewCount || 0,
    favoriteCount: r.favoriteCount || 0,
  }))
  const hasSignal = items.some((p) => p.inquiryCount > 0 || p.viewCount > 0 || p.favoriteCount > 0)
  return { items, hasSignal }
}

// ─── Content snapshots (live, TTL-cached) ───────────────────
// Blog / press / jobs / offers power the deterministic BLOG/PRESS/CAREERS/
// OFFERS answers so the model never invents posts, releases, vacancies, or
// discounts. Same convention as areas/developers: one capped query per
// question-class, summaries only (no full bodies — prompt budget), published
// rows only. TTL 5 min; static rebuild on deploy needs nothing (no cron).

const CONTENT_TTL_MS = 5 * 60_000

export interface BlogStat { title: string; titleArabic: string | null; slug: string; excerpt: string | null; category: string | null }
export interface PressStat { title: string; titleArabic: string | null; slug: string; source: string | null }
export interface JobStat { title: string; titleArabic: string | null; slug: string; department: string; location: string; type: string }
export interface OfferStat { name: string; nameArabic: string | null; slug: string; city: string | null; maxDiscount: number; startPrice: number | null }

let blogCache: { at: number; data: BlogStat[] } | null = null
let pressCache: { at: number; data: PressStat[] } | null = null
let jobsCache: { at: number; data: JobStat[] } | null = null
let offersCache: { at: number; data: OfferStat[] } | null = null

export async function getBlogSnapshot(limit = 5): Promise<BlogStat[]> {
  if (blogCache && Date.now() - blogCache.at < CONTENT_TTL_MS) return blogCache.data.slice(0, limit)
  const rows = await db.blog.findMany({
    where: { isPublished: true },
    select: { title: true, titleArabic: true, slug: true, excerpt: true, category: true },
    orderBy: { publishedAt: 'desc' },
    take: Math.max(limit, 5),
  })
  blogCache = { at: Date.now(), data: rows }
  return rows.slice(0, limit)
}

export async function getPressSnapshot(limit = 5): Promise<PressStat[]> {
  if (pressCache && Date.now() - pressCache.at < CONTENT_TTL_MS) return pressCache.data.slice(0, limit)
  const rows = await db.pressRelease.findMany({
    where: { isPublished: true },
    select: { title: true, titleArabic: true, slug: true, source: true },
    orderBy: { publishedAt: 'desc' },
    take: Math.max(limit, 5),
  })
  pressCache = { at: Date.now(), data: rows }
  return rows.slice(0, limit)
}

export async function getJobsSnapshot(limit = 8): Promise<JobStat[]> {
  if (jobsCache && Date.now() - jobsCache.at < CONTENT_TTL_MS) return jobsCache.data.slice(0, limit)
  const rows = await db.job.findMany({
    where: { isPublished: true },
    select: { title: true, titleArabic: true, slug: true, department: true, location: true, type: true },
    orderBy: { createdAt: 'desc' },
    take: Math.max(limit, 8),
  })
  jobsCache = { at: Date.now(), data: rows }
  return rows.slice(0, limit)
}

export async function getOffersSnapshot(limit = 5): Promise<OfferStat[]> {
  if (offersCache && Date.now() - offersCache.at < CONTENT_TTL_MS) return offersCache.data.slice(0, limit)
  // Same public/offers semantics as GET /api/offers: approved projects with
  // ≥1 active plan carrying cashDiscount > 0.
  const projects = await db.project.findMany({
    where: { ...PUBLIC_PROJECT_WHERE, paymentPlans: { some: { isActive: true, cashDiscount: { gt: 0 } } } },
    select: {
      name: true, nameArabic: true, slug: true, startPrice: true,
      city: { select: { name: true, nameArabic: true } },
      paymentPlans: {
        where: { isActive: true, cashDiscount: { gt: 0 } },
        select: { cashDiscount: true },
        orderBy: { cashDiscount: 'desc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
    take: Math.max(limit, 5),
  })
  const data: OfferStat[] = projects.map((p) => ({
    name: p.name,
    nameArabic: p.nameArabic,
    slug: p.slug,
    city: p.city?.nameArabic || p.city?.name || null,
    maxDiscount: Math.round(p.paymentPlans[0]?.cashDiscount ?? 0),
    startPrice: p.startPrice,
  }))
  offersCache = { at: Date.now(), data }
  return data.slice(0, limit)
}

// ─── Arabic-tolerant name matching ────────────────────────────
// DB stores e.g. nameArabic='سيلييا' while users type 'سيليا'. Normalize
// both sides (alef forms, ta marbuta, alef maqsura, diacritics, tatweel,
// collapsed repeats, case/space-insensitive) and match in JS over a light
// cached index (id-free: name/nameArabic/slug only, 1864 rows).

export function normalizeAr(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/(.)\1+/g, '$1')
    .replace(/[\s\-_]+/g, '')
}

async function getNameIndex() {
  if (namesCache && Date.now() - namesCache.at < NAMES_TTL_MS) return namesCache.data
  const rows = await db.project.findMany({
    where: PUBLIC_PROJECT_WHERE,
    select: { name: true, nameArabic: true, slug: true },
  })
  namesCache = { at: Date.now(), data: rows }
  return rows
}

// Spaceless normalizeAr() eats the spaces multi-word patterns need, so
// site-intent patterns are ALSO tested against this space-keeping twin
// (same char folding: alef forms, ة→ه, ى→ي, ال stays — substring match
// tolerates word-leading ال; patterns spell out mid-pattern ال explicitly).
function normalizeArLoose(text: string): string {
  const PH = ''
  return normalizeAr(text.replace(/\s+/g, PH)).split(PH).join(' ')
}

// Words that carry no project identity — stripped before matching so
// "عايز أعرف عن مشروع سيليا" reduces to candidate tokens like "سيليا".
const NOISE_WORDS = new Set([
  'عايز', 'عايزه', 'عاوز', 'عاوز', 'اعرف', 'أعرف', 'عن', 'مشروع', 'مشاريع', 'كمبوند',
  'تفاصيل', 'معلومات', 'كلمني', 'احكيلي', 'قولي', 'ايه', 'إيه', 'اسم', 'اسعار', 'أسعار',
  'بكام', 'فين', 'ازاي', 'إزاي', 'ممكن', 'لو', 'سمعت', 'شفت', 'the', 'project', 'about',
  'tell', 'know', 'info', 'details', 'price', 'prices', 'compound', 'a', 'an', 'me',
])

export async function resolveProjectMention(message: string): Promise<string | null> {
  const tokens = normalizeAr(message).length > 0
    ? message.split(/[\s،,؛;:.!?؟()«»"'-]+/).map((t) => t.trim()).filter(Boolean)
    : []
  const candidates = tokens
    .map((t) => normalizeAr(t))
    .filter((t) => t.length >= 3 && !NOISE_WORDS.has(t) && !NOISE_WORDS.has(normalizeAr(t)))
  if (candidates.length === 0) return null
  const index = await getNameIndex()
  let best: { slug: string; score: number } | null = null
  for (const p of index) {
    const names = [normalizeAr(p.name), p.nameArabic ? normalizeAr(p.nameArabic) : '', normalizeAr(p.slug)].filter(Boolean)
    for (const cand of candidates) {
      for (const n of names) {
        if (!n || cand.length < 3) continue
        let score = 0
        if (n === cand) score = 100
        else if (n.includes(cand) && cand.length >= 4) score = 60 + cand.length
        else if (cand.includes(n) && n.length >= 4) score = 50 + n.length
        if (score > 0 && (!best || score > best.score)) best = { slug: p.slug, score }
      }
    }
  }
  return best?.slug || null
}

// ─── Intent classification (regex, AR + EN, no deps) ──────────

const GREETINGS = ['سلام', 'السلام عليكم', 'أهلا', 'اهلا', 'اهلين', 'مرحبا', 'ازيك', 'ازيكم', 'عامل ايه', 'اخبارك', 'هاي', 'هلا', 'صباح الخير', 'مساء الخير', 'hello', 'hi', 'hey', 'good morning', 'good evening', 'salam', 'ahlan']
const AREA_RES = [/المناطق/, /بتشتغل\w* في/, /بتغط\w+/, /فين مشاريع/, /فين.*(شغل|تشتغل)/, /عندكم.*(مناطق|فروع|مشاريع فين)/, /areas?\s+(you\s+)?cover/, /which\s+(cities|areas)/, /where.*(operate|coverage|located)/, /what\s+areas/]
// Plural/collective developer questions ("مين المطورين عندكم؟"). Singular
// "مين المطور؟" (who is THIS project's developer) stays GENERAL/contextual.
const DEV_LIST_RES = [/مطورين/, /المطورين/, /شركات التطوير/, /شركات عقاري/, /ايه الشركات/, /إيه الشركات/, /which developers/, /what developers/, /list.*developers/, /developers.*(list|platform|have)/]
const CHEAP_RES = [/ارخص/, /أرخص/, /رخص/, /cheapest/, /lowest price/, /most affordable/]
const BEST_RES = [/افضل/, /أفضل/, /احسن/, /أحسن/, /اشهر/, /أشهر/, /best/, /most popular/, /top projects?/]
const BOOK_RES = [/احجز/, /أحجز/, /حجز/, /معاينة/, /معاينه/, /زيارة/, /book.*(view|visit)/, /schedule.*(view|visit)/, /how.*book/]
const CALC_RES = [/حاسبه/, /حاسبة/, /اله حاسبه/, /آلة حاسبة/, /calculator/, /mortgage/, /التمويل/]
const ABOUT_RES = [/مشروع/, /كمبوند/, /project/, /compound/, /عن\s+\w/, /كلمني عن/, /احكيلي عن/, /tell me about/, /details about/]
// New static/content intents — checked BEFORE the broad ABOUT_RES so
// "كلمني عن غاية" / "مقال عن ..." route to site facts, not project search.
const ABOUT_SITE_RES = [/عن غايه/, /عن الشركه/, /عن المنصه/, /ايه غايه/, /ايه هي غايه/, /ايه هيا غايه/, /يعني ايه غايه/, /مين غايه/, /مهمتكم/, /بتعملوا ايه/, /بتعمل ايه/, /بتقدموا ايه/, /بتقدم ايه/, /بتقدموا/, /عرفني.*غايه/, /كلمني.*غايه/, /احكيلي.*غايه/, /ليه مصر/, /what is ghaya/, /about ghaya/, /about (the )?(company|platform|site)/, /your mission/, /what do you (do|offer)/, /why egypt/]
const CONTACT_RES = [/رقم التليفون/, /رقمكم/, /تليفونكم/, /ايميلكم/, /إيميلكم/, /بريدكم/, /عنوانكم/, /مكانكم/, /فين مكانكم/, /مواعيد الشغل/, /مواعيدكم/, /phone number/, /your email/, /your address/, /working hours/, /how.*contact/, /contact you/]
const BLOG_RES = [/مدونه/, /مدونة/, /مقالات/, /مقال/, /\bblog\b/]
const PRESS_RES = [/صحافه/, /صحافة/, /أخباركم/, /اخباركم/, /بيان صحفي/, /تغطيه/, /تغطية/, /\bpress\b/, /media coverage/]
const CAREERS_RES = [/وظايف/, /وظائف/, /وظيفه/, /وظيفة/, /شغل عندكم/, /توظيف/, /انضم.*فريق/, /\bcareers?\b/, /\bjobs?\b/, /hiring/, /vacanc/, /join.*team/, /open positions/]
const OFFERS_RES = [/عروض/, /خصومات/, /خصم/, /\boffers?\b/, /discounts?/, /\bdeals\b/, /cash discount/]
const LEGAL_RES = [/شروط الاستخدام/, /الخصوصيه/, /الخصوصية/, /الكوكيز/, /\bterms\b/, /\bprivacy\b/, /\bcookies\b/, /legal@/]
const PLATFORM_RES = [/قارن.*ازاي/, /ازاي.*قارن/, /ازاي.*مقارنه/, /ازاي.*مقارنة/, /المقارنه/, /المقارنة/, /المحفوظ/, /بحوثاتي/, /how.*compare/, /\bsaved\b/, /بروكر.*(انضم|اشترك|اقدم)/, /مطور.*(ضيف|اعرض|اشترك|ابعت)/, /broker.*join/, /developer.*(submit|list|join)/, /جوله\s*(ال)?افتراضيه/, /جولة\s*(ال)?افتراضية/, /virtual tour/]
const COMPARE_RES = [
  /قارن/, /مقارنه/, /مقارنة/, /الفرق بين/, /ايه الفرق/, /إيه الفرق/,
  /محتار.*بين/, /أنهي أحسن/, /انهي احسن/, /مين.*(?:أحسن|احسن)/, /(?:أفضل|افضل|أحسن|احسن).*بين/,
  /compare/, /\bvs\b/, /versus/, /which is better/,
]

export function classifySiteIntent(message: string): SiteIntentKind {
  const norm = normalizeAr(message)
  const lower = message.toLowerCase()
  const trimmed = message.trim()

  // GREETING only when the message is basically just a greeting (a bare
  // hello, optionally with a common opener suffix like "عليكم"). Longer
  // messages carrying a question fall through to the real intents below.
  const normTrimmed = normalizeAr(trimmed)
  const greetHit = GREETINGS.some((g) => {
    const ng = normalizeAr(g)
    return (
      normTrimmed === ng ||
      trimmed.toLowerCase() === g.toLowerCase() ||
      (ng.length >= 3 && normTrimmed.startsWith(ng) && normTrimmed.length <= ng.length + 8)
    )
  })
  if (greetHit && normTrimmed.length <= 25) return 'GREETING'

  if (BOOK_RES.some((r) => r.test(message))) return 'HOW_TO_BOOK'
  if (AREA_RES.some((r) => r.test(message))) return 'WHERE_AREAS'
  if (DEV_LIST_RES.some((r) => r.test(message) || r.test(lower))) return 'DEVELOPERS'
  // Site-content intents (static pages + published content) — before BOTH
  // COMPARE_RES and the broad ABOUT_RES project matcher, so "ازاي اقارن…"
  // (how-to) doesn't become a project comparison and site questions never
  // become a catalog search. Real "قارن بين A و B" carries no ازاي/مقارنة/
  // saved/role/tour trigger, so it still falls through to COMPARISON.
  // NOTE: ه-forms match normalizeAr() output (ة→ه, spaces stripped), NOT
  // raw text — so every set is tested against `norm` too (same precedent
  // as CHEAP_RES/BEST_RES), PLUS `loose` (space-keeping fold) which is
  // what multi-word patterns actually match.
  const loose = normalizeArLoose(message)
  const siteHit = (res: RegExp[]) => res.some((r) => r.test(message) || r.test(lower) || r.test(norm) || r.test(loose))
  if (siteHit(ABOUT_SITE_RES)) return 'ABOUT_SITE'
  if (siteHit(CONTACT_RES)) return 'CONTACT_INFO'
  if (siteHit(BLOG_RES)) return 'BLOG'
  if (siteHit(PRESS_RES)) return 'PRESS'
  if (siteHit(CAREERS_RES)) return 'CAREERS'
  if (siteHit(OFFERS_RES)) return 'OFFERS'
  if (siteHit(LEGAL_RES)) return 'SITE_HELP'
  if (siteHit(PLATFORM_RES)) return 'SITE_HELP'
  if (COMPARE_RES.some((r) => r.test(message) || r.test(lower))) return 'COMPARISON'
  if (CHEAP_RES.some((r) => r.test(message) || r.test(norm))) return 'CHEAPEST'
  if (BEST_RES.some((r) => r.test(message) || r.test(norm))) return 'BEST'
  if (CALC_RES.some((r) => r.test(message))) {
    // Concrete numbers ("احسب قسط شقة بـ 5 مليون على 7 سنين") belong to the
    // payment tool path, not the static calculator guide.
    if (/\d/.test(normalizeDigits(message))) return 'GENERAL'
    return 'CALCULATOR'
  }
  if (ABOUT_RES.some((r) => r.test(message) || r.test(lower))) return 'PROJECT_ABOUT'
  return 'GENERAL'
}

function normalizeDigits(text: string): string {
  const AR = '٠١٢٣٤٥٦٧٨٩'
  const FA = '۰۱۲۳۴۵۶۷۸۹'
  return text
    .replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)))
}

export function fmtPriceAr(amount: number): string {
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000
    return `${Number.isInteger(m) ? m : m.toFixed(1)} مليون جنيه`
  }
  if (amount >= 1_000) {
    const k = Math.round(amount / 1_000)
    return `${k} ألف جنيه`
  }
  return `${amount.toLocaleString('ar-EG')} جنيه`
}

// ─── Deterministic answers ────────────────────────────────────
// Every string below is composed ONLY from the static constants above or
// live query results. The LLM never touches these paths, so it cannot
// corrupt prices, names, or counts.

export interface GroundedAnswer {
  content: string
  toolTag: string
}

export async function answerSiteQuestion(
  kind: SiteIntentKind,
  message: string,
  lang: 'ar' | 'en',
): Promise<GroundedAnswer | null> {
  const ar = lang === 'ar'

  if (kind === 'GREETING') {
    return {
      toolTag: 'site_knowledge',
      content: ar
        ? `أهلًا بيك 👋 أنا عين (Ayn)، مساعد غاية العقارية.\n${SITE_IDENTITY_LINE}\n\nأقدر أساعدك في: تدور على مشروع أو شقة بالمواصفات اللي عايزها، تقارن بين مشاريع، تحسب القسط والمقدم، أو تحجز معاينة.\nقولي بتدور على إيه: المكان والميزانية وعدد الأوض؟`
        : `Hi 👋 I'm Ayn (عين), the GHAYA Real Estate assistant.\n${SITE_IDENTITY_LINE}\n\nI can help you search projects by budget/area/rooms, compare projects, estimate installments, or book a viewing.\nTell me what you're looking for: area, budget, bedrooms?`,
    }
  }

  if (kind === 'WHERE_AREAS') {
    const areas = await getAreasSnapshot()
    const total = areas.reduce((s, a) => s + a.projectCount, 0)
    // Group cities under their governorate (both computed from live rows).
    const govOrder: string[] = []
    const govGroups = new Map<string, { label: string; lines: string[] }>()
    for (const a of areas) {
      const key = a.governorate || '__nogov'
      const label = a.governorateArabic || a.governorate || (ar ? 'مناطق أخرى' : 'Other areas')
      if (!govGroups.has(key)) {
        govGroups.set(key, { label, lines: [] })
        govOrder.push(key)
      }
      const priceBits: string[] = []
      if (a.minPrice) priceBits.push(ar ? `يبدأ من ${fmtPriceAr(a.minPrice)}` : `from ${fmtPriceAr(a.minPrice)}`)
      if (a.avgPrice && a.avgPrice !== a.minPrice) priceBits.push(ar ? `متوسط ${fmtPriceAr(a.avgPrice)}` : `avg ${fmtPriceAr(a.avgPrice)}`)
      govGroups.get(key)!.lines.push(
        `• ${a.nameArabic || a.name}: ${a.projectCount} ${ar ? 'مشروع' : 'projects'}${priceBits.length ? ` (${priceBits.join(ar ? '، ' : ', ')})` : ''}`,
      )
    }
    if (ar) {
      const sections = govOrder.map((k) => `📍 **${govGroups.get(k)!.label}**\n${govGroups.get(k)!.lines.join('\n')}`)
      return {
        toolTag: 'site_knowledge',
        content: `بنشتغل في ${areas.length} منطقة بإجمالي ${total} مشروع 👇\n\n${sections.join('\n\n')}\n\nشوف كل المناطق هنا: /areas\nقولي أنهي منطقة عاجباك وأنا أجيبلك المشاريع اللي فيها.`,
      }
    }
    const sections = govOrder.map((k) => `📍 **${govGroups.get(k)!.label}**\n${govGroups.get(k)!.lines.join('\n')}`)
    return {
      toolTag: 'site_knowledge',
      content: `We cover ${areas.length} areas with ${total} projects 👇\n\n${sections.join('\n\n')}\n\nBrowse all areas: /areas\nTell me which area you like and I'll pull its projects.`,
    }
  }

  if (kind === 'DEVELOPERS') {
    const { items, total } = await getDevelopersSnapshot(15)
    if (items.length === 0) return null
    if (ar) {
      const lines = items.map(
        (d, i) => `${i + 1}. **${d.companyName}** — ${d.projectCount} مشروع${d.minPrice ? ` (يبدأ من ${fmtPriceAr(d.minPrice)})` : ''}`,
      )
      return {
        toolTag: 'site_knowledge',
        content: `دول أكبر المطورين عندنا على المنصة (من بيانات الموقع المباشرة — ${total} مطور) 👇\n\n${lines.join('\n')}\n\nقولي اسم المطور اللي عاجبك وأنا أجيبلك كل مشاريعه بالتفاصيل.`,
      }
    }
    const lines = items.map(
      (d, i) => `${i + 1}. **${d.companyName}** — ${d.projectCount} projects${d.minPrice ? ` (from ${fmtPriceAr(d.minPrice)})` : ''}`,
    )
    return {
      toolTag: 'site_knowledge',
      content: `Our top developers on the platform (live site data — ${total} developers) 👇\n\n${lines.join('\n')}\n\nTell me which developer you like and I'll pull their projects.`,
    }
  }

  if (kind === 'CHEAPEST') {
    const items = await getCheapestProjects(3)
    if (items.length === 0) return null
    if (ar) {
      const lines = items.map(
        (p, i) => `${i + 1}. **${p.name}**${p.nameArabic ? ` (${p.nameArabic})` : ''}${p.city ? ` — ${p.city}` : ''}\n   يبدأ من ${fmtPriceAr(p.startPrice)} — /projects/${p.slug}`,
      )
      return {
        toolTag: 'site_knowledge',
        content: `أرخص ${items.length} مشاريع عندنا حاليًا (من بيانات الموقع المباشرة) 👇\n\n${lines.join('\n\n')}\n\nالأسعار بتتغير، دوس على اللينك عشان تشوف التفاصيل والأرقام المحدّثة.`,
      }
    }
    const lines = items.map(
      (p, i) => `${i + 1}. **${p.name}**${p.city ? ` — ${p.city}` : ''}\n   from ${fmtPriceAr(p.startPrice)} — /projects/${p.slug}`,
    )
    return {
      toolTag: 'site_knowledge',
      content: `Our ${items.length} cheapest projects right now (live site data) 👇\n\n${lines.join('\n\n')}\n\nPrices change — open the link for current details.`,
    }
  }

  if (kind === 'BEST') {
    const { items, hasSignal } = await getPopularProjects(3)
    if (!hasSignal) {
      return {
        toolTag: 'site_knowledge',
        content: ar
          ? 'لسه مفيش بيانات تفاعل كفاية عندي عشان أرشح «الأفضل» بثقة — ومش هخترع ترشيح من عندي.\n\nقولي الميزانية والمكان اللي في بالك (مثلًا: التجمع تحت 8 مليون)، وأنا أجيبلك أنسب المشاريع من بيانات الموقع مباشرة.'
          : 'I don\'t have enough engagement data yet to rank "the best" honestly — and I won\'t invent a ranking.\n\nTell me your budget and area (e.g. New Cairo under 8M) and I\'ll pull the closest projects from live site data.',
      }
    }
    const lines = items.map(
      (p, i) =>
        `${i + 1}. **${p.name}**${p.city ? ` — ${p.city}` : ''}${p.startPrice ? `\n   ${ar ? 'يبدأ من' : 'from'} ${fmtPriceAr(p.startPrice)}` : ''} — /projects/${p.slug}`,
    )
    return {
      toolTag: 'site_knowledge',
      content: ar
        ? `أكتر ${items.length} مشاريع عليها تفاعل عندنا 👇\n\n${lines.join('\n\n')}`
        : `Our ${items.length} most-engaged projects 👇\n\n${lines.join('\n\n')}`,
    }
  }

  if (kind === 'HOW_TO_BOOK') {
    const steps = ar ? BOOKING_STEPS_AR : BOOKING_STEPS_EN
    const numbered = steps.map((s, i) => `${i + 1}. ${s}`).join('\n')
    return {
      toolTag: 'site_knowledge',
      content: ar
        ? `حجز المعاينة سهل ومجاني، من غير ما تسجل دخول 👇\n\n${numbered}\n\n${CONTACT.hoursAr ? `مواعيد الشغل: ${CONTACT.hoursAr}.\n` : ''}لو عايز مساعدة: ${CONTACT.phone} — ${CONTACT.email}`
        : `Booking a viewing is free and needs no sign-in 👇\n\n${numbered}\n\nWorking hours: ${CONTACT.hoursEn}.\nNeed help: ${CONTACT.phone} — ${CONTACT.email}`,
    }
  }

  if (kind === 'CALCULATOR') {
    const lines = CALCULATORS.map((c) => `• **${ar ? c.ar : c.en}** — ${ar ? c.useAr : c.useEn}\n  ${c.href}`).join('\n\n')
    const soon = (ar ? COMING_SOON_AR : COMING_SOON_EN).map((s) => `• ${s} (${ar ? 'قريبًا' : 'coming soon'})`).join('\n')
    return {
      toolTag: 'site_knowledge',
      content: ar
        ? `عندنا ${CALCULATORS.length} أدوات شغالة على الموقع 👇\n\n${lines}\n\n${soon}\n\nقولي عايز تحسب إيه وأنا أوجهك للأداة الصح.`
        : `We have ${CALCULATORS.length} live tools on the site 👇\n\n${lines}\n\n${soon}\n\nTell me what you want to compute and I'll point you to the right one.`,
    }
  }

  if (kind === 'ABOUT_SITE') {
    const feats = (ar ? ABOUT_FEATURES_AR : ABOUT_FEATURES_EN).map((f) => `• ${f}`).join('\n')
    return {
      toolTag: 'site_knowledge',
      content: ar
        ? `${SITE_IDENTITY_LINE}\n\n🎯 مهمتنا: ${ABOUT_MISSION_AR}\n\nبنقدّم إيه:\n${feats}\n\n${ABOUT_WHY_EGYPT_AR}\n\nاعرف أكتر من /about`
        : `${SITE_IDENTITY_LINE}\n\n🎯 Our mission: ${ABOUT_MISSION_EN}\n\nWhat we offer:\n${feats}\n\n${ABOUT_WHY_EGYPT_EN}\n\nMore at /about`,
    }
  }

  if (kind === 'CONTACT_INFO') {
    return {
      toolTag: 'site_knowledge',
      content: ar
        ? `تواصل مع فريق غاية 👇\n\n📞 التليفون: ${CONTACT.phone}\n📧 الإيميل: ${CONTACT.email}\n📍 العنوان: ${CONTACT.addressAr}\n🕘 ${CONTACT.hoursAr}\n\nأو ابعت رسالة من /contact (الاسم والتليفون بس) وهنرد عليك خلال 24 ساعة.`
        : `Reach the GHAYA team 👇\n\n📞 Phone: ${CONTACT.phone}\n📧 Email: ${CONTACT.email}\n📍 Address: ${CONTACT.addressEn}\n🕘 ${CONTACT.hoursEn}\n\nOr send a message from /contact (name + phone only) — we reply within 24 hours.`,
    }
  }

  if (kind === 'BLOG') {
    const posts = await getBlogSnapshot(5)
    if (posts.length === 0) {
      return {
        toolTag: 'site_knowledge',
        content: ar
          ? 'لسه مفيش مقالات منشورة على المدونة — تابعنا قريب. في الوقت ده أقدر أساعدك تدور على مشروع أو تحسب قسط.'
          : 'No published blog posts yet — check back soon. Meanwhile I can help you search projects or estimate installments.',
      }
    }
    const lines = posts.map((p, i) => {
      const title = ar && p.titleArabic ? p.titleArabic : p.title
      const bit = p.category ? ` — ${p.category}` : ''
      const snip = p.excerpt ? `\n   ${p.excerpt.replace(/\s+/g, ' ').trim().slice(0, 120)}` : ''
      return `${i + 1}. **${title}**${bit}${snip}\n   /blog/${p.slug}`
    })
    return {
      toolTag: 'site_knowledge',
      content: ar
        ? `أحدث مقالات مدونة غاية 👇\n\n${lines.join('\n\n')}\n\nكل المقالات هنا: /blog`
        : `Latest from the GHAYA blog 👇\n\n${lines.join('\n\n')}\n\nAll posts: /blog`,
    }
  }

  if (kind === 'PRESS') {
    const items = await getPressSnapshot(5)
    if (items.length === 0) {
      return {
        toolTag: 'site_knowledge',
        content: ar
          ? 'لسه مفيش بيانات صحفية منشورة — تابع /press عشان الجديد.'
          : 'No published press releases yet — watch /press for updates.',
      }
    }
    const lines = items.map((p, i) => {
      const title = ar && p.titleArabic ? p.titleArabic : p.title
      return `${i + 1}. **${title}**${p.source ? ` — ${p.source}` : ''}\n   /press/${p.slug}`
    })
    return {
      toolTag: 'site_knowledge',
      content: ar
        ? `أحدث أخبار غاية في الصحافة 👇\n\n${lines.join('\n\n')}\n\nكل البيانات هنا: /press`
        : `Latest GHAYA press 👇\n\n${lines.join('\n\n')}\n\nAll releases: /press`,
    }
  }

  if (kind === 'CAREERS') {
    const jobs = await getJobsSnapshot(8)
    if (jobs.length === 0) {
      return {
        toolTag: 'site_knowledge',
        content: ar
          ? 'مفيش وظايف مفتوحة دلوقتي — احنا على طول بندوّر على ناس شاطرة، عدّي على /careers كمان شوية.'
          : "No open positions at the moment — we're always looking for talent, check /careers again later.",
      }
    }
    const lines = jobs.map((j, i) => {
      const title = ar && j.titleArabic ? j.titleArabic : j.title
      return `${i + 1}. **${title}** — ${j.department} · ${j.location}\n   /careers/${j.slug}`
    })
    return {
      toolTag: 'site_knowledge',
      content: ar
        ? `الوظايف المفتوحة عندنا (${jobs.length}) — قدّم من صفحة الوظيفة 👇\n\n${lines.join('\n\n')}\n\nكل الوظايف هنا: /careers`
        : `Our open roles (${jobs.length}) — apply from the job page 👇\n\n${lines.join('\n\n')}\n\nAll jobs: /careers`,
    }
  }

  if (kind === 'OFFERS') {
    const offers = await getOffersSnapshot(5)
    if (offers.length === 0) {
      return {
        toolTag: 'site_knowledge',
        content: ar
          ? 'مفيش عروض كاش دلوقتي — المطورين لسه منزلوش خصومات. عدّي على /offers كمان شوية، أو اتفرج على /projects لحد ما ينزلوا.'
          : 'No cash offers right now — developers have not dropped discounts yet. Check /offers later, or browse /projects meanwhile.',
      }
    }
    const lines = offers.map((o, i) => {
      const name = ar && o.nameArabic ? o.nameArabic : o.name
      const price = o.startPrice ? (ar ? ` — يبدأ من ${fmtPriceAr(o.startPrice)}` : ` — from ${fmtPriceAr(o.startPrice)}`) : ''
      return `${i + 1}. **${name}**${o.city ? ` — ${o.city}` : ''} — ${ar ? `خصم كاش لحد ${o.maxDiscount}%` : `cash discount up to ${o.maxDiscount}%`}${price}\n   /projects/${o.slug}`
    })
    return {
      toolTag: 'site_knowledge',
      content: ar
        ? `عروض الكاش الشغالة حاليًا 👇\n\n${lines.join('\n\n')}\n\nكل العروض بالتفاصيل هنا: /offers`
        : `Live cash offers right now 👇\n\n${lines.join('\n\n')}\n\nAll offers with details: /offers`,
    }
  }

  if (kind === 'SITE_HELP') {
    const P = ar ? PLATFORM_AR : PLATFORM_EN
    const msg = message.toLowerCase()
    const nrm = normalizeAr(message)
    const isLegal = LEGAL_RES.some((r) => r.test(message) || r.test(nrm) || r.test(normalizeArLoose(message)))
    const isCompare = /قارن|مقارن|compare|\bvs\b|versus/.test(message) || /قارن|مقارن|compare|\bvs\b|versus/.test(msg)
    const isRole = /بروكر|مطور|وسيط|broker|developer/.test(message) || /بروكر|مطور|وسيط|broker|developer/.test(msg)
    if (isLegal) {
      const lines = (ar ? LEGAL_AR : LEGAL_EN).join('\n\n')
      return {
        toolTag: 'site_knowledge',
        content: ar
          ? `الصفحات القانونية باختصار (النص الكامل على الصفحة نفسها) 👇\n\n${lines}`
          : `Legal pages in short (full text lives on each page) 👇\n\n${lines}`,
      }
    }
    if (isCompare) {
      return {
        toolTag: 'site_knowledge',
        content: ar
          ? `المقارنة على الموقع 👇\n\n• ${P.compare}\n• ${P.tour}\n\nقولي اسم مشروعين وأنا أقارنهملك بالأرقام.`
          : `Comparing on the site 👇\n\n• ${P.compare}\n• ${P.tour}\n\nTell me two project names and I'll compare them by the numbers.`,
      }
    }
    if (isRole) {
      return {
        toolTag: 'site_knowledge',
        content: ar
          ? `👇\n\n• ${P.broker}\n• ${P.developer}\n\nولو بتدور على شغل عندنا شوف /careers.`
          : `👇\n\n• ${P.broker}\n• ${P.developer}\n\nJob seekers: see /careers.`,
      }
    }
    const lines = (ar ? LEGAL_AR : LEGAL_EN).join('\n\n')
    return {
      toolTag: 'site_knowledge',
      content: ar
        ? `خريطة الموقع باختصار 👇\n\n• ${P.locations}\n• ${P.offers}\n• ${P.compare}\n• ${P.saved}\n• ${P.tour}\n• ${P.faq}\n\n${lines}`
        : `Site map in short 👇\n\n• ${P.locations}\n• ${P.offers}\n• ${P.compare}\n• ${P.saved}\n• ${P.tour}\n• ${P.faq}\n\n${lines}`,
    }
  }

  if (kind === 'PROJECT_ABOUT') {
    const slug = await resolveProjectMention(message)
    if (!slug) return null // unknown name → existing general flow (honest "not found")
    const res = await toolGetProjectDetails(slug)
    if (!res.success) return null
    const d = res.data as any
    // Prefer the Arabic city name (DB city.name is English-only).
    let cityLabel: string | null = d.city || null
    try {
      const areas = await getAreasSnapshot()
      const match = areas.find((a) => a.name === d.city)
      if (match?.nameArabic) cityLabel = match.nameArabic
    } catch { /* Arabic label is a nicety — never fail the answer */ }
    const facts: string[] = []
    facts.push(ar ? `**${d.name}**${d.nameArabic ? ` (${d.nameArabic})` : ''}` : `**${d.name}**`)
    if (d.developerName) facts.push(ar ? `🏢 المطور: ${d.developerName}` : `🏢 Developer: ${d.developerName}`)
    if (d.city) facts.push(ar ? `📍 المكان: ${cityLabel}` : `📍 Location: ${d.city}`)
    if (d.startPrice) facts.push(ar ? `💰 يبدأ من ${fmtPriceAr(d.startPrice)}` : `💰 From ${fmtPriceAr(d.startPrice)}`)
    if (d.downPaymentMin != null) facts.push(ar ? `💳 مقدم من ${d.downPaymentMin}%` : `💳 Down payment from ${d.downPaymentMin}%`)
    if (d.installmentYears) facts.push(ar ? `📆 تقسيط حتى ${d.installmentYears} سنة` : `📆 Installments up to ${d.installmentYears} years`)
    if (d.completionPercent != null) facts.push(ar ? `📊 نسبة الإنجاز: ${d.completionPercent}%` : `📊 Completion: ${d.completionPercent}%`)
    if (d.description) {
      const snip = String(d.description).replace(/\s+/g, ' ').trim().slice(0, 280)
      if (snip) facts.push(`\n${snip}${d.description.length > 280 ? '…' : ''}`)
    }
    if (d.amenities?.length) facts.push(ar ? `\n🏊 ${d.amenities.slice(0, 6).join('، ')}` : `\n🏊 ${d.amenities.slice(0, 6).join(', ')}`)
    facts.push(ar ? `\nشوف كل التفاصيل والوحدات هنا: /projects/${d.slug}` : `\nFull details and units: /projects/${d.slug}`)
    return { toolTag: 'get_project_details', content: facts.join('\n') }
  }

  return null
}
