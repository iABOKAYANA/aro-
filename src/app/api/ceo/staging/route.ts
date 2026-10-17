import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi, logAudit } from '@/lib/permissions'
import { parseJsonSafe } from '@/lib/utils'
import { sanitizeExtracted, type WhatsAppExtracted } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'

const VALID_STATUSES = ['NEW', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'MERGED']
const VALID_DECISIONS = ['APPROVED', 'REJECTED', 'MERGE']

/**
 * GET /api/ceo/staging?status?&group? — WhatsApp staging review queue.
 * `status` filters NEW|IN_REVIEW|APPROVED|REJECTED|MERGED; `group` matches
 * groupJid or groupName (contains). → 200 { items, counts } where counts is
 * the per-status tally (respecting the group filter).
 */
export async function GET(req: Request) {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const group = searchParams.get('group')

    if (status !== null && status !== '' && !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }

    const groupWhere =
      group && group.trim()
        ? { OR: [{ groupJid: { contains: group.trim() } }, { groupName: { contains: group.trim() } }] }
        : undefined

    const where: Record<string, unknown> = { ...(groupWhere ? groupWhere : {}) }
    if (status) where.status = status

    const [items, grouped] = await Promise.all([
      db.stagingItem.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500 }),
      db.stagingItem.groupBy({
        by: ['status'],
        where: groupWhere ?? {},
        _count: { status: true },
      }),
    ])

    const counts: Record<string, number> = {}
    for (const s of VALID_STATUSES) counts[s] = 0
    for (const g of grouped) counts[g.status] = g._count.status

    return NextResponse.json({ items, counts })
  } catch (e) {
    console.error('CEO list staging error:', e)
    return NextResponse.json({ error: 'Failed to list staging items' }, { status: 500 })
  }
}

interface StagingPayload {
  raw?: string
  extracted?: WhatsAppExtracted | null
  extractionEngine?: string
  mediaUrls?: string[]
  suggestedProjectId?: string | null
  matchScore?: number | null
}

function readPayload(item: { payload: string }): StagingPayload {
  return parseJsonSafe<StagingPayload>(item.payload, {})
}

/** Best-effort City/Governorate resolution from a free-text city name. */
async function resolveCity(cityName: string | null): Promise<{ cityId: string; governorateId: string } | null> {
  if (!cityName || !cityName.trim()) return null
  const needle = cityName.trim()
  const city = await db.city.findFirst({
    where: { OR: [{ name: { contains: needle } }, { nameArabic: { contains: needle } }] },
    select: { id: true, governorateId: true },
  })
  if (!city) return null
  return { cityId: city.id, governorateId: city.governorateId }
}

/**
 * Resolve the owning developer for an APPROVED (new) project: explicit
 * `developerId` wins; otherwise senderPhone → User.phone → DeveloperProfile.
 * WhatsApp senders have no account link by default, so without either the
 * CEO must MERGE into an existing project instead. → developerProfileId or null.
 */
async function resolveDeveloper(
  explicitId: unknown,
  senderPhone: string | null
): Promise<string | null> {
  if (typeof explicitId === 'string' && explicitId) {
    const profile = await db.developerProfile.findUnique({
      where: { id: explicitId },
      select: { id: true },
    })
    return profile?.id ?? null
  }
  if (senderPhone && senderPhone.trim()) {
    const digits = senderPhone.replace(/\D/g, '')
    const users = await db.user.findMany({
      where: { role: 'DEVELOPER' },
      select: { id: true, phone: true, developerProfile: { select: { id: true } } },
      take: 500,
    })
    for (const u of users) {
      if (!u.phone) continue
      const uDigits = u.phone.replace(/\D/g, '')
      if (
        uDigits &&
        digits &&
        (uDigits === digits || uDigits.endsWith(digits) || digits.endsWith(uDigits))
      ) {
        if (u.developerProfile) return u.developerProfile.id
      }
    }
  }
  return null
}

