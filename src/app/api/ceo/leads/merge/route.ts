import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

// ─── POST /api/ceo/leads/merge ← { keepId, mergeIds[] } ──
// Collapses suspected duplicates into one surviving lead. CEO-only,
// all-or-nothing inside a single transaction.
//
// Child tables pointing at Lead (from prisma/schema.prisma):
//   MOVED → keepId  : Deal (leadId, Cascade), Viewing (leadId, restrictive —
//                       must move or the delete fails), LeadActivity (leadId,
//                       Cascade), LeadOwnershipHistory (leadId, Cascade),
//                       VoiceNote (leadId, Cascade).
//   REPOINTED       : Lead.duplicateOfId (plain scalar, no FK) — any lead
//                     pointing at a merged row is repointed to keepId so the
//                     duplicate chain survives.
//   NOT MOVABLE     : Inquiry has NO lead FK (only userId/unitId), so there
//                     is nothing to move — reported as such.
//   DELETE-vs-CANCEL: merged rows are HARD-DELETED (not cancelled). Delete
//                     keeps history safest because every movable child is
//                     re-homed on keepId first (nothing cascade-lost), and the
//                     merged notes + a LEAD_MERGED activity + a
//                     DUPLICATE_RESOLVED ownership entry + an LEAD_MERGED
//                     audit row are all appended to keepId before the delete.
//                     Cancelling would leave dead rows that the duplicate
//                     matcher already excludes (LOST/CANCELLED/EXPIRED) while
//                     still cluttering the queue. After the FK moves, the
//                     single-delete guard (blocks when deals exist) is
//                     vacuously satisfied since the merged rows own no deals.
export async function POST(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error
    const actorId = (session!.user as any)?.id as string

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const keepId = typeof body?.keepId === 'string' ? body.keepId.trim() : ''
    const rawIds = Array.isArray(body?.mergeIds) ? (body.mergeIds as unknown[]) : []
    const mergeIds = [
      ...new Set(
        rawIds
          .filter((v): v is string => typeof v === 'string' && !!v.trim())
          .map((s) => s.trim())
      ),
    ].filter((id) => id !== keepId)

    if (!keepId) return NextResponse.json({ error: 'keepId is required' }, { status: 400 })
    if (mergeIds.length === 0) {
      return NextResponse.json({ error: 'mergeIds must be a non-empty array (excluding keepId)' }, { status: 400 })
    }
    if (mergeIds.length > 50) {
      return NextResponse.json({ error: 'Cannot merge more than 50 leads at once' }, { status: 400 })
    }

    const keep = await db.lead.findUnique({ where: { id: keepId } })
    if (!keep) return NextResponse.json({ error: 'Keep lead not found' }, { status: 404 })
    const doomed = await db.lead.findMany({ where: { id: { in: mergeIds } } })
    if (doomed.length !== mergeIds.length) {
      const found = new Set(doomed.map((l) => l.id))
      const missing = mergeIds.filter((id) => !found.has(id))
      return NextResponse.json({ error: `Lead(s) not found: ${missing.join(', ')}` }, { status: 404 })
    }

    const now = new Date()
    const mergedCodes = doomed.map((l) => l.leadCode || l.id.slice(0, 8))

    const moved = await db.$transaction(async (tx) => {
      const [deals, viewings, activities, ownership, voiceNotes] = await Promise.all([
        tx.deal.updateMany({ where: { leadId: { in: mergeIds } }, data: { leadId: keepId } }),
        tx.viewing.updateMany({ where: { leadId: { in: mergeIds } }, data: { leadId: keepId } }),
        tx.leadActivity.updateMany({ where: { leadId: { in: mergeIds } }, data: { leadId: keepId } }),
        tx.leadOwnershipHistory.updateMany({ where: { leadId: { in: mergeIds } }, data: { leadId: keepId } }),
        tx.voiceNote.updateMany({ where: { leadId: { in: mergeIds } }, data: { leadId: keepId } }),
      ])
      const repointed = await tx.lead.updateMany({
        where: { duplicateOfId: { in: mergeIds } },
        data: { duplicateOfId: keepId },
      })

      const absorbed = doomed.map(
        (l) => `[Merged ${l.leadCode || l.id.slice(0, 8)} — ${l.name} <${l.email || 'no email'} / ${l.phone}>]: ${l.notes || '(no notes)'}`
      )
      const notes = [keep.notes, ...absorbed].filter(Boolean).join('\n\n')

      await tx.lead.update({
        where: { id: keepId },
        data: {
          notes,
          reviewStatus: 'ACTIVE',
          duplicateOfId: null,
          resolvedById: actorId,
          resolvedAt: now,
          resolutionNote: `Merged ${mergeIds.length} duplicate(s): ${mergedCodes.join(', ')}`,
          updatedBy: actorId,
          lastActivityAt: now,
        },
      })
      await tx.leadActivity.create({
        data: {
          leadId: keepId,
          type: 'LEAD_MERGED',
          content: `Merged ${mergeIds.length} duplicate lead(s) (${mergedCodes.join(', ')}) — deals, viewings, activities, ownership history and voice notes moved here`,
        },
      })
      await tx.leadOwnershipHistory.create({
        data: {
          leadId: keepId,
          action: 'DUPLICATE_RESOLVED',
          fromBrokerId: null,
          toBrokerId: keep.brokerId,
          changedById: actorId,
          reason: `Merged duplicates: ${mergedCodes.join(', ')}`,
          previousExpiresAt: keep.protectionExpiresAt,
          newExpiresAt: keep.protectionExpiresAt,
        },
      })
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'LEAD_MERGED',
          entity: 'Lead',
          entityId: keepId,
          changes: JSON.stringify({ keepId, mergedIds: mergeIds, mergedCodes }),
        },
      })

      await tx.lead.deleteMany({ where: { id: { in: mergeIds } } })

      return {
        deals: deals.count,
        viewings: viewings.count,
        activities: activities.count,
        ownershipHistory: ownership.count,
        voiceNotes: voiceNotes.count,
        repointedDuplicates: repointed.count,
      }
    })

    return NextResponse.json({ keepId, merged: mergeIds, moved })
  } catch (err) {
    console.error('CEO merge leads error:', err)
    return NextResponse.json({ error: 'Failed to merge leads' }, { status: 500 })
  }
}
