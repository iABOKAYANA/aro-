import type { PropertyFilterInput } from '@/lib/validations'

const LOCATION_MAP: Record<string, string> = {
  // English aliases → canonical DB City.nameSlug (verified against prod:
  // SELECT name, nameSlug FROM City). Every value below exists in the DB.
  // Entries that pointed at non-existent slugs (north-coast, badr,
  // sadat-city, mostakbal-city-as-city) matched ZERO rows — fixed or
  // moved to the governorate map.
  'new cairo': 'new-cairo',
  'fifth settlement': 'new-cairo',
  'fourth settlement': 'new-cairo',
  'sixth settlement': 'new-cairo',
  'tagamoa': 'new-cairo',
  'el tagamoa': 'new-cairo',
  'el-tagamoa': 'new-cairo',
  'madinaty': 'new-cairo',
  'mostakbal city': 'new-cairo',
  'mostakbal': 'new-cairo',
  'sheikh zayed': 'sheikh-zayed',
  'sheikh zayed city': 'sheikh-zayed',
  'zayed': 'sheikh-zayed',
  'new zayed': 'new-zayed',
  'new capital': 'new-capital-city',
  'new administrative capital': 'new-capital-city',
  'administrative capital': 'new-capital-city',
  '6th october': '6th-of-october-city',
  '6 october': '6th-of-october-city',
  'october gardens': '6th-of-october-city',
  'october': '6th-of-october-city',
  'el shorouk': 'el-shorouk',
  'shorouk': 'el-shorouk',
  'sokhna': 'ain-sokhna',
  'ain sokhna': 'ain-sokhna',
  'ain-sokhna': 'ain-sokhna',
  'el sokhna': 'ain-sokhna',
  'el alamein': 'al-alamein',
  'el-alamein': 'al-alamein',
  'new alamein': 'al-alamein',
  'dabaa': 'al-dabaa',
  'al dabaa': 'al-dabaa',
  'el hamam': 'el-hamam',
  'ras el hekma': 'ras-el-hekma',
  'ras elhekma': 'ras-el-hekma',
  'sidi abdel rahman': 'sidi-abdel-rahman',
  'sidi heneish': 'sidi-heneish',
  'el gouna': 'el-gouna',
  'gouna': 'el-gouna',
  'soma bay': 'somabay',
  'somabay': 'somabay',
  'makadi': 'makadi',
  'sahl hasheesh': 'sahl-hasheesh',
  'ras sudr': 'ras-sudr',
  'cairo': 'cairo',
  'nasr city': 'cairo',
  'maadi': 'cairo',
  'zamalek': 'cairo',
  'downtown': 'cairo',
  'heliopolis': 'cairo',
  'new heliopolis': 'cairo',
}

// English place words that resolve to a DB Governorate.nameSlug (there is
// no "North Coast" / "Giza" / "Hurghada" city row, so a city filter would
// return zero — governorate keeps them answerable).
const GOVERNORATE_MAP: Record<string, string> = {
  'north coast': 'matrouh',
  'sahel': 'matrouh',
  'marina': 'matrouh',
  'hacienda': 'matrouh',
  'marassi': 'matrouh',
  'marsa matruh': 'matrouh',
  'marsa matrouh': 'matrouh',
  'giza': 'giza',
  'hurghada': 'red-sea',
  'red sea': 'red-sea',
  'suez': 'suez',
}