/**
 * PATCH /api/ceo/staging ← { id, decision: 'APPROVED'|'REJECTED'|'MERGE',
 *   targetProjectId?, reason?, editedPayload?, developerId? }
 *
 * Only NEW/IN_REVIEW rows can be decided (else 400).
 * - APPROVED: creates a live project with approvalStatus APPROVED (NOT
 *   PUBLISHED — the normal publish step still applies) from extracted fields
 *   (+editedPayload overrides) with media refs (coverImage = first WhatsApp
 *   image, gallery = all of them). Owner = explicit developerId, else the
 *   developer account whose phone matches senderPhone; without either → 400.
 *   Sets item APPROVED + targetProjectId = new project.
 * - MERGE: applies extracted (+editedPayload) scalar fields onto
 *   targetProjectId (required, must exist). Overwrite rule: name/nameArabic/
 *   description/prices overwrite when present; location→address, city and
 *   coverImage only fill EMPTY targets (never clobber); gallery = union of
 *   existing + WhatsApp media. Sets item MERGED. Whitelist = same field set
 *   as the edit-request PROJECT list.
 * - REJECTED: requires reason; sets REJECTED + reviewNote.
 * All decisions write an audit row. No user is notified (WhatsApp source has
 * no account; the actor IS the CEO). → 200 { item, project? }
 */
