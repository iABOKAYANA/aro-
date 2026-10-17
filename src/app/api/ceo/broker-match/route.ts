import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireActor } from '@/lib/lead-access'
import { recommendBrokersForProject } from '@/lib/broker-match'

export const dynamic = 'force-dynamic'

// ─── BROKER–PROJECT MATCHING (Feature 9) ────────────────────
// CEO/ADMIN: any project. DEVELOPER: only their own projects.
// Brokers see only factual indicators (no private client data leaks).

export async function GET(req: Request) {
  try {
    const gate = await requireActor(['DEVELOPER'])
    if (!gate.ok) return gate.response
    const ctx = gate.ctx

    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('projectId')
    if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 })

    const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, developerId: true } })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    if (!ctx.isCEO) {
      // DEVELOPER must own this project
      if (!ctx.developerId || ctx.developerId !== project.developerId) {
        return NextResponse.json({ error: 'Forbidden — not your project' }, { status: 403 })
      }
    }

    const result = await recommendBrokersForProject(projectId)
    return NextResponse.json(result)
  } catch (e) {
    console.error('Broker match error:', e)
    return NextResponse.json({ error: 'Failed to compute broker matches' }, { status: 500 })
  }
}