// Arabic location mappings → canonical DB City.nameSlug. Values verified
// against prod City/District/Governorate rows. Matched longest-first so
// 'التجمع الخامس' beats 'التجمع' and 'نيو زايد' beats 'زايد'.
const LOCATION_MAP_AR: Record<string, string> = {
  'التجمع الخامس': 'new-cairo',
  'التجمع الرابع': 'new-cairo',
  'التجمع السادس': 'new-cairo',
  'التجمع الثالث': 'new-cairo',
  'التجمع الأول': 'new-cairo',
  'التجمع الاول': 'new-cairo',
  'التجمع': 'new-cairo',
  'القاهرة الجديدة': 'new-cairo',
  'مدينتي': 'new-cairo',
  'مدينة المستقبل': 'new-cairo',
  'المستقبل': 'new-cairo',
  'الشيخ زايد': 'sheikh-zayed',
  'زايد': 'sheikh-zayed',
  'نيو زايد': 'new-zayed',
  'العاصمة الإدارية': 'new-capital-city',
  'العاصمة الادارية': 'new-capital-city',
  'العاصمة الجديدة': 'new-capital-city',
  'العاصمة': 'new-capital-city',
  'مدينة 6 أكتوبر': '6th-of-october-city',
  '6 أكتوبر': '6th-of-october-city',
  '٦ أكتوبر': '6th-of-october-city',
  'حدائق أكتوبر': '6th-of-october-city',
  'حدائق اكتوبر': '6th-of-october-city',
  'اكتوبر': '6th-of-october-city',
  'أكتوبر': '6th-of-october-city',
  'مدينة نصر': 'cairo',
  'المعادي': 'cairo',
  'مصر الجديدة': 'cairo',
  'الزمالك': 'cairo',
  'وسط البلد': 'cairo',
  'القاهرة': 'cairo',
  'حلوان': 'cairo',
  'شبرا': 'cairo',
  'الشروق': 'el-shorouk',
  'العين السخنة': 'ain-sokhna',
  'عين سخنة': 'ain-sokhna',
  'عين السخنة': 'ain-sokhna',
  'العلمين الجديدة': 'al-alamein',
  'العلمين': 'al-alamein',
  'الضبعة': 'al-dabaa',
  'الضبعه': 'al-dabaa',
  'الحمام': 'el-hamam',
  'رأس الحكمة': 'ras-el-hekma',
  'راس الحكمة': 'ras-el-hekma',
  'رأس سدر': 'ras-sudr',
  'راس سدر': 'ras-sudr',
  'سيدي عبد الرحمن': 'sidi-abdel-rahman',
  'سيدي هنيش': 'sidi-heneish',
  'الجونة': 'el-gouna',
  'الجونه': 'el-gouna',
  'سوما باي': 'somabay',
  'مكادي': 'makadi',
  'سهل حشيش': 'sahl-hasheesh',
}

// Arabic place words → DB Governorate.nameSlug (no matching city row
// exists, so a city filter would return zero rows).
const GOVERNORATE_MAP_AR: Record<string, string> = {
  'الساحل الشمالي': 'matrouh',
  'الساحل': 'matrouh',
  'مارينا': 'matrouh',
  'هاسيندا': 'matrouh',
  'مراسي': 'matrouh',
  'مرسى مطروح': 'matrouh',
  'الجيزة': 'giza',
  'الجيزه': 'giza',
  'الغردقة': 'red-sea',
  'الغردقه': 'red-sea',
  'البحر الأحمر': 'red-sea',
  'البحر الاحمر': 'red-sea',
  'السويس': 'suez',
}

const PROPERTY_TYPE_MAP: Record<string, PropertyFilterInput['propertyType']> = {
  // English
  'apartment': 'APARTMENT',
  'flat': 'APARTMENT',
  'شقة': 'APARTMENT',
  'شقه': 'APARTMENT',
  'villa': 'VILLA',
  'فيلا': 'VILLA',
  'فلل': 'VILLA',
  'فيلات': 'VILLA',
  'penthouse': 'PENTHOUSE',
  'بنتهاوس': 'PENTHOUSE',
  'روف': 'PENTHOUSE',
  'رووف': 'PENTHOUSE',
  'roof': 'PENTHOUSE',
  'duplex': 'DUPLEX',
  'دوبلكس': 'DUPLEX',
  'double': 'DUPLEX',
  'townhouse': 'TOWNHOUSE',
  'تاون هاوس': 'TOWNHOUSE',
  'town house': 'TOWNHOUSE',
  'توين هاوس': 'TOWNHOUSE',
  'توين': 'TOWNHOUSE',
  'twin house': 'TOWNHOUSE',
  'twinhouse': 'TOWNHOUSE',
  'twin_house': 'TOWNHOUSE',
  'twin': 'TOWNHOUSE',
  'studio': 'STUDIO',
  'استوديو': 'STUDIO',
  'استديو': 'STUDIO',
  'chalet': 'CHALET',
  'chalets': 'CHALET',
  'شاليه': 'CHALET',
  'شاليهات': 'CHALET',
  'شقق': 'APARTMENT',
  'commercial': 'COMMERCIAL',
  'تجاري': 'COMMERCIAL',
  'محل': 'COMMERCIAL',
  'محلات': 'COMMERCIAL',
  'دكاني': 'COMMERCIAL',
  'land': 'LAND',
  'أرض': 'LAND',
  'ارض': 'LAND',
  'أراضي': 'LAND',
  'اراضي': 'LAND',
  'medical': 'MEDICAL',
  'طبي': 'MEDICAL',
  'عيادة': 'MEDICAL',
  'عيادات': 'MEDICAL',
  'admin': 'ADMINISTRATIVE',
  'إداري': 'ADMINISTRATIVE',
  'مكتب': 'ADMINISTRATIVE',
  'office': 'ADMINISTRATIVE',
}