export async function PATCH(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error
    const actorId = (session!.user as any)?.id as string

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }
    const { id, decision, targetProjectId, reason, editedPayload, developerId } = body as {
      id?: unknown
      decision?: unknown
      targetProjectId?: unknown
      reason?: unknown
      editedPayload?: unknown
      developerId?: unknown
    }

    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }
    if (typeof decision !== 'string' || !VALID_DECISIONS.includes(decision)) {
      return NextResponse.json(
        { error: 'decision must be one of: APPROVED, REJECTED, MERGE' },
        { status: 400 }
      )
    }
    const note = typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 2000) : null

    const item = await db.stagingItem.findUnique({ where: { id } })
    if (!item) {
      return NextResponse.json({ error: 'Staging item not found' }, { status: 404 })
    }
    if (item.status !== 'NEW' && item.status !== 'IN_REVIEW') {
      return NextResponse.json(
        { error: `This item is already ${item.status}` },
        { status: 400 }
      )
    }

    if (decision === 'REJECTED') {
      if (!note) {
        return NextResponse.json({ error: 'reason is required to reject' }, { status: 400 })
      }
      const rejected = await db.stagingItem.update({
        where: { id },
        data: { status: 'REJECTED', reviewNote: note },
      })
      await logAudit({
        userId: actorId,
        action: 'STAGING_REJECTED',
        entity: 'StagingItem',
        entityId: id,
        changes: { reason: note, groupJid: item.groupJid },
      })
      return NextResponse.json({ item: rejected })
    }

    const stored = readPayload(item)
    const override =
      editedPayload && typeof editedPayload === 'object'
        ? (editedPayload as Record<string, unknown>)
        : {}
    const merged = sanitizeExtracted({ ...(stored.extracted ?? {}), ...override })
    const mediaUrls =
      Array.isArray(override.mediaUrls) && (override.mediaUrls as unknown[]).every((u) => typeof u === 'string')
        ? ((override.mediaUrls as string[]).filter(Boolean).slice(0, 30))
        : (stored.mediaUrls ?? [])

    if (decision === 'APPROVED') {
      const name = merged?.name?.trim() || null
      if (!name) {
        return NextResponse.json(
          { error: 'Project name is required (add it via editedPayload)' },
          { status: 400 }
        )
      }
      const ownerId = await resolveDeveloper(developerId, item.senderPhone)
      if (!ownerId) {
        return NextResponse.json(
          { error: 'No developer account matches this sender — pass developerId or MERGE into an existing project' },
          { status: 400 }
        )
      }

      const { randomBytes } = await import('node:crypto')
      const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      const slug = `${slugBase || 'project'}-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`

      const city = await resolveCity(merged?.city ?? null)
      const location = merged?.location?.trim() || null
      const address =
        location ?? (city ? null : merged?.city?.trim() || null)

      const num = (v: number | null | undefined): number | null =>
        typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null
      const years = num(merged?.years) !== null ? Math.round(num(merged?.years) as number) : null

      const project = await db.project.create({
        data: {
          developerId: ownerId,
          name,
          nameArabic: merged?.nameArabic?.trim() || null,
          slug,
          description: merged?.description?.trim() || `Imported from WhatsApp (${item.groupName || item.groupJid || 'unknown group'})`,
          coverImage: mediaUrls[0] ?? null,
          gallery: JSON.stringify(mediaUrls),
          cityId: city?.cityId ?? null,
          governorateId: city?.governorateId ?? null,
          address,
          status: 'COMING_SOON',
          approvalStatus: 'APPROVED',
          isActive: true,
          startPrice: num(merged?.price),
          totalArea: num(merged?.area),
          downPaymentMin: num(merged?.downPayment),
          installmentYears: years,
        },
      })

      // Best-effort amenity links (fail-soft — never breaks the approval).
      try {
        const names = merged?.amenities ?? []
        if (names.length > 0) {
          const amenities = await db.amenity.findMany({ select: { id: true, name: true, nameArabic: true } })
          const lower = (s: string) => s.toLowerCase().trim()
          const matched = new Set<string>()
          for (const n of names) {
            const hit = amenities.find(
              (a) => lower(a.name) === lower(n) || (a.nameArabic && lower(a.nameArabic) === lower(n))
            )
            if (hit) matched.add(hit.id)
          }
          if (matched.size > 0) {
            // matched is a Set — already deduped (skipDuplicates is
            // unsupported on SQLite, so it is intentionally not used).
            await db.projectAmenity.createMany({
              data: [...matched].map((amenityId) => ({ projectId: project.id, amenityId })),
            })
          }
        }
      } catch (e) {
        console.error('[staging] amenity link failed:', e)
      }

      const approved = await db.stagingItem.update({
        where: { id },
        data: { status: 'APPROVED', targetProjectId: project.id, reviewNote: note },
      })

      await logAudit({
        userId: actorId,
        action: 'STAGING_APPROVED',
        entity: 'StagingItem',
        entityId: id,
        changes: { projectId: project.id, developerId: ownerId, name, groupJid: item.groupJid },
      })

      return NextResponse.json({ item: approved, project })
    }

    // MERGE
    if (typeof targetProjectId !== 'string' || !targetProjectId) {
      return NextResponse.json({ error: 'targetProjectId is required to merge' }, { status: 400 })
    }
    const target = await db.project.findUnique({ where: { id: targetProjectId } })
    if (!target) {
      return NextResponse.json({ error: 'Target project not found' }, { status: 404 })
    }

    const num = (v: number | null | undefined): number | null =>
      typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null
    const data: Record<string, unknown> = {}
    // Overwrite fields (present in payload → applied).
    if (merged?.name?.trim()) data.name = merged.name.trim()
    if (merged?.nameArabic?.trim()) data.nameArabic = merged.nameArabic.trim()
    if (merged?.description?.trim()) data.description = merged.description.trim()
    if (num(merged?.price) !== null) data.startPrice = num(merged?.price)
    if (num(merged?.area) !== null) data.totalArea = num(merged?.area)
    if (num(merged?.downPayment) !== null) data.downPaymentMin = num(merged?.downPayment)
    if (num(merged?.years) !== null) data.installmentYears = Math.round(num(merged?.years) as number)
    // Fill-empty-only fields (never clobber curated data).
    const location = merged?.location?.trim() || null
    if (location && !target.address) data.address = location
    if (!target.coverImage && mediaUrls[0]) data.coverImage = mediaUrls[0]
    if (!target.cityId || !target.governorateId) {
      const city = await resolveCity(merged?.city ?? null)
      if (city) {
        if (!target.cityId) data.cityId = city.cityId
        if (!target.governorateId) data.governorateId = city.governorateId
      } else if (merged?.city?.trim() && !target.address && !location) {
        data.address = merged.city.trim()
      }
    }
    if (mediaUrls.length > 0) {
      const existing = parseJsonSafe<string[]>(target.gallery, [])
      const union = [...existing]
      for (const u of mediaUrls) if (!union.includes(u)) union.push(u)
      if (union.length !== existing.length) data.gallery = JSON.stringify(union)
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nothing to merge — payload has no usable fields' }, { status: 400 })
    }

    const project = await db.project.update({ where: { id: targetProjectId }, data: data as never })
    const mergedItem = await db.stagingItem.update({
      where: { id },
      data: { status: 'MERGED', targetProjectId, reviewNote: note },
    })

    await logAudit({
      userId: actorId,
      action: 'STAGING_MERGED',
      entity: 'StagingItem',
      entityId: id,
      changes: { targetProjectId, appliedFields: Object.keys(data) },
    })

    return NextResponse.json({ item: mergedItem, project })
  } catch (e) {
    console.error('CEO decide staging error:', e)
    return NextResponse.json({ error: 'Failed to review staging item' }, { status: 500 })
  }
}
