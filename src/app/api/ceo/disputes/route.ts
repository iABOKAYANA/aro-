import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { requireCEOApi, logAudit } from '@/lib/permissions'
import { syncDealCommission } from '@/lib/commission'
import { notifyUser, notifyRole, brokerUserId } from '@/lib/notify'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// ─── Deal attribution disputes (DealDispute model) ─────────
// GET   /api/ceo/disputes — CEO-only. OPEN disputes first, then newest-first.
//   Each row carries deal context (value, status, current broker) + claimant.
// POST  /api/ceo/disputes — file a dispute. Dual-role:
//   • BROKER (any signed-in broker): claimantId is taken from the session and
//     any client-supplied claimantId is IGNORED (a broker can only file as self).
//   • CEO/ADMIN: must supply claimantId explicitly (files on a broker's behalf).
//   Body: { dealId*, claimantId?, reason*, evidence? }
// PATCH /api/ceo/disputes — CEO-only. Resolve a dispute.
//   Body: { id*, decision: APPROVED|REJECTED, resolution? }
//   APPROVED side effects: deal.brokerId → claimant's broker profile,
//   PENDING commission re-sync via syncDealCommission, both brokers notified,
//   audit DISPUTE_RESOLVED. REJECTED: commissions restored, claimant notified.

const DISPUTE_INCLUDE = {
  deal: {
    select: {
      id: true,
      dealValue: true,
      status: true,
      brokerId: true,
      projectId: true,
      developerId: true,
      leadId: true,
      broker: { select: { id: true, user: { select: { name: true, email: true } } } },
      project: { select: { id: true, name: true } },
      lead: { select: { id: true, leadCode: true, name: true } },
    },
  },
  claimant: { select: { id: true, name: true, email: true } },
} as const

function shapeDispute(d: {
  id: string
  dealId: string
  claimantId: string
  reason: string
  evidence: string | null
  status: string
  resolution: string | null
  createdAt: Date
  updatedAt: Date
  deal: {
    id: string
    dealValue: number | null
    status: string
    brokerId: string | null
    broker: { id: string; user: { name: string; email: string } } | null
    project: { id: string; name: string }
    lead: { id: string; leadCode: string | null; name: string }
  }
  claimant: { id: string; name: string; email: string }
}) {
  return {
    id: d.id,
    dealId: d.dealId,
    dealValue: d.deal.dealValue,
    dealStatus: d.deal.status,
    currentBroker: d.deal.broker
      ? { brokerId: d.deal.broker.id, name: d.deal.broker.user.name, email: d.deal.broker.user.email }
      : null,
    project: d.deal.project,
    lead: d.deal.lead,
    claimant: d.claimant,
    reason: d.reason,
    evidence: d.evidence,
    status: d.status,
    resolution: d.resolution,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }
}

