import { describe, expect, it } from 'vitest'
import {
  commissionRuleSchema,
  dealCreateSchema,
  inquirySchema,
  leadSchema,
  leadStatusUpdateSchema,
  loginSchema,
  nawyImportBodySchema,
  propertyFilterSchema,
  registerSchema,
} from '@/lib/validations'

describe('loginSchema', () => {
  it('accepts a valid payload', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'secret1' }).success).toBe(true)
  })

  it('rejects bad email and short password', () => {
    expect(loginSchema.safeParse({ email: 'nope', password: 'secret1' }).success).toBe(false)
    expect(loginSchema.safeParse({ email: 'a@b.com', password: '123' }).success).toBe(false)
  })
})

describe('registerSchema', () => {
  const base = {
    name: 'Ahmed',
    email: 'a@b.com',
    // Register floor is 10 (see validations.ts) — fixtures must clear it.
    password: 'secret1234',
    confirmPassword: 'secret1234',
  }

  it('accepts matching passwords and defaults role to BUYER', () => {
    const r = registerSchema.safeParse(base)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.role).toBe('BUYER')
  })

  it('rejects mismatched passwords on confirmPassword', () => {
    const r = registerSchema.safeParse({ ...base, confirmPassword: 'other12' })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual(['confirmPassword'])
    }
  })

  it('rejects short names and invalid roles', () => {
    expect(registerSchema.safeParse({ ...base, name: 'A' }).success).toBe(false)
    expect(registerSchema.safeParse({ ...base, role: 'CEO' }).success).toBe(false)
  })
})

describe('propertyFilterSchema', () => {
  it('applies page/limit defaults', () => {
    const r = propertyFilterSchema.safeParse({})
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.page).toBe(1)
      expect(r.data.limit).toBe(12)
    }
  })

  it('rejects negative prices and out-of-range paging', () => {
    expect(propertyFilterSchema.safeParse({ minPrice: -1 }).success).toBe(false)
    expect(propertyFilterSchema.safeParse({ limit: 51 }).success).toBe(false)
    expect(propertyFilterSchema.safeParse({ page: 0 }).success).toBe(false)
  })

  it('rejects unknown enums but accepts a full valid filter', () => {
    expect(propertyFilterSchema.safeParse({ propertyType: 'CASTLE' }).success).toBe(false)
    expect(
      propertyFilterSchema.safeParse({
        propertyType: 'VILLA',
        listingType: 'SALE',
        minPrice: 1_000_000,
        maxPrice: 5_000_000,
        bedrooms: 3,
        sortBy: 'price_asc',
      }).success,
    ).toBe(true)
  })
})

describe('inquirySchema', () => {
  it('accepts empty-string email (optional contact path)', () => {
    expect(
      inquirySchema.safeParse({ name: 'Sara', email: '', phone: '01012345678' }).success,
    ).toBe(true)
  })

  it('rejects short names, short phones, malformed emails', () => {
    expect(inquirySchema.safeParse({ name: 'S', phone: '01012345678' }).success).toBe(false)
    expect(inquirySchema.safeParse({ name: 'Sara', phone: '123' }).success).toBe(false)
    expect(inquirySchema.safeParse({ name: 'Sara', phone: '01012345678', email: 'bad' }).success).toBe(false)
  })
})

describe('leadSchema', () => {
  it('defaults source to WEBSITE', () => {
    const r = leadSchema.safeParse({ name: 'Omar', phone: '0101234567' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.source).toBe('WEBSITE')
  })

  it('rejects short name/phone and oversized notes', () => {
    expect(leadSchema.safeParse({ name: 'O', phone: '0101234567' }).success).toBe(false)
    expect(leadSchema.safeParse({ name: 'Omar', phone: '123' }).success).toBe(false)
    expect(leadSchema.safeParse({ name: 'Omar', phone: '0101234567', notes: 'x'.repeat(4001) }).success).toBe(false)
  })
})

describe('lead + deal schemas', () => {
  it('leadStatusUpdateSchema enforces status enum and positive dealValue', () => {
    expect(leadStatusUpdateSchema.safeParse({ status: 'CONTACTED' }).success).toBe(true)
    expect(leadStatusUpdateSchema.safeParse({ status: 'MAYBE' }).success).toBe(false)
    expect(leadStatusUpdateSchema.safeParse({ status: 'SOLD', dealValue: -5 }).success).toBe(false)
  })

  it('dealCreateSchema defaults status to RESERVATION', () => {
    const r = dealCreateSchema.safeParse({ leadId: 'l1' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.status).toBe('RESERVATION')
  })
})

describe('commissionRuleSchema', () => {
  it('accepts a balanced split', () => {
    expect(
      commissionRuleSchema.safeParse({ name: 'Std', totalPct: 4, estateaiPct: 1, brokerPct: 3 }).success,
    ).toBe(true)
  })

  it('rejects percentages outside 0..100', () => {
    expect(
      commissionRuleSchema.safeParse({ name: 'Std', totalPct: 101, estateaiPct: 1, brokerPct: 3 }).success,
    ).toBe(false)
    expect(
      commissionRuleSchema.safeParse({ name: 'Std', totalPct: 4, estateaiPct: -1, brokerPct: 3 }).success,
    ).toBe(false)
  })
})

describe('nawyImportBodySchema', () => {
  it('accepts nawy.com URLs in both modes', () => {
    expect(
      nawyImportBodySchema.safeParse({ mode: 'PREVIEW', urls: ['https://www.nawy.com/x'] }).success,
    ).toBe(true)
  })

  it('rejects off-domain URLs, empty lists, and >30 URLs', () => {
    expect(
      nawyImportBodySchema.safeParse({ mode: 'IMPORT', urls: ['https://evil.com/x'] }).success,
    ).toBe(false)
    expect(nawyImportBodySchema.safeParse({ mode: 'PREVIEW', urls: [] }).success).toBe(false)
    expect(
      nawyImportBodySchema.safeParse({ mode: 'PREVIEW', urls: Array(31).fill('https://nawy.com/x') }).success,
    ).toBe(false)
  })
})
