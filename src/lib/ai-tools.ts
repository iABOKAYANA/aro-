import { db } from '@/lib/db'
import { searchProjects, searchUnits, getProjectBySlug } from '@/lib/search'
import { isPublicProject, PUBLIC_APPROVAL_STATUSES, PUBLIC_PROJECT_WHERE } from '@/lib/project-visibility'
import { normalizeCityInput, normalizeListingTypeInput, normalizePropertyTypeInput } from '@/lib/ai-search-parser'
import type { PropertyFilterInput } from '@/lib/validations'
import type { AICtx } from '@/lib/ai-growth-tools'

// ─── Tool Types ──────────────────────────────────────────

export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

export interface ProjectSummary {
  id: string
  name: string
  slug: string
  coverImage: string | null
  status: string
  startPrice: number | null
  endPrice: number | null
  propertyTypes: string[]
  city: string | null
  governorate: string | null
  developerName: string | null
  developerLogo: string | null
  completionPercent: number | null
  viewCount: number
  favoriteCount: number
  unitCount: number
  startBedrooms: number | null
  endBedrooms: number | null
  deliveryDate: string | null
  description: string | null
  amenities: string[]
  downPaymentMin: number | null
  installmentYears: number | null
}

export interface UnitSummary {
  id: string
  name: string
  slug: string | null
  unitType: string
  listingType: string
  status: string
  bedrooms: number | null
  bathrooms: number | null
  area: number
  price: number
  pricePerSqm: number | null
  finishingType: string | null
  projectName: string
  projectSlug: string
  hasBalcony: boolean
  view: string | null
}

export interface DeveloperSummary {
  id: string
  companyName: string
  logo: string | null
  isVerified: boolean
  totalProjects: number
  totalUnitsSold: number
  rating: number
  reviewCount: number
  description: string | null
  headquarters: string | null
  foundedYear: number | null
  website: string | null
  projects: Array<{ id: string; name: string; slug: string; startPrice: number | null }>
}

export interface PaymentCalculation {
  unitPrice: number
  downPaymentPct: number
  downPaymentAmount: number
  financedAmount: number
  installmentYears: number
  totalInstallments: number
  semiAnnualPayment: number
  monthlyPayment: number
  maintenanceFee: number
  cashDiscount: number | null
  cashPrice: number | null
  pricePerSqm: number
  area: number
}

export interface ComparisonData {
  // Rendered by ChatComparisonTable + consumed by the LLM as reasoning
  // context. Still no full amenities arrays / unit lists — but carries the
  // price range, delivery date, district and payment-plan count so the
  // assistant can compare like a consultant, not a row dump.
  projects: Array<{
    name: string
    developer: string
    city: string | null
    district: string | null
    startPrice: number | null
    endPrice: number | null
    propertyTypes: string[]
    unitCount: number
    completionPercent: number | null
    downPaymentMin: number | null
    installmentYears: number | null
    deliveryDate: string | null
    paymentPlansCount: number
  }>
}

// ─── Tool Implementations ────────────────────────────────

function projectToSummary(p: any): ProjectSummary {
  const propertyTypes = typeof p.propertyTypes === 'string' ? JSON.parse(p.propertyTypes) : (p.propertyTypes || [])
  const amenities = (p.amenities || []).map((a: any) => a.amenity?.name).filter(Boolean)
  const units = p.units || []
  const prices = units.filter((u: any) => u.price > 0).map((u: any) => u.price)
  const bedrooms = units.map((u: any) => u.bedrooms).filter((b: any) => b != null)

  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    coverImage: p.coverImage,
    status: p.status,
    startPrice: p.startPrice || (prices.length > 0 ? Math.min(...prices) : null),
    endPrice: p.endPrice || (prices.length > 0 ? Math.max(...prices) : null),
    propertyTypes,
    city: p.city?.name || null,
    governorate: p.governorate?.name || null,
    developerName: p.developer?.companyName || null,
    developerLogo: p.developer?.logo || null,
    completionPercent: p.completionPercent,
    viewCount: p.viewCount || 0,
    favoriteCount: p.favoriteCount || 0,
    unitCount: units.length,
    startBedrooms: bedrooms.length > 0 ? Math.min(...bedrooms) : null,
    endBedrooms: bedrooms.length > 0 ? Math.max(...bedrooms) : null,
    deliveryDate: p.deliveryDate ? new Date(p.deliveryDate).toISOString() : null,
    description: p.description,
    amenities,
    downPaymentMin: p.downPaymentMin,
    installmentYears: p.installmentYears,
  }
}

