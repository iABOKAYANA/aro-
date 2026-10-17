import { describe, expect, it } from 'vitest'
import { csvName, downloadCsv, toCsv } from '@/lib/csv'

describe('toCsv', () => {
  it('returns empty string for no rows', () => {
    expect(toCsv([])).toBe('')
  })

  it('writes header + CRLF-joined rows', () => {
    expect(
      toCsv([
        { name: 'A', price: 100 },
        { name: 'B', price: 200 },
      ]),
    ).toBe('name,price\r\nA,100\r\nB,200')
  })

  it('quotes cells containing commas', () => {
    expect(toCsv([{ city: 'Cairo, Egypt' }])).toBe('city\r\n"Cairo, Egypt"')
  })

  it('doubles embedded quotes and quotes cells with newlines', () => {
    expect(toCsv([{ note: 'say "hi"' }])).toBe('note\r\n"say ""hi"""')
    expect(toCsv([{ note: 'line1\nline2' }])).toBe('note\r\n"line1\nline2"')
  })

  it('prefixes formula-injection cells with a single quote', () => {
    const out = toCsv([{ a: '=1+1', b: '+5', c: '@cmd', d: '-5' }])
    expect(out).toContain("'=1+1")
    expect(out).toContain("'+5")
    expect(out).toContain("'@cmd")
    expect(out).toContain("'-5")
  })

  it('renders null/undefined as empty, Dates as YYYY-MM-DD', () => {
    expect(toCsv([{ a: null, b: undefined, c: new Date('2026-03-05T12:00:00Z') }])).toBe(
      'a,b,c\r\n,,2026-03-05',
    )
  })

  it('joins arrays with " | " and stringifies objects as-is (no quoting)', () => {
    const out = toCsv([{ tags: ['a', 'b'], meta: { x: 1 } }])
    expect(out).toContain('a | b')
    // NOTE: object cells return early from cell() and bypass CSV quoting —
    // current behaviour, asserted here so a change is caught deliberately.
    expect(out).toContain('{"x":1}')
  })

  it('unions keys in first-seen order without columns', () => {
    expect(toCsv([{ a: 1 }, { b: 2, a: 3 }])).toBe('a,b\r\n1,\r\n3,2')
  })

  it('honours an explicit column order (incl. missing keys)', () => {
    expect(toCsv([{ a: 1, b: 2 }], ['b', 'a', 'zzz'])).toBe('b,a,zzz\r\n2,1,')
  })

  it('keeps Arabic text intact (BOM is only added at download time)', () => {
    const out = toCsv([{ city: 'القاهرة' }])
    expect(out).toContain('القاهرة')
    expect(out.charCodeAt(0)).not.toBe(0xfeff)
  })
})

describe('csvName', () => {
  it('joins and lowercases table + suffix', () => {
    expect(csvName('leads', 'active')).toBe('leads-active')
    expect(csvName('Units')).toBe('units')
  })
})

describe('downloadCsv', () => {
  it('returns false outside a browser (no DOM touch in node)', () => {
    expect(downloadCsv('x', [{ a: 1 }])).toBe(false)
    expect(downloadCsv('x', [])).toBe(false)
  })
})
