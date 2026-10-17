import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi, logAudit } from '@/lib/permissions'
import { partnershipSchema } from '@/lib/validations'

export const dynamic = 'force-dynamic'

function parseIdList(value: string | null): string[] {
  if (!value) return []
  try {
    const p = JSON.parse(value)
    return Array.isArray(p) ? p.filter((v) => typeof v === 'string') : []
  } catch {
    return []
  }
}

// ─── GET /api/ceo/partnerships — list with broker access ──
export async function GET() {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const [partnerships, accessRows] = await Promise.all([
      db.developerPartnership.findMany({
        include: {
          developer: {
            select: {
              id: true,
              companyName: true,
              isVerified: true,
              user: { select: { name: true, email: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.brokerProjectAccess.findMany({
        include: {
          broker: { select: { id: true, user: { select: { name: true, email: true } } } },
          developer: { select: { id: true, companyName: true } },
          project: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ])

    return NextResponse.json({
      partnerships: partnerships.map((p) => ({
        ...p,
        approvedProjectIds: parseIdList(p.approvedProjectIds),
        allowedBrokerIds: parseIdList(p.allowedBrokerIds),
        blockedBrokerIds: parseIdList(p.blockedBrokerIds),
      })),
      brokerAccess: accessRows,
    })
  } catch (error) {
    console.error('Partnerships GET error:', error)
    return NextResponse.json({ error: 'Failed to load partnerships' }, { status: 500 })
  }
}

// ─── POST /api/ceo/partnerships ───────────────────────────
// body.type:
//   'PARTNERSHIP_UPSERT'  — create/update a DeveloperPartnership
//   'ACCESS_UPSERT'       — grant/revoke a broker's project/developer access
//   'ACCESS_DELETE'       — remove an access row
export async function POST(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error
    const actorId = (session!.user as any)?.id as string

    const body = await req.json()
    const type = body.type as string

    if (type === 'PARTNERSHIP_UPSERT') {
      const parsed = partnershipSchema.safeParse(body.partnership)
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid partnership' }, { status: 400 })
      }
      const p = parsed.data
      const developer = await db.developerProfile.findUnique({ where: { id: p.developerId } })
      if (!developer) return NextResponse.json({ error: 'Developer not found' }, { status: 404 })

      const data = {
        status: p.status,
        allProjectsApproved: p.allProjectsApproved,
        approvedProjectIds: JSON.stringify(p.approvedProjectIds),
        commissionAgreement: p.commissionAgreement || null,
        leadProtectionDays: p.leadProtectionDays ?? null,
        allowedBrokerIds: JSON.stringify(p.allowedBrokerIds),
        blockedBrokerIds: JSON.stringify(p.blockedBrokerIds),
        startDate: p.startDate ? new Date(p.startDate) : null,
        endDate: p.endDate ? new Date(p.endDate) : null,
        terms: p.terms || null,
        isActive: p.isActive,
        reviewNote: p.reviewNote || null,
        reviewedById: p.status !== 'PENDING' ? actorId : null,
      }

      const existing = await db.developerPartnership.findUnique({ where: { developerId: p.developerId } })
      const partnership = existing
        ? await db.developerPartnership.update({ where: { developerId: p.developerId }, data })
        : await db.developerPartnership.create({ data: { developerId: p.developerId, ...data } })

      await logAudit({
        userId: actorId,
        action: existing ? 'PARTNERSHIP_UPDATED' : 'PARTNERSHIP_CREATED',
        entity: 'DeveloperPartnership',
        entityId: partnership.id,
        changes: { status: p.status, developerId: p.developerId },
      })

      return NextResponse.json({ partnership }, { status: existing ? 200 : 201 })
    }

    if (type === 'ACCESS_UPSERT') {
      const brokerId = String(body.brokerId || '')
      if (!brokerId) return NextResponse.json({ error: 'brokerId required' }, { status: 400 })
      const access = body.access === 'BLOCKED' ? 'BLOCKED' : 'APPROVED'
      const developerId = body.developerId ? String(body.developerId) : null
      const projectId = body.projectId ? String(body.projectId) : null
      if (!developerId && !projectId) {
        return NextResponse.json({ error: 'developerId or projectId required' }, { status: 400 })
      }

      const broker = await db.brokerProfile.findUnique({ where: { id: brokerId } })
      if (!broker) return NextResponse.json({ error: 'Broker not found' }, { status: 404 })

      const where = { brokerId, developerId, projectId }
      const data = {
        access,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        createdById: actorId,
        notes: typeof body.notes === 'string' ? body.notes : null,
      }
      const existingAccess = await db.brokerProjectAccess.findFirst({
        where: { brokerId, developerId: developerId as any, projectId: projectId as any },
      })
      const row = existingAccess
        ? await db.brokerProjectAccess.update({ where: { id: existingAccess.id }, data })
        : await db.brokerProjectAccess.create({ data: { ...where, ...data } })

      await logAudit({
        userId: actorId,
        action: `BROKER_ACCESS_${access}`,
        entity: 'BrokerProjectAccess',
        entityId: row.id,
        changes: { brokerId, developerId, projectId },
      })

      return NextResponse.json({ access: row })
    }

    if (type === 'ACCESS_DELETE') {
      if (!body.accessId) return NextResponse.json({ error: 'accessId required' }, { status: 400 })
      await db.brokerProjectAccess.delete({ where: { id: body.accessId } })
      await logAudit({
        userId: actorId,
        action: 'BROKER_ACCESS_DELETED',
        entity: 'BrokerProjectAccess',
        entityId: body.accessId,
      })
      return NextResponse.json({ deleted: true })
    }

    // Bulk allow / block — one round-trip for any number of projects or developers
    if (type === 'ACCESS_BULK') {
      const brokerId = String(body.brokerId || '')
      if (!brokerId) return NextResponse.json({ error: 'brokerId required' }, { status: 400 })
      const access = body.access === 'BLOCKED' ? 'BLOCKED' : 'APPROVED'
      const projectIds: string[] = Array.isArray(body.projectIds)
        ? [...new Set<string>(body.projectIds.map((v: unknown) => String(v)).filter(Boolean))]
        : []
      const developerIds: string[] = Array.isArray(body.developerIds)
        ? [...new Set<string>(body.developerIds.map((v: unknown) => String(v)).filter(Boolean))]
        : []

      if (projectIds.length === 0 && developerIds.length === 0) {
        return NextResponse.json({ error: 'Nothing selected' }, { status: 400 })
      }

      const broker = await db.brokerProfile.findUnique({ where: { id: brokerId } })
      if (!broker) return NextResponse.json({ error: 'Broker not found' }, { status: 404 })

      const projects = projectIds.length
        ? await db.project.findMany({
            where: { id: { in: projectIds } },
            select: { id: true, developerId: true },
          })
        : []

      const targets = [
        ...projects.map((p) => ({ developerId: p.developerId, projectId: p.id })),
        ...developerIds.map((developerId) => ({ developerId, projectId: null })),
      ]

      let changed = 0
      await db.$transaction(async (tx) => {
        for (const t of targets) {
          const existing = await tx.brokerProjectAccess.findFirst({
            where: {
              brokerId,
              developerId: t.developerId,
              projectId: t.projectId as any,
            },
          })
          if (existing) {
            if (existing.access !== access) {
              await tx.brokerProjectAccess.update({
                where: { id: existing.id },
                data: { access, createdById: actorId, notes: `bulk ${access}` },
              })
              changed += 1
            }
          } else {
            await tx.brokerProjectAccess.create({
              data: {
                brokerId,
                developerId: t.developerId,
                projectId: t.projectId as any,
                access,
                createdById: actorId,
                notes: `bulk ${access}`,
              },
            })
            changed += 1
          }
        }
      })

      await logAudit({
        userId: actorId,
        action: `BROKER_ACCESS_BULK_${access}`,
        entity: 'BrokerProjectAccess',
        entityId: brokerId,
        changes: {
          brokerId,
          access,
          requested: targets.length,
          changed,
          projectCount: projects.length,
          developerCount: developerIds.length,
        },
      })

      return NextResponse.json({
        changed,
        total: targets.length,
        access,
        skipped: targets.length - changed,
      })
    }

    // Bulk revoke — drop any number of rules in one call. Scoped to one broker
    // so a leaked id list can never wipe someone else's rules.
    if (type === 'ACCESS_DELETE_BULK') {
      const brokerId = String(body.brokerId || '')
      if (!brokerId) return NextResponse.json({ error: 'brokerId required' }, { status: 400 })
      const accessIds: string[] = Array.isArray(body.accessIds)
        ? [...new Set<string>(body.accessIds.map((v: unknown) => String(v)).filter(Boolean))]
        : []
      if (accessIds.length === 0) {
        return NextResponse.json({ error: 'Nothing selected' }, { status: 400 })
      }
      const { count } = await db.brokerProjectAccess.deleteMany({
        where: { id: { in: accessIds }, brokerId },
      })
      await logAudit({
        userId: actorId,
        action: 'BROKER_ACCESS_BULK_DELETED',
        entity: 'BrokerProjectAccess',
        entityId: accessIds[0],
        changes: { brokerId, accessIds, deleted: count },
      })
      return NextResponse.json({ deleted: count })
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
  } catch (err) {
    console.error('Partnerships POST error:', err)
    return NextResponse.json({ error: 'Failed to save partnership' }, { status: 500 })
  }
}
