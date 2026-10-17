import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi, logAudit } from '@/lib/permissions'
import { applyStatusTransition } from '@/lib/lead-lifecycle'
import { transferLeadOwnership } from '@/lib/lead-ceo-transfer'

export const dynamic = 'force-dynamic'

// ─── POST /api/ceo/leads/bulk ────────────────────────────
// Body: { ids[], action: 'assign'|'status'|'delete', brokerId?, status?,
//         reason? } → { updated: n, failed: [{ id, error }] }.
// Per-row try/catch: one bad row never aborts the batch.
//   assign → transferLeadOwnership() (src/lib/lead-ceo-transfer.ts), the same
//            steps as the single TRANSFER in POST /api/ceo/leads/actions.
//   status → applyStatusTransition() (src/lib/lead-lifecycle.ts), the same
//            machine as single PATCH /api/ceo/leads — an illegal transition
//            is a per-row failure, never a 400.
//   delete → same safeguard as single DELETE /api/ceo/leads: a lead with
//            linked deals is a per-row failure
//            ('This lead has linked deals and cannot be deleted.'), otherwise
//            hard delete + LEAD_DELETED audit.
export async function POST(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error
    const actorId = (session!.user as any)?.id as string

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const rawIds = Array.isArray(body?.ids) ? (body.ids as unknown[]) : []
    const ids = [
      ...new Set(
        rawIds.filter((v): v is string => typeof v === 'string' && !!v.trim()).map((s) => s.trim())
      ),
    ]
    const action = typeof body?.action === 'string' ? body.action : ''
    const reason = typeof body?.reason === 'string' ? (body.reason as string) : null

    if (ids.length === 0) return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 })
    if (ids.length > 200) return NextResponse.json({ error: 'Cannot process more than 200 leads at once' }, { status: 400 })
    if (action !== 'assign' && action !== 'status' && action !== 'delete') {
      return NextResponse.json({ error: "Unknown action (expected 'assign' | 'status' | 'delete')" }, { status: 400 })
    }

    let brokerId: string | null = null
    if (action === 'assign') {
      brokerId = typeof body?.brokerId === 'string' ? (body.brokerId as string).trim() : ''
      if (!brokerId) return NextResponse.json({ error: 'brokerId is required for assign' }, { status: 400 })
      const broker = await db.brokerProfile.findUnique({ where: { id: brokerId }, select: { id: true } })
      if (!broker) return NextResponse.json({ error: 'Broker not found' }, { status: 404 })
    }

    let status: string | null = null
    if (action === 'status') {
      status = typeof body?.status === 'string' ? (body.status as string) : ''
      if (!status) return NextResponse.json({ error: 'status is required for status action' }, { status: 400 })
      // NOTE: an unknown/illegal status value is intentionally NOT a 400 —
      // applyStatusTransition rejects it per row below.
    }

    let updated = 0
    const failed: Array<{ id: string; error: string }> = []

    for (const id of ids) {
      try {
        if (action === 'assign') {
          await transferLeadOwnership({ leadId: id, toBrokerId: brokerId!, actorId, reason })
          updated += 1
        } else if (action === 'status') {
          const result = await applyStatusTransition({
            leadId: id,
            to: status!,
            actorId,
            actorRole: 'CEO',
            notes: reason,
          })
          if (!result.ok) throw new Error(result.error || 'Invalid transition')
          updated += 1
        } else {
          const lead = await db.lead.findUnique({ where: { id }, select: { id: true } })
          if (!lead) throw new Error('Lead not found')
          const dealCount = await db.deal.count({ where: { leadId: id } })
          if (dealCount > 0) {
            throw new Error('This lead has linked deals and cannot be deleted.')
          }
          await db.lead.delete({ where: { id } })
          await logAudit({ userId: actorId, action: 'LEAD_DELETED', entity: 'Lead', entityId: id })
          updated += 1
        }
      } catch (e) {
        failed.push({ id, error: e instanceof Error ? e.message : 'Failed' })
      }
    }

    return NextResponse.json({ updated, failed })
  } catch (err) {
    console.error('CEO bulk leads error:', err)
    return NextResponse.json({ error: 'Bulk action failed' }, { status: 500 })
  }
}
