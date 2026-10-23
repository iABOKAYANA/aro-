import { describe, expect, it } from 'vitest'
import { stripBrandSuffix, projectTitle } from '@/lib/seo'
import type { SeoProjectLike } from '@/lib/seo'

// leftover "… - Nawy" suffixes ride in metaTitles from the Nawy catalog
// imports (114 public rows did when caught) — no ghayaestate SERP may show a
// foreign brand. GHAYA suffix strips too (previous double-suffix guard).
describe('stripBrandSuffix — Nawy mirror-brand leftovers', () => {
  it('strips "- Nawy" (hyphen, the common import shape)', () => {
    expect(stripBrandSuffix('Hyde Park New Cairo 2026 Prices - Nawy')).toBe('Hyde Park New Cairo 2026 Prices')
  })
  it('strips "| Nawy" and "— Nawy" variants', () => {
    expect(stripBrandSuffix('Azha Prices | Nawy')).toBe('Azha Prices')
    expect(stripBrandSuffix('Azha Prices — Nawy')).toBe('Azha Prices')
  })
  it('leaves "Nawy" when it is the project name itself, not a suffix', () => {
    expect(stripBrandSuffix('Nawy Compound')).toBe('Nawy Compound')
  })
  it('still strips the GHAYA suffix', () => {
    expect(stripBrandSuffix('Palm Parks | GHAYA')).toBe('Palm Parks')
    expect(stripBrandSuffix('Palm Parks | GHAYA REAL ESTATE')).toBe('Palm Parks')
  })

  it('projectTitle: metaTitle ending in "- Nawy" renders clean', () => {
    const p: SeoProjectLike = {
      slug: '38-hyde-park',
      metaTitle: 'Hyde Park New Cairo 2026 Prices, Location, & Facilities - Nawy',
      name: 'Hyde Park',
      startPrice: 0,
    } as unknown as SeoProjectLike
    expect(projectTitle(p)).toBe('Hyde Park New Cairo 2026 Prices, Location, & Facilities')
  })
})
