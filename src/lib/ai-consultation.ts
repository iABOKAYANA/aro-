// ─── Consultation gate — عين studies & consults, never dumps listings ───
//
// Before recommending, Ayn needs a usable CLIENT PROFILE: budget + place +
// property type or purpose. Until then a listing turn resolves to ONE short
// question (deterministic — instant, free, consistent), max 3, then the
// search proceeds with whatever is known. Clients who explicitly ask to see
// options ("وريني اللي عندك") can skip discovery entirely.

import { parseNaturalLanguageQuery } from '@/lib/ai-search-parser'

export type ChatLang = 'ar' | 'en'

export interface ConsultNeeds {
  budgetMin?: number
  budgetMax?: number
  place?: string
  propertyType?: string
  purpose?: 'live' | 'invest'
  bedrooms?: number
}

// Stable marker every discovery question starts with, so the gate can count
// how many were already asked from plain assistant history (no metadata
// dependency — conversation contents are the source of truth).
export const CONSULT_MARKER_AR = 'عشان أرشّح لك صح'
export const CONSULT_MARKER_EN = 'to recommend the right fit'

const INVEST_RE = /استثمار|استثمر|عائد|ربح|invest/i
const LIVE_RE = /أسكن|اسكن|عايش|ساكن|للسكن|عشان اسكن|عشان أسكن|تسكن|سكن\b|to live|living in|our home|بيت لنا/i
const RECOMMENDATION_REQUEST_RE = /رشح(?:لي|لى|لنا)?|رشّح(?:لي|لى|لنا)?|ترشح(?:لي|لى|لنا)?|أنسب(?:لي|لنا)?|انسب(?:لي|لنا)?|أفضل\s*(?:مشروع|كمبوند|اختيار|عقار|وحدة)?|افضل\s*(?:مشروع|كمبوند|اختيار|عقار|وحدة)?|أحسن\s*(?:مشروع|كمبوند|اختيار|عقار|وحدة)?|احسن\s*(?:مشروع|كمبوند|اختيار|عقار|وحدة)?|اختارلي|best\s*(?:project|compound|property|option)?|recommend(?:\s+me|ation)?|what\s+should\s+i\s+(?:buy|choose)|which\s+(?:project|compound|property|unit)\s+should/i
const EXPLICIT_POPULARITY_RE = /most\s+(?:popular|viewed|engaged)|highest\s+engagement|الأكثر\s+(?:شعبية|مشاهدة)|اكتر\s+مشاريع?\s+(?:عليها\s+)?تفاعل|أكتر\s+مشاريع?\s+(?:عليها\s+)?تفاعل|أكثر\s+مشاريع?\s+(?:عليها\s+)?تفاعل/i

// "Just show me" impatience — skip discovery, search with what we have.
const IMMEDIATE_PHRASES = [
  'وريني اللي عندك',
  'وريني اللي عندكم',
  'اعرض اللي عندك',
  'هات اللي عندك',
  'وريني كل حاجة',
  'وريني كل المشاريع',
  'عرض اللي عندك',
  'show me what you have',
  'just show me',
  'show me everything',
  'show me the list',
  'show me the options',
  'هات الاختيارات',
  'هات القائمة',
  'اعرض الاختيارات',
  'اعرض المشاريع',
  'جيبلي اختيارات',
  'ابعتلي الاختيارات',
  'give me the list',
  'give me the options',
  'pull up the options',
]

const SHORTLIST_PHRASES = [
  'وريني', 'ورينى', 'هات الاختيارات', 'هاتلى الاختيارات', 'هاتلي الاختيارات',
  'هات القائمة', 'هاتلى القائمة', 'هاتلي القائمة', 'اعرض الاختيارات',
  'اعرض القائمة', 'اعرضلي المشاريع', 'ابعتلي الاختيارات', 'جيبلي اختيارات',
  'فصّل بالقائمة', 'فصل بالقائمة', 'القائمة', 'الاختيارات', 'الترشيحات',
  'رشحلي', 'رشّحلي', 'رشح لي', 'أفضل مشروع', 'افضل مشروع', 'أحسن مشروع',
  'احسن مشروع', 'أنسب مشروع', 'انسب مشروع', 'أحسن اختيار', 'احسن اختيار',
  'best project', 'best option', 'recommend me', 'what do you recommend', 'show me', 'show the list', 'show options',
  'give me the list', 'give me options', 'shortlist', 'top 3', 'pull up',
  'send me options', 'list them',
]

