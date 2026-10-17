import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireActor, type ActorContext } from '@/lib/lead-access'
import { requireCEOApi, logAudit } from '@/lib/permissions'
import { autoMatchEnabled, matchProject, persistAutoMatch, recentAutoMatches, getProjectFacts, type MatchCandidate } from '@/lib/auto-match'
import { notifyUser } from '@/lib/notify'

export const dynamic = 'force-dynamic'

// ─── AI AUTO-MATCHING (Feature 2) ───────────────────────────
// CEO/ADMIN: full scope. BROKER: only matches among their OWN leads
// (server-side scoping — never another broker's clients).
// No automatic spam: notifications only happen on explicit notify action.

async function scopeForBroker(ctx: ActorContext): Promise<string | null> {
  if (ctx.role === 'BROKER') return ctx.brokerId // null → no candidates
  return null
}

export async function GET(req: Request) {
  try {
    const gate = await requireActor(['BROKER'])
    if (!gate.ok) return gate.response
    const ctx = gate.ctx

    const enabled = await autoMatchEnabled()
    if (!enabled) {
      return NextResponse.json({ enabled: false, matches: [], reason: 'Auto-Matching is disabled in CEO settings (recommendationsEnabled)' })
    }

    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('projectId')

    // History view (CEO only — insights may cover projects a broker can't see)
    if (!projectId) {
      if (!ctx.isCEO) return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
      const insights = await recentAutoMatches(20)
      return NextResponse.json({ enabled: true, history: insights })
    }

    const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, developerId: true, approvalStatus: true } })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const scopeBrokerId = await scopeForBroker(ctx)
    if (ctx.role === 'BROKER' && !scopeBrokerId) {
      return NextResponse.json({ error: 'Broker profile not found' }, { status: 403 })
    }

    const result = await matchProject(projectId, { scopeBrokerId })
    if (ctx.isCEO) await persistAutoMatch(projectId, result)

    const counts = {
      HIGH: result.matches.filter((m) => m.tier === 'HIGH').length,
      MEDIUM: result.matches.filter((m) => m.tier === 'MEDIUM').length,
      LOW: result.matches.filter((m) => m.tier === 'LOW').length,
    }
    return NextResponse.json({ enabled: true, facts: result.facts, matches: result.matches, counts, generatedAt: result.generatedAt, scope: ctx.isCEO ? 'ALL' : 'MY_LEADS' })
  } catch (e) {
    console.error('Auto-match error:', e)
    return NextResponse.json({ error: 'Failed to compute matches' }, { status: 500 })
  }
}

/** Explicit notification workflow — no automatic messaging. */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireActor(['BROKER'])
    if (!gate.ok) return gate.response
    const ctx = gate.ctx

    const body = await req.json()
    const { action, projectId, matchId, matchKind } = body
    if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 })

    if (action === 'notify') {
      if (!matchId || !matchKind) return NextResponse.json({ error: 'matchId and matchKind are required' }, { status: 400 })

      if (matchKind === 'LEAD') {
        const lead = await db.lead.findUnique({ where: { id: matchId }, select: { id: true, name: true, brokerId: true, reviewStatus: true } })
        if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
        // Authorization: broker may only notify about their own lead
        if (ctx.role === 'BROKER' && lead.brokerId !== ctx.brokerId) {
          return NextResponse.json({ error: 'Forbidden — lead not owned by this broker' }, { status: 403 })
        }
        if (!lead.brokerId) {
          return NextResponse.json({ error: 'Lead has no assigned broker' }, { status: 409 })
        }
        const profile = await db.brokerProfile.findUnique({ where: { id: lead.brokerId }, select: { userId: true } })
        const project = await db.project.findUnique({ where: { id: projectId }, select: { name: true } })
        if (!profile) return NextResponse.json({ error: 'Broker profile not found' }, { status: 404 })
        await notifyUser(profile.userId, {
          type: 'AUTO_MATCH',
          title: 'New matching buyer',
          message: `A new project matches a client of yours (${lead.name}): ${project?.name || 'project'}. Review the match and follow up.`,
          link: `/dashboard/leads/${lead.id}`,
          metadata: { projectId, leadId: lead.id },
        })
        await logAudit({
          userId: ctx.userId,
          action: 'AUTO_MATCH_NOTIFIED',
          entity: 'Lead',
          entityId: lead.id,
          changes: { projectId, brokerId: lead.brokerId },
        })
        return NextResponse.json({ success: true, notified: 'broker' })
      }

      // BUYER match → notify CEO/ADMIN (no broker is assigned to a DNA buyer)
      if (!ctx.isCEO) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      const buyer = await db.user.findUnique({ where: { id: matchId }, select: { id: true, name: true } })
      if (!buyer) return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })
      const project = await db.project.findUnique({ where: { id: projectId }, select: { name: true } })
      const { notifyRole } = await import('@/lib/notify')
      await notifyRole(['CEO', 'ADMIN'], {
        type: 'AUTO_MATCH',
        title: 'Buyer matches a new project',
        message: `${buyer.name} matches ${project?.name || 'a project'}. Assign a broker to follow up.`,
        link: '/ceo/leads',
        metadata: { projectId, buyerId: buyer.id },
      })
      await logAudit({
        userId: ctx.userId,
        action: 'AUTO_MATCH_NOTIFIED',
        entity: 'User',
        entityId: buyer.id,
        changes: { projectId, kind: 'BUYER' },
      })
      return NextResponse.json({ success: true, notified: 'ceo' })
    }

    if (action === 'recompute') {
      if (!ctx.isCEO) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      if (!(await autoMatchEnabled())) return NextResponse.json({ error: 'Auto-Matching is disabled' }, { status: 409 })
      const result = await matchProject(projectId)
      await persistAutoMatch(projectId, result)
      await logAudit({ userId: ctx.userId, action: 'AUTO_MATCH_RECOMPUTED', entity: 'Project', entityId: projectId, changes: { matches: result.matches.length } })
      return NextResponse.json({ success: true, counts: result.matches.length })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (e) {
    console.error('Auto-match action error:', e)
    return NextResponse.json({ error: 'Action failed' }, { status: 500 })
  }
}

/** CEO-only: quick summary for dashboards. */
export async function PATCH() {
  const { error } = await requireCEOApi()
  if (error) return error
  const enabled = await autoMatchEnabled()
  const insights = await recentAutoMatches(5)
  const totalMatches = insights.reduce((acc, i) => {
    const counts = i.counts as { HIGH?: number; MEDIUM?: number; LOW?: number }
    return acc + (counts.HIGH || 0) + (counts.MEDIUM || 0) + (counts.LOW || 0)
  }, 0)
  return NextResponse.json({ enabled, recentProjects: insights.length, totalMatches })
}

export type { MatchCandidate }
