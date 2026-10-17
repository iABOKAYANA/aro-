import { db } from '@/lib/db'
import { readBoolSetting } from '@/lib/system-settings'
import { parseJsonSafe } from '@/lib/utils'

// ─── AI AUTO-LEADS / MATCHING (Feature 2) ──────────────────
// When a project (or its units/offer) is published, find BUYERS whose
// REAL preferences overlap with it. Match reasons are factual strings
// built from stored preferences — nothing is invented.
// Nothing is ever spammed: matches are stored + listed for review, and
// notifications only happen through an explicit CEO/broker action.

export const AUTO_MATCH_INSIGHT = 'AUTO_MATCH'
export const AUTO_MATCH_TOGGLE = 'recommendationsEnabled' // existing CEO AI toggle (wired)

export interface MatchSignal {
  component: 'location' | 'budget' | 'type' | 'bedrooms'
  score: number            // 0..1
  detail: string           // factual explanation
}

export interface MatchCandidate {
  kind: 'LEAD' | 'BUYER'
  id: string
  name: string
  score: number            // 0..100
  tier: 'HIGH' | 'MEDIUM' | 'LOW'
  brokerId: string | null
  reasons: string[]
  signals: MatchSignal[]
}

export interface ProjectFacts {
  id: string
  name: string
  priceBand: { min: number | null; max: number | null }
  city: string | null
  governorate: string | null
  propertyTypes: string[]
  bedrooms: { min: number; max: number } | null
  unitCount: number
  status: string
  approvalStatus: string
}

interface Signals {
  budget: { min?: number; max?: number } | null
  locations: string[]
  types: string[]
  bedrooms?: number
}

const TIER_HIGH = 70
const TIER_MEDIUM = 45
const TIER_LOW = 30

function parseArr(raw: string | null): string[] {
  const v = parseJsonSafe<unknown[]>(raw, [])
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

export async function getProjectFacts(projectId: string): Promise<ProjectFacts | null> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      city: { select: { name: true, nameSlug: true } },
      governorate: { select: { name: true } },
      units: { select: { price: true, unitType: true, bedrooms: true, area: true } },
    },
  })
  if (!project) return null

  const prices = project.units.map((u) => u.price).filter((p) => p > 0)
  const beds = project.units.map((u) => u.bedrooms).filter((b): b is number => b !== null)
  const unitTypes = [...new Set(project.units.map((u) => u.unitType).filter(Boolean))]

  return {
    id: project.id,
    name: project.name,
    priceBand: {
      min: project.startPrice ?? (prices.length ? Math.min(...prices) : null),
      max: project.endPrice ?? (prices.length ? Math.max(...prices) : null),
    },
    city: project.city?.nameSlug || project.city?.name || null,
    governorate: project.governorate?.name || null,
    propertyTypes: parseArr(project.propertyTypes).length ? parseArr(project.propertyTypes) : unitTypes,
    bedrooms: beds.length ? { min: Math.min(...beds), max: Math.max(...beds) } : null,
    unitCount: project.units.length,
    status: project.status,
    approvalStatus: project.approvalStatus,
  }
}

function locSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u0600-\u06FF-]/g, '')
}