function unitToSummary(u: any): UnitSummary {
  return {
    id: u.id,
    name: u.name,
    slug: u.slug,
    unitType: u.unitType,
    listingType: u.listingType,
    status: u.status,
    bedrooms: u.bedrooms,
    bathrooms: u.bathrooms,
    area: u.area,
    price: u.price,
    pricePerSqm: u.pricePerSqm,
    finishingType: u.finishingType,
    projectName: u.project?.name || '',
    projectSlug: u.project?.slug || '',
    hasBalcony: u.hasBalcony || false,
    view: u.view,
  }
}

// ─── AI tool-arg normalization ───────────────────────────
// The small model passes display names, not DB slugs ("New Cairo",
// "التجمع", "apartment"). search.ts filters are exact/canonical
// (city.nameSlug equality, UPPERCASE propertyTypes contains), so raw
// model args match ZERO rows. Normalize here — one place, every AI
// caller benefits — and drop values that resolve to nothing instead of
// exact-matching them into an empty result.
function normalizeSearchFilters(filters: PropertyFilterInput): PropertyFilterInput {
  const out: PropertyFilterInput = { ...filters }
  if (typeof out.city === 'string' && out.city.trim()) {
    const place = normalizeCityInput(out.city)
    if (place.city) out.city = place.city
    else if (place.governorate) {
      delete (out as Record<string, unknown>).city
      out.governorate = place.governorate
    } else {
      delete (out as Record<string, unknown>).city
    }
  }
  if (typeof out.governorate === 'string' && out.governorate.trim()) {
    const place = normalizeCityInput(out.governorate)
    if (place.city) {
      delete (out as Record<string, unknown>).governorate
      out.city = place.city
    } else if (place.governorate) out.governorate = place.governorate
    else delete (out as Record<string, unknown>).governorate
  }
  if (out.propertyType !== undefined) {
    const t = normalizePropertyTypeInput(out.propertyType)
    if (t) out.propertyType = t
    else delete (out as Record<string, unknown>).propertyType
  }
  if (out.listingType !== undefined) {
    const t = normalizeListingTypeInput(out.listingType)
    if (t) out.listingType = t
    else delete (out as Record<string, unknown>).listingType
  }
  return out
}

// Bedroom/bathroom filters are unit-level and unit inventory is sparse —
// a strict bedrooms clause zeroes out otherwise matching projects. Retry
// without it (same relaxation order as the chat forced-search fallback).
async function relaxedProjectSearch(filters: PropertyFilterInput) {
  const first = await searchProjects({ ...filters, limit: filters.limit || 6 })
  if (first.total > 0) return first
  if (filters.bedrooms !== undefined || filters.bathrooms !== undefined) {
    const rest: PropertyFilterInput = { ...filters }
    delete rest.bedrooms
    delete rest.bathrooms
    const second = await searchProjects({ ...rest, limit: filters.limit || 6 })
    if (second.total > 0) return second
  }
  return first
}

// Tool: searchProjects
export async function toolSearchProjects(filters: PropertyFilterInput): Promise<ToolResult> {
  try {
    const results = await relaxedProjectSearch(normalizeSearchFilters(filters))
    const summaries = results.items.map(projectToSummary)
    return {
      success: true,
      data: {
        total: results.total,
        page: results.page,
        totalPages: results.totalPages,
        projects: summaries,
      },
    }
  } catch (error) {
    return { success: false, error: 'Failed to search projects' }
  }
}

// Tool: searchUnits
export async function toolSearchUnits(filters: PropertyFilterInput): Promise<ToolResult> {
  try {
    const normalized = normalizeSearchFilters(filters)
    let results = await searchUnits({ ...normalized, limit: filters.limit || 6 })
    if (results.total === 0 && (normalized.bedrooms !== undefined || normalized.bathrooms !== undefined)) {
      const rest: PropertyFilterInput = { ...normalized }
      delete rest.bedrooms
      delete rest.bathrooms
      const retry = await searchUnits({ ...rest, limit: filters.limit || 6 })
      if (retry.total > 0) results = retry
    }
    const summaries = results.items.map(unitToSummary)
    return {
      success: true,
      data: {
        total: results.total,
        page: results.page,
        totalPages: results.totalPages,
        units: summaries,
      },
    }
  } catch (error) {
    return { success: false, error: 'Failed to search units' }
  }
}