const LISTING_TYPE_MAP: Record<string, PropertyFilterInput['listingType']> = {
  'sale': 'SALE',
  'sell': 'SALE',
  'for sale': 'SALE',
  'بيع': 'SALE',
  'للبيع': 'SALE',
  'rent': 'RENT',
  'for rent': 'RENT',
  'إيجار': 'RENT',
  'للايجار': 'RENT',
  'للاستئجار': 'RENT',
  'resale': 'RESALE',
  'إعادة بيع': 'RESALE',
  'ثاني': 'RESALE',
  'تاني': 'RESALE',
  'installment': 'INSTALLMENT',
  'تقسيط': 'INSTALLMENT',
  'أقساط': 'INSTALLMENT',
  'تقسيطات': 'INSTALLMENT',
  'installments': 'INSTALLMENT',
  'payment plan': 'INSTALLMENT',
  'long payment': 'INSTALLMENT',
  'long installments': 'INSTALLMENT',
  'قسط': 'INSTALLMENT',
  'مقدم': 'INSTALLMENT',
  'down payment': 'INSTALLMENT',
}

// ─── Digit normalization ─────────────────────────────
// Users often type Arabic-Indic digits (٣ أوض، ٨ مليون). The regexes below
// only match ASCII digits, so normalize both Arabic-Indic (٠-٩) and Eastern
// Arabic-Indic (۰-۹) digits to 0-9 before any parsing.
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
export function normalizeDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/٫/g, '.')
    .replace(/٬/g, '')
}

// Price magnitude: مليون/million → ×1e6, ألف → ×1e3. Detection is
// text-wide on purpose — mixed "5 مليون و 500 ألف" is vanishingly rare in
// chat queries, and a bare number with ألف must not become millions.
function priceMultiplier(text: string): number {
  if (/ألف|الاف|الآف|thousand/i.test(text) && !/مليون|مليون|million/i.test(text)) return 1_000
  return 1_000_000
}