function scoreCandidate(sig: Signals, facts: ProjectFacts): { score: number; signals: MatchSignal[]; reasons: string[] } {
  const signals: MatchSignal[] = []
  const reasons: string[] = []

  // ── Location (35%) ──
  const targets = [facts.city, facts.governorate].filter(Boolean).map((s) => (s as string).toLowerCase())
  const targetSlugs = targets.map(locSlug)
  let locScore = 0
  if (sig.locations.length) {
    const hit = sig.locations.find((l) => {
      const ll = l.toLowerCase()
      return targets.some((t) => ll === t || t.includes(ll) || ll.includes(t)) ||
        targetSlugs.some((t) => ll === t || ll.includes(t) || t.includes(ll))
    })
    if (hit) {
      locScore = 1
      reasons.push(`Prefers ${hit.replace(/-/g, ' ')} — project is in ${facts.city || facts.governorate}`)
    } else {
      reasons.push(`Prefers ${sig.locations.map((l) => l.replace(/-/g, ' ')).join(', ')} — project is in ${facts.city || facts.governorate} (no overlap)`)
    }
  } else {
    locScore = 0.3
    reasons.push('No location preference on record — location compatibility unknown')
  }
  signals.push({ component: 'location', score: locScore, detail: reasons[reasons.length - 1] })

  // ── Budget (40%) ──
  let budgetScore = 0.5
  const band = facts.priceBand
  if (!sig.budget) {
    reasons.push('No budget on record — budget compatibility unknown')
    signals.push({ component: 'budget', score: 0.5, detail: 'No budget on record' })
  } else if (band.min === null || band.max === null) {
    reasons.push('Project has no published price band yet')
    signals.push({ component: 'budget', score: 0.5, detail: 'No published price band' })
  } else {
    const bMin = sig.budget.min ?? 0
    const bMax = sig.budget.max ?? Number.POSITIVE_INFINITY
    const overlapLow = Math.max(bMin, band.min)
    const overlapHigh = Math.min(bMax, band.max)
    const overlap = overlapHigh - overlapLow
    const bandSize = band.max - band.min || band.min
    if (overlap > 0) {
      budgetScore = overlap >= bandSize ? 1 : Math.max(0.6, overlap / bandSize)
      reasons.push(
        `Budget ${bMin ? `${Math.round(bMin / 1e6)}M` : 'any'}–${bMax === Infinity ? 'any' : `${Math.round(bMax / 1e6)}M`} overlaps project band ${Math.round(band.min / 1e6)}M–${Math.round(band.max / 1e6)}M EGP`,
      )
    } else {
      // adjacent? within 15% of the band
      const near = overlapLow === 0 ? false : Math.abs(overlap) <= bandSize * 0.15
      budgetScore = near ? 0.3 : 0
      reasons.push(
        `Budget ${bMin ? `${Math.round(bMin / 1e6)}M` : 'any'}–${bMax === Infinity ? 'any' : `${Math.round(bMax / 1e6)}M`} does not ${near ? 'quite ' : ''}cover project band ${Math.round(band.min / 1e6)}M–${Math.round(band.max / 1e6)}M EGP`,
      )
    }
    signals.push({ component: 'budget', score: budgetScore, detail: reasons[reasons.length - 1] })
  }

  // ── Property type (20%) ──
  let typeScore = 0.5
  if (sig.types.length && facts.propertyTypes.length) {
    const inter = sig.types.filter((t) => facts.propertyTypes.includes(t))
    if (inter.length) {
      typeScore = 1
      reasons.push(`Interested in ${inter.join(', ')} — project offers ${inter.join(', ')}`)
    } else {
      typeScore = 0
      reasons.push(`Interested in ${sig.types.join(', ')} — project offers ${facts.propertyTypes.join(', ')} (no overlap)`)
    }
  } else {
    reasons.push('Property-type preference unknown')
  }
  signals.push({ component: 'type', score: typeScore, detail: reasons[reasons.length - 1] })

  // ── Bedrooms (5%) ──
  let bedScore = 0.5
  if (sig.bedrooms !== undefined && facts.bedrooms) {
    const okBeds = sig.bedrooms >= facts.bedrooms.min && sig.bedrooms <= facts.bedrooms.max
    bedScore = okBeds ? 1 : 0
    reasons.push(`Wants ${sig.bedrooms} bedrooms — project units have ${facts.bedrooms.min}–${facts.bedrooms.max}`)
  }
  signals.push({ component: 'bedrooms', score: bedScore, detail: reasons[reasons.length - 1] })

  const score = Math.round((0.35 * locScore + 0.4 * budgetScore + 0.2 * typeScore + 0.05 * bedScore) * 100)
  return { score, signals, reasons }
}

function tierOf(score: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (score >= TIER_HIGH) return 'HIGH'
  if (score >= TIER_MEDIUM) return 'MEDIUM'
  return 'LOW'
}

