import { db } from '@/lib/db'
import { notifyUser, notifyRole, brokerUserId } from '@/lib/notify'

// ─── Monthly broker-target progress (computed from deals, never stored) ──
// Actuals: deals with status SOLD whose (saleDate ?? createdAt) falls in the
// month. BrokerTarget.brokerId is a User id; Deal.brokerId is a BrokerProfile
// id — joined via BrokerProfile.userId.

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split('-').map(Number)
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) }
}

export function monthOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function currentMonth(): string {
  return monthOf(new Date())
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export interface BrokerProgress {
  brokerId: string // BrokerProfile id (join-friendly with leads/deals)
  name: string
  month: string
  targetDeals: number
  targetValue: number
  actualDeals: number
  actualValue: number
  pctDeals: number
  pctValue: number
  hasTarget: boolean
}

export async function getTargetsProgress(month: string): Promise<BrokerProgress[]> {
  const { start, end } = monthRange(month)
  const [profiles, targets, deals] = await Promise.all([
    db.brokerProfile.findMany({
      select: { id: true, userId: true, user: { select: { name: true } } },
      orderBy: { user: { createdAt: 'asc' } },
    }),
    db.brokerTarget.findMany({ where: { month } }),
    db.deal.findMany({
      where: {
        status: 'SOLD',
        OR: [
          { saleDate: { gte: start, lt: end } },
          { saleDate: null, createdAt: { gte: start, lt: end } },
        ],
      },
      select: { brokerId: true, dealValue: true },
    }),
  ])
  const byUser = new Map(targets.map((t) => [t.brokerId, t]))
  const actuals = new Map<string, { n: number; v: number }>()
  for (const d of deals) {
    if (!d.brokerId) continue
    const e = actuals.get(d.brokerId) || { n: 0, v: 0 }
    e.n += 1
    e.v += d.dealValue || 0
    actuals.set(d.brokerId, e)
  }
  return profiles.map((p) => {
    const t = byUser.get(p.userId)
    const a = actuals.get(p.id) || { n: 0, v: 0 }
    const td = t?.targetDeals ?? 0
    const tv = t?.targetValue ?? 0
    return {
      brokerId: p.id,
      name: p.user.name || '',
      month,
      targetDeals: td,
      targetValue: tv,
      actualDeals: a.n,
      actualValue: a.v,
      pctDeals: td > 0 ? round1((a.n / td) * 100) : 0,
      pctValue: tv > 0 ? round1((a.v / tv) * 100) : 0,
      hasTarget: !!t,
    }
  })
}

// Fail-soft hit check for the deal-close hook: notifies only when THIS close
// crossed a threshold (exact deals hit / value crossover), so repeat closes
// above target don't re-spam. Never throws.
export async function checkTargetHit(params: {
  brokerProfileId: string
  dealValue: number
  saleDate: Date | null
}): Promise<void> {
  try {
    const month = monthOf(params.saleDate ?? new Date())
    const profile = await db.brokerProfile.findUnique({
      where: { id: params.brokerProfileId },
      select: { userId: true, user: { select: { name: true } } },
    })
    if (!profile) return
    const target = await db.brokerTarget.findUnique({
      where: { brokerId_month: { brokerId: profile.userId, month } },
    })
    if (!target) return
    const rows = await getTargetsProgress(month)
    const row = rows.find((r) => r.brokerId === params.brokerProfileId)
    if (!row) return
    const hitDeals = target.targetDeals > 0 && row.actualDeals === target.targetDeals
    const dv = typeof params.dealValue === 'number' ? params.dealValue : 0
    const hitValue =
      target.targetValue > 0 &&
      row.actualValue >= target.targetValue &&
      row.actualValue - dv < target.targetValue
    if (!hitDeals && !hitValue) return
    const bits: string[] = []
    if (hitDeals) bits.push(`${row.actualDeals}/${target.targetDeals} deals`)
    if (hitValue) bits.push(`${row.actualValue}/${target.targetValue} value`)
    const detail = bits.join(' + ')
    await notifyUser(await brokerUserId(params.brokerProfileId), {
      type: 'TARGET_HIT',
      title: `Target hit — ${month}`,
      message: `Congratulations! You hit your ${month} target — ${detail}.`,
      link: '/dashboard/deals',
      metadata: { month },
    })
    await notifyRole(['CEO', 'ADMIN'], {
      type: 'TARGET_HIT',
      title: 'Broker hit monthly target',
      message: `${profile.user.name || 'Broker'} hit the ${month} target — ${detail}.`,
      link: '/ceo/brokers',
      metadata: { brokerId: params.brokerProfileId, month },
    })
  } catch (e) {
    console.error('[targets] hit check failed:', e)
  }
}
