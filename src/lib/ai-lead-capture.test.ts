// Slot-machine + validation tests for the chat lead-capture / compare-nudge
// upgrade (src/lib/ai-lead-capture.ts). Fake numbers only: the reserved
// 01000000000-style range, never real subscriber numbers.
import { describe, it, expect } from 'vitest'
import {
  normalizeEgyptianPhone,
  isValidEgyptianPhone,
  extractEgyptianPhone,
  isValidLeadName,
  extractNameAndPhone,
  isLeadTrigger,
  isCancelMessage,
  isConfirmYes,
  isConfirmNo,
  isCompareAffirm,
  decideLeadStep,
  formatLeadReply,
  buildCompareNudge,
  shouldAppendNudge,
  LEAD_MAX_RETRIES,
  type LeadState,
} from '@/lib/ai-lead-capture'

// Reserved-style fakes (010/011/012/015 prefixes, 11 digits).
const P1 = '01000000001'
const P2 = '01100000002'
const P3 = '01200000003'
const P4 = '01500000004'

describe('Egyptian phone validation', () => {
  it('accepts all four mobile prefixes', () => {
    for (const p of [P1, P2, P3, P4]) expect(isValidEgyptianPhone(p)).toBe(true)
  })
  it('accepts spaced/dashed forms', () => {
    expect(isValidEgyptianPhone('010 000 000 01')).toBe(true)
    expect(isValidEgyptianPhone('011-000-000-02')).toBe(true)
  })
  it('accepts Arabic-Indic digits', () => {
    expect(isValidEgyptianPhone('٠١٠٠٠٠٠٠٠٠١')).toBe(true)
  })
  it('accepts +20 / 0020 country-code forms', () => {
    expect(isValidEgyptianPhone('+201000000001')).toBe(true)
    expect(isValidEgyptianPhone('00201000000001')).toBe(true)
  })
  it('rejects short / garbage / wrong-prefix numbers', () => {
    expect(isValidEgyptianPhone('123')).toBe(false)
    expect(isValidEgyptianPhone('abc1234567')).toBe(false)
    expect(isValidEgyptianPhone('010000001')).toBe(false) // 9 digits
    expect(isValidEgyptianPhone('0100000001')).toBe(false) // 10 digits
    expect(isValidEgyptianPhone('01900000001')).toBe(false) // bad prefix
    expect(isValidEgyptianPhone('02123456789')).toBe(false) // landline shape
    expect(isValidEgyptianPhone('')).toBe(false)
    expect(isValidEgyptianPhone(null)).toBe(false)
  })
  it('extracts a phone from free text', () => {
    expect(extractEgyptianPhone(`كلمني على ${P1} بعد الضهر`)).toBe(P1)
    expect(extractEgyptianPhone('no digits here')).toBeNull()
  })
})

describe('name validation + combo extraction', () => {
  it('accepts Arabic and Latin names', () => {
    expect(isValidLeadName('أحمد')).toBe(true)
    expect(isValidLeadName('Sara Mohamed')).toBe(true)
  })
  it('rejects too-short / phone-like / symbol-only input', () => {
    expect(isValidLeadName('S')).toBe(false)
    expect(isValidLeadName(P1)).toBe(false)
    expect(isValidLeadName('12345')).toBe(false)
    expect(isValidLeadName('---')).toBe(false)
  })
  it('extracts name+phone combos in one turn', () => {
    const combo = extractNameAndPhone(`اسمي أحمد ورقمي ${P1}`)
    expect(combo).toEqual({ name: 'أحمد', phone: P1 })
  })
  it('returns null when the combo has no usable name', () => {
    expect(extractNameAndPhone(P1)).toBeNull()
    expect(extractNameAndPhone('hello there')).toBeNull()
  })
})

describe('trigger / cancel / confirm detection', () => {
  it('fires on booking/contact phrases', () => {
    expect(isLeadTrigger('عايز أحجز معاينة')).toBe(true)
    expect(isLeadTrigger('كلمني')).toBe(true)
    expect(isLeadTrigger('مهتم بالشقة دي')).toBe(true)
    expect(isLeadTrigger('I want to book a viewing')).toBe(true)
  })
  it('ignores how-to booking questions (site grounding owns those)', () => {
    expect(isLeadTrigger('ازاي أحجز معاينة؟')).toBe(false)
    expect(isLeadTrigger('how do I book a viewing?')).toBe(false)
  })
  it('ignores plain searches', () => {
    expect(isLeadTrigger('عايز شقة في التجمع')).toBe(false)
  })
  it('detects cancel in both languages', () => {
    expect(isCancelMessage('إلغاء')).toBe(true)
    expect(isCancelMessage('cancel')).toBe(true)
    expect(isCancelMessage('عايز شقة')).toBe(false)
  })
  it('detects yes/no confirmations', () => {
    expect(isConfirmYes('أيوه')).toBe(true)
    expect(isConfirmYes('أكّد')).toBe(true)
    expect(isConfirmYes('yes')).toBe(true)
    expect(isConfirmYes('إلغاء')).toBe(false) // cancel wins over yes
    expect(isConfirmNo('لا')).toBe(true)
  })
})

