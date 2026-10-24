import { describe, expect, it } from 'vitest'
import {
  normalizeCityInput,
  normalizeListingTypeInput,
  normalizePropertyTypeInput,
  parseNaturalLanguageQuery,
  hasListingIntent,
} from '@/lib/ai-search-parser'

describe('parseNaturalLanguageQuery', () => {
  it('parses a full English query (location + type + beds + price)', () => {
    const { filters, confidence } = parseNaturalLanguageQuery(
      'villa in new cairo 3 bedrooms under 5 million',
    )
    expect(filters.city).toBe('new-cairo')
    expect(filters.propertyType).toBe('VILLA')
    expect(filters.bedrooms).toBe(3)
    expect(filters.maxPrice).toBe(5_000_000)
    expect(confidence).toBeGreaterThan(0)
  })

  it('parses Arabic queries', () => {
    const { filters } = parseNaturalLanguageQuery('شقة في التجمع الخامس')
    expect(filters.propertyType).toBe('APARTMENT')
    expect(filters.city).toBe('new-cairo')
  })

  it('detects rent listing intent', () => {
    const { filters } = parseNaturalLanguageQuery('apartment for rent in maadi')
    expect(filters.listingType).toBe('RENT')
    expect(filters.city).toBe('cairo')
  })

  it('parses price ranges and lower bounds', () => {
    const range = parseNaturalLanguageQuery('apartment from 3 to 5 million')
    expect(range.filters.minPrice).toBe(3_000_000)
    expect(range.filters.maxPrice).toBe(5_000_000)

    const over = parseNaturalLanguageQuery('villa over 10 million')
    expect(over.filters.minPrice).toBe(10_000_000)
  })

  it('parses area requirements and zayed location', () => {
    const { filters } = parseNaturalLanguageQuery('villa 200 sqm in sheikh zayed')
    expect(filters.minArea).toBe(200)
    expect(filters.city).toBe('sheikh-zayed')
  })

  it('surfaces developers in the summary without polluting filters', () => {
    const { filters, summary } = parseNaturalLanguageQuery('sodic villa')
    expect(summary.find((s) => s.field === 'developer')?.value).toBe('SODIC')
    expect(filters.city).toBeUndefined()
  })

  it('understands colloquial Arabic project and developer words', () => {
    const { filters, summary } = parseNaturalLanguageQuery('عايز تاون في زايد من سوديك')
    expect(filters.propertyType).toBe('TOWNHOUSE')
    expect(filters.city).toBe('sheikh-zayed')
    expect(summary.find((s) => s.field === 'developer')?.value).toBe('SODIC')
    expect(hasListingIntent('مشاريع سوديك في زايد')).toBe(true)
  })

  it('maps sort hints (cheapest / luxury)', () => {
    expect(parseNaturalLanguageQuery('cheapest apartments').filters.sortBy).toBe('price_asc')
    expect(parseNaturalLanguageQuery('luxury villa').filters.sortBy).toBe('price_desc')
  })

  it('detects installment intent from down-payment phrasing', () => {
    const { filters } = parseNaturalLanguageQuery('apartment with down payment')
    expect(filters.listingType).toBe('INSTALLMENT')
  })

  it('returns defaults + zero confidence for an empty query', () => {
    const { filters, summary, confidence } = parseNaturalLanguageQuery('')
    expect(filters).toMatchObject({ page: 1, limit: 12 })
    expect(summary).toEqual([])
    expect(confidence).toBe(0)
  })

  it('keeps confidence within 0..100', () => {
    const { confidence } = parseNaturalLanguageQuery('3 bedroom villa in new cairo under 8 million cheapest')
    expect(confidence).toBeGreaterThanOrEqual(0)
    expect(confidence).toBeLessThanOrEqual(100)
  })

  it('parses the Arabic combined query (Indic digits + أوض + التجمع + تحت)', () => {
    const { filters } = parseNaturalLanguageQuery('شقة ٣ أوض في التجمع تحت ٨ مليون')
    expect(filters.city).toBe('new-cairo')
    expect(filters.bedrooms).toBe(3)
    expect(filters.maxPrice).toBe(8_000_000)
    expect(filters.propertyType).toBe('APARTMENT')
  })

  it('parses the English combined query', () => {
    const { filters } = parseNaturalLanguageQuery('3 bedroom apartment in New Cairo under 10 million')
    expect(filters.city).toBe('new-cairo')
    expect(filters.bedrooms).toBe(3)
    expect(filters.maxPrice).toBe(10_000_000)
    expect(filters.propertyType).toBe('APARTMENT')
  })

  it('folds Persian digits too', () => {
    const { filters } = parseNaturalLanguageQuery('شقة ۳ اوض تحت ۸ مليون')
    expect(filters.bedrooms).toBe(3)
    expect(filters.maxPrice).toBe(8_000_000)
  })

  it('maps every Arabic city alias to its DB slug', () => {
    const cases: Array<[string, string]> = [
      ['التجمع', 'new-cairo'],
      ['التجمع الخامس', 'new-cairo'],
      ['التجمع الرابع', 'new-cairo'],
      ['التجمع السادس', 'new-cairo'],
      ['القاهرة الجديدة', 'new-cairo'],
      ['مدينتي', 'new-cairo'],
      ['مدينة المستقبل', 'new-cairo'],
      ['الشيخ زايد', 'sheikh-zayed'],
      ['زايد', 'sheikh-zayed'],
      ['نيو زايد', 'new-zayed'],
      ['العاصمة', 'new-capital-city'],
      ['العاصمة الإدارية', 'new-capital-city'],
      ['اكتوبر', '6th-of-october-city'],
      ['حدائق أكتوبر', '6th-of-october-city'],
      ['الشروق', 'el-shorouk'],
      ['العين السخنة', 'ain-sokhna'],
      ['العلمين', 'al-alamein'],
      ['العلمين الجديدة', 'al-alamein'],
      ['الضبعة', 'al-dabaa'],
      ['راس الحكمة', 'ras-el-hekma'],
      ['راس سدر', 'ras-sudr'],
      ['سيدي عبد الرحمن', 'sidi-abdel-rahman'],
      ['الجونة', 'el-gouna'],
      ['مكادي', 'makadi'],
      ['mostakbal city', 'new-cairo'],
      ['new zayed', 'new-zayed'],
      ['new capital', 'new-capital-city'],
      ['ras el hekma', 'ras-el-hekma'],
    ]
    for (const [text, slug] of cases) {
      expect(parseNaturalLanguageQuery(`شقة في ${text}`).filters.city, text).toBe(slug)
    }
  })

  it('maps coast-level concepts to the matrouh governorate (no city row exists)', () => {
    for (const text of ['شاليه في الساحل', 'شاليه في الساحل الشمالي', 'villa in north coast', 'شاليه في مارينا', 'مرسى مطروح']) {
      const { filters } = parseNaturalLanguageQuery(text)
      expect(filters.governorate, text).toBe('matrouh')
      expect(filters.city, text).toBeUndefined()
    }
    expect(parseNaturalLanguageQuery('شقة في الجيزة').filters.governorate).toBe('giza')
    expect(parseNaturalLanguageQuery('شقة في الغردقة').filters.governorate).toBe('red-sea')
  })

  it('parses bedroom words in both digit systems', () => {
    expect(parseNaturalLanguageQuery('شقة ٣ أوض').filters.bedrooms).toBe(3)
    expect(parseNaturalLanguageQuery('شقة 3 اوض').filters.bedrooms).toBe(3)
    expect(parseNaturalLanguageQuery('شقة ٤ غرف').filters.bedrooms).toBe(4)
    expect(parseNaturalLanguageQuery('فيلا 5 غرف نوم').filters.bedrooms).toBe(5)
    expect(parseNaturalLanguageQuery('شقة غرفتين').filters.bedrooms).toBe(2)
    expect(parseNaturalLanguageQuery('شقة ثلاث غرف').filters.bedrooms).toBe(3)
    expect(parseNaturalLanguageQuery('three bedroom villa').filters.bedrooms).toBe(3)
  })

  it('maps bedroom/type words to unit-type enums', () => {
    const cases: Array<[string, string]> = [
      ['شقة', 'APARTMENT'],
      ['شقق', 'APARTMENT'],
      ['فيلا', 'VILLA'],
      ['فلل', 'VILLA'],
      ['دوبلكس', 'DUPLEX'],
      ['تاون هاوس', 'TOWNHOUSE'],
      ['توين هاوس', 'TOWNHOUSE'],
      ['بنتهاوس', 'PENTHOUSE'],
      ['روف', 'PENTHOUSE'],
      ['شاليه', 'CHALET'],
      ['استديو', 'STUDIO'],
      ['مكتب', 'ADMINISTRATIVE'],
      ['محل', 'COMMERCIAL'],
      ['عيادة', 'MEDICAL'],
      ['أرض', 'LAND'],
    ]
    for (const [word, type] of cases) {
      expect(parseNaturalLanguageQuery(`${word} في التجمع`).filters.propertyType, word).toBe(type)
    }
  })

  it('parses Arabic price phrases (direction + magnitude)', () => {
    expect(parseNaturalLanguageQuery('شقة تحت 8 مليون').filters.maxPrice).toBe(8_000_000)
    expect(parseNaturalLanguageQuery('شقة اقل من ٥ مليون').filters.maxPrice).toBe(5_000_000)
    expect(parseNaturalLanguageQuery('شقة لحد 10 مليون').filters.maxPrice).toBe(10_000_000)
    expect(parseNaturalLanguageQuery('فيلا فوق 20 مليون').filters.minPrice).toBe(20_000_000)
    expect(parseNaturalLanguageQuery('فيلا اكتر من ١٥ مليون').filters.minPrice).toBe(15_000_000)
    expect(parseNaturalLanguageQuery('شقة يبدأ من 3 مليون').filters.minPrice).toBe(3_000_000)
    expect(parseNaturalLanguageQuery('شقة 500 ألف').filters.maxPrice).toBe(500_000)
    expect(parseNaturalLanguageQuery('شقة تحت 8 مليون جنيه').filters.maxPrice).toBe(8_000_000)
    expect(parseNaturalLanguageQuery('شقة 8000000').filters.maxPrice).toBe(8_000_000)
  })

  it('understands spoken amounts and common Egyptian budget ranges', () => {
    expect(parseNaturalLanguageQuery('ميزانيتي خمسة مليون').filters.maxPrice).toBe(5_000_000)
    expect(parseNaturalLanguageQuery('ميزانيتي خمسة ونص مليون').filters.maxPrice).toBe(5_500_000)
    expect(parseNaturalLanguageQuery('ميزانيتي مليون ونص').filters.maxPrice).toBe(1_500_000)
    expect(parseNaturalLanguageQuery('شقة بين ٥ و٨ مليون').filters).toMatchObject({ minPrice: 5_000_000, maxPrice: 8_000_000 })
    expect(parseNaturalLanguageQuery('شقة من ٥ لحد ٨ مليون').filters).toMatchObject({ minPrice: 5_000_000, maxPrice: 8_000_000 })
    expect(parseNaturalLanguageQuery('شقة مقدم ٢ مليون').filters.maxPrice).toBeUndefined()
    expect(parseNaturalLanguageQuery('شقة بمقدم ٢ مليون وميزانية ٨ مليون').filters.maxPrice).toBe(8_000_000)
    expect(parseNaturalLanguageQuery('شقة ٣ غرف من ١٢٠ لـ ١٥٠ متر تحت ٨ مليون').filters).toMatchObject({
      bedrooms: 3,
      minArea: 120,
      maxArea: 150,
      maxPrice: 8_000_000,
    })
  })

  it('recognizes colloquial finishing descriptions', () => {
    expect(parseNaturalLanguageQuery('عايز شقة نص تشطيب').filters.finishingType).toBe('SEMI_FINISHED')
    expect(parseNaturalLanguageQuery('عايز شقة سوبر لوكس').filters.finishingType).toBe('SUPER_LUXURY')
    expect(parseNaturalLanguageQuery('عايز شقة على المحارة').filters.finishingType).toBe('CORE_SHELL')
  })

  it('normalizes raw tool args (display names, Arabic, any case)', () => {
    expect(normalizeCityInput('New Cairo')).toEqual({ city: 'new-cairo' })
    expect(normalizeCityInput('التجمع')).toEqual({ city: 'new-cairo' })
    expect(normalizeCityInput('new-cairo')).toEqual({ city: 'new-cairo' })
    expect(normalizeCityInput('الساحل')).toEqual({ governorate: 'matrouh' })
    expect(normalizeCityInput('Atlantis')).toEqual({})
    expect(normalizeCityInput('')).toEqual({})
    expect(normalizePropertyTypeInput('apartment')).toBe('APARTMENT')
    expect(normalizePropertyTypeInput('APARTMENT')).toBe('APARTMENT')
    expect(normalizePropertyTypeInput('twin_house')).toBe('TOWNHOUSE')
    expect(normalizePropertyTypeInput('شقة')).toBe('APARTMENT')
    expect(normalizePropertyTypeInput('castle')).toBeUndefined()
    expect(normalizeListingTypeInput('sale')).toBe('SALE')
    expect(normalizeListingTypeInput('RENT')).toBe('RENT')
    expect(normalizeListingTypeInput('تقسيط')).toBe('INSTALLMENT')
  })
})
