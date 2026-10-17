import { db } from '@/lib/db'
import { parseJsonSafe } from '@/lib/utils'

// ─── SMART BROKER MATCHING (Feature 9) ──────────────────────
// Matches a project with brokers using ACTUAL platform activity.
// Deliberately NOT a political/arbitrary "winner" ranking: every entry
// shows factual indicators + factual reasons, ordered by recency of
// activity — the CEO/developer makes the decision.

export interface BrokerIndicator {
  brokerId: string
  name: string
  email: string
  agency: string | null
  isVerified: boolean
  rating: number
  yearsExperience: number | null
  serviceAreas: string[]
  specialization: string[]
  indicators: {
    activeLeads: number
    leadsInArea: number
    leadsMatchingType: number
    viewingsLast90d: number
    reservationsLast90d: number
    soldDeals: number
    totalDeals: number
    lastActivityAt: string | null
    hasProjectAccess: boolean
  }
  reasons: string[]
  lastActivityAt: string | null  // used only for ordering (recency, not merit)
}

export interface BrokerMatchResult {
  project: { id: string; name: string; city: string | null; governorate: string | null; propertyTypes: string[]; priceBand: { min: number | null; max: number | null } }
  brokers: BrokerIndicator[]
  disclosure: string
}

const DISCLOSURE =
  'Factual indicators only. EstateAI does not rank brokers as objectively "the best" — these are relevant activity facts to support your decision.'

export async function recommendBrokersForProject(projectId: string): Promise<BrokerMatchResult> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      city: { select: { name: true, nameSlug: true } },
      governorate: { select: { name: true } },
      units: { select: { price: true } },
    },
  })
  if (!project) throw new Error('Project not found')

  const propertyTypes = parseJsonSafe<string[]>(project.propertyTypes, [])
  const city = project.city?.name || null
  const governorate = project.governorate?.name || null
  const prices = project.units.map((u) => u.price).filter((p) => p > 0)
  const priceBand = {
    min: project.startPrice ?? (prices.length ? Math.min(...prices) : null),
    max: project.endPrice ?? (prices.length ? Math.max(...prices) : null),
  }

  const brokers = await db.brokerProfile.findMany({
    include: {
      user: { select: { id: true, name: true, email: true, status: true } },
      projectAccess: { where: { projectId }, select: { id: true } },
    },
  })

  const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

  const out: BrokerIndicator[] = []
  for (const b of brokers) {
    if (b.user.status !== 'ACTIVE') continue

    const [activeLeads, leads, viewings, reservations, sold] = await Promise.all([
      db.lead.count({ where: { brokerId: b.id, reviewStatus: 'ACTIVE', status: { notIn: ['LOST', 'CLOSED'] } } }),
      db.lead.findMany({
        where: { brokerId: b.id, reviewStatus: 'ACTIVE' },
        select: { preferredAreas: true, preferredPropertyTypes: true, updatedAt: true },
        take: 300,
      }),
      db.viewing.count({ where: { brokerId: b.id, createdAt: { gte: since90 } } }),
      db.deal.count({ where: { brokerId: b.id, createdAt: { gte: since90 }, status: { in: ['RESERVATION', 'CONTRACT', 'SOLD'] } } }),
      db.deal.count({ where: { brokerId: b.id, status: 'SOLD' } }),
    ])
    const totalDeals = await db.deal.count({ where: { brokerId: b.id } })

    const targetNames = [city, governorate].filter(Boolean).map((s) => (s as string).toLowerCase())
    let leadsInArea = 0
    let leadsMatchingType = 0
    let lastActivity: Date | null = null
    for (const l of leads) {
      const areas = parseJsonSafe<string[]>(l.preferredAreas, [])
      const types = parseJsonSafe<string[]>(l.preferredPropertyTypes, [])
      const areaHit = areas.some((a) => {
        const ll = a.toLowerCase()
        return targetNames.some((t) => ll === t || t.includes(ll) || ll.includes(t))
      })
      if (areaHit) leadsInArea++
      if (propertyTypes.length && types.some((t) => propertyTypes.includes(t))) leadsMatchingType++
      const upd = new Date(l.updatedAt)
      if (!lastActivity || upd > lastActivity) lastActivity = upd
    }
    if (viewings > 0 || reservations > 0) {
      const now90 = since90
      if (!lastActivity || now90 > lastActivity) lastActivity = now90
    }

    const serviceAreas = parseJsonSafe<string[]>(b.serviceAreas, [])
    const specialization = parseJsonSafe<string[]>(b.specialization, [])
    const hasAccess = b.projectAccess.length > 0

    const reasons: string[] = []
    if (leadsInArea > 0) reasons.push(`${leadsInArea} active lead${leadsInArea === 1 ? '' : 's'} interested in ${city || governorate}`)
    if (leadsMatchingType > 0) reasons.push(`${leadsMatchingType} lead${leadsMatchingType === 1 ? '' : 's'} matching this project's property types`)
    if (viewings > 0) reasons.push(`${viewings} viewing${viewings === 1 ? '' : 's'} booked in the last 90 days`)
    if (reservations > 0) reasons.push(`${reservations} deal${reservations === 1 ? '' : 's'} reserved in the last 90 days`)
    if (sold > 0) reasons.push(`${sold} sold deal${sold === 1 ? '' : 's'} on record`)
    const areaDeclared = serviceAreas.some((a) => {
      const ll = a.toLowerCase()
      return targetNames.some((t) => ll === t || t.includes(ll) || ll.includes(t))
    })
    if (areaDeclared) reasons.push(`Service areas include ${city || governorate}`)
    if (specialization.length && propertyTypes.some((t) => specialization.includes(t))) {
      reasons.push(`Specializes in ${specialization.filter((s) => propertyTypes.includes(s)).join(', ')}`)
    }
    if (hasAccess) reasons.push('Already has access to this project')
    if (activeLeads > 0 && !reasons.length) reasons.push(`${activeLeads} active lead${activeLeads === 1 ? '' : 's'} in pipeline`)

    out.push({
      brokerId: b.id,
      name: b.user.name,
      email: b.user.email,
      agency: b.agencyName || null,
      isVerified: b.isVerified,
      rating: b.rating,
      yearsExperience: b.yearsExperience,
      serviceAreas,
      specialization,
      indicators: {
        activeLeads,
        leadsInArea,
        leadsMatchingType,
        viewingsLast90d: viewings,
        reservationsLast90d: reservations,
        soldDeals: sold,
        totalDeals,
        lastActivityAt: lastActivity ? lastActivity.toISOString() : null,
        hasProjectAccess: hasAccess,
      },
      reasons,
      lastActivityAt: lastActivity ? lastActivity.toISOString() : null,
    })
  }

  // Order by recency of activity (factual, not a merit ranking)
  out.sort((a, b) => (b.lastActivityAt || '').localeCompare(a.lastActivityAt || ''))

  return {
    project: {
      id: project.id,
      name: project.name,
      city,
      governorate,
      propertyTypes,
      priceBand,
    },
    brokers: out,
    disclosure: DISCLOSURE,
  }
}
