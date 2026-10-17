import { beforeEach, describe, expect, it } from 'vitest'
import {
  CURRENCIES,
  DEFAULT_RATES,
  convertFromEGP,
  formatMoney,
  getActiveCurrency,
  getRates,
  normaliseRates,
  setActiveCurrency,
  setRates,
  subscribeCurrency,
} from '@/lib/currency'

/** Intl pads currency output with NBSP on some runtimes — normalise first. */
const norm = (s: string) => s.replace(/[ \s]+/g, ' ').trim()

beforeEach(() => {
  setActiveCurrency('EGP')
  setRates({ ...DEFAULT_RATES })
})

describe('convertFromEGP', () => {
  it('returns the input untouched for EGP', () => {
    expect(convertFromEGP(1500000, 'EGP')).toBe(1500000)
  })

  it('divides by the EGP-per-unit rate', () => {
    expect(convertFromEGP(48.5, 'USD')).toBeCloseTo(1, 10)
    expect(convertFromEGP(100, 'USD')).toBeCloseTo(100 / 48.5, 10)
    expect(convertFromEGP(12.9, 'SAR')).toBeCloseTo(1, 10)
  })

  it('passes non-finite input through untouched', () => {
    expect(convertFromEGP(NaN, 'USD')).toBeNaN()
    expect(convertFromEGP(Infinity, 'USD')).toBe(Infinity)
  })

  it('handles zero and negatives arithmetically', () => {
    expect(convertFromEGP(0, 'USD')).toBe(0)
    expect(convertFromEGP(-48.5, 'USD')).toBeCloseTo(-1, 10)
  })
})

describe('formatMoney', () => {
  it('formats EGP with no decimals', () => {
    expect(norm(formatMoney(1500000))).toBe('EGP 1,500,000')
  })

  it('formats an explicit target currency without switching state', () => {
    expect(norm(formatMoney(100000, 'USD'))).toBe('$2,061.86')
    expect(getActiveCurrency()).toBe('EGP')
  })

  it('follows the active currency', () => {
    setActiveCurrency('USD')
    expect(norm(formatMoney(485000))).toBe('$10,000')
  })

  it('returns an em-dash for NaN / Infinity (never "NaN" in UI)', () => {
    expect(formatMoney(NaN)).toBe('—')
    expect(formatMoney(Infinity)).toBe('—')
    expect(formatMoney(-Infinity)).toBe('—')
  })

  it('formats zero as a zero amount, not a dash', () => {
    expect(norm(formatMoney(0))).toBe('EGP 0')
  })
})

describe('setRates', () => {
  it('merges sane values and ignores garbage payloads', () => {
    setRates({ USD: 50 })
    expect(getRates().USD).toBe(50)
    expect(getRates().EGP).toBe(1)
  })

  it.each([0, -5, NaN, Infinity, 'junk', undefined])('rejects insane USD rate %p', (v) => {
    setRates({ USD: v })
    expect(getRates().USD).toBe(DEFAULT_RATES.USD)
  })

  it('rejects absurd magnitudes (>1e6 per unit either way)', () => {
    setRates({ USD: 1e10 })
    expect(getRates().USD).toBe(DEFAULT_RATES.USD)
    setRates({ USD: 1e-7 })
    expect(getRates().USD).toBe(DEFAULT_RATES.USD)
  })

  it('ignores non-object payloads and unknown currencies', () => {
    setRates(null)
    setRates('USD=50')
    setRates({ EUR: 30 } as unknown as Record<string, number>)
    expect(getRates()).toEqual(DEFAULT_RATES)
  })
})

describe('normaliseRates', () => {
  it('falls back to defaults for empty input', () => {
    expect(normaliseRates(null)).toEqual(DEFAULT_RATES)
    expect(normaliseRates(undefined)).toEqual(DEFAULT_RATES)
    expect(normaliseRates('nope')).toEqual(DEFAULT_RATES)
  })

  it('keeps defaults for zero/negative entries, takes positive ones', () => {
    expect(normaliseRates({ USD: 0, SAR: -3 }).USD).toBe(DEFAULT_RATES.USD)
    expect(normaliseRates({ USD: 55 }).USD).toBe(55)
  })
})

describe('active currency + subscriptions', () => {
  it('starts at EGP and only accepts known currencies', () => {
    expect(getActiveCurrency()).toBe('EGP')
    expect(CURRENCIES).toEqual(['EGP', 'USD', 'SAR'])
    setActiveCurrency('EUR' as never)
    expect(getActiveCurrency()).toBe('EGP')
  })

  it('notifies subscribers on change and honours unsubscribe', () => {
    let calls = 0
    const unsub = subscribeCurrency(() => calls++)
    setActiveCurrency('USD')
    expect(calls).toBe(1)
    setActiveCurrency('USD') // no-op, no emit
    expect(calls).toBe(1)
    unsub()
    setActiveCurrency('SAR')
    expect(calls).toBe(1)
  })

  it('a throwing subscriber never breaks the switch', () => {
    subscribeCurrency(() => {
      throw new Error('broken')
    })
    expect(() => setActiveCurrency('USD')).not.toThrow()
    expect(getActiveCurrency()).toBe('USD')
  })
})
