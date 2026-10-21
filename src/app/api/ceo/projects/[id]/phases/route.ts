import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi, logAudit } from '@/lib/permissions'

/**
 * The phases BELOW a project — always inside their parent project, never
 * standalone. PATCH lets the CEO spotlight a phase as a "new launch" whenever
 * he decides (`isLaunch`, optional `launchDate`). Unit/price data of a phase
 * itself is owned by imports & unit flows; this endpoint deliberately touches
 * ONLY the two launch fields so nothing else can drift.
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { error, session } = await requireCEOApi()
  if (error) return error

  const projectId = params.id
  const body = await request.json().catch(() => null)
  const phaseId = typeof body?.phaseId === 'string' ? body.phaseId : null
  if (!phaseId) {
    return NextResponse.json({ error: 'phaseId is required' }, { status: 400 })
  }

  const phase = await db.projectPhase.findUnique({
    where: { id: phaseId },
    select: { id: true, projectId: true, name: true },
  })
  if (!phase || phase.projectId !== projectId) {
    return NextResponse.json({ error: 'المرحلة دي مش بتاعة المشروع ده.' }, { status: 404 })
  }

  const data: { isLaunch?: boolean; launchDate?: Date | null } = {}
  if (typeof body.isLaunch === 'boolean') data.isLaunch = body.isLaunch
  if ('launchDate' in body) {
    if (body.launchDate === null || body.launchDate === '') data.launchDate = null
    else {
      const d = new Date(body.launchDate)
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: 'تاريخ اللونش مش صحيح.' }, { status: 400 })
      }
      data.launchDate = d
    }
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No launch fields to update' }, { status: 400 })
  }

  const updated = await db.projectPhase.update({
    where: { id: phaseId },
    data,
    select: { id: true, name: true, isLaunch: true, launchDate: true },
  })

  await logAudit({
    action: 'PHASE_LAUNCH',
    entity: 'ProjectPhase',
    entityId: phaseId,
    userId: (session!.user as any).id,
    changes: { isLaunch: updated.isLaunch, launchDate: updated.launchDate || null, phaseName: phase.name },
  })

  return NextResponse.json({ phase: updated })
}
