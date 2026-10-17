import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { PUBLIC_PROJECT_WHERE, PUBLIC_UNIT_PROJECT_WHERE } from '@/lib/project-visibility'
import { getClientIp, rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

interface ExtractedFilters {
  budget: { min?: number; max?: number } | null
  location: string | null
  bedrooms: number | null
  propertyType: string | null
  listingType: string | null
  deliveryPreference: string | null
  keywords: string[]
}

function extractFilters(query: string): ExtractedFilters {
  // Arabic-Indic / Persian digits (٣ أوض، ٨ مليون) never match \d — fold first.
  const AR_D = '٠١٢٣٤٥٦٧٨٩'
  const FA_D = '۰۱۲۳۴۵۶۷۸۹'
  const folded = query
    .replace(/[٠-٩]/g, (d) => String(AR_D.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(FA_D.indexOf(d)))
  const q = folded.toLowerCase()

  const filters: ExtractedFilters = {
    budget: null,
    location: null,
    bedrooms: null,
    propertyType: null,
    listingType: null,
    deliveryPreference: null,
    keywords: [],
  }

  // Extract budget (Arabic triggers + ألف thousands, not just millions).
  // Directional patterns (تحت/فوق…) run BEFORE the generic "X million"
  // one, otherwise "فوق 10 مليون" would parse as max instead of min.
  const hasThousand = /(ألف|الاف|thousand)/i.test(q) && !/(مليون|million)/i.test(q)
  const budgetMult = hasThousand ? 1000 : 1000000
  const rangePatterns = [
    /(\d+)\s*(?:m|million)\s*(?:to|-)\s*(\d+)\s*(?:m|million)/i,
    /between\s+(\d+)\s*(?:m|million)\s*(?:and|to|-)\s*(\d+)\s*(?:m|million)/i,
  ]
  const underPatterns = [
    /(?:under|below|less than|up to|maximum|max|تحت|اقل من|أقل من|لحد)\s+(\d+)\s*(?:million|m|مليون|ألف|الاف|جنيه|egp)?/i,
  ]
  const overPatterns = [
    /(?:over|above|more than|starting from|فوق|اكتر من|أكتر من|اكثر من|أكثر من|يبدأ من|ابتداء من)\s+(\d+)\s*(?:million|m|مليون|ألف|الاف|جنيه|egp)?/i,
  ]
  const singlePatterns = [
    /(\d+)\s*(?:million|m|مليون|ألف|الاف)\s*(?:egp|جنيه)?/i,
    /(\d+)\s*[mM](?:\s|$|,|\.)/,
    /(\d{7,})\s*(?:egp|جنيه)?/i,
  ]

  const scaleDown = (num: number) => (num < 1000 ? num * budgetMult : num)
  let budgetMatched = false
  for (const pattern of rangePatterns) {
    const match = q.match(pattern)
    if (match && match[2]) {
      filters.budget = { min: Number(match[1]) * 1000000, max: Number(match[2]) * 1000000 }
      budgetMatched = true
      break
    }
  }
  if (!budgetMatched) {
    for (const pattern of underPatterns) {
      const match = q.match(pattern)
      if (match) {
        filters.budget = { max: scaleDown(Number(match[1])) }
        budgetMatched = true
        break
      }
    }
  }
  if (!budgetMatched) {
    for (const pattern of overPatterns) {
      const match = q.match(pattern)
      if (match) {
        filters.budget = { min: scaleDown(Number(match[1])) }
        budgetMatched = true
        break
      }
    }
  }
  if (!budgetMatched) {
    for (const pattern of singlePatterns) {
      const match = q.match(pattern)
      if (match) {
        filters.budget = { max: scaleDown(Number(match[1])) }
        break
      }
    }
  }

  // Extract location
  const locations = [
    'new cairo', 'القاهرة الجديدة',
    'sheikh zayed', 'الشيخ زايد', 'زايد',
    'new capital', 'العاصمة الإدارية', 'العاصمة',
    '6th october', 'october', 'city october', 'اكتوبر', 'أكتوبر',
    'north coast', 'الساحل الشمالي', 'الساحل',
    'fifth settlement', 'التجمع الخامس', 'التجمع',
    'fourth settlement', 'التجمع الرابع',
    'maadi', 'المعادي',
    'heliopolis', 'مصر الجديدة',
    'nasr city', 'مدينة نصر',
    'haram', 'الهرم',
    'dokki', 'الدقي',
    'mohandessin', 'المهندسين',
    'zamalek', 'الزمالك',
    'tagamoa', 'التجمع',
  ]
  for (const loc of locations) {
    if (q.includes(loc)) {
      // Values must be substrings of real DB slugs (the query uses
      // `contains`): city new-capital-city, 6th-of-october-city, district
      // fifth-settlement, governorate matrouh (no "north coast" city row).
      filters.location = loc.includes('التجمع') ? 'new-cairo' :
        loc === 'new cairo' || loc === 'القاهرة الجديدة' ? 'new-cairo' :
        loc === 'sheikh zayed' || loc === 'الشيخ زايد' || loc === 'زايد' ? 'sheikh-zayed' :
        loc === 'new capital' || loc === 'العاصمة الإدارية' || loc === 'العاصمة' ? 'new-capital-city' :
        loc === 'october' || loc === '6th october' || loc === 'city october' || loc === 'اكتوبر' || loc === 'أكتوبر' ? '6th-of-october-city' :
        loc === 'fifth settlement' || loc === 'التجمع الخامس' ? 'fifth-settlement' :
        loc === 'north coast' || loc === 'الساحل الشمالي' || loc === 'الساحل' ? 'matrouh' :
        loc
      break
    }
  }

  // Extract bedrooms (Arabic-Indic digits already folded above; أوض/أوده
  // variants are how Egyptians actually write it, not just غرفة)
  const bedroomPatterns = [
    /(\d+)\s*(?:bed|bedroom|br|غرف|غرفة|غرفه|نوم|أوض|اوض|أوضة|اوضة|أوده|اوده|أود)\b/i,
    /(\d+)\s*b\s*r/i,
  ]
  for (const pattern of bedroomPatterns) {
    const match = q.match(pattern)
    if (match) {
      filters.bedrooms = Number(match[1])
      break
    }
  }

  // Extract property type
  const propertyTypeEntries: [string, string][] = [
    ['apartment', 'APARTMENT'], ['شقة', 'APARTMENT'], ['شقه', 'APARTMENT'], ['شقق', 'APARTMENT'], ['flat', 'APARTMENT'],
    ['villa', 'VILLA'], ['فيلا', 'VILLA'], ['فلل', 'VILLA'],
    ['townhouse', 'TOWNHOUSE'], ['تاون هاوس', 'TOWNHOUSE'], ['توين هاوس', 'TOWNHOUSE'], ['توين', 'TOWNHOUSE'], ['twin', 'TOWNHOUSE'],
    ['penthouse', 'PENTHOUSE'], ['بنتهاوس', 'PENTHOUSE'], ['روف', 'PENTHOUSE'],
    ['studio', 'STUDIO'], ['استوديو', 'STUDIO'], ['استديو', 'STUDIO'],
    ['duplex', 'DUPLEX'], ['دوبلكس', 'DUPLEX'],
    ['chalet', 'CHALET'], ['شاليه', 'CHALET'],
    ['commercial', 'COMMERCIAL'], ['تجاري', 'COMMERCIAL'],
  ]
  for (const [keyword, type] of propertyTypeEntries) {
    if (q.includes(keyword)) {
      filters.propertyType = type
      break
    }
  }

  // Extract listing type
  if (q.includes('rent') || q.includes('ايجار') || q.includes('إيجار')) {
    filters.listingType = 'RENT'
  } else if (q.includes('installment') || q.includes('تقسيط') || q.includes('installments')) {
    filters.listingType = 'INSTALLMENT'
  } else if (q.includes('resale') || q.includes('إعادة بيع')) {
    filters.listingType = 'RESALE'
  } else if (q.includes('buy') || q.includes('purchase') || q.includes('شراء')) {
    filters.listingType = 'SALE'
  }

  // Extract delivery preference
  if (q.includes('ready') || q.includes('موجود') || q.includes('delivered')) {
    filters.deliveryPreference = 'delivered'
  } else if (q.includes('under construction') || q.includes('تحت الإنشاء')) {
    filters.deliveryPreference = 'under_construction'
  }

  // Collect remaining keywords for text search
  const stopWords = ['i', 'want', 'need', 'looking', 'for', 'a', 'an', 'the', 'in', 'with', 'and', 'or', 'near', 'my', 'me', 'find', 'show', 'search', 'have', 'is', 'it']
  const words = q.split(/\s+/).filter((w) => w.length > 2 && !stopWords.includes(w) && !/^\d+$/.test(w))
  filters.keywords = words.slice(0, 5)

  return filters
}

function buildExplanation(filters: ExtractedFilters): string {
  const parts: string[] = []
  if (filters.budget) {
    if (filters.budget.max) parts.push(`budget up to ${new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 0 }).format(filters.budget.max)}`)
    if (filters.budget.min) parts.push(`budget starting from ${new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 0 }).format(filters.budget.min)}`)
  }
  if (filters.location) parts.push(`in ${filters.location}`)
  if (filters.bedrooms) parts.push(`${filters.bedrooms} bedrooms`)
  if (filters.propertyType) parts.push(`${filters.propertyType.toLowerCase().replace(/_/g, ' ')}`)
  if (filters.listingType) parts.push(`for ${filters.listingType.toLowerCase()}`)

  if (parts.length === 0) return 'Showing all available properties'

  return `Found properties matching: ${parts.join(', ')}`
}

export async function POST(req: Request) {
  try {
    // Anonymous DB-backed search — cap input size and throttle per IP.
    const rl = rateLimit(`ai-search:${getClientIp(req.headers)}`, { limit: 60, windowMs: 60 * 60_000 })
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many searches. Please wait a moment and try again.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))),
          },
        }
      )
    }

    const { query } = await req.json()
    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }
    if (query.length > 2000) {
      return NextResponse.json({ error: 'Query too long (max 2000 characters)' }, { status: 400 })
    }

    const filters = extractFilters(query)

    const andConditions: Record<string, unknown>[] = [
      // AI answers cover public projects only — non-approved never surface.
      { ...PUBLIC_PROJECT_WHERE },
    ]

    if (filters.location) {
      andConditions.push({
        OR: [
          { city: { nameSlug: { contains: filters.location } } },
          { city: { name: { contains: filters.location } } },
          { governorate: { nameSlug: { contains: filters.location } } },
          { district: { nameSlug: { contains: filters.location } } },
        ],
      })
    }

    if (filters.propertyType) {
      andConditions.push({ propertyTypes: { contains: filters.propertyType } })
    }
    if (filters.listingType) {
      andConditions.push({ listingTypes: { contains: filters.listingType } })
    }
    if (filters.budget) {
      const priceFilter: Record<string, number> = {}
      if (filters.budget.min) priceFilter.gte = filters.budget.min
      if (filters.budget.max) priceFilter.lte = filters.budget.max
      andConditions.push({
        OR: [
          { startPrice: priceFilter },
          { units: { some: { price: priceFilter, isSample: false } } },
        ],
      })
    }

    const where: Record<string, unknown> = {
      AND: andConditions,
    }

    const projects = await db.project.findMany({
      where,
      include: {
        developer: { select: { companyName: true, isVerified: true } },
        governorate: { select: { name: true } },
        city: { select: { name: true } },
        district: { select: { name: true } },
        units: {
          where: filters.bedrooms
            ? { bedrooms: filters.bedrooms, isSample: false }
            : { status: 'AVAILABLE', isSample: false },
          take: 3,
          orderBy: { price: 'asc' },
          select: { price: true, area: true, bedrooms: true, unitType: true },
        },
        amenities: {
          include: { amenity: { select: { name: true } } },
          take: 6,
        },
      },
      orderBy: { viewCount: 'desc' },
      take: 10,
    })

    let matchedUnits: any[] = []
    if (filters.bedrooms || filters.budget || filters.propertyType) {
      // AI answers present buyable inventory only — never showcase samples,
      // and never units of non-approved projects (visibility follows the project).
      const unitWhere: Record<string, unknown> = { status: 'AVAILABLE', isSample: false, project: { ...PUBLIC_UNIT_PROJECT_WHERE } }
      if (filters.bedrooms) unitWhere.bedrooms = filters.bedrooms
      if (filters.propertyType) unitWhere.unitType = filters.propertyType
      if (filters.budget) {
        const priceFilter: Record<string, number> = {}
        if (filters.budget.min) priceFilter.gte = filters.budget.min
        if (filters.budget.max) priceFilter.lte = filters.budget.max
        unitWhere.price = priceFilter
      }

      matchedUnits = await db.unit.findMany({
        where: unitWhere,
        include: {
          project: { select: { name: true, slug: true } },
        },
        orderBy: { price: 'asc' },
        take: 5,
      })
    }

    const explanation = buildExplanation(filters)

    return NextResponse.json({
      query,
      extractedFilters: filters,
      explanation,
      projects,
      units: matchedUnits,
      totalProjects: projects.length,
      totalUnits: matchedUnits.length,
    })
  } catch (error) {
    console.error('AI search error:', error)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
