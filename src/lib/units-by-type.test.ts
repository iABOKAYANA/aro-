import { describe, expect, it } from 'vitest'
import { unitCategoryRows } from './units-by-type'

const u = (over: Record<string, unknown> = {}) => ({
  unitType: 'APARTMENT',
  bedrooms: 1,
  area: 100,
  price: 5_000_000,
  status: 'AVAILABLE',
  isSample: false,
  name: 'Apartment 1BR 100 m²',
  nameArabic: 'شقة',
  ...over,
})

describe('unitCategoryRows', () => {
  it('الوحدة اللي اترند=أول صف بالغرف وترتيب صح: 1 ثم 2 ثم 3 ثم 4', () => {
    const rows = unitCategoryRows([
      u({ bedrooms: 2, area: 145, price: 10_358_000 }),
      u({ bedrooms: 1, area: 84, price: 6_006_000 }),
      u({ bedrooms: 4, area: 240, price: 23_000_000 }),
      u({ bedrooms: 3, area: 166, price: 15_500_000 }),
    ])
    expect(rows.map((r) => r.key)).toEqual(['BED_1', 'BED_2', 'BED_3', 'BED_4'])
    expect(rows[0]).toMatchObject({
      key: 'BED_1',
      labelAr: 'شقة غرفة واحدة',
      labelEn: '1BR',
      count: 1,
      minArea: 84,
      startingPrice: 6_006_000,
    })
  })

  it('5+ يتجمعوا في صف واحد وترتيبع 5th', () => {
    const rows = unitCategoryRows([
      u({ bedrooms: 5, area: 300, price: 30_000_000 }),
      u({ bedrooms: 7, area: 400, price: 45_000_000 }),
      u({ bedrooms: 1 }),
    ])
    expect(rows.map((r) => r.key)).toEqual(['BED_1', 'BED_5'])
    expect(rows[1]).toMatchObject({ count: 2, minArea: 300, startingPrice: 30_000_000, labelAr: 'شقة 5 غرف وأكثر' })
  })

  it('يفصل أنواع +N عن نفس عدد الغرف ويحافظ على متوسط المساحة من المصدر', () => {
    const rows = unitCategoryRows([
      u({ bedrooms: 2, name: '2B · Average area 123 sqm', area: 123, price: 10_900_000 }),
      u({ bedrooms: 2, name: '2B+N · Average area 127 sqm', area: 127, price: 11_200_000 }),
      u({ bedrooms: 3, name: '3B · Average area 149 sqm', area: 149, price: 13_200_000 }),
      u({ bedrooms: 3, name: '3B+N · Average area 160 sqm', area: 160, price: 14_100_000 }),
      u({ bedrooms: 4, name: '4B+N · Average area 199 sqm', area: 199, price: 17_500_000 }),
    ])
    expect(rows.map((r) => r.key)).toEqual(['BED_2', 'BED_2_N', 'BED_3', 'BED_3_N', 'BED_4_N'])
    expect(rows.map((r) => r.areaLabel)).toEqual(['average', 'average', 'average', 'average', 'average'])
    expect(rows[1]).toMatchObject({ labelEn: '2BR + N', labelAr: 'شقة غرفتين + N', minArea: 127, startingPrice: 11_200_000 })
  })

  it('المساحة الأولية = أصغر مساحة والسعر = أرخص سعر (ممكن من وحدتين مختلفتين، أجريات حرة)', () => {
    const rows = unitCategoryRows([
      u({ bedrooms: 2, area: 140, price: 10_426_000 }), // أصغر مساحة
      u({ bedrooms: 2, area: 145, price: 10_358_000 }), // أرخص سعر (مختلفة)
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].minArea).toBe(140)
    expect(rows[0].startingPrice).toBe(10_358_000)
  })

  it('الشاليهات محطوطة في نظام فيلات + تدرج (توأين)، الفانيلات الفريدة في الصف VILLA', () => {
    const rows = unitCategoryRows([
      u({ unitType: 'VILLA', bedrooms: null, name: 'Twin House — From 27.767M', area: 300, price: 27_767_000 }),
      u({ unitType: 'VILLA', bedrooms: null, name: 'Standalone Villa — From 37.258M', area: 380, price: 37_258_000 }),
      u({ unitType: 'CHALET', bedrooms: 2, name: '2BR Chalet', area: 120, price: 14_028_000 }),
      u({ unitType: 'TOWNHOUSE', bedrooms: null, name: 'Townhouse', area: 220, price: 21_662_000 }),
    ])
    expect(rows.map((r) => r.key)).toEqual(['VILLA', 'VILLA_TWIN', 'TOWNHOUSE', 'CHALET'])
    const villa = rows.find((r) => r.key === 'VILLA')!
    expect(villa.labelAr).toBe('بناني (فيلا مستقلة)')
    expect(villa.count).toBe(1)
    expect(rows.find((r) => r.key === 'VILLA_TWIN')!.labelAr).toBe('توين هاوس')
  })

  it('التجاري/الإداري/الطبي صف لكل نوع بالغرف ماتتتجمعش في صف', () => {
    const rows = unitCategoryRows([
      u({ unitType: 'COMMERCIAL', bedrooms: null, name: 'Retail 102 m²', area: 102, price: 18_219_000 }),
      u({ unitType: 'COMMERCIAL', bedrooms: null, name: 'Retail 71 m²', area: 71, price: 14_390_000 }),
      u({ unitType: 'ADMINISTRATIVE', bedrooms: null, area: 75, price: 7_447_000 }),
      u({ unitType: 'MEDICAL', bedrooms: null, area: 151, price: 11_051_000 }),
    ])
    expect(rows.map((r) => r.key)).toEqual(['COMMERCIAL', 'ADMINISTRATIVE', 'MEDICAL'])
    expect(rows.find((r) => r.key === 'COMMERCIAL')).toMatchObject({ count: 2, minArea: 71, startingPrice: 14_390_000, labelAr: 'محل تجاري' })
  })

  it('الاستوديو والبنتهاوس والدوبلكس صف مستقل بالغرف مش مجزأة', () => {
    const rows = unitCategoryRows([
      u({ unitType: 'STUDIO', bedrooms: 0, area: 49, price: 8_800_000 }),
      u({ unitType: 'PENTHOUSE', bedrooms: 4, area: 270, price: 24_135_000 }),
      u({ unitType: 'DUPLEX', bedrooms: 3, area: 210, price: 19_000_000 }),
    ])
    expect(rows.map((r) => r.key)).toEqual(['STUDIO', 'DUPLEX', 'PENTHOUSE'])
  })

  it('شوينك كايس (isSample) والحالة (SOLD) مش بتعدّي في المشتري', () => {
    const rows = unitCategoryRows([
      u({ isSample: true, area: 50, price: 1_000_000 }),
      u({ status: 'SOLD', area: 60, price: 2_000_000 }),
    ])
    expect(rows).toHaveLength(0)
  })
})
