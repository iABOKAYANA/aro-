import { describe, it, expect } from 'vitest'
import { formatMillions } from '@/lib/ai-market-study'
import { stripStaleDomainLinks } from '@/lib/ai-llm'

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
describe('link repair (stripStaleDomainLinks)', () => {
  it('rewrites the hallucinated ghaya:// scheme to a relative path', () => {
    expect(stripStaleDomainLinks('[gree](ghaya://projects/1101-greens)')).toBe('[gree](/projects/1101-greens)')
    expect(stripStaleDomainLinks('[](https://estateai.eg/projects/x)')).toBe('[](/projects/x)')
    expect(stripStaleDomainLinks('اجميع /projects/150-royal')).toBe('اجميع /projects/150-royal')
  })
})
