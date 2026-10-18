// ─── Consultation gate — عين studies & consults, never dumps listings ───
//
// Before recommending, Ayn needs a minimal CLIENT PROFILE: budget + a place
// OR a property type/purpose. Until then a listing turn resolves to ONE
// short question (deterministic — instant, free, consistent), max 3, then
// the search proceeds with whatever is known. Clients who explicitly ask
// to see options ("وريني اللي عندك") skip discovery entirely.

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
]

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

/** Minimum profile to reason about a fit: a budget + (place OR type/purpose). */
export function isReady(n: ConsultNeeds): boolean {
  const hasBudget = n.budgetMin !== undefined || n.budgetMax !== undefined
  const hasDirection = !!n.place || !!n.propertyType || !!n.purpose
  return hasBudget && hasDirection
}

export function wantsImmediateListings(text: string): boolean {
  const t = text.trim().toLowerCase()
  return IMMEDIATE_PHRASES.some((p) => t.includes(p))
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
        return { slot, content: 'عشان أرشّح لك صح من الأول: الميزانية في حدود كام؟ (كاش ولا تقسيط؟)' }
      case 'place':
        return { slot, content: 'عشان أرشّح لك صح: تحب تكون فين بالظبط؟ (التجمع، زايد، الساحل… مثلًا)' }
      default:
        return { slot, content: 'عشان أرشّح لك صح: بتدور على إيه — شقة، فيلا، تاون هاوس؟ وده للسكن ولا استثمار؟' }
    }
  }
  switch (slot) {
    case 'budget':
      return { slot, content: 'To recommend the right fit — roughly what’s your budget? (cash or installment?)' }
    case 'place':
      return { slot, content: 'To recommend the right fit — where would you like to be? (New Cairo, Sheikh Zayed, the Coast…)' }
    default:
      return { slot, content: 'To recommend the right fit — what are you after: apartment, villa, townhouse? To live in or invest?' }
  }
}
