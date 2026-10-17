import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi } from '@/lib/permissions'
import { getCommissionDefaults } from '@/lib/commission'

export const dynamic = 'force-dynamic'

// ─── GET /api/ceo/forecast — CEO revenue forecast (read-only) ───
// Aggregates the open pipeline (leads, excluding dead LOST/CANCELLED/
// EXPIRED rows) by pipeline stage and weights each stage's FULL deal value
// by a FIXED close-probability map below. Response contract:
//   { stages: [{ stage, count, value, probability, weighted }],
//     totalOpen, totalWeighted, generatedAt }
// Value semantics (per lead, first positive source wins):
//   1. linked Deal.dealValue (max positive across the lead's deals — the
//      FULL transaction value, not EstateAI's cut),
//   2. linked Unit.price,
//   3. Lead.budgetMax, then Lead.budgetMin,
//   4. 0 when nothing is known (still counted in `count`, adds 0 to `value`).
// EstateAI share (additive, outside the mandated contract): per-stage
// `estateaiWeighted` + top-level `totalEstateaiWeighted`. Per lead, the
// EstateAI amount is the linked deal's latest Commission.estateaiAmount
// when a commission row exists, otherwise an estimate of
// value × platform-default estateaiPct / 100; weighted by the same stage
// probability. It is an expected-value estimate, not booked revenue.
// Close-probability map (fixed fractions; weighted = value × probability):
//   NEW 0.05, CONTACTED 0.10, QUALIFIED 0.25, VIEWING 0.40,
//   INTERESTED 0.50, RESERVATION 0.70, CONTRACT 0.90, SOLD 1.00.
// Legacy lead statuses fold onto their nearest modern equivalent:
//   VISITED ≡ VIEWING (0.40), NEGOTIATING 0.60 (between INTERESTED and
//   RESERVATION), CONVERTED ≡ SOLD (1.00). Any other non-dead status found
//   in the data is reported with probability 0 (counted, never weighted).
// totalOpen = Σ stage values (full deal values, unweighted).
// totalWeighted = Σ stage weighteds (probability-adjusted pipeline value).

const STAGE_PROBABILITY: Record<string, number> = {
  NEW: 0.05,
  CONTACTED: 0.1,
  QUALIFIED: 0.25,
  VIEWING: 0.4,
  INTERESTED: 0.5,
  RESERVATION: 0.7,
  CONTRACT: 0.9,
  SOLD: 1,
  // Legacy statuses (kept for pre-existing rows — see lead-lifecycle.ts)
  VISITED: 0.4,
  NEGOTIATING: 0.6,
  CONVERTED: 1,
}

const STAGE_ORDER = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'VIEWING',
  'INTERESTED',
  'RESERVATION',
  'CONTRACT',
  'SOLD',
]

const DEAD_STATUSES = ['LOST', 'CANCELLED', 'EXPIRED']

const r2 = (n: number) => Math.round(n * 100) / 100

export async function GET() {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const [leads, defaults] = await Promise.all([
      db.lead.findMany({
        where: { status: { notIn: DEAD_STATUSES } },
        select: {
          status: true,
          budgetMin: true,
          budgetMax: true,
          unit: { select: { price: true } },
          deals: {
            select: {
              dealValue: true,
              status: true,
              commissions: {
                select: { estateaiAmount: true },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          },
        },
      }),
      getCommissionDefaults(),
    ])
    const defaultEstateaiPct = defaults.estateaiPct ?? 0

    const byStage = new Map<string, { count: number; value: number; estateaiWeighted: number }>()
    const bump = (stage: string) => {
      let row = byStage.get(stage)
      if (!row) {
        row = { count: 0, value: 0, estateaiWeighted: 0 }
        byStage.set(stage, row)
      }
      return row
    }

    for (const lead of leads) {
      const stage = lead.status || 'NEW'
      const probability = STAGE_PROBABILITY[stage] ?? 0
      const row = bump(stage)
      row.count += 1

      // Full deal value: best linked deal value wins, then unit price,
      // then buyer budget, else 0 (counted but valueless).
      let value = 0
      let estateaiAmount: number | null = null
      let bestDealValue = 0
      for (const deal of lead.deals) {
        if (typeof deal.dealValue === 'number' && deal.dealValue > bestDealValue) {
          if (deal.status === 'CANCELLED' || deal.status === 'LOST') continue
          bestDealValue = deal.dealValue
          estateaiAmount = deal.commissions[0]?.estateaiAmount ?? null
        }
      }
      if (bestDealValue > 0) {
        value = bestDealValue
      } else if (lead.unit && typeof lead.unit.price === 'number' && lead.unit.price > 0) {
        value = lead.unit.price
      } else if (typeof lead.budgetMax === 'number' && lead.budgetMax > 0) {
        value = lead.budgetMax
      } else if (typeof lead.budgetMin === 'number' && lead.budgetMin > 0) {
        value = lead.budgetMin
      }

      row.value += value
      // EstateAI share where computable: booked commission when present,
      // otherwise the platform-default estateaiPct estimate.
      const estateaiValue =
        value > 0
          ? (estateaiAmount ?? (value * defaultEstateaiPct) / 100)
          : 0
      row.estateaiWeighted += estateaiValue * probability
    }

    const stages = [...byStage.entries()]
      .map(([stage, row]) => {
        const probability = STAGE_PROBABILITY[stage] ?? 0
        const value = r2(row.value)
        return {
          stage,
          count: row.count,
          value,
          probability,
          weighted: r2(value * probability),
          estateaiWeighted: r2(row.estateaiWeighted),
        }
      })
      .sort((a, b) => {
        const ai = STAGE_ORDER.indexOf(a.stage)
        const bi = STAGE_ORDER.indexOf(b.stage)
        return (ai === -1 ? STAGE_ORDER.length : ai) - (bi === -1 ? STAGE_ORDER.length : bi)
      })

    const totalOpen = r2(stages.reduce((s, r) => s + r.value, 0))
    const totalWeighted = r2(stages.reduce((s, r) => s + r.weighted, 0))
    const totalEstateaiWeighted = r2(stages.reduce((s, r) => s + r.estateaiWeighted, 0))

    return NextResponse.json({
      stages: stages.map(({ stage, count, value, probability, weighted }) => ({
        stage,
        count,
        value,
        probability,
        weighted,
      })),
      totalOpen,
      totalWeighted,
      totalEstateaiWeighted,
      stagesEstateai: stages.map(({ stage, estateaiWeighted }) => ({ stage, estateaiWeighted })),
      generatedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('CEO forecast error:', err)
    return NextResponse.json({ error: 'Failed to build forecast' }, { status: 500 })
  }
}
