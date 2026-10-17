import { beforeEach, describe, expect, it } from 'vitest'
import { setActiveCurrency, setRates, DEFAULT_RATES } from '@/lib/currency'
import {
  EGYPT_GOVERNORATES,
  LISTING_TYPES,
  PROPERTY_TYPES,
  classNames,
  cn,
  formatEGP,
  formatSQM,
  generateOTP,
  getInitials,
  parseJsonSafe,
  slugify,
  truncate,
} from '@/lib/utils'
import { isValidImageUrl } from '@/lib/image-url'

beforeEach(() => {
  setActiveCurrency('EGP')
  setRates({ ...DEFAULT_RATES })
})

describe('slugify', () => {
  it('lowercases, strips punctuation, joins with dashes', () => {
    expect(slugify('Hello World!')).toBe('hello-world')
    expect(slugify('New Cairo Compound 5')).toBe('new-cairo-compound-5')
  })

  it('collapses separators and trims edge dashes', () => {
    expect(slugify('  --New Cairo__Compound-- ')).toBe('new-cairo-compound')
  })

  it('returns empty string for empty / punctuation-only input', () => {
    expect(slugify('')).toBe('')
    expect(slugify('!!!')).toBe('')
  })
})

describe('truncate', () => {
  it('leaves short strings untouched', () => {
    expect(truncate('abc', 5)).toBe('abc')
    expect(truncate('abcde', 5)).toBe('abcde')
  })

  it('cuts and appends an ellipsis', () => {
    expect(truncate('abcdef', 3)).toBe('abc...')
  })
})

describe('getInitials', () => {
  it.each([null, undefined, ''])('returns ? for %p', (v) => {
    expect(getInitials(v as null)).toBe('?')
  })

  it('uppercases the first two name initials', () => {
    expect(getInitials('Ahmed Hassan')).toBe('AH')
    expect(getInitials('mona')).toBe('M')
    expect(getInitials('Ahmed Hassan Ali')).toBe('AH')
  })
})

describe('parseJsonSafe', () => {
  it('parses valid JSON', () => {
    expect(parseJsonSafe('{"a":1}', {})).toEqual({ a: 1 })
    expect(parseJsonSafe('[1,2]', [] as number[])).toEqual([1, 2])
  })

  it('returns the fallback for bad / empty / nullish input', () => {
    const fb = { ok: false }
    expect(parseJsonSafe('{broken', fb)).toBe(fb)
    expect(parseJsonSafe('', fb)).toBe(fb)
    expect(parseJsonSafe(null, fb)).toBe(fb)
    expect(parseJsonSafe(undefined, fb)).toBe(fb)
    expect(parseJsonSafe('null', fb)).toBe(fb)
  })
})

describe('formatters', () => {
  it('formatSQM uses a deterministic en-US grouping', () => {
    expect(formatSQM(1500)).toBe('1,500 sqm')
    expect(formatSQM(0)).toBe('0 sqm')
    expect(formatSQM(250)).toBe('250 sqm')
  })

  it('formatEGP mirrors the active currency and guards NaN', () => {
    expect(formatEGP(NaN).trim()).toBe('—')
    expect(formatEGP(2000000)).toContain('2,000,000')
  })
})

describe('class helpers', () => {
  it('cn joins classes and lets tailwind-merge resolve conflicts', () => {
    expect(cn('a', 'b')).toBe('a b')
    expect(cn('px-2', 'px-4')).toBe('px-4')
    expect(cn('a', false && 'b', undefined)).toBe('a')
  })

  it('classNames drops falsy entries', () => {
    expect(classNames('a', false, null, undefined, 'b')).toBe('a b')
  })
})

describe('generateOTP', () => {
  it('always yields a 6-digit numeric string in range', () => {
    for (let i = 0; i < 25; i++) {
      const otp = generateOTP()
      expect(otp).toMatch(/^\d{6}$/)
      expect(Number(otp)).toBeGreaterThanOrEqual(100000)
      expect(Number(otp)).toBeLessThanOrEqual(999999)
    }
  })
})

describe('domain constants', () => {
  it('covers the expected governorates / types', () => {
    expect(EGYPT_GOVERNORATES).toContain('Cairo')
    expect(EGYPT_GOVERNORATES.length).toBeGreaterThan(10)
    expect([...PROPERTY_TYPES]).toContain('APARTMENT')
    expect([...LISTING_TYPES]).toEqual(['SALE', 'RENT', 'RESALE', 'INSTALLMENT'])
  })
})

describe('isValidImageUrl', () => {
  it.each(['https://cdn.x/a.jpg', 'http://x.com/a.png', '/images/a.webp', '//cdn/x.jpg', 'https://store.public.blob.vercel-storage.com/images/uploads/123-abcd.jpg'])(
    'accepts %s',
    (v) => expect(isValidImageUrl(v)).toBe(true),
  )

  it.each(['notaurl', '', 'ftp://x/a.jpg', 'data:image/png;base64,xx', 'example.com/a.jpg'])(
    'rejects %p',
    (v) => expect(isValidImageUrl(v)).toBe(false),
  )

  it('rejects non-strings', () => {
    expect(isValidImageUrl(null)).toBe(false)
    expect(isValidImageUrl(undefined)).toBe(false)
    expect(isValidImageUrl(123)).toBe(false)
  })
})