// Tool: getProjectDetails
export async function toolGetProjectDetails(slugOrName: string): Promise<ToolResult> {
  try {
    let project = await getProjectBySlug(slugOrName)
    if (!project) {
      const found = await db.project.findFirst({
        where: {
          OR: [
            { name: { contains: slugOrName } },
            { nameArabic: { contains: slugOrName } },
            { slug: { contains: slugOrName.toLowerCase().replace(/ /g, '-') } },
          ],
          isActive: true,
        },
        select: { slug: true },
      })
      if (found) project = await getProjectBySlug(found.slug)
    }
    if (!project) return { success: false, error: 'Project not found' }
    // Public AI surfaces never expose drafts or priceless projects.
    if (!isPublicProject(project)) return { success: false, error: 'Project not found' }

    const summary = projectToSummary({
      ...project,
      amenities: project.amenities,
      units: project.units,
    })

    const paymentPlans = (project.paymentPlans || []).map((pp: any) => ({
      id: pp.id,
      name: pp.name,
      downPaymentPct: pp.downPaymentPct,
      installmentYears: pp.installmentYears,
      maintenanceFeePct: pp.maintenanceFeePct,
      semiAnnualPct: pp.semiAnnualPct,
      cashDiscount: pp.cashDiscount,
      isDefault: pp.isDefault,
      milestones: (pp.milestones || []).map((m: any) => ({
        name: m.name,
        percentage: m.percentage,
        description: m.description,
      })),
    }))

    const units = (project.units || []).map((u: any) => ({
      id: u.id,
      name: u.name,
      unitType: u.unitType,
      listingType: u.listingType,
      status: u.status,
      bedrooms: u.bedrooms,
      bathrooms: u.bathrooms,
      area: u.area,
      price: u.price,
      pricePerSqm: u.pricePerSqm,
      finishingType: u.finishingType,
      phase: u.phase?.name || null,
    }))

    return {
      success: true,
      data: {
        ...summary,
        description: project.description,
        address: project.address,
        totalArea: project.totalArea,
        googleMapsUrl: project.googleMapsUrl,
        developer: {
          companyName: project.developer?.companyName,
          isVerified: project.developer?.isVerified,
          foundedYear: project.developer?.foundedYear,
          headquarters: project.developer?.headquarters,
        },
        paymentPlans,
        units: units.slice(0, 20),
        nearbyPlaces: (project.nearbyPlaces || []).map((p: any) => ({
          name: p.name,
          distance: p.distance,
          driveTime: p.driveTime,
        })),
      },
    }
  } catch (error) {
    return { success: false, error: 'Failed to get project details' }
  }
}

// Tool: getDeveloperDetails
export async function toolGetDeveloperDetails(name: string): Promise<ToolResult> {
  try {
    const developer = await db.developerProfile.findFirst({
      where: {
        OR: [
          { companyName: { contains: name } },
          { companyNameArabic: { contains: name } },
        ],
      },
      include: {
        projects: {
          where: { ...PUBLIC_PROJECT_WHERE },
          select: { id: true, name: true, slug: true, startPrice: true, coverImage: true, status: true },
          take: 10,
        },
      },
    })

    if (!developer) return { success: false, error: 'Developer not found' }

    return {
      success: true,
      data: {
        id: developer.id,
        companyName: developer.companyName,
        logo: developer.logo,
        isVerified: developer.isVerified,
        totalProjects: developer.totalProjects,
        totalUnitsSold: developer.totalUnitsSold,
        rating: developer.rating,
        reviewCount: developer.reviewCount,
        description: developer.description,
        headquarters: developer.headquarters,
        foundedYear: developer.foundedYear,
        website: developer.website,
        projects: developer.projects,
      } satisfies DeveloperSummary,
    }
  } catch (error) {
    return { success: false, error: 'Failed to get developer details' }
  }
}

