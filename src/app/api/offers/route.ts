import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { PUBLIC_PROJECT_WHERE } from '@/lib/project-visibility'
import { maxDiscountOf } from '@/lib/units-by-type'

export const dynamic = 'force-dynamic'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

/**
 * GET /api/offers — public developer-offers radar.
 *
 * Every active project having ≥1 active payment plan with `cashDiscount > 0`
 * (`cashDiscount` is a percent off the price for paying cash — the same
 * semantics as `toolCalculatePayment`: cashPrice = price × (1 − pct/100)).
 * Project summaries mirror the `GET /api/projects` include shape; each plan
 * carries its computed after-discount price from the project's `startPrice`.
 *
 * Response shape:
 * {
 *   offers: [{
 *     project: { id, slug, name, nameArabic, coverImage, startPrice, endPrice,
 *                city, district, governorate, developer },
 *     plans: [{ id, name, nameArabic, downPaymentPct, installmentYears,
 *               cashDiscountPct, priceBefore, priceAfter, savings }],
 *     maxDiscount: number|null  // highest cashDiscountPct across plans
 *   }],
 *   total, page, limit, totalPages
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const rawLimit = parseInt(searchParams.get('limit') || '', 10)
    const rawPage = parseInt(searchParams.get('page') || '', 10)
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(rawLimit, 1), MAX_LIMIT)
      : DEFAULT_LIMIT
    const page = Number.isFinite(rawPage) ? Math.max(rawPage, 1) : 1

    const where = {
      // Public only: offers on non-approved projects never surface.
      ...PUBLIC_PROJECT_WHERE,
      paymentPlans: { some: { isActive: true, cashDiscount: { gt: 0 } } },
    }

    const [total, projects] = await Promise.all([
      db.project.count({ where }),
      db.project.findMany({
        where,
        include: {
          developer: { select: { companyName: true } },
          governorate: { select: { name: true, nameArabic: true } },
          city: { select: { name: true, nameArabic: true, nameSlug: true } },
          district: { select: { name: true, nameArabic: true } },
          paymentPlans: {
            where: { isActive: true, cashDiscount: { gt: 0 } },
            select: {
              id: true,
              name: true,
              nameArabic: true,
              downPaymentPct: true,
              installmentYears: true,
              cashDiscount: true,
            },
            orderBy: { cashDiscount: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])

    const offers = projects.map((project) => {
      const priceBefore = project.startPrice ?? null
      const plans = project.paymentPlans.map((plan) => {
        const cashDiscountPct = plan.cashDiscount ?? 0
        const priceAfter =
          priceBefore !== null
            ? Math.round(priceBefore * (1 - cashDiscountPct / 100) * 100) / 100
            : null
        const savings =
          priceBefore !== null && priceAfter !== null
            ? Math.round((priceBefore - priceAfter) * 100) / 100
            : null
        return {
          id: plan.id,
          name: plan.name,
          nameArabic: plan.nameArabic,
          downPaymentPct: plan.downPaymentPct,
          installmentYears: plan.installmentYears,
          cashDiscountPct,
          priceBefore,
          priceAfter,
          savings,
        }
      })
      return {
        project: {
          id: project.id,
          slug: project.slug,
          name: project.name,
          nameArabic: project.nameArabic,
          coverImage: project.coverImage,
          startPrice: project.startPrice,
          endPrice: project.endPrice,
          city: project.city,
          district: project.district,
          governorate: project.governorate,
          developer: project.developer,
        },
        plans,
        maxDiscount: maxDiscountOf(project.paymentPlans),
      }
    })

    return NextResponse.json(
      {
        offers,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
    )
  } catch (error) {
    console.error('Fetch offers error:', error)
    return NextResponse.json({ error: 'Failed to fetch offers' }, { status: 500 })
  }
}