function parsePrice(text: string): { minPrice?: number; maxPrice?: number } {
  const result: { minPrice?: number; maxPrice?: number } = {}
  const mult = priceMultiplier(text)

  // Pattern: "from X to Y" / "between X and Y" / "من X لـ Y" / "من X الى Y" / "من X إلى Y"
  const betweenMatch = text.match(/(?:between|from|من)\s*([\d,.]+)\s*(?:to|and|-\s*|لـ|الى|إلى|حتى)\s*([\d,.]+)\s*(?:million|m|مليون|ألف|الاف|الف|جنيه|egp|thousand)?/i)
  if (betweenMatch) {
    result.minPrice = parseNumber(betweenMatch[1]) * mult
    result.maxPrice = parseNumber(betweenMatch[2]) * mult
    return result
  }

  // Pattern: "under X" / "below X" / "أقل من X" / "تحت X" / "لحد X"
  const underMatch = text.match(/(?:under|below|less than|up to|maximum|max|أقل من|اقل من|تحت|لحد|لغاية|لغايه|بحد أقصى|بحد اقصي|لا يزيد عن|مش اكتر من|مش أكتر من)\s*([\d,.]+)\s*(?:million|m|مليون|ألف|الاف|الف|جنيه|egp|thousand)?/i)
  if (underMatch) {
    result.maxPrice = parseNumber(underMatch[1]) * mult
    return result
  }

  // Pattern: "over X" / "above X" / "أكثر من X" / "فوق X" / "يبدأ من X"
  const overMatch = text.match(/(?:over|above|more than|starting from|from|أكثر من|أكتر من|اكثر من|اكتر من|فوق|ابتداء من|يبدأ من|يبتدي من|بداية من|بدايه من)\s*([\d,.]+)\s*(?:million|m|مليون|ألف|الاف|الف|جنيه|egp|thousand)?/i)
  if (overMatch) {
    result.minPrice = parseNumber(overMatch[1]) * mult
    return result
  }

  // Pattern: "X million" as standalone (interpret as max price)
  const singleMatch = text.match(/(?:معايا|عندي|ميزانيتي|بـ|Budget)?\s*([\d,.]+)\s*(?:million|m|مليون|ألف|الاف|الف|thousand)/i)
  if (singleMatch && !result.minPrice && !result.maxPrice) {
    result.maxPrice = parseNumber(singleMatch[1]) * mult
    return result
  }

  // Pattern: "X M" or "Xm"
  const shortMatch = text.match(/([\d,.]+)\s*[mM](?:\s|$|,|\.)/)
  if (shortMatch && !result.minPrice && !result.maxPrice) {
    result.maxPrice = parseNumber(shortMatch[1]) * 1_000_000
  }

  // Pattern: a bare 7+-digit figure ("8000000", "8000000 جنيه") = max price
  if (!result.minPrice && !result.maxPrice) {
    const bigMatch = text.match(/(\d{7,})\s*(?:جنيه|egp|le)?/i)
    if (bigMatch) result.maxPrice = parseNumber(bigMatch[1])
  }

  return result
}

function parseNumber(str: string): number {
  return parseFloat(str.replace(/,/g, ''))
}

const AR_BEDROOM_WORD = '(?:غرف|غرفة|غرفه|نوم|أوض|اوض|أوضة|اوضة|أوده|اوده|أود|اود)'

function parseBedrooms(text: string): number | undefined {
  // "3 bedroom" / "3 غرفة" / "3 أوض" (digits already normalized upstream)
  const enMatch = text.match(/(\d+)\s*(?:bedroom|bed|room|br|bd)/i)
  if (enMatch) return parseInt(enMatch[1])

  const arMatch = text.match(new RegExp(`(\\d+)\\s*${AR_BEDROOM_WORD}`, 'i'))
  if (arMatch) return parseInt(arMatch[1])

  // Dual form: "غرفتين" / "اوضتين"
  if (/(غرفتين|اوضتين|أوضتين)/i.test(text)) return 2

  // Spelled-out numbers + a bedroom word ("ثلاث غرف"، "three bedrooms")
  const spelled: Record<string, number> = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6,
    'واحد': 1, 'واحده': 1, 'واحدة': 1,
    'اتنين': 2, 'اثنين': 2, 'اثنان': 2,
    'تلاته': 3, 'ثلاثه': 3, 'ثلاث': 3, 'ثلاثة': 3,
    'اربع': 4, 'أربع': 4, 'اربعه': 4, 'أربعه': 4, 'أربعة': 4,
    'خمس': 5, 'خمسه': 5, 'خمسة': 5,
    'ست': 6, 'سته': 6, 'ستة': 6,
  }
  const noBath = text.replace(/bathrooms?/gi, ' ')
  const hasBedWord = new RegExp(AR_BEDROOM_WORD, 'i').test(text)
    || /(bedrooms?|beds?|rooms?)/i.test(noBath)
  if (hasBedWord) {
    const lower = text.toLowerCase()
    for (const [word, num] of Object.entries(spelled)) {
      if (lower.includes(word)) return num
    }
  }

  return undefined
}