// Tool: compareProjects
// One light select per project (rendered fields only + a 1-row priced-unit
// probe for the public-price gate). Previously each project went through
// toolGetProjectDetails → getProjectBySlug, which loads the FULL detail
// graph (ALL units + phases, payment plans + milestones, amenities,
// nearby, master plans, brochures) and fed the LLM full `amenities`
// arrays plus redundant endPrice/priceRange/avgPrice/totalUnits/
// deliveryDate. Same resolution order (exact slug → fuzzy name) and same
// public-visibility gate (isActive + APPROVED/PUBLISHED + has price);
// the comparison table output is unchanged.
const COMPARE_PROJECT_SELECT = {
  name: true,
  startPrice: true,
  endPrice: true,
  propertyTypes: true,
  completionPercent: true,
  downPaymentMin: true,
  installmentYears: true,
  deliveryDate: true,
  isActive: true,
  approvalStatus: true,
  city: { select: { name: true } },
  district: { select: { name: true } },
  developer: { select: { companyName: true } },
  _count: { select: { units: true, paymentPlans: true } },
  // Price-gate probe: at most one tiny row, never the full unit list.
  units: { where: { price: { gt: 0 } }, select: { id: true }, take: 1 },
}

function isComparePublic(p: {
  isActive: boolean
  approvalStatus: string
  startPrice: number | null
  units: Array<{ id: string }>
}): boolean {
  if (!p.isActive) return false
  if (!PUBLIC_APPROVAL_STATUSES.includes(p.approvalStatus)) return false
  if ((p.startPrice ?? 0) > 0) return true
  return p.units.length > 0
}

export async function toolCompareProjects(projectNames: string[]): Promise<ToolResult> {
  if (projectNames.length < 2) {
    return { success: false, error: 'Need at least 2 projects to compare' }
  }

  try {
    const comparisonProjects: ComparisonData['projects'] = []
    for (const name of projectNames.slice(0, 4)) {
      const key = name.trim()
      if (!key) continue
      let p = await db.project.findUnique({
        where: { slug: key },
        select: COMPARE_PROJECT_SELECT,
      })
      if (!p || !isComparePublic(p)) {
        p = await db.project.findFirst({
          where: {
            ...PUBLIC_PROJECT_WHERE,
            AND: [
              {
                OR: [
                  { name: { contains: key } },
                  { nameArabic: { contains: key } },
                  { slug: { contains: key.toLowerCase().replace(/ /g, '-') } },
                ],
              },
            ],
          },
          select: COMPARE_PROJECT_SELECT,
        })
      }
      if (!p || !isComparePublic(p)) continue
      let propertyTypes: string[] = []
      try {
        const parsed: unknown = JSON.parse(p.propertyTypes)
        if (Array.isArray(parsed)) propertyTypes = parsed.filter((t): t is string => typeof t === 'string')
      } catch {
        propertyTypes = []
      }
      comparisonProjects.push({
        name: p.name,
        developer: p.developer?.companyName || 'N/A',
        city: p.city?.name || null,
        district: p.district?.name || null,
        startPrice: p.startPrice,
        endPrice: p.endPrice,
        propertyTypes,
        unitCount: p._count.units,
        completionPercent: p.completionPercent,
        downPaymentMin: p.downPaymentMin,
        installmentYears: p.installmentYears,
        deliveryDate: p.deliveryDate ? p.deliveryDate.toISOString() : null,
        paymentPlansCount: p._count.paymentPlans,
      })
    }

    if (comparisonProjects.length < 2) {
      return { success: false, error: 'Could not find enough projects to compare' }
    }

    return { success: true, data: { projects: comparisonProjects } satisfies ComparisonData }
  } catch (error) {
    return { success: false, error: 'Failed to compare projects' }
  }
}

// Tool: calculatePayment
export async function toolCalculatePayment(params: {
  unitPrice: number
  downPaymentPct?: number
  installmentYears?: number
  maintenanceFeePct?: number
  cashDiscountPct?: number
  area?: number
}): Promise<ToolResult> {
  try {
    const {
      unitPrice,
      downPaymentPct = 10,
      installmentYears = 7,
      maintenanceFeePct = 0,
      cashDiscountPct,
      area,
    } = params

    const downPaymentAmount = unitPrice * (downPaymentPct / 100)
    const financedAmount = unitPrice - downPaymentAmount
    const totalInstallments = installmentYears * 2
    const semiAnnualPayment = financedAmount / totalInstallments
    const monthlyPayment = semiAnnualPayment / 6
    const maintenanceFee = unitPrice * (maintenanceFeePct / 100)
    const cashPrice = cashDiscountPct ? unitPrice * (1 - cashDiscountPct / 100) : null
    const pricePerSqm = area ? unitPrice / area : unitPrice

    const calculation: PaymentCalculation = {
      unitPrice,
      downPaymentPct,
      downPaymentAmount,
      financedAmount,
      installmentYears,
      totalInstallments,
      semiAnnualPayment,
      monthlyPayment,
      maintenanceFee,
      cashDiscount: cashDiscountPct || null,
      cashPrice,
      pricePerSqm,
      area: area || unitPrice,
    }

    return { success: true, data: calculation }
  } catch (error) {
    return { success: false, error: 'Failed to calculate payment' }
  }
}

