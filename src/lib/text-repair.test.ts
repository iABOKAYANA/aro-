import { describe, it, expect } from 'vitest'
import { collapseJammedDuplicates } from '@/lib/text-repair'

describe('collapseJammedDuplicates', () => {
  it('collapses an immediate no-space Latin phrase jam (Emaar Misr)', () => {
    expect(
      collapseJammedDuplicates(
        'Emaar MisrEmaar Misr has been a major player in the Egyptian real-estate market.'
      )
    ).toBe('Emaar Misr has been a major player in the Egyptian real-estate market.')
  })

  it('leaves separated repeated words untouched', () => {
    const clean = 'The community is very very large and very very green.'
    expect(collapseJammedDuplicates(clean)).toBe(clean)
  })

  it('leaves Arabic-script text untouched', () => {
    const ar = 'إعمار مصرإعمار مصر هي من أبرز المطورين العقاريين داخل مصر اليوم.'
    expect(collapseJammedDuplicates(ar)).toBe(ar)
  })
})
