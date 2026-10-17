import { describe, expect, it } from 'vitest'
import {
  NORMALIZER_KINDS,
  normalizeArea,
  normalizeCount,
  normalizeCurrency,
  normalizeDate,
  normalizeField,
  normalizeLocation,
  normalizeName,
  normalizePaymentPlan,
  normalizePrice,
  normalizePropertyType,
  toAsciiDigits,
} from '@/lib/data-normalizer'

describe('toAsciiDigits', () => {
  it('converts Arabic-Indic and Persian digits to ASCII', () => {
    expect(toAsciiDigits('١٢٣٤٥')).toBe('12345')
    expect(toAsciiDigits('۱۲۳')).toBe('123')
    expect(toAsciiDigits('٧.٢ مليون')).toBe('7.2 مليون')
  })
})

describe('normalizeArea', () => {
  it('parses metric + Arabic units at full confidence', () => {
    const r = normalizeArea('160 متر')
    expect(r.value).toBe(160)
    expect(r.needsReview).toBe(false)
    expect(r.original).toBe('160 متر')
  })

  it('accepts a bare number at reduced (but passing) confidence', () => {
    const r = normalizeArea('160')
    expect(r.value).toBe(160)
    expect(r.confidence).toBe(0.75)
    expect(r.needsReview).toBe(false)
  })

  it.each(['', '-5 m2', '0 sqm', '200000 m2', 'big house'])('flags %p for review', (v) => {
    const r = normalizeArea(v)
    expect(r.value).toBeNull()
    expect(r.needsReview).toBe(true)
  })
})

describe('normalizePrice', () => {
  it('expands M / million suffixes', () => {
    expect(normalizePrice('7.2M').value).toBe(7_200_000)
    expect(normalizePrice('7,200,000').value).toBe(7_200_000)
  })

  it('handles Arabic-Indic digits with Arabic suffixes', () => {
    const r = normalizePrice('٧.٢ مليون')
    expect(r.value).toBe(7_200_000)
    expect(r.needsReview).toBe(false)
  })

  it('expands K suffixes', () => {
    expect(normalizePrice('5K').value).toBe(5000)
  })

  it('marks suffix-less small numbers ambiguous instead of guessing', () => {
    const r = normalizePrice('7.2')
    expect(r.value).toBeNull()
    expect(r.needsReview).toBe(true)
  })

  it.each(['', '0', 'free'])('rejects %p', (v) => {
    expect(normalizePrice(v).value).toBeNull()
  })

  it('documents that a leading minus is dropped ("−3M" → 3M, not an error)', () => {
    // The price regex is unanchored, so the sign is never read. Asserted as
    // current behaviour — change the normaliser if negatives must fail.
    expect(normalizePrice('-3M').value).toBe(3_000_000)
  })
})

describe('normalizeCurrency', () => {
  it.each([
    ['EGP', 'EGP'],
    ['جنيه', 'EGP'],
    ['100 USD', 'USD'],
    ['$50', 'USD'],
    ['€', 'EUR'],
  ])('%p → %p', (input, expected) => {
    const r = normalizeCurrency(input)
    expect(r.value).toBe(expected)
    expect(r.needsReview).toBe(false)
  })

  it('fails on unknown currency', () => {
    expect(normalizeCurrency('XYZ').needsReview).toBe(true)
    expect(normalizeCurrency('').value).toBeNull()
  })
})

describe('normalizeCount', () => {
  it('reads digits for bedrooms and bathrooms', () => {
    expect(normalizeCount('3 bedrooms', 'bedrooms').value).toBe(3)
    expect(normalizeCount('2 حمام', 'bathrooms').value).toBe(2)
  })

  it('reads English and Arabic number words, incl. studio = 0', () => {
    expect(normalizeCount('three bedrooms', 'bedrooms').value).toBe(3)
    expect(normalizeCount('استوديو', 'bedrooms').value).toBe(0)
  })

  it('rejects unrealistic counts and empty input', () => {
    expect(normalizeCount('99 rooms', 'bedrooms').value).toBeNull()
    expect(normalizeCount('', 'bedrooms').needsReview).toBe(true)
  })
})

describe('normalizePropertyType', () => {
  it('matches exact English and Arabic types at full confidence', () => {
    expect(normalizePropertyType('Villa').value).toBe('VILLA')
    expect(normalizePropertyType('شقة').value).toBe('APARTMENT')
  })

  it('substring-matches longer phrases at reduced confidence', () => {
    const r = normalizePropertyType('luxury villa with pool')
    expect(r.value).toBe('VILLA')
    expect(r.confidence).toBeLessThan(1)
  })

  it('fails on unknown types', () => {
    expect(normalizePropertyType('castle').value).toBeNull()
  })
})

describe('normalizeLocation', () => {
  it('maps known English and Arabic names to slugs', () => {
    expect(normalizeLocation('New Cairo').value).toBe('new-cairo')
    expect(normalizeLocation('التجمع').value).toBe('new-cairo')
  })

  it('passes unknown plausible places through with needsReview', () => {
    const r = normalizeLocation('Zamalek Heights')
    expect(r.value).toBe('Zamalek Heights')
    expect(r.needsReview).toBe(true)
  })

  it('fails on garbage', () => {
    expect(normalizeLocation('!!').value).toBeNull()
    expect(normalizeLocation('').value).toBeNull()
  })
})

describe('normalizeDate', () => {
  it('parses ISO and day-first slash dates', () => {
    expect(normalizeDate('2026-09-30').normalized).toBe('30/09/2026')
    expect(normalizeDate('30/09/2026').normalized).toBe('30/09/2026')
  })

  it('parses quarters and month+year', () => {
    expect(normalizeDate('Q3 2026').normalized).toBe('Q3 2026')
    expect(normalizeDate('Sep 2026').value).not.toBeNull()
  })

  it('flags bare years as review-worthy, rejects garbage', () => {
    const y = normalizeDate('2027')
    expect(y.normalized).toBe('2027')
    expect(y.needsReview).toBe(true)
    expect(normalizeDate('garbage!!').value).toBeNull()
  })
})

describe('normalizePaymentPlan', () => {
  it('extracts down-payment % and years', () => {
    const r = normalizePaymentPlan('10% down, 8 years installments')
    expect(r.value).toEqual({ downPaymentPct: 10, years: 8 })
    expect(r.needsReview).toBe(false)
  })

  it('rejects texts with no plan data and unrealistic ranges', () => {
    expect(normalizePaymentPlan('hello world').value).toBeNull()
    expect(normalizePaymentPlan('10% down and 99 years').value).toBeNull()
    expect(normalizePaymentPlan('').value).toBeNull()
  })
})

describe('normalizeName', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeName('  SODIC  Developments ', 'developer').value).toBe('SODIC Developments')
  })

  it.each(['', 'x', '<script>', 'see http://x.com', 'a'.repeat(121)])('rejects %p', (v) => {
    expect(normalizeName(v, 'project').value).toBeNull()
  })
})

describe('normalizeField dispatcher', () => {
  it('routes every documented kind', () => {
    expect(NORMALIZER_KINDS).toHaveLength(11)
    expect(normalizeField('price', '5M').value).toBe(5_000_000)
    expect(normalizeField('area', '100 sqm').value).toBe(100)
    expect(normalizeField('location', 'cairo').value).toBe('cairo')
    expect(normalizeField('bedrooms', '2').value).toBe(2)
    expect(normalizeField('currency', 'USD').value).toBe('USD')
  })
})