export const SHORTLIST_AFFIRMATION_RE = /^(?:اه|آه|ايوه|أيوه|أيوة|تمام|ماشي|موافق|يلا|yes|yeah|sure|okay|ok|sounds good|go ahead|do it)(?:\s|[!.،]|$)/i

/** Bare consent after the one-time segue offer — the promised list now. */
export function isShortlistConsent(
  assistantTexts: string[],
  currentMessage: string,
): boolean {
  const last = assistantTexts[assistantTexts.length - 1] || ''
  if (!last.includes(AREA_TAKE_SEGUE_AR) && !last.includes(AREA_TAKE_SEGUE_EN)) return false
  return SHORTLIST_AFFIRMATION_RE.test(currentMessage.trim())
}

const ASKED_BUDGET_RE = /الميزانية|budget/i
const ASKED_PLACE_RE = /تكون فين|would you like to be/i
const ASKED_TYPEPURPOSE_RE = /بتدور على إيه|what are you after/i

export function extractNeeds(text: string): ConsultNeeds {
  const { filters } = parseNaturalLanguageQuery(text)
  const needs: ConsultNeeds = {}
  if (filters.city) needs.place = String(filters.city)
  else if ((filters as Record<string, unknown>).governorate) {
    needs.place = String((filters as Record<string, unknown>).governorate)
  }
  if (filters.propertyType) needs.propertyType = String(filters.propertyType)
  if (filters.bedrooms !== undefined && filters.bedrooms !== null) needs.bedrooms = Number(filters.bedrooms)
  if (filters.minPrice) needs.budgetMin = Number(filters.minPrice)
  if (filters.maxPrice) needs.budgetMax = Number(filters.maxPrice)
  if (INVEST_RE.test(text)) needs.purpose = 'invest'
  else if (LIVE_RE.test(text)) needs.purpose = 'live'
  return needs
}

/** Later non-undefined values win (newest message is most authoritative). */
export function mergeNeeds(base: ConsultNeeds, newer: ConsultNeeds): ConsultNeeds {
  const out: ConsultNeeds = { ...base }
  for (const [k, v] of Object.entries(newer) as Array<[keyof ConsultNeeds, ConsultNeeds[keyof ConsultNeeds] & (number | string | undefined)]>) {
    if (v !== undefined && v !== null && v !== '') (out as Record<string, unknown>)[k] = v
  }
  return out
}

export function needsFromHistory(history: Array<{ role: string; content: string }>, currentMessage: string): ConsultNeeds {
  const priorUser = history
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .slice(-6)
  let needs: ConsultNeeds = {}
  for (const t of priorUser) needs = mergeNeeds(needs, extractNeeds(t))
  return mergeNeeds(needs, extractNeeds(currentMessage))
}

/** Minimum profile for a tailored shortlist: budget + place + type or purpose. */
export function isReady(n: ConsultNeeds): boolean {
  const hasBudget = n.budgetMin !== undefined || n.budgetMax !== undefined
  const hasWhat = !!n.propertyType || !!n.purpose
  return hasBudget && !!n.place && hasWhat
}

/**
 * Repeat protection: true when every still-missing discovery slot was
 * already asked at least once. The gate must NEVER re-ask a question the
 * client dodged — an unreplied slot is treated as "not important to them"
 * and the search proceeds with whatever is known instead.
 */
export function discoveryExhausted(
  n: ConsultNeeds,
  asked: Set<'budget' | 'place' | 'typepurpose'>,
): boolean {
  const missing: Array<'budget' | 'place' | 'typepurpose'> = []
  if (n.budgetMin === undefined && n.budgetMax === undefined) missing.push('budget')
  if (!n.place) missing.push('place')
  if (!n.propertyType && !n.purpose) missing.push('typepurpose')
  return missing.length > 0 && missing.every((s) => asked.has(s))
}