// Tool: getPaymentPlans
export async function toolGetPaymentPlans(projectSlug: string): Promise<ToolResult> {
  try {
    const project = await db.project.findUnique({
      where: { slug: projectSlug },
      include: {
        paymentPlans: {
          where: { isActive: true },
          include: { milestones: { orderBy: { sortOrder: 'asc' } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
    })

    if (!project) return { success: false, error: 'Project not found' }

    const plans = project.paymentPlans.map((pp: any) => ({
      id: pp.id,
      name: pp.name,
      downPaymentPct: pp.downPaymentPct,
      installmentYears: pp.installmentYears,
      maintenanceFeePct: pp.maintenanceFeePct,
      semiAnnualPct: pp.semiAnnualPct,
      deliveryPaymentPct: pp.deliveryPaymentPct,
      cashDiscount: pp.cashDiscount,
      isDefault: pp.isDefault,
      milestones: pp.milestones.map((m: any) => ({
        name: m.name,
        percentage: m.percentage,
        description: m.description,
      })),
    }))

    return { success: true, data: { projectName: project.name, plans } }
  } catch (error) {
    return { success: false, error: 'Failed to get payment plans' }
  }
}

// Tool: getAmenities
export async function toolGetAmenities(projectSlug: string): Promise<ToolResult> {
  try {
    const project = await db.project.findUnique({
      where: { slug: projectSlug },
      include: {
        amenities: {
          include: { amenity: true },
        },
      },
    })

    if (!project) return { success: false, error: 'Project not found' }

    const amenities = project.amenities.map((pa: any) => ({
      name: pa.amenity.name,
      nameArabic: pa.amenity.nameArabic,
      icon: pa.amenity.icon,
      category: pa.amenity.category,
      isPremium: pa.isPremium,
    }))

    return { success: true, data: { projectName: project.name, amenities } }
  } catch (error) {
    return { success: false, error: 'Failed to get amenities' }
  }
}

// Tool: createInquiry
// userId is FORCED from the server session (ctx) — any model-supplied value
// is ignored, so the model can never attribute inquiries to other users.
// Anonymous callers create unattributed inquiries (userId null), as before.
export async function toolCreateInquiry(
  params: {
    name: string
    phone: string
    email?: string
    message?: string
    unitId?: string
    userId?: string
  },
  ctx?: AICtx,
): Promise<ToolResult> {
  try {
    const userId = ctx?.userId ?? null
    const name = typeof params.name === 'string' ? params.name.trim() : ''
    const phone = typeof params.phone === 'string' ? params.phone.trim() : ''
    if (name.length < 2 || name.length > 120) {
      return { success: false, error: 'A valid name (2-120 characters) is required to create an inquiry.' }
    }
    // Phone idiom mirrors inquirySchema (min 10 chars): raw length floor
    // plus a digit-count/shape check so 'abc1234567' still fails.
    const digits = phone.replace(/\D/g, '')
    if (
      phone.length < 10 ||
      digits.length < 7 ||
      digits.length > 15 ||
      !/^[+\d][\d\s\-().+]*$/.test(phone)
    ) {
      return { success: false, error: 'A valid phone number is required to create an inquiry.' }
    }
    const email = typeof params.email === 'string' && params.email.includes('@')
      ? params.email.trim().slice(0, 254)
      : undefined
    const unitId = typeof params.unitId === 'string' && params.unitId ? params.unitId : undefined
    const inquiry = await db.inquiry.create({
      data: {
        name,
        phone,
        email,
        message: (typeof params.message === 'string' && params.message.trim()
          ? params.message.trim()
          : 'Inquiry from AI Assistant'
        ).slice(0, 2000),
        unitId,
        userId,
        source: 'AI_CHATBOT',
        type: 'GENERAL',
      },
    })

    return {
      success: true,
      data: {
        id: inquiry.id,
        message: 'Inquiry created successfully. A broker will contact you soon.',
      },
    }
  } catch (error) {
    return { success: false, error: 'Failed to create inquiry' }
  }
}
