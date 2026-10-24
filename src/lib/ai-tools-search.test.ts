import { describe, expect, it } from 'vitest'
import { normalizeSearchFilters } from '@/lib/ai-tools'

describe('AI catalog search arguments', () => {
  it('normalizes Arabic area/type words and maps developerName to the actual catalog filter', () => {
    const filters = normalizeSearchFilters({
      page: 1,
      limit: 6,
      city: 'الشيخ زايد',
      propertyType: 'townhouse' as never,
      developerName: 'سوديك',
    })

    expect(filters).toMatchObject({
      city: 'sheikh-zayed',
      propertyType: 'TOWNHOUSE',
      developer: 'سوديك',
    })
    expect(filters).not.toHaveProperty('developerName')
  })

  it('preserves an already-normalized developer filter', () => {
    const filters = normalizeSearchFilters({ page: 1, limit: 6, developer: 'Mountain View' })
    expect(filters.developer).toBe('Mountain View')
  })
})