/**
 * Slots the CURRENT message just settled (defined now, undefined before) —
 * the trigger for the one-time area-take round.
 */
export function slotsRevealedBy(
  history: Array<{ role: string; content: string }>,
  currentMessage: string,
): Array<'budget' | 'place' | 'typepurpose'> {
  const prior = needsFromHistory(history, '')
  const now = mergeNeeds(prior, extractNeeds(currentMessage))
  const revealed: Array<'budget' | 'place' | 'typepurpose'> = []
  const budgetBefore = prior.budgetMin !== undefined || prior.budgetMax !== undefined
  const budgetNow = now.budgetMin !== undefined || now.budgetMax !== undefined
  if (!budgetBefore && budgetNow) revealed.push('budget')
  if (!prior.place && now.place) revealed.push('place')
  if (!(prior.propertyType || prior.purpose) && (now.propertyType || now.purpose)) {
    revealed.push('typepurpose')
  }
  return revealed
}

/** Has Ayn already recommended projects in the recent conversation? */
export function hasRecommended(assistantTexts: string[]): boolean {
  return assistantTexts.some((t) => t.includes('/projects/'))
}

/** Was the one-time area-take round already offered? */
export function areaTakeOffered(assistantTexts: string[]): boolean {
  return assistantTexts.some((t) => t.includes(AREA_TAKE_SEGUE_AR) || t.includes(AREA_TAKE_SEGUE_EN))
}

export function isRecommendationRequest(text: string): boolean {
  return RECOMMENDATION_REQUEST_RE.test(text) || /تنصح(?:ني)?|استثمر|أشتري|اشتري|should\s+i\s+(?:buy|invest)/i.test(text)
}

/** Only explicit popularity/ranking questions should bypass personal discovery. */
export function isExplicitPopularityRequest(text: string): boolean {
  return EXPLICIT_POPULARITY_RE.test(text)
}

/** The user explicitly asks to see a shortlist/cards now (not just advice). */
export function wantsShortlistNow(text: string): boolean {
  const t = text.trim().toLowerCase()
  return SHORTLIST_PHRASES.some((phrase) => t.includes(phrase))
}

/**
 * If Ayn already offered a shortlist-vs-discussion choice, don't show cards
 * until the client chooses the shortlist. A bare yes accepts the first option;
 * direct project questions/comparisons are handled normally.
 */
export function shouldHoldShortlist(
  assistantTexts: string[],
  currentMessage: string,
  directCatalogTask = false,
): boolean {
  if (directCatalogTask || hasRecommended(assistantTexts) || !areaTakeOffered(assistantTexts)) return false
  if (wantsShortlistNow(currentMessage)) return false
  const lastAssistant = assistantTexts[assistantTexts.length - 1] || ''
  const justOfferedChoice = lastAssistant.includes(AREA_TAKE_SEGUE_AR) || lastAssistant.includes(AREA_TAKE_SEGUE_EN)
  return !(justOfferedChoice && SHORTLIST_AFFIRMATION_RE.test(currentMessage.trim()))
}

export function wantsImmediateListings(text: string): boolean {
  const t = text.trim().toLowerCase()
  return IMMEDIATE_PHRASES.some((p) => t.includes(p)) ||
    /(?:ورين[ىي]|هات(?:لي|لى)?|اعرض(?:لي|لى)?|جيب(?:لي|لى)?|ابعت(?:لي|لى)?)\s*(?:ال)?(?:اختيارات|قائمة|مشاريع|عقارات|شقق|فيلا|وحدات|اللي عندك)/i.test(t) ||
    /(?:ورين[ىي]|هات(?:لي|لى)?|اعرض(?:لي|لى)?|جيب(?:لي|لى)?|ابعت(?:لي|لى)?)\s*.{0,12}(?:أفضل|افضل|أحسن|احسن|أنسب|انسب|ترشيح|اختيار)/i.test(t) ||
    /\b(?:show me|pull up|give me|send me)\b.{0,24}\b(?:projects?|properties|apartments?|options?|listings?)\b/i.test(t)
}