describe('slot order: name → phone → confirm → submit', () => {
  const start: LeadState = { stage: 'awaiting_name', retries: 0 }
  it('walks the happy path', () => {
    const s1 = decideLeadStep(start, 'أحمد')
    expect(s1.action).toBe('ask_phone')
    expect(s1.state?.stage).toBe('awaiting_phone')
    const s2 = decideLeadStep(s1.state!, P1)
    expect(s2.action).toBe('ask_confirm')
    expect(s2.state?.stage).toBe('awaiting_confirm')
    const s3 = decideLeadStep(s2.state!, 'أكّد')
    expect(s3.action).toBe('submit')
    expect(s3.name).toBe('أحمد')
    expect(s3.phone).toBe(P1)
    expect(s3.state).toBeNull()
  })
  it('resolves a name+phone combo straight to confirm', () => {
    const s = decideLeadStep(start, `اسمي سارة ورقمي ${P2}`)
    expect(s.action).toBe('ask_confirm')
    expect(s.name).toBe('سارة')
    expect(s.phone).toBe(P2)
  })
  it('stashes a phone-first answer and still asks for the name', () => {
    const s = decideLeadStep(start, P3)
    expect(s.action).toBe('ask_name')
    expect(s.state?.phone).toBe(P3)
    const s2 = decideLeadStep(s.state!, 'كريم')
    expect(s2.action).toBe('ask_confirm')
    expect(s2.phone).toBe(P3)
  })
  it('repeats (not submits) on a non-answer at confirm', () => {
    const st: LeadState = { stage: 'awaiting_confirm', name: 'أحمد', phone: P1, retries: 0 }
    const s = decideLeadStep(st, 'مش فاهم')
    expect(s.action).toBe('repeat_confirm')
    expect(s.state?.stage).toBe('awaiting_confirm')
  })
})

describe('cancel from any stage', () => {
  const stages: LeadState[] = [
    { stage: 'awaiting_name', retries: 0 },
    { stage: 'awaiting_phone', name: 'أحمد', retries: 1 },
    { stage: 'awaiting_confirm', name: 'أحمد', phone: P1, retries: 0 },
  ]
  for (const st of stages) {
    it(`aborts cleanly from ${st.stage}`, () => {
      const s = decideLeadStep(st, 'إلغاء')
      expect(s.action).toBe('cancelled')
      expect(s.state).toBeNull()
    })
  }
})

describe('retry limit → human handoff', () => {
  it(`allows ${LEAD_MAX_RETRIES} re-asks then hands off`, () => {
    let st: LeadState = { stage: 'awaiting_phone', name: 'أحمد', retries: 0 }
    const r1 = decideLeadStep(st, 'abc')
    expect(r1.action).toBe('ask_phone')
    const r2 = decideLeadStep(r1.state!, 'xyz')
    expect(r2.action).toBe('ask_phone')
    const r3 = decideLeadStep(r2.state!, '!!!')
    expect(r3.action).toBe('handoff')
    expect(r3.state).toBeNull()
  })
  it('applies the same limit on the name slot', () => {
    let st: LeadState = { stage: 'awaiting_name', retries: 0 }
    st = decideLeadStep(st, '1').state!
    st = decideLeadStep(st, '2').state!
    expect(decideLeadStep(st, '3').action).toBe('handoff')
  })
})

describe('summary + copy', () => {
  it('confirm summary carries name and phone', () => {
    const text = formatLeadReply('ask_confirm', 'ar', { name: 'أحمد', phone: P1 })
    expect(text).toContain('أحمد')
    expect(text).toContain(P1)
  })
  it('invalid-phone re-ask names the Egyptian format', () => {
    const text = formatLeadReply('ask_phone', 'ar', { name: 'أحمد' })
    expect(text).toContain('010')
    expect(text).toContain('015')
  })
  it('success message never hardcodes a number (WhatsApp comes from config)', () => {
    const withWa = formatLeadReply('submit', 'ar', { name: 'أ', phone: P1, waHref: 'https://wa.me/200000000000' })
    expect(withWa).toContain('https://wa.me/200000000000')
    const withoutWa = formatLeadReply('submit', 'ar', { name: 'أ', phone: P1 })
    expect(withoutWa).not.toContain('wa.me')
  })
})

describe('compare affirmation + nudge', () => {
  it('catches short affirmations', () => {
    expect(isCompareAffirm('أيوه قارن')).toBe(true)
    expect(isCompareAffirm('قارن أول 2')).toBe(true)
    expect(isCompareAffirm('قارنهم')).toBe(true)
    expect(isCompareAffirm('yes, compare')).toBe(true)
  })
  it('leaves explicit named comparisons to the LLM path', () => {
    expect(isCompareAffirm('قارن بين سوديك وماونتن فيو في التجمع الخامس بالتفصيل')).toBe(false)
  })
  it('leaves how-to-compare questions alone', () => {
    expect(isCompareAffirm('ازاي اقارن بين المشاريع؟')).toBe(false)
  })
  it('accepts a bare affirmation only after a nudge', () => {
    expect(isCompareAffirm('أيوه', 'عايز أقارن لك X و Y؟ قول "أيوه قارن".')).toBe(true)
    expect(isCompareAffirm('أيوه', 'تمام، لقيت 3 نتائج مناسبة')).toBe(false)
    expect(isCompareAffirm('أيوه')).toBe(false)
  })
  it('builds a bilingual nudge naming the pair', () => {
    expect(buildCompareNudge('ar', 'A', 'B')).toContain('A')
    expect(buildCompareNudge('ar', 'A', 'B')).toContain('أيوه قارن')
    expect(buildCompareNudge('en', 'A', 'B')).toContain('yes, compare')
  })
  it('appends only for fresh multi-result turns', () => {
    const blocks = [{ type: 'property_grid', projects: [{ name: 'A' }, { name: 'B' }] }]
    expect(shouldAppendNudge('نتائج مناسبة 👇', blocks, ['search_projects'])).toBe(true)
    expect(shouldAppendNudge('نتائج', blocks, ['search_projects', 'compare_projects'])).toBe(false)
    expect(shouldAppendNudge('قارن كده', blocks, ['search_projects'])).toBe(false)
    expect(shouldAppendNudge('نتائج', [{ type: 'property_grid', projects: [{ name: 'A' }] }], [])).toBe(false)
  })
})