// Longest-key-first so specific aliases win ('التجمع الخامس' beats
// 'التجمع', 'نيو زايد' beats 'زايد', 'new administrative capital' beats
// 'new capital').
function byLengthDesc<K extends string>(map: Record<K, string>): Array<[string, string]> {
  return Object.entries<string>(map).sort((a, b) => b[0].length - a[0].length) as Array<[string, string]>
}

export interface ResolvedPlace {
  city?: string
  governorate?: string
}

// Resolve free text (or a model-supplied display name) to DB slugs.
// Accepts Arabic aliases, English aliases, and already-canonical slugs.
export function resolvePlace(text: string): ResolvedPlace {
  if (!text || typeof text !== 'string') return {}
  const lower = text.toLowerCase().trim()

  const knownCities = new Set<string>([
    ...Object.values(LOCATION_MAP),
    ...Object.values(LOCATION_MAP_AR),
  ])
  const knownGovs = new Set<string>([
    ...Object.values(GOVERNORATE_MAP),
    ...Object.values(GOVERNORATE_MAP_AR),
  ])
  if (knownCities.has(lower)) return { city: lower }
  if (knownGovs.has(lower)) return { governorate: lower }

  for (const [keyword, slug] of byLengthDesc(LOCATION_MAP)) {
    if (lower.includes(keyword)) return { city: slug }
  }
  for (const [keyword, slug] of byLengthDesc(LOCATION_MAP_AR)) {
    if (text.includes(keyword)) return { city: slug }
  }
  for (const [keyword, slug] of byLengthDesc(GOVERNORATE_MAP)) {
    if (lower.includes(keyword)) return { governorate: slug }
  }
  for (const [keyword, slug] of byLengthDesc(GOVERNORATE_MAP_AR)) {
    if (text.includes(keyword)) return { governorate: slug }
  }
  return {}
}

function parseLocation(text: string): string | undefined {
  return resolvePlace(text).city
}

function parseGovernorate(text: string): string | undefined {
  return resolvePlace(text).governorate
}

// Normalize a single tool-arg value (what the LLM passes to
// search_projects/search_units) to canonical DB slugs. Returns {} when the
// value resolves to nothing — callers drop the filter instead of
// exact-matching a display name ("New Cairo") against nameSlug and
// returning zero rows.
export function normalizeCityInput(raw: unknown): ResolvedPlace {
  return resolvePlace(typeof raw === 'string' ? raw : '')
}

const VALID_PROPERTY_TYPES = new Set<string>([
  'APARTMENT', 'VILLA', 'TOWNHOUSE', 'PENTHOUSE', 'STUDIO',
  'DUPLEX', 'CHALET', 'LAND', 'COMMERCIAL', 'ADMINISTRATIVE', 'MEDICAL',
])

export function normalizePropertyTypeInput(raw: unknown): PropertyFilterInput['propertyType'] | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined
  const upper = raw.trim().toUpperCase().replace(/[\s-]+/g, '_')
  if (VALID_PROPERTY_TYPES.has(upper)) return upper as PropertyFilterInput['propertyType']
  return parsePropertyType(raw)
}

const VALID_LISTING_TYPES = new Set<string>(['SALE', 'RENT', 'RESALE', 'INSTALLMENT'])

export function normalizeListingTypeInput(raw: unknown): PropertyFilterInput['listingType'] | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined
  const upper = raw.trim().toUpperCase()
  if (VALID_LISTING_TYPES.has(upper)) return upper as PropertyFilterInput['listingType']
  return parseListingType(raw)
}

function parsePropertyType(text: string): PropertyFilterInput['propertyType'] | undefined {
  const lower = text.toLowerCase()

  // 'أرض' is a substring of 'الأرضي' (ground floor) — a floor hint, not land.
  const landBlocked = /(أرضي|ارضي)/.test(text)

  for (const [keyword, type] of Object.entries(PROPERTY_TYPE_MAP)) {
    if ((keyword === 'أرض' || keyword === 'ارض') && landBlocked) continue
    if (lower.includes(keyword)) return type
  }

  return undefined
}