/** Slots the assistant has already asked about (from plain assistant texts). */
export function askedConsultSlots(assistantTexts: string[]): Set<'budget' | 'place' | 'typepurpose'> {
  const asked = new Set<'budget' | 'place' | 'typepurpose'>()
  for (const t of assistantTexts) {
    if (ASKED_BUDGET_RE.test(t)) asked.add('budget')
    if (ASKED_PLACE_RE.test(t)) asked.add('place')
    if (ASKED_TYPEPURPOSE_RE.test(t)) asked.add('typepurpose')
  }
  return asked
}

/** How many discovery questions were already asked in recent assistant turns. */
export function countConsultQuestions(assistantTexts: string[]): number {
  let n = 0
  for (const t of assistantTexts) {
    if (t.includes(CONSULT_MARKER_AR) || t.toLowerCase().includes(CONSULT_MARKER_EN)) n++
  }
  return n
}

export const CONSULT_MAX_QUESTIONS = 3

// Area-take round: before a client who just revealed their place (or a
// fresh profile) gets ANY listings, Ayn discusses the AREA first — a
// consultative take on the market with REAL aggregates — and ends with a
// system-owned segue question. The marker lets the gate know the round
// already happened (it never happens twice).
export const AREA_TAKE_SEGUE_AR = 'تحب فصّل بالقائمة لأقوى 3، ولا ندردش أكتر في المكان؟'
export const AREA_TAKE_SEGUE_EN = 'Want the curated top-3 list, or keep talking about the area first?'

export interface ConsultQuestion {
  slot: 'budget' | 'place' | 'typepurpose'
  content: string
}

/** The ONE question this turn — first essential still missing (unasked first). */
export function nextConsultQuestion(
  n: ConsultNeeds,
  lang: ChatLang,
  asked: Set<'budget' | 'place' | 'typepurpose'>,
): ConsultQuestion | null {
  const missing: Array<'budget' | 'place' | 'typepurpose'> = []
  if (n.budgetMin === undefined && n.budgetMax === undefined) missing.push('budget')
  if (!n.place) missing.push('place')
  if (!n.propertyType && !n.purpose) missing.push('typepurpose')
  if (missing.length === 0) return null

  const unasked = missing.filter((s) => !asked.has(s))
  const slot = unasked[0] ?? missing[0]

  if (lang === 'ar') {
    switch (slot) {
      case 'budget':
        return {
          slot,
          content:
            'عشان أرشّح لك صح من الأول: الميزانية هي أمّ كل الأرقام — منها بنعمل الخريطة كلها (المنطقة، نوع الوحدة، خطة السداد). السؤال الكلاسيكي، بس هو فعلاً اللي يحدّد السطر الأول 🙂 الميزانية في حدود كام؟ (كاش ولا تقسيط؟)',
        }
      case 'place':
        return {
          slot,
          content:
            'عشان أرشّح لك صح: المكان مش تفصيل بسيط — هو اللي بيرسم يومك الكامل (المواصلات، المدارس، الزحمة) وسعر المتر نفسه بيتغير جدًا من حي لآخر. تحب تكون فين بالظبط؟ (التجمع، زايد، الساحل… مثلًا)',
        }
      default:
        return {
          slot,
          content:
            'عشان أرشّح لك صح: بتدور على إيه — شقة، فيلا، تاون هاوس؟ وده للسكن ولا استثمار؟ رأيي إن الجواب بقلب الاستراتيجية كلها: للسكن بنبص على المعيشة والمرافق، وللاستثمار بنبص على قابلية البيع والإيجار.',
        }
    }
  }
  switch (slot) {
    case 'budget':
      return {
        slot,
        content:
          'To recommend the right fit — and this question really is the map: the budget decides the area, the unit type and the payment structure. Roughly what’s your budget? (cash or installment?)',
      }
    case 'place':
      return {
        slot,
        content:
          'To recommend the right fit: the place shapes your daily life (commute, schools, traffic) and the price per meter changes street to street. Where would you like to be? (New Cairo, Sheikh Zayed, the Coast…)',
      }
    default:
      return {
        slot,
        content:
          'To recommend the right fit — what are you after: apartment, villa, townhouse? To live in or invest? My honest take: the answer flips the whole strategy — living is about lifestyle and amenities, investing is about resale and rent.',
      }
  }
}
