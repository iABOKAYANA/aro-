import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isPublicProject } from '@/lib/project-visibility'
import { readTrust, summarizeTrust, trustLabel, freshnessDays, type TrustStatus } from '@/lib/trust'

export const dynamic = 'force-dynamic'

// ─── PUBLIC TRUST ENDPOINT (Feature 10) ──────────────────────
// Anyone viewing a project/unit can see which important facts are
// verified vs developer-provided vs pending vs stale. Never labels
// unverified data as verified. Internal notes/usernames are NOT exposed.

function sanitize(trust: Awaited<ReturnType<typeof readTrust>>) {
  const out: Record<string, { status: TrustStatus; label: string; tone: string; ageDays: number; source?: string }> = {}
  for (const [field, entry] of Object.entries(trust)) {
    const { label, tone } = trustLabel(entry.status)
    out[field] = { status: entry.status, label, tone, ageDays: entry.ageDays, source: entry.source }
  }
  return out
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('projectId')
    const unitId = searchParams.get('unitId')
    if (!projectId && !unitId) {
      return NextResponse.json({ error: 'projectId or unitId is required' }, { status: 400 })
    }
    const window = await freshnessDays()

    let raw: string | null = null
    if (projectId) {
      const p = await db.project.findUnique({
        where: { id: projectId },
        select: { dataTrust: true, approvalStatus: true, isActive: true, startPrice: true, units: { where: { price: { gt: 0 } }, take: 1, select: { id: true, price: true } } },
      })
      if (!p || !isPublicProject(p)) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      raw = p.dataTrust
    } else {
      const u = await db.unit.findUnique({ where: { id: unitId! }, select: { dataTrust: true, status: true } })
      if (!u) return NextResponse.json({ error: 'Unit not found' }, { status: 404 })
      raw = u.dataTrust
    }

    const trust = readTrust(raw, window)
    return NextResponse.json({
      freshnessWindowDays: window,
      trust: sanitize(trust),
      summary: summarizeTrust(trust),
      lastUpdated: new Date().toISOString(),
    })
  } catch (e) {
    console.error('Trust fetch error:', e)
    return NextResponse.json({ error: 'Failed to load trust data' }, { status: 500 })
  }
}