// ─── GET — list disputes, OPEN first ───────────────────────
export async function GET() {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const rows = await db.dealDispute.findMany({
      include: DISPUTE_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    const rank = (s: string) => (s === 'OPEN' ? 0 : 1)
    rows.sort(
      (a, b) => rank(a.status) - rank(b.status) || b.createdAt.getTime() - a.createdAt.getTime(),
    )

    return NextResponse.json({ disputes: rows.map(shapeDispute) })
  } catch (err) {
    console.error('CEO list disputes error:', err)
    return NextResponse.json({ error: 'Failed to fetch disputes' }, { status: 500 })
  }
}

// ─── POST — file a dispute (broker self-files, CEO files for a claimant) ──
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const role = (session.user as { role?: string }).role as string
    const actorId = (session.user as { id?: string }).id as string
    if (!['BROKER', 'CEO', 'ADMIN'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Filing freezes the deal's PENDING commissions (DISPUTED) until CEO
    // review — throttle filings so one account cannot spam-freeze the ledger.
    const rl = rateLimit(`dispute-file:${actorId}`, { limit: 10, windowMs: 60 * 60_000 })
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many disputes filed. Please wait a moment and try again.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))),
          },
        }
      )
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }

    const dealId = typeof body.dealId === 'string' ? body.dealId.trim() : ''
    if (!dealId) return NextResponse.json({ error: 'dealId required' }, { status: 400 })

    // Broker-filed: own id from the session, client claimantId ignored.
    // CEO-filed: claimantId must be supplied explicitly.
    let claimantId: string
    if (role === 'BROKER') {
      claimantId = actorId
    } else {
      claimantId = typeof body.claimantId === 'string' ? body.claimantId.trim() : ''
      if (!claimantId) return NextResponse.json({ error: 'claimantId required' }, { status: 400 })
    }

    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    if (!reason) return NextResponse.json({ error: 'reason required' }, { status: 400 })
    if (reason.length > 2000) return NextResponse.json({ error: 'Reason too long' }, { status: 400 })
    const evidence = typeof body.evidence === 'string' && body.evidence.trim() ? body.evidence.trim() : null
    if (evidence && evidence.length > 4000) {
      return NextResponse.json({ error: 'Evidence too long' }, { status: 400 })
    }

    const [deal, claimant] = await Promise.all([
      db.deal.findUnique({ where: { id: dealId }, select: { id: true } }),
      db.user.findUnique({ where: { id: claimantId }, select: { id: true, name: true } }),
    ])
    if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })
    if (!claimant) return NextResponse.json({ error: 'Claimant not found' }, { status: 404 })
    // Only a real broker profile can hold attribution — reject junk early
    // (resolution would refuse it anyway).
    const claimantProfile = await db.brokerProfile.findUnique({
      where: { userId: claimantId },
      select: { id: true },
    })
    if (!claimantProfile) {
      return NextResponse.json({ error: 'Claimant is not a broker' }, { status: 400 })
    }

    const dup = await db.dealDispute.findFirst({
      where: { dealId, claimantId, status: 'OPEN' },
      select: { id: true },
    })
    if (dup) {
      return NextResponse.json({ error: 'An open dispute already exists for this deal and claimant' }, { status: 409 })
    }

    const dispute = await db.dealDispute.create({
      data: { dealId, claimantId, reason, evidence },
      include: DISPUTE_INCLUDE,
    })

    // Freeze the money trail while contested: PENDING commissions go DISPUTED
    // so they surface in growth-stats openDisputes and syncDealCommission
    // cannot silently recompute them mid-dispute. Restored on resolution.
    await db.commission.updateMany({
      where: { dealId, status: 'PENDING' },
      data: { status: 'DISPUTED' },
    })

    await logAudit({
      userId: actorId,
      action: 'DISPUTE_OPENED',
      entity: 'DealDispute',
      entityId: dispute.id,
      changes: { dealId, claimantId, filedByRole: role },
    })

    await notifyRole(['CEO', 'ADMIN'], {
      type: 'DISPUTE_OPENED',
      title: 'New deal dispute filed',
      message: `${claimant.name || 'A broker'} disputes attribution on deal ${dealId.slice(0, 8)}.`,
      link: '/ceo/deals',
      metadata: { disputeId: dispute.id, dealId },
    })

    return NextResponse.json({ dispute: shapeDispute(dispute) }, { status: 201 })
  } catch (err) {
    console.error('File dispute error:', err)
    return NextResponse.json({ error: 'Failed to file dispute' }, { status: 500 })
  }
}

