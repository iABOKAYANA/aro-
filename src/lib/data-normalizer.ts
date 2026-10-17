// ─── AI DATA CLEANER / NORMALIZATION LAYER (Feature 4) ─────
// Deterministic normalization of messy real-estate inputs.
// Hard rules:
//   • NEVER invent missing information — unknown → { value: null, needsReview: true }.
//   • Always preserve the original raw string for auditing.
//   • When confidence is low the result is marked "Needs Review" for CEO/ADMIN.

export interface NormResult<T> {
  original: string
  value: T | null
  normalized: string | null   // display form of the cleaned value
  confidence: number          // 0..1
  needsReview: boolean
  reason?: string
}

function fail<T>(original: string, reason: string): NormResult<T> {
  return { original, value: null, normalized: null, confidence: 0, needsReview: true, reason }
}

function ok<T>(original: string, value: T, normalized: string, confidence = 1): NormResult<T> {
  return { original, value, normalized, confidence, needsReview: confidence < 0.7 }
}

// Arabic-Indic + Persian digits → ASCII
const ARABIC_DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
}
export function toAsciiDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (d) => ARABIC_DIGITS[d] ?? d)
}

function toNumber(raw: string): number | null {
  const s = toAsciiDigits(raw).replace(/[,\s]/g, '')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

// ─── Area ─────────────────────────────────────────────────
// "160 m", "160m²", "160 SQM", "160 متر", "160م²"  →  160 m²
export function normalizeArea(input: unknown): NormResult<number> {
  const original = String(input ?? '').trim()
  if (!original) return fail('Area input empty', 'EMPTY')
  const cleaned = toAsciiDigits(original).toLowerCase()
  const m = cleaned.match(/(-?\d+(?:\.\d+)?)/)
  if (!m) return fail(original, 'No numeric value found')
  const value = parseFloat(m[1])
  if (!Number.isFinite(value) || value <= 0) return fail(original, 'Area must be a positive number')
  if (value > 100_000) return fail(original, 'Area unreasonably large — verify manually')
  const hasUnit = /m²|m2|sqm|sq\.?m|square met|mتر|متر|مربع|meter/.test(cleaned)
  return ok(original, value, `${value} m²`, hasUnit ? 1 : 0.75)
}

// ─── Price ────────────────────────────────────────────────
// "7.2M", "7.2 مليون", "7,200,000", "٧.٢م"  →  7,200,000
export function normalizePrice(input: unknown): NormResult<number> {
  const original = String(input ?? '').trim()
  if (!original) return fail('Price input empty', 'EMPTY')
  const cleaned = toAsciiDigits(original).toLowerCase().replace(/egp|جنيه|ج\.م|egp\./g, '')
  const m = cleaned.match(/(\d+(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*([a-z\u0600-\u06FF]*)/)
  if (!m) return fail(original, 'No numeric value found')
  let value = parseFloat(m[1].replace(/,/g, ''))
  const suffix = (m[2] || '').trim()
  const isMillion = /^(m|mn|million|مليون|م)$/.test(suffix)
  const isThousand = /^(k|thousand|ألف|الف|kilo)$/.test(suffix)
  if (isMillion) value *= 1_000_000
  else if (isThousand) value *= 1_000
  if (!Number.isFinite(value) || value <= 0) return fail(original, 'Price must be a positive number')
  if (value >= 1 && value < 1000 && !isMillion && !isThousand) {
    // e.g. "7.2" with no unit — ambiguous scale, needs review rather than a guess
    return { original, value: null, normalized: null, confidence: 0.4, needsReview: true, reason: 'Number has no unit suffix (M/K) — scale ambiguous' }
  }
  const confidence = isMillion || isThousand ? 1 : /[\d,]{4,}/.test(m[1]) ? 1 : 0.8
  const display = value >= 1_000_000 ? `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 2).replace(/\.00$/, '')}M EGP` : `${value.toLocaleString('en-US')} EGP`
  return ok(original, Math.round(value * 100) / 100, display, confidence)
}

// ─── Currency ─────────────────────────────────────────────
export function normalizeCurrency(input: unknown): NormResult<string> {
  const original = String(input ?? '').trim()
  if (!original) return fail('Currency input empty', 'EMPTY')
  const cleaned = toAsciiDigits(original).toUpperCase()
  if (/EGP|جنيه|ج\.م|LE/.test(cleaned)) return ok(original, 'EGP', 'EGP')
  if (/USD|\$|DOLLAR/.test(cleaned)) return ok(original, 'USD', 'USD')
  if (/EUR|€/.test(cleaned)) return ok(original, 'EUR', 'EUR')
  return fail(original, 'Unrecognized currency')
}

// ─── Bedrooms / Bathrooms ─────────────────────────────────
const NUMBER_WORDS: Record<string, number> = {
  studio: 0,استوديو: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  واحد: 1, اثنين: 2, اثنان: 2, ثلاثة: 3, ثلاث: 3, أربعة: 4, اربعة: 4, خمسة: 5,ستة: 6,
}
export function normalizeCount(input: unknown, kind: 'bedrooms' | 'bathrooms'): NormResult<number> {
  const original = String(input ?? '').trim()
  if (!original) return fail(`${kind} input empty`, 'EMPTY')
  const cleaned = toAsciiDigits(original).toLowerCase()
  const digitMatch = cleaned.match(/(\d+)/)
  if (digitMatch) {
    const value = parseInt(digitMatch[1], 10)
    const max = kind === 'bedrooms' ? 15 : 15
    if (value < 0 || value > max) return fail(original, `Unrealistic ${kind} count`)
    return ok(original, value, String(value))
  }
  for (const [word, n] of Object.entries(NUMBER_WORDS)) {
    if (cleaned.includes(word)) return ok(original, n, String(n), 0.9)
  }
  return fail(original, `Could not read ${kind} count`)
}

// ─── Property type ────────────────────────────────────────
const TYPE_MAP: Record<string, string> = {
  apartment: 'APARTMENT', flat: 'APARTMENT',شقه: 'APARTMENT', شقة: 'APARTMENT', villa: 'VILLA', فيلا: 'VILLA',
  townhouse: 'TOWNHOUSE', 'town house': 'TOWNHOUSE','تاون هاوس': 'TOWNHOUSE',
  penthouse: 'PENTHOUSE',بنتهاوس: 'PENTHOUSE', duplex: 'DUPLEX',دوبلكس: 'DUPLEX',
  studio: 'STUDIO',استوديو: 'STUDIO', commercial: 'COMMERCIAL',تجاري: 'COMMERCIAL',
  land: 'LAND',أرض: 'LAND', ارض: 'LAND', medical: 'MEDICAL',طبي: 'MEDICAL',
  admin: 'ADMINISTRATIVE', office: 'ADMINISTRATIVE',مكتب: 'ADMINISTRATIVE',إداري: 'ADMINISTRATIVE',
  chalet: 'CHALET',شاليه: 'CHALET', twin: 'TWIN_HOUSE', 'duplex apartment': 'DUPLEX',
}
export function normalizePropertyType(input: unknown): NormResult<string> {
  const original = String(input ?? '').trim()
  if (!original) return fail('Property type empty', 'EMPTY')
  const cleaned = toAsciiDigits(original).toLowerCase().trim()
  for (const [key, value] of Object.entries(TYPE_MAP)) {
    if (cleaned === key) return ok(original, value, value)
  }
  for (const [key, value] of Object.entries(TYPE_MAP)) {
    if (cleaned.includes(key)) return ok(original, value, value, 0.85)
  }
  return fail(original, 'Unknown property type')
}

// ─── Location ─────────────────────────────────────────────
const LOCATION_MAP: Record<string, string> = {
  'new cairo': 'new-cairo', 'fifth settlement': 'new-cairo', tagamoa: 'new-cairo', 'el tagamoa': 'new-cairo',
  'sheikh zayed': 'sheikh-zayed', 'new capital': 'new-capital', '6th october': '6th-october', '6 october': '6th-october',
  'north coast': 'north-coast', 'el alamein': 'el-alamein', 'el-alamein': 'el-alamein',
  cairo: 'cairo', giza: 'giza', alexandria: 'alexandria', 'ain sokhna': 'ain-sokhna', shorouk: 'shorouk', badr: 'badr',
  'mostakbal city': 'mostakbal-city', 'sadat city': 'sadat-city',
}
const LOCATION_MAP_AR: Record<string, string> = {
  'التجمع الخامس': 'new-cairo', 'التجمع': 'new-cairo', 'الشيخ زاية': 'sheikh-zayed', 'الشيخ زايد': 'sheikh-zayed',
  'العاصمة الإدارية': 'new-capital', 'العاصمة الجديدة': 'new-capital', '6 أكتوبر': '6th-october',
  'الساحل الشمالي': 'north-coast', 'الإسكندرية': 'alexandria', 'القاهرة': 'cairo', 'الجيزة': 'giza',
  'الشروق': 'shorouk', 'بدر': 'badr', 'عين سخنة': 'ain-sokhna', 'العلمين': 'el-alamein', 'معادي': 'cairo', 'مصر الجديدة': 'cairo',
}
export function normalizeLocation(input: unknown): NormResult<string> {
  const original = String(input ?? '').trim()
  if (!original) return fail('Location empty', 'EMPTY')
  const cleaned = original.toLowerCase().replace(/\s+/g, ' ').trim()
  if (LOCATION_MAP[cleaned]) return ok(original, LOCATION_MAP[cleaned], LOCATION_MAP[cleaned])
  if (LOCATION_MAP_AR[original]) return ok(original, LOCATION_MAP_AR[original], LOCATION_MAP_AR[original])
  for (const [key, slug] of Object.entries(LOCATION_MAP)) {
    if (key && cleaned.includes(key)) return ok(original, slug, slug, 0.85)
  }
  for (const [key, slug] of Object.entries(LOCATION_MAP_AR)) {
    if (original.includes(key)) return ok(original, slug, slug, 0.85)
  }
  // A single word/phrase could still be a valid place we simply don't map
  if (/^[\w\u0600-\u06FF\s'-]{3,40}$/.test(original)) {
    return { original, value: original.replace(/\s+/g, ' ').trim(), normalized: original.replace(/\s+/g, ' ').trim(), confidence: 0.5, needsReview: true, reason: 'Not in the known location list — confirm before publishing' }
  }
  return fail(original, 'Unrecognized location')
}

// ─── Delivery / date ──────────────────────────────────────
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
}
const MONTHS_AR: Record<string, number> = {
  'يناير': 1, 'فبراير': 2, 'مارس': 3, 'أبريل': 4, 'ابريل': 4, 'مايو': 5, 'يونيو': 6,
  'يوليو': 7, 'أغسطس': 8, 'اغسطس': 8, 'سبتمبر': 9, 'أكتوبر': 10, 'اكتوبر': 11, 'نوفمبر': 12, 'ديسمبر': 13,
}
export function normalizeDate(input: unknown): NormResult<string> {
  const original = String(input ?? '').trim()
  if (!original) return fail('Date input empty', 'EMPTY')
  const cleaned = toAsciiDigits(original).toLowerCase().trim()

  // ISO-ish: 2026-09-30 / 30/09/2026 / 09-30-2026
  const iso = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return ok(original, new Date(+iso[1], +iso[2] - 1, +iso[3]).toISOString(), `${iso[3].padStart(2, '0')}/${iso[2].padStart(2, '0')}/${iso[1]}`)
  const slash = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
  if (slash) {
    const d = new Date(+slash[3], +slash[2] - 1, +slash[1])
    if (!isNaN(d.getTime())) return ok(original, d.toISOString(), `${slash[1].padStart(2, '0')}/${slash[2].padStart(2, '0')}/${slash[3]}`)
  }

  // Quarter: "2026 Q3", "Q3 2026", "الربع الثالث 2026"
  const quarter = cleaned.match(/q\s*([1-4])\s*(?:of\s*)?(\d{4})?/) || cleaned.match(/(\d{4}).*q\s*([1-4])/)
  if (quarter) {
    const q = parseInt(quarter[1], 10)
    const year = parseInt(quarter[2] || String(new Date().getFullYear()), 10)
    const month = q * 3 // end of quarter
    const d = new Date(year, month, 0)
    return ok(original, d.toISOString(), `Q${q} ${year}`, 0.9)
  }

  // Month + year: "Sep 2026", "سبتمبر 2026"
  const monthNames = Object.keys(MONTHS_AR)
  for (const name of monthNames) {
    if (cleaned.includes(name)) {
      const y = cleaned.match(/(\d{4})/)
      if (y) {
        const d = new Date(+y[1], MONTHS_AR[name], 0)
        return ok(original, d.toISOString(), `${name} ${y[1]}`, 0.9)
      }
      return { original, value: null, normalized: null, confidence: 0.5, needsReview: true, reason: 'Month found but no year' }
    }
  }
  const enMonth = cleaned.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/)
  if (enMonth) {
    const y = cleaned.match(/(\d{4})/)
    const month = MONTHS[enMonth[1]]
    if (y && month) {
      const d = new Date(+y[1], month, 0)
      return ok(original, d.toISOString(), `${enMonth[1].toUpperCase()} ${y[1]}`, 0.9)
    }
    return { original, value: null, normalized: null, confidence: 0.5, needsReview: true, reason: 'Month found but no year' }
  }

  // Bare year: "2027"
  const yearOnly = cleaned.match(/\b(20\d{2})\b/)
  if (yearOnly) {
    return { original, value: new Date(+yearOnly[1], 11, 31).toISOString(), normalized: yearOnly[1], confidence: 0.6, needsReview: true, reason: 'Only a year provided — exact delivery date unknown' }
  }
  return fail(original, 'Could not interpret the date')
}

// ─── Payment plan text ────────────────────────────────────
// "10% down payment, 8 years installments" → { downPaymentPct: 10, years: 8 }
export function normalizePaymentPlan(input: unknown): NormResult<{ downPaymentPct?: number; years?: number; monthlyPct?: number }> {
  const original = String(input ?? '').trim()
  if (!original) return fail('Payment plan input empty', 'EMPTY')
  const cleaned = toAsciiDigits(original).toLowerCase()
  const result: { downPaymentPct?: number; years?: number; monthlyPct?: number } = {}

  const down = cleaned.match(/(\d+(?:\.\d+)?)\s*%[^%]{0,24}(?:down|مقدم)/) || cleaned.match(/(?:down|مقدم)[^%]{0,24}(\d+(?:\.\d+)?)\s*%/)
  if (down) result.downPaymentPct = parseFloat(down[1])
  const years = cleaned.match(/(\d+)\s*(?:year|سنة|سنه|سنوات)/)
  if (years) result.years = parseInt(years[1], 10)
  const monthly = cleaned.match(/(\d+(?:\.\d+)?)\s*%\s*(?:monthly|شهري)/) || cleaned.match(/(?:monthly|شهري)\s*(\d+(?:\.\d+)?)\s*%/)
  if (monthly) result.monthlyPct = parseFloat(monthly[1])

  if (result.downPaymentPct === undefined && result.years === undefined && result.monthlyPct === undefined) {
    return fail(original, 'No down-payment % or installment years found')
  }
  if ((result.downPaymentPct ?? 0) > 100 || (result.years ?? 0) > 50) {
    return fail(original, 'Values outside realistic range')
  }
  const parts: string[] = []
  if (result.downPaymentPct !== undefined) parts.push(`${result.downPaymentPct}% down`)
  if (result.monthlyPct !== undefined) parts.push(`${result.monthlyPct}% monthly`)
  if (result.years !== undefined) parts.push(`${result.years} years`)
  const complete = result.downPaymentPct !== undefined || result.years !== undefined
  return ok(original, result, parts.join(' · '), complete ? 1 : 0.7)
}

// ─── Names (developer / project) ──────────────────────────
export function normalizeName(input: unknown, kind: 'developer' | 'project'): NormResult<string> {
  const original = String(input ?? '').trim()
  if (!original) return fail(`${kind} name empty`, 'EMPTY')
  const cleaned = original.replace(/\s+/g, ' ').trim()
  if (cleaned.length < 2) return fail(original, 'Too short')
  if (cleaned.length > 120) return fail(original, 'Too long — likely corrupted')
  if (/[<>{}]|http|www\./.test(cleaned)) return fail(original, 'Contains markup or URL — corrupted input')
  const normalized = cleaned.replace(/\s*-\s*/g, ' ').replace(/\s+/g, ' ').trim()
  const confidence = /\d{5,}|[_@#$%^*]/.test(normalized) ? 0.6 : 1
  return ok(original, normalized, normalized, confidence)
}

// ─── Batch helper ─────────────────────────────────────────
export type NormalizerKind =
  | 'area' | 'price' | 'currency' | 'bedrooms' | 'bathrooms'
  | 'propertyType' | 'location' | 'date' | 'paymentPlan' | 'developerName' | 'projectName'

export function normalizeField(kind: NormalizerKind, raw: unknown): NormResult<unknown> {
  switch (kind) {
    case 'area': return normalizeArea(raw)
    case 'price': return normalizePrice(raw)
    case 'currency': return normalizeCurrency(raw)
    case 'bedrooms': return normalizeCount(raw, 'bedrooms')
    case 'bathrooms': return normalizeCount(raw, 'bathrooms')
    case 'propertyType': return normalizePropertyType(raw)
    case 'location': return normalizeLocation(raw)
    case 'date': return normalizeDate(raw)
    case 'paymentPlan': return normalizePaymentPlan(raw)
    case 'developerName': return normalizeName(raw, 'developer')
    case 'projectName': return normalizeName(raw, 'project')
  }
}

export const NORMALIZER_KINDS: NormalizerKind[] = [
  'area', 'price', 'currency', 'bedrooms', 'bathrooms',
  'propertyType', 'location', 'date', 'paymentPlan', 'developerName', 'projectName',
]