function parseListingType(text: string): PropertyFilterInput['listingType'] | undefined {
  const lower = text.toLowerCase()

  // Special: "أقل مقدم" = cheapest down payment = installment
  if (text.includes('أقل مقدم') || text.includes('اقل مقدم') || lower.includes('lowest down payment') || lower.includes('cheapest down')) {
    return 'INSTALLMENT'
  }

  // Check multi-word phrases first
  const phrases = ['for rent', 'for sale', 'payment plan', 'long payment', 'long installments', 'down payment']
  for (const phrase of phrases) {
    if (lower.includes(phrase)) {
      const result = LISTING_TYPE_MAP[phrase]
      if (result) return result
    }
  }

  for (const [keyword, type] of Object.entries(LISTING_TYPE_MAP)) {
    if (keyword.length > 2 && lower.includes(keyword)) return type
  }

  return undefined
}

function parseArea(text: string): { minArea?: number; maxArea?: number } {
  const result: { minArea?: number; maxArea?: number } = {}

  const betweenMatch = text.match(/(?:between|from|من)\s*([\d,.]+)\s*(?:to|and|-\s*|لـ|الى|حتى)\s*([\d,.]+)\s*(?:m2|sqm|م2|متر|meter|sq\.?\s*m)/i)
  if (betweenMatch) {
    result.minArea = parseNumber(betweenMatch[1])
    result.maxArea = parseNumber(betweenMatch[2])
    return result
  }

  const underMatch = text.match(/(?:under|below|less than|أقل من)\s*([\d,.]+)\s*(?:m2|sqm|م2|متر|meter)/i)
  if (underMatch) {
    result.maxArea = parseNumber(underMatch[1])
    return result
  }

  const singleMatch = text.match(/([\d,.]+)\s*(?:m2|sqm|م2|متر|meter)/i)
  if (singleMatch) {
    result.minArea = parseNumber(singleMatch[1])
  }

  return result
}

function parseDeveloper(text: string): string | undefined {
  const developers: Record<string, string> = {
    'sodic': 'SODIC',
    'mountain view': 'Mountain View',
    'emaar': 'Emaar',
    'palm hills': 'Palm Hills',
    'talaat moustafa': 'Talaat Moustafa Group',
    'tmg': 'Talaat Moustafa Group',
    'dar al-mimar': 'Dar Al-Mimar',
    'dar al mimar': 'Dar Al-Mimar',
    'reef': 'Reef Development',
    'tatweer': 'Tatweer Misr',
    'tatweer misr': 'Tatweer Misr',
    'orabia': 'Orabi Group',
    'rozen': 'Rozen Homes',
    'delta': 'Delta Homes',
    'city edge': 'City Edge',
    'compressed': 'BESIX',
    'besix': 'BESIX',
    'hassan allam': 'Hassan Allam',
    'allam': 'Hassan Allam',
    'al futtaim': 'Al Futtaim',
    'futtaim': 'Al Futtaim',
    'memaar': 'Memaar Properties',
    'memar': 'Memaar Properties',
    'ornia': 'Ornia',
    'premier': 'Premier Group',
    'pioneers': 'Pioneers Properties',
    'upward': 'Upward Development',
    'crystal': 'Crystal Lagoons',
  }

  const lower = text.toLowerCase()
  for (const [keyword, name] of Object.entries(developers)) {
    if (lower.includes(keyword)) return name
  }
  return undefined
}

function parseFinishing(text: string): string | undefined {
  const lower = text.toLowerCase()
  if (lower.includes('semi finished') || lower.includes('نص تشطيب')) return 'SEMI_FINISHED'
  if (lower.includes('finished') || lower.includes('تشطيب') || lower.includes('جاهز')) return 'FINISHED'
  if (lower.includes('core') || lower.includes('basic')) return 'CORE_SHELL'
  if (lower.includes('super') || lower.includes('premium')) return 'SUPER_LUXURY'
  return undefined
}

