import { describe, it, expect } from 'vitest'
import { stripNawyPromo } from '@/lib/promo-strip'

describe('stripNawyPromo', () => {
  it('drops an English hotline sentence but keeps the rest', () => {
    const out = stripNawyPromo(
      'Mivida is a luxurious development by Emaar in New Cairo. Call us on 15211 to buy your unit in Mivida Compound New Cairo. The project spans 100 acres.'
    )
    expect(out).toBe(
      'Mivida is a luxurious development by Emaar in New Cairo. The project spans 100 acres.'
    )
    expect(out).not.toMatch(/15211/)
  })

  it('drops Arabic ناوي promo sentences and keeps the rest', () => {
    const out = stripNawyPromo(
      'يعد كمبوند ميفيدا من أبرز مشروعات إعمار. يمكنك التواصل مع ناوي على رقم 15211 للحصول على كافة المعلومات. الخدمات متكاملة داخل المشروع.'
    )
    expect(out).toBe('يعد كمبوند ميفيدا من أبرز مشروعات إعمار. الخدمات متكاملة داخل المشروع.')
    expect(out).not.toMatch(/ناوي|15211/)
  })

  it('removes the "ناوي ناو" brand artifact but keeps the surrounding sentence', () => {
    const out = stripNawyPromo(
      'تتوفر وحدات من المالك وأخرى ناوي ناو يمكنك الانتقال إليها فورًا مع تقسيط على 7 سنوات.'
    )
    expect(out).not.toMatch(/ناوي|ناو/)
    expect(out).toMatch(/تقسيط على 7 سنوات/)
  })

  it('returns clean text untouched', () => {
    const clean = 'مشروع في التجمع الخامس بأسعار تنافسية وخطط سداد مرنة.'
    expect(stripNawyPromo(clean)).toBe(clean)
    expect(stripNawyPromo(null)).toBe('')
    expect(stripNawyPromo('')).toBe('')
  })

  it('never leaves a marker anywhere', () => {
    const out = stripNawyPromo(
      'Why Get Your Home with Nawy? If you are wondering why you would search in Nawy, let us explain. The compound is delivered in 2027. To know more, call us on 15211.'
    )
    expect(out.toLowerCase()).not.toContain('nawy')
    expect(out).not.toContain('15211')
    expect(out).toContain('delivered in 2027')
  })
})
