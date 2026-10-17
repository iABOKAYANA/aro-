import { type Prisma } from '@prisma/client'

export type PropertyType = 'APARTMENT' | 'VILLA' | 'TOWNHOUSE' | 'PENTHOUSE' | 'STUDIO' | 'DUPLEX' | 'CHALET' | 'LAND' | 'COMMERCIAL' | 'ADMINISTRATIVE' | 'MEDICAL'
export type ListingType = 'SALE' | 'RENT' | 'RESALE' | 'INSTALLMENT'
export type UserRole = 'BUYER' | 'BROKER' | 'DEVELOPER' | 'ADMIN'

export interface PropertyFilter {
  governorate?: string
  city?: string
  district?: string
  propertyType?: PropertyType
  listingType?: ListingType
  minPrice?: number
  maxPrice?: number
  minArea?: number
  maxArea?: number
  bedrooms?: number
  bathrooms?: number
  finishingType?: string
  status?: string
  amenities?: string[]
  sortBy?: 'price_asc' | 'price_desc' | 'area_asc' | 'area_desc' | 'newest' | 'popular'
  page?: number
  limit?: number
}

export interface ProjectFilter {
  governorate?: string
  city?: string
  developerId?: string
  propertyTypes?: PropertyType[]
  listingTypes?: ListingType[]
  minPrice?: number
  maxPrice?: number
  status?: string
  isFeatured?: boolean
  sortBy?: 'newest' | 'popular' | 'price_asc' | 'price_desc'
  page?: number
  limit?: number
}

export interface SearchResult<T> {
  items: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface DashboardStats {
  totalProperties?: number
  totalUnits?: number
  totalInquiries?: number
  totalLeads?: number
  totalRevenue?: number
  conversionRate?: number
  recentInquiries?: unknown[]
  topProjects?: unknown[]
}

export interface AIChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  metadata?: Record<string, unknown>
}

export interface MapPin {
  id: string
  lat: number
  lng: number
  title: string
  price: number
  type: string
  image?: string
}

export type ProjectWithRelations = Prisma.ProjectGetPayload<{
  include: {
    developer: true
    governorate: true
    city: true
    district: true
    units: { take: 3; orderBy: { price: 'asc' } }
    amenities: { include: { amenity: true } }
    paymentPlans: true
  }
}>

export type UnitWithRelations = Prisma.UnitGetPayload<{
  include: {
    project: { select: { name: true; slug: true; coverImage: true } }
    phase: { select: { name: true } }
  }
}>