function parseDelivery(text: string): { maxDeliveryYears?: number } | undefined {
  const match = text.match(/(?:delivery|وصول|تسليم|استلام)\s*(?:within|في|بعد|within)?\s*(\d+)\s*(?:year|سنة|سنه|سنوات)/i)
  if (match) return { maxDeliveryYears: parseInt(match[1]) }

  const arMatch = text.match(/(\d+)\s*(?:year|سنة|سنه|سنوات)\s*(?:delivery|وصول|تسليم|استلام)/i)
  if (arMatch) return { maxDeliveryYears: parseInt(arMatch[1]) }

  return undefined
}

function parseReady(text: string): boolean | undefined {
  const lower = text.toLowerCase()
  if (lower.includes('ready') || lower.includes('جاهز') || lower.includes('مسموح') || lower.includes('مستلم') || lower.includes('delivery immediately') || lower.includes('fika')) return true
  return undefined
}

export interface ParsedFilters {
  filters: PropertyFilterInput
  summary: Array<{ label: string; value: string; field: string }>
  confidence: number
}

export function parseNaturalLanguageQuery(query: string): ParsedFilters {
  query = normalizeDigits(query)
  const filters: PropertyFilterInput = {
    page: 1,
    limit: 12,
  }
  const summary: Array<{ label: string; value: string; field: string }> = []
  let confidenceScore = 0
  let totalChecks = 0

  // Location (city first, then governorate for coast-level concepts like
  // الساحل that have no city row — a city filter there would match zero)
  totalChecks++
  const location = parseLocation(query)
  if (location) {
    filters.city = location
    summary.push({ label: 'Location', value: location.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), field: 'city' })
    confidenceScore++
  } else {
    const governorate = parseGovernorate(query)
    if (governorate) {
      filters.governorate = governorate
      summary.push({ label: 'Region', value: governorate.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), field: 'governorate' })
      confidenceScore++
    }
  }

  // Property type
  totalChecks++
  const propertyType = parsePropertyType(query)
  if (propertyType) {
    filters.propertyType = propertyType
    summary.push({ label: 'Type', value: propertyType.charAt(0) + propertyType.slice(1).toLowerCase(), field: 'propertyType' })
    confidenceScore++
  }

  // Bedrooms
  totalChecks++
  const bedrooms = parseBedrooms(query)
  if (bedrooms !== undefined) {
    filters.bedrooms = bedrooms
    summary.push({ label: 'Bedrooms', value: String(bedrooms), field: 'bedrooms' })
    confidenceScore++
  }

  // Price
  totalChecks++
  const price = parsePrice(query)
  if (price.minPrice) {
    filters.minPrice = price.minPrice
    summary.push({ label: 'Min Price', value: `${(price.minPrice / 1_000_000).toFixed(0)}M`, field: 'minPrice' })
    confidenceScore++
  }
  if (price.maxPrice) {
    filters.maxPrice = price.maxPrice
    summary.push({ label: 'Max Price', value: `${(price.maxPrice / 1_000_000).toFixed(0)}M`, field: 'maxPrice' })
    confidenceScore++
  }

  // Listing type
  totalChecks++
  const listingType = parseListingType(query)
  if (listingType) {
    filters.listingType = listingType
    summary.push({ label: 'Listing', value: listingType, field: 'listingType' })
    confidenceScore++
  }

  // Area
  totalChecks++
  const area = parseArea(query)
  if (area.minArea) {
    filters.minArea = area.minArea
    summary.push({ label: 'Min Area', value: `${area.minArea} m²`, field: 'minArea' })
    confidenceScore++
  }
  if (area.maxArea) {
    filters.maxArea = area.maxArea
    summary.push({ label: 'Max Area', value: `${area.maxArea} m²`, field: 'maxArea' })
    confidenceScore++
  }

  // Developer
  totalChecks++
  const developer = parseDeveloper(query)
  if (developer) {
    summary.push({ label: 'Developer', value: developer, field: 'developer' })
    confidenceScore++
  }

  // Finishing
  totalChecks++
  const finishing = parseFinishing(query)
  if (finishing) {
    filters.finishingType = finishing
    summary.push({ label: 'Finishing', value: finishing.replace(/_/g, ' '), field: 'finishingType' })
    confidenceScore++
  }

  // Delivery
  totalChecks++
  const delivery = parseDelivery(query)
  if (delivery?.maxDeliveryYears) {
    summary.push({ label: 'Delivery', value: `≤ ${delivery.maxDeliveryYears} years`, field: 'delivery' })
    confidenceScore++
  }

  // Ready
  totalChecks++
  const ready = parseReady(query)
  if (ready) {
    summary.push({ label: 'Availability', value: 'Ready / Delivered', field: 'ready' })
    confidenceScore++
  }

  // Sort preference
  const lower = query.toLowerCase()
  if (lower.includes('cheapest') || lower.includes('أقل سعر') || lower.includes('low price') || lower.includes(' affordable')) {
    filters.sortBy = 'price_asc'
    summary.push({ label: 'Sort', value: 'Price: Low to High', field: 'sortBy' })
  } else if (lower.includes('highest') || lower.includes('أعلى سعر') || lower.includes('luxury') || lower.includes('فاخر')) {
    filters.sortBy = 'price_desc'
    summary.push({ label: 'Sort', value: 'Price: High to Low', field: 'sortBy' })
  } else if (lower.includes('popular') || lower.includes('أشهر') || lower.includes('أفضل')) {
    filters.sortBy = 'popular'
    summary.push({ label: 'Sort', value: 'Most Popular', field: 'sortBy' })
  }

  const confidence = totalChecks > 0 ? Math.round((confidenceScore / totalChecks) * 100) : 0

  return { filters, summary, confidence }
}