// ─── PATCH — CEO resolves a dispute ────────────────────────
export async function PATCH(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error
    const actorId = (session!.user as { id?: string })?.id as string

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }
    const id = typeof body.id === 'string' ? body.id.trim() : ''
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const decision = body.decision === undefined || body.decision === null ? '' : String(body.decision)
    if (decision !== 'APPROVED' && decision !== 'REJECTED') {
      return NextResponse.json({ error: 'decision must be APPROVED or REJECTED' }, { status: 400 })
    }
    const resolution = typeof body.resolution === 'string' && body.resolution.trim() ? body.resolution.trim() : null
    if (resolution && resolution.length > 2000) {
      return NextResponse.json({ error: 'Resolution too long' }, { status: 400 })
    }

    const dispute = await db.dealDispute.findUnique({
      where: { id },
      include: {
        deal: { select: { id: true, brokerId: true, dealValue: true, projectId: true, developerId: true, leadId: true } },
      },
    })
    if (!dispute) return NextResponse.json({ error: 'Dispute not found' }, { status: 404 })
    if (dispute.status !== 'OPEN') {
      return NextResponse.json({ error: `Dispute already ${dispute.status.toLowerCase()}` }, { status: 409 })
    }

    if (decision === 'REJECTED') {
      // Restore the frozen money trail — the original attribution stands.
      await db.commission.updateMany({
        where: { dealId: dispute.dealId, status: 'DISPUTED' },
        data: { status: 'PENDING' },
      })
      const rejected = await db.dealDispute.update({
        where: { id },
        data: { status: 'REJECTED', resolution },
        include: DISPUTE_INCLUDE,
      })
      await logAudit({
        userId: actorId,
        action: 'DISPUTE_RESOLVED',
        entity: 'DealDispute',
        entityId: id,
        changes: { dealId: dispute.dealId, decision: 'REJECTED', resolution },
      })
      await notifyUser(dispute.claimantId, {
        type: 'DISPUTE_REJECTED',
        title: 'Dispute rejected',
        message: `Your dispute on deal ${dispute.dealId.slice(0, 8)} was rejected.${resolution ? ` Reason: ${resolution}` : ''}`,
        link: '/dashboard/deals',
        metadata: { disputeId: id, dealId: dispute.dealId },
      })
      return NextResponse.json({ dispute: shapeDispute(rejected) })
    }

    // APPROVED — reattribute the deal to the claimant's broker profile.
    const claimantProfile = await db.brokerProfile.findUnique({
      where: { userId: dispute.claimantId },
      select: { id: true, user: { select: { name: true } } },
    })
    if (!claimantProfile) {
      return NextResponse.json({ error: 'Claimant is not a broker — cannot reattribute deal' }, { status: 400 })
    }

    const previousBrokerId = dispute.deal.brokerId
    const deal = await db.deal.update({
      where: { id: dispute.dealId },
      data: { brokerId: claimantProfile.id },
      select: { id: true, brokerId: true, dealValue: true, projectId: true, developerId: true },
    })

    // Unfreeze then re-sync the commission so amounts reflect the (possibly
    // new) rule resolution. syncDealCommission only recomputes PENDING rows —
    // commissions already APPROVED/PAID are left untouched by design.
    await db.commission.updateMany({
      where: { dealId: dispute.dealId, status: 'DISPUTED' },
      data: { status: 'PENDING' },
    })
    let commission: { id: string } | null = null
    if (deal.dealValue && Number.isFinite(deal.dealValue) && deal.dealValue > 0) {
      commission = await syncDealCommission({
        dealId: deal.id,
        dealValue: deal.dealValue,
        projectId: deal.projectId,
        developerId: deal.developerId,
      })
    }

    const approved = await db.dealDispute.update({
      where: { id },
      data: { status: 'APPROVED', resolution },
      include: DISPUTE_INCLUDE,
    })

    await db.leadActivity
      .create({
        data: {
          leadId: dispute.deal.leadId,
          type: 'DISPUTE_RESOLVED',
          content: `Deal attribution moved to ${claimantProfile.user.name || dispute.claimantId} (dispute approved)${resolution ? ` — ${resolution}` : ''}`,
        },
      })
      .catch((e) => console.error('[disputes] lead activity failed:', e))

    await logAudit({
      userId: actorId,
      action: 'DISPUTE_RESOLVED',
      entity: 'DealDispute',
      entityId: id,
      changes: {
        dealId: dispute.dealId,
        decision: 'APPROVED',
        previousBrokerId,
        newBrokerId: claimantProfile.id,
        commissionId: commission?.id ?? null,
        resolution,
      },
    })

    const claimantName = claimantProfile.user.name || 'The claimant'
    await notifyUser(dispute.claimantId, {
      type: 'DISPUTE_APPROVED',
      title: 'Dispute approved — deal attributed to you',
      message: `Deal ${dispute.dealId.slice(0, 8)} is now on your record.${resolution ? ` Note: ${resolution}` : ''}`,
      link: '/dashboard/deals',
      metadata: { disputeId: id, dealId: dispute.dealId },
    })
    await notifyUser(await brokerUserId(previousBrokerId), {
      type: 'DISPUTE_APPROVED',
      title: 'Deal reattributed after dispute',
      message: `Deal ${dispute.dealId.slice(0, 8)} was reattributed to ${claimantName} following an approved dispute.`,
      link: '/dashboard/deals',
      metadata: { disputeId: id, dealId: dispute.dealId },
    })

    return NextResponse.json({ dispute: shapeDispute(approved), deal, commission })
  } catch (err) {
    console.error('CEO resolve dispute error:', err)
    return NextResponse.json({ error: 'Failed to resolve dispute' }, { status: 500 })
  }
}
