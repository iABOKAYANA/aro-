// ─── Market study — real market/area numbers for عين's consultations ───
//
// Deterministic DB aggregates (SQLite, ~1.8k public projects): per-area
// project counts, active developers, price bands and per-type minimums.
// Real numbers ONLY — no estimates, no cached guesses. Used to ground the
// AI's consultative reasoning (market positioning, value vs area average),
// never displayed as a claim the DB doesn't back.

import { db } from '@/lib/db'
import { PUBLIC_PROJECT_WHERE } from '@/lib/project-visibility'

export interface AreaStats {
  place: string
  kind: 'city' | 'governorate'
  projectsCount: number
  developersCount: number
  minStart: number | null
  avgStart: number | null
  maxStart: number | null
  byType: Array<{ type: string; count: number; minStart: number | null }>
  topDevelopers: Array<{ name: string; projectsCount: number }>
}

export interface MarketSnapshot {
  totalProjects: number
  totalDevelopers: number
  topAreas: Array<{ name: string; count: number; minStart: number | null }>
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length)
}

/** Real aggregates for one area (city slug/name first, governorate fallback). */
export async function areaStats(place: string): Promise<AreaStats | null> {
  const p = place.trim()
  if (!p) return null
  try {
    const city = await db.city.findFirst({
      where: { OR: [{ nameSlug: p }, { name: p }, { nameArabic: p }] },
      select: { id: true, name: true },
    })
    let kind: 'city' | 'governorate' = 'city'
    let scope: Record<string, unknown> | null = null
    let placeName = ''
    if (city) {
      scope = { ...PUBLIC_PROJECT_WHERE, cityId: city.id }
      placeName = city.name
    } else {
      const gov = await db.governorate.findFirst({
        where: { OR: [{ nameSlug: p }, { name: p }, { nameArabic: p }] },
        select: { id: true, name: true },
      })
      if (!gov) return null
      kind = 'governorate'
      scope = { ...PUBLIC_PROJECT_WHERE, governorateId: gov.id }
      placeName = gov.name
    }

    const rows = await db.project.findMany({
      where: scope as never,
      select: {
        startPrice: true,
        propertyTypes: true,
        developerId: true,
        developer: { select: { companyName: true } },
      },
    })
    if (rows.length === 0) return null

    const prices = rows.map((r) => r.startPrice).filter((v): v is number => typeof v === 'number' && v > 0)
    const devCounts = new Map<string, number>()
    const typeCounts = new Map<string, number>()
    const typeMin = new Map<string, number | null>()

    for (const r of rows) {
      const dev = r.developer?.companyName?.trim()
      if (dev) devCounts.set(dev, (devCounts.get(dev) || 0) + 1)
      let types: string[] = []
      try {
        const t = typeof r.propertyTypes === 'string' ? JSON.parse(r.propertyTypes) : r.propertyTypes
        if (Array.isArray(t)) types = t.map(String)
      } catch {
        types = []
      }
      for (const t of types.length > 0 ? types : ['UNKNOWN']) {
        typeCounts.set(t, (typeCounts.get(t) || 0) + 1)
        const cur = typeMin.get(t)
        if (typeof r.startPrice === 'number' && r.startPrice > 0 && (cur == null || r.startPrice < cur)) {
          typeMin.set(t, r.startPrice)
        }
      }
    }

    const byType = [...typeCounts.entries()]
      .map(([type, count]) => ({ type, count, minStart: typeMin.get(type) ?? null }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
      .filter((t) => t.type !== 'UNKNOWN' || byTypeOnlyUnknown(typeCounts))

    const topDevelopers = [...devCounts.entries()]
      .map(([name, projectsCount]) => ({ name, projectsCount }))
      .sort((a, b) => b.projectsCount - a.projectsCount)
      .slice(0, 5)

    return {
      place: placeName,
      kind,
      projectsCount: rows.length,
      developersCount: devCounts.size,
      minStart: prices.length ? Math.min(...prices) : null,
      avgStart: avg(prices),
      maxStart: prices.length ? Math.max(...prices) : null,
      byType,
      topDevelopers,
    }
  } catch {
    return null
  }
}

function byTypeOnlyUnknown(m: Map<string, number>): boolean {
  return m.size === 1 && m.has('UNKNOWN')
}

/** Compact national picture (when no specific area is in play). */
export async function nationalSnapshot(): Promise<MarketSnapshot | null> {
  try {
    const [totalProjects, totalDevelopers, areaRows, cities] = await Promise.all([
      db.project.count({ where: PUBLIC_PROJECT_WHERE }),
      db.developerProfile.count(),
      db.project.groupBy({
        by: ['cityId'],
        where: PUBLIC_PROJECT_WHERE,
        _count: { id: true },
        _min: { startPrice: true },
        orderBy: { _count: { id: 'desc' } },
        take: 6,
      }),
      db.city.findMany({ select: { id: true, name: true } }),
    ])
    const nameById = new Map(cities.map((c) => [c.id, c.name]))
    const topAreas = areaRows
      .filter((r): r is typeof r & { cityId: string } => !!r.cityId)
      .map((r) => ({
        name: nameById.get(r.cityId) || '',
        count: r._count.id,
        minStart: r._min.startPrice ?? null,
      }))
      .filter((a) => a.name !== '')
    if (totalProjects === 0) return null
    return { totalProjects, totalDevelopers, topAreas }
  } catch {
    return null
  }
}

export function formatMillions(v: number | null): string | null {
  if (typeof v !== 'number' || v <= 0) return null
  return `${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`
}