// ─── Listing-intent detection ──────────────────────────
// True when the message asks to buy/rent/search in EITHER language: an
// explicit search verb (وريني، عايز، show me…) OR ≥2 concrete listing slots
// (place/type/rooms/budget/installment). Single-slot messages ("بكام؟",
// "فين؟") stay conversational. Used by the chat fallback so a listing
// question never returns with zero data when inventory matches.
const LISTING_VERBS = [
  'وريني', 'ورينى', 'هاتلي', 'هاتلى', 'عايز', 'عايزه', 'عاوز', 'محتاج',
  'ابحث', 'دورلي', 'دورلى', 'اعرض', 'اعرضلى', 'شوفلي', 'شوفلى', 'ايه المتاح',
  'إيه المتاح', 'عندكم', 'عندكو', 'متاح', 'متوفر', 'ابعتلي',
  'show me', 'find me', 'search for', 'looking for', 'i want', 'i need',
  'do you have', 'any available', 'list', 'browse',
]

const BUY_RENT_WORDS = [
  'buy', 'rent', 'sale', 'resale', 'lease', 'book', 'reserve',
  'بيع', 'شرا', 'اشتري', 'أشتري', 'ايجار', 'إيجار', 'للايجار', 'استئجار',
  'احجز', 'أحجز', 'حجز', 'تقسيط', 'قسط', 'مقدم',
  'شقة', 'شقه', 'فيلا', 'تاون', 'دوبلكس', 'بنتهاوس', 'استوديو',
  'استديو', 'شاليه', 'مكتب', 'محل', 'عيادة', 'أرض', 'ارض',
  'apartment', 'flat', 'villa', 'townhouse', 'penthouse', 'duplex',
  'studio', 'chalet', 'office', 'commercial',
]

export function hasListingIntent(text: string): boolean {
  const q = normalizeDigits(text)
  const lower = q.toLowerCase()
  if (LISTING_VERBS.some((v) => lower.includes(v))) return true
  const { summary } = parseNaturalLanguageQuery(q)
  const slots = new Set(
    summary.filter((s) => s.field !== 'sortBy' && s.field !== 'developer').map((s) => s.field),
  )
  if (slots.size >= 2) return true
  // One concrete slot + a buy/rent noun still counts ("شقة للبيع").
  if (slots.size >= 1 && BUY_RENT_WORDS.some((w) => lower.includes(w))) return true
  return false
}
