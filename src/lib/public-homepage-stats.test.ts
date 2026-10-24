import { describe, expect, it } from 'vitest'
import { summarizePublicHomepageStats } from '@/lib/public-homepage-stats'

describe('public homepage catalog statistics', () => {
  it('counts the supplied public catalog, distinct cities and developers—not the card sample', () => {
    const stats = summarizePublicHomepageStats(
      [
        { developerId: 'dev-a', cityId: 'city-1' },
        { developerId: 'dev-a', cityId: 'city-1' },
        { developerId: 'dev-b', cityId: 'city-2' },
        { developerId: 'dev-b', cityId: null },
      ],
      [
        { id: 'dev-b', companyName: 'B Development', companyNameArabic: null, slug: 'b-development' },
        { id: 'dev-a', companyName: 'A Development', companyNameArabic: 'أ للتطوير', slug: null },
        { id: 'unlisted', companyName: 'Not Public', companyNameArabic: null, slug: 'not-public' },
      ],
      17,
    )

    expect(stats).toMatchObject({
      projectCount: 4,
      developerCount: 2,
      cityCount: 2,
      availableUnitCount: 17,
    })
    expect(stats.featuredDevelopers.map((d) => [d.id, d.projectCount])).toEqual([
      ['dev-a', 2],
      ['dev-b', 2],
    ])
    expect(stats.featuredDevelopers.some((d) => d.id === 'unlisted')).toBe(false)
  })
})