/** Compute matching buyers for a project. `scopeBrokerId` limits lead candidates to one broker. */
export async function matchProject(
  projectId: string,
  opts?: { scopeBrokerId?: string | null; limit?: number },
): Promise<{ facts: ProjectFacts; matches: MatchCandidate[]; generatedAt: string }> {
  const facts = await getProjectFacts(projectId)
  if (!facts) throw new Error('Project not found')

  const matches: MatchCandidate[] = []

  // 1. Active leads with any recorded preference
  const leadWhere: Record<string, unknown> = {
    reviewStatus: 'ACTIVE',
    status: { notIn: ['LOST', 'CLOSED'] },
    AND: [{ OR: [{ budgetMin: { not: null } }, { budgetMax: { not: null } }, { preferredAreas: { not: '[]' } }, { preferredPropertyTypes: { not: '[]' } }] }],
  }
  if (opts?.scopeBrokerId) leadWhere.brokerId = opts.scopeBrokerId
  const leads = await db.lead.findMany({
    where: leadWhere,
    orderBy: { updatedAt: 'desc' },
    take: opts?.limit ?? 400,
    select: { id: true, name: true, brokerId: true, budgetMin: true, budgetMax: true, preferredAreas: true, preferredPropertyTypes: true },
  })
  for (const lead of leads) {
    const sig: Signals = {
      budget: lead.budgetMin !== null || lead.budgetMax !== null
        ? { min: lead.budgetMin ?? undefined, max: lead.budgetMax ?? undefined }
        : null,
      locations: parseArr(lead.preferredAreas),
      types: parseArr(lead.preferredPropertyTypes),
    }
    const { score, signals, reasons } = scoreCandidate(sig, facts)
    if (score < TIER_LOW) continue
    matches.push({ kind: 'LEAD', id: lead.id, name: lead.name, score, tier: tierOf(score), brokerId: lead.brokerId, reasons, signals })
  }

  // 2. Registered buyers with DNA (only for full-scope viewers — a broker
  //    never sees clients they don't own)
  if (!opts?.scopeBrokerId) {
    const profiles = await db.userProfile.findMany({
      where: { dnaConfidence: { gt: 0 } },
      orderBy: { dnaUpdatedAt: 'desc' },
      take: 400,
      include: { user: { select: { id: true, name: true, role: true, status: true } } },
    })
    for (const p of profiles) {
      if (p.user.role !== 'BUYER' || p.user.status !== 'ACTIVE') continue
      const dna = parseJsonSafe<{ budget?: { min?: number; max?: number }; locations?: string[]; propertyTypes?: string[]; bedrooms?: number }>(p.dnaData, {})
      const sig: Signals = {
        budget: dna.budget ? { min: dna.budget.min, max: dna.budget.max } : null,
        locations: dna.locations || [],
        types: dna.propertyTypes || [],
        bedrooms: dna.bedrooms,
      }
      if (!sig.budget && !sig.locations.length && !sig.types.length) continue
      const { score, signals, reasons } = scoreCandidate(sig, facts)
      if (score < TIER_LOW) continue
      matches.push({ kind: 'BUYER', id: p.user.id, name: p.user.name, score, tier: tierOf(score), brokerId: null, reasons, signals })
    }
  }

  matches.sort((a, b) => b.score - a.score)
  return { facts, matches: matches.slice(0, opts?.limit ?? 100), generatedAt: new Date().toISOString() }
}

/** Persist the latest match set as an AIInsight (replaces previous for the project). */
export async function persistAutoMatch(projectId: string, result: { facts: ProjectFacts; matches: MatchCandidate[]; generatedAt: string }): Promise<void> {
  try {
    const data = JSON.stringify({
      projectId,
      projectName: result.facts.name,
      priceBand: result.facts.priceBand,
      generatedAt: result.generatedAt,
      counts: {
        HIGH: result.matches.filter((m) => m.tier === 'HIGH').length,
        MEDIUM: result.matches.filter((m) => m.tier === 'MEDIUM').length,
        LOW: result.matches.filter((m) => m.tier === 'LOW').length,
      },
      matches: result.matches,
    })
    const existing = await db.aIInsight.findFirst({ where: { type: AUTO_MATCH_INSIGHT, entityId: projectId } })
    if (existing) {
      await db.aIInsight.update({ where: { id: existing.id }, data: { data, createdAt: new Date() } })
    } else {
      await db.aIInsight.create({ data: { type: AUTO_MATCH_INSIGHT, entityType: 'PROJECT', entityId: projectId, data, confidence: 1 } })
    }
  } catch (e) {
    console.error('[auto-match] persist failed:', e)
  }
}

export async function autoMatchEnabled(): Promise<boolean> {
  return readBoolSetting(AUTO_MATCH_TOGGLE, true)
}

/** Recent persisted match sets (CEO history view). */
export async function recentAutoMatches(limit = 20) {
  const rows = await db.aIInsight.findMany({ where: { type: AUTO_MATCH_INSIGHT }, orderBy: { createdAt: 'desc' }, take: limit })
  return rows.map((r) => {
    const data = parseJsonSafe<Record<string, unknown>>(r.data, {})
    return {
      id: r.id,
      projectId: r.entityId,
      projectName: (data.projectName as string) || '—',
      priceBand: data.priceBand || null,
      counts: data.counts || {},
      generatedAt: new Date(r.createdAt).toISOString(),
      matches: (data.matches as MatchCandidate[]) || [],
    }
  })
}
