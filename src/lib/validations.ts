import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  // Login floor stays 6: existing accounts with 6–9 char passwords must keep
  // working. Only NEW passwords move to 10 (registerSchema below).
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional(),
  // New-password floor is 10. Safe: register only creates NEW accounts
  // (existing email → 409), so no existing user can be locked out.
  password: z.string().min(10, 'Password must be at least 10 characters'),
  confirmPassword: z.string(),
  role: z.enum(['BUYER', 'BROKER', 'DEVELOPER']).default('BUYER'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

export const propertyFilterSchema = z.object({
  q: z.string().optional(),
  governorate: z.string().optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  propertyType: z.enum([
    'APARTMENT', 'VILLA', 'TOWNHOUSE', 'PENTHOUSE', 'STUDIO',
    'DUPLEX', 'CHALET', 'LAND', 'COMMERCIAL', 'ADMINISTRATIVE', 'MEDICAL',
  ]).optional(),
  listingType: z.enum(['SALE', 'RENT', 'RESALE', 'INSTALLMENT']).optional(),
  minPrice: z.number().min(0).optional(),
  maxPrice: z.number().min(0).optional(),
  minArea: z.number().min(0).optional(),
  maxArea: z.number().min(0).optional(),
  bedrooms: z.number().min(0).optional(),
  bathrooms: z.number().min(0).optional(),
  finishingType: z.string().optional(),
  status: z.string().optional(),
  sortBy: z.enum(['price_asc', 'price_desc', 'area_asc', 'area_desc', 'newest', 'popular']).optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(50).default(12),
})

export const inquirySchema = z.object({
  name: z.string().min(2, 'Name is required'),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().min(10, 'Valid phone number required'),
  message: z.string().optional(),
  type: z.enum(['GENERAL', 'VISIT_REQUEST', 'PRICE_INQUIRY', 'AVAILABILITY', 'PAYMENT_PLAN', 'COMMISSION', 'CALLBACK']).default('GENERAL'),
  unitId: z.string().optional(),
})

export const leadSchema = z.object({
  name: z.string().min(2),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().min(7),
  source: z.string().min(1).max(40).default('WEBSITE'),
  status: z.string().max(30).optional(),
  projectId: z.string().optional(),
  unitId: z.string().optional(),
  developerId: z.string().optional(),
  budgetMin: z.number().optional(),
  budgetMax: z.number().optional(),
  notes: z.string().max(4000).optional(),
  preferredAreas: z.array(z.string()).optional(),
  preferredPropertyTypes: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  nextFollowUp: z.string().datetime({ offset: true }).optional(),
})

export const leadStatusUpdateSchema = z.object({
  status: z.enum([
    'NEW', 'CONTACTED', 'QUALIFIED', 'VIEWING', 'INTERESTED',
    'RESERVATION', 'CONTRACT', 'SOLD', 'LOST', 'CANCELLED', 'EXPIRED',
    'VISITED', 'NEGOTIATING', 'CONVERTED',
  ]),
  notes: z.string().max(2000).optional(),
  dealValue: z.number().positive().optional(),
})

export const leadTransferSchema = z.object({
  leadId: z.string().min(1),
  toBrokerId: z.string().min(1),
  reason: z.string().max(1000).optional(),
})

export const leadProtectionActionSchema = z.object({
  leadId: z.string().min(1),
  action: z.enum(['EXTEND', 'EXPIRE', 'RENEW']),
  days: z.number().int().min(1).max(730).optional(),
  reason: z.string().max(1000).optional(),
})

export const duplicateResolveSchema = z.object({
  leadId: z.string().min(1), // the DUPLICATE_REVIEW lead
  resolution: z.enum(['ORIGINAL_WINS', 'CHALLENGER_WINS']),
  winnerBrokerId: z.string().optional(),
  reason: z.string().max(1000).optional(),
})

export const dealCreateSchema = z.object({
  leadId: z.string().min(1),
  projectId: z.string().optional(),
  unitId: z.string().optional(),
  status: z.enum(['RESERVATION', 'CONTRACT', 'SOLD', 'CANCELLED', 'LOST']).default('RESERVATION'),
  dealValue: z.number().positive().optional(),
  reservationDate: z.string().datetime({ offset: true }).optional(),
  contractDate: z.string().datetime({ offset: true }).optional(),
  saleDate: z.string().datetime({ offset: true }).optional(),
  source: z.enum(['PLATFORM', 'OFF_PLATFORM_REPORT']).default('PLATFORM'),
  notes: z.string().max(4000).optional(),
})

export const dealUpdateSchema = z.object({
  status: z.enum(['RESERVATION', 'CONTRACT', 'SOLD', 'CANCELLED', 'LOST']).optional(),
  dealValue: z.number().positive().optional(),
  reservationDate: z.string().datetime({ offset: true }).nullable().optional(),
  contractDate: z.string().datetime({ offset: true }).nullable().optional(),
  saleDate: z.string().datetime({ offset: true }).nullable().optional(),
  notes: z.string().max(4000).optional(),
  ruleId: z.string().optional(),
})

export const commissionRuleSchema = z.object({
  name: z.string().min(2).max(120),
  developerId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  totalPct: z.number().min(0).max(100),
  estateaiPct: z.number().min(0).max(100),
  brokerPct: z.number().min(0).max(100),
  otherPct: z.number().min(0).max(100).default(0),
  otherLabel: z.string().max(60).optional().nullable(),
  minDealValue: z.number().min(0).optional().nullable(),
  maxDealValue: z.number().min(0).optional().nullable(),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  priority: z.number().int().min(0).max(1000).default(0),
}).refine(
  (d) => d.minDealValue == null || d.maxDealValue == null || d.minDealValue <= d.maxDealValue,
  { message: 'minDealValue must be less than or equal to maxDealValue', path: ['maxDealValue'] }
)

export const partnershipSchema = z.object({
  developerId: z.string().min(1),
  status: z.enum(['PENDING', 'UNDER_REVIEW', 'APPROVED', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'EXPIRED']),
  allProjectsApproved: z.boolean().default(false),
  approvedProjectIds: z.array(z.string()).default([]),
  commissionAgreement: z.string().max(4000).optional().nullable(),
  leadProtectionDays: z.number().int().min(1).max(730).optional().nullable(),
  allowedBrokerIds: z.array(z.string()).default([]),
  blockedBrokerIds: z.array(z.string()).default([]),
  startDate: z.string().datetime({ offset: true }).optional().nullable(),
  endDate: z.string().datetime({ offset: true }).optional().nullable(),
  terms: z.string().max(8000).optional().nullable(),
  isActive: z.boolean().default(true),
  reviewNote: z.string().max(2000).optional().nullable(),
})

export const newLaunchesConfigSchema = z.object({
  enabled: z.boolean().default(true),
  windowDays: z.number().int().min(1).max(365),
  limit: z.number().int().min(1).max(12),
  pinnedIds: z.array(z.string().min(1)).max(100),
  hiddenIds: z.array(z.string().min(1)).max(500),
})

export type NewLaunchesActionInput = z.infer<typeof newLaunchesConfigSchema>

// ─── Nawy bulk catalog import (CEO only) ─────────────────────
export const nawyImportBodySchema = z.object({
  mode: z.enum(['PREVIEW', 'IMPORT']),
  urls: z
    .array(
      z
        .string()
        .url()
        .refine((u) => {
          try {
            const h = new URL(u).hostname
            return h === 'nawy.com' || h === 'www.nawy.com'
          } catch {
            return false
          }
        }, 'Only nawy.com URLs are allowed')
    )
    .min(1)
    .max(30),
  publish: z.boolean().optional().default(false),
  includeAr: z.boolean().optional().default(true),
})

export type NawyImportBodyInput = z.infer<typeof nawyImportBodySchema>

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type PropertyFilterInput = z.infer<typeof propertyFilterSchema>
export type InquiryInput = z.infer<typeof inquirySchema>
export type LeadInput = z.infer<typeof leadSchema>
