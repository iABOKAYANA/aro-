import { describe, it, expect } from 'vitest'
import {
  extractNeeds,
  mergeNeeds,
  needsFromHistory,
  isReady,
  wantsImmediateListings,
  askedConsultSlots,
  countConsultQuestions,
  nextConsultQuestion,
  discoveryExhausted,
  slotsRevealedBy,
  hasRecommended,
  areaTakeOffered,
  AREA_TAKE_SEGUE_AR,
  type ConsultNeeds,
  CONSULT_MARKER_AR,
} from '@/lib/ai-consultation'

describe('ai-consultation gate', () => {
  it('discoveryExhausted: a dodged budget is never re-asked — search proceeds', () => {
    // Client said place+type/purpose, dodged the budget question twice.
    const needs = extractNeeds('عايز فيلا في زايد للاستثمار') // no numbers
    const asked = askedConsultSlots([`عشان أرشّح لك صح: الميزانية في حدود كام؟ (كاش ولا تقسيط؟)`])
    expect(isReady(needs)).toBe(false)
    expect(discoveryExhausted(needs, asked)).toBe(true)
  })

  it('discoveryExhausted: unasked missing slots are not exhausted yet', () => {
    const needs: ConsultNeeds = { place: 'sheikh-zayed' }
    const asked = new Set<'budget' | 'place' | 'typepurpose'>(['budget'])
    // budget asked+missing, but place is NOT asked and IS missing → ask place
    expect(discoveryExhausted(needs, asked)).toBe(false)
  })

  it('discoveryExhausted: a complete profile is never exhausted (ready beats it)', () => {
    const needs = extractNeeds('عايز شقة في التجمع تحت 8 مليون')
    expect(discoveryExhausted(needs, new Set(['budget', 'place', 'typepurpose']))).toBe(false)
  })

  it('area take: first full-profile message triggers exactly one area discussion (slots revealed)', () => {
    // Fresh conversation: everything arrives in one message → reveal.
    const revealed = slotsRevealedBy([], 'عايز فيلا في زايد للاستثمار حوالي 12 مليون')
    expect(revealed.length).toBeGreaterThan(0)
    expect(hasRecommended([])).toBe(false)
    expect(areaTakeOffered([])).toBe(false)
  })

  it('area take: after the segue was offered, the round never repeats', () => {
    const assistant = [`بص يا باشا على المكان... ${AREA_TAKE_SEGUE_AR}`]
    expect(areaTakeOffered(assistant)).toBe(true)
    // and once projects were recommended, the round is a no-go too
    expect(hasRecommended([`رشّح لك ده /projects/1291-elevation 👌`])).toBe(true)
  })

  it('area take: a later turn does NOT reveal again (nothing new settled)', () => {
    const history = [
      { role: 'user' as const, content: 'عايز فيلا في زايد للاستثمار حوالي 12 مليون' },
      { role: 'assistant' as const, content: `خريطة المكان... ${AREA_TAKE_SEGUE_AR}` },
    ]
    expect(slotsRevealedBy(history, 'فصّل بالقائمة')).toEqual([])
  })

  it('extracts needs from a full Arabic query (digits, aliases, budget)', () => {
    const n = extractNeeds('عايز شقة ٣ أوض في التجمع تحت ٨ مليون تقسيط')
    expect(n.budgetMax).toBe(8_000_000)
    expect(n.place).toBe('new-cairo')
    expect(n.propertyType).toBe('APARTMENT')
    expect(isReady(n)).toBe(true)
  })

  it('a bare listing want is NOT ready and asks budget first', () => {
    const n = extractNeeds('عايز شقة')
    expect(isReady(n)).toBe(false)
    const q = nextConsultQuestion(n, 'ar', new Set())
    expect(q?.slot).toBe('budget')
    expect(q?.content).toContain(CONSULT_MARKER_AR)
  })

  it('place known but budget missing → asks budget, not place again', () => {
    const history = [
      { role: 'user', content: 'عايز شقة' },
      { role: 'assistant', content: 'عشان أرشّح لك صح من الأول: الميزانية في حدود كام؟ (كاش ولا تقسيط؟)' },
      { role: 'user', content: 'في التجمع' },
    ]
    const n = needsFromHistory(history, 'في التجمع')
    expect(isReady(n)).toBe(false)
    const asked = askedConsultSlots(history.map((m) => (m.role === 'assistant' ? m.content : '')))
    const q = nextConsultQuestion(n, 'ar', asked)
    // budget was asked and dodged; place+type are now known from the thread →
    // the only essential left is budget, so it is gently re-asked.
    expect(q?.slot).toBe('budget')
    expect(q?.content).toContain('الميزانية')
  })

  it('mergeNeeds lets newer values win and never loses older ones', () => {
    const a = extractNeeds('شقة في التجمع')
    const b = extractNeeds('تحت ٨ مليون')
    const merged = mergeNeeds(a, b)
    expect(merged.budgetMax).toBe(8_000_000)
    expect(merged.place).toBe('new-cairo')
    expect(isReady(merged)).toBe(true)
  })

  it('impatience bypasses discovery', () => {
    expect(wantsImmediateListings('وريني اللي عندك')).toBe(true)
    expect(wantsImmediateListings('show me what you have')).toBe(true)
    expect(wantsImmediateListings('عايز شقة في التجمع')).toBe(false)
  })

  it('counts asked discovery questions from plain assistant texts', () => {
    const texts = [
      'عشان أرشّح لك صح من الأول: الميزانية في حدود كام؟',
      'عشان أرشّح لك صح: تحب تكون فين بالظبط؟',
    ]
    expect(countConsultQuestions(texts)).toBe(2)
    expect(askedConsultSlots(texts)).toEqual(new Set(['budget', 'place']))
  })

  it('English gets English questions', () => {
    const n = extractNeeds('looking for an apartment')
    expect(isReady(n)).toBe(false)
    const q = nextConsultQuestion(n, 'en', new Set())
    expect(q?.content).toMatch(/budget/i)
  })

  it('ready profile produces no question', () => {
    const n = extractNeeds('villa in Sheikh Zayed under 20 million')
    expect(isReady(n)).toBe(true)
    expect(nextConsultQuestion(n, 'ar', new Set())).toBeNull()
  })
})
