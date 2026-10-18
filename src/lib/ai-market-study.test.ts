import { describe, it, expect } from 'vitest'
import { formatMillions } from '@/lib/ai-market-study'

describe('ai-market-study helpers', () => {
  it('formats real EGP values as millions (bilingual-safe digits)', () => {
    expect(formatMillions(8_000_000)).toBe('8M')
    expect(formatMillions(6_870_000)).toBe('6.9M')
    expect(formatMillions(2_500_000)).toBe('2.5M')
  })
  it('nulls and non-values stay null (never invented)', () => {
    expect(formatMillions(null)).toBeNull()
    expect(formatMillions(0)).toBeNull()
    expect(formatMillions(-5)).toBeNull()
  })
})
