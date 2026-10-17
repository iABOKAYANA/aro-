import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/permissions'
import { readTargetSnapshot, type WatchTargetType } from '@/lib/watch'
import { isPublicProject } from '@/lib/project-visibility'
import { parseJsonSafe } from '@/lib/utils'

export const dynamic = 'force-dynamic'

// ─── WATCHLIST (Feature 7) — users watch units/projects ─────

async function requireSelf() {
  const session = await auth()
  const user = session?.user as { id?: string; role?: string } | undefined
  if (!user?.id) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), userId: null }
  return { error: null, userId: user.id, role: (user.role as string) || 'BUYER' }
}

const VALID_TYPES: WatchTargetType[] = ['UNIT', 'PROJECT']
/** City follows ride the same Watch table — the city slug travels in `targetId`. */
const CITY_TYPE = 'CITY' as const
type AnyWatchTarget = WatchTargetType | typeof CITY_TYPE

/** Slugs the clients send (`new-cairo`, `sheikh-zayed`, …). Server-normalised. */
function normalizeCitySlug(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const slug = raw.trim().toLowerCase()
  if (!slug || slug.length > 80) return null
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null
  return slug
}

async function targetExists(targetType: AnyWatchTarget, targetId: string): Promise<{ ok: boolean; name?: string; projectId?: string }> {
  if (targetType === CITY_TYPE) {
    const slug = normalizeCitySlug(targetId)
    if (!slug) return { ok: false }
    // Server authority: the slug must belong to a real City row when the
    // table knows it. Unknown-but-well-formed slugs are still accepted so
    // freshly-added areas and fallback cards stay followable — the fan-out
    // only ever notifies for projects whose stored city resolves server-side.
    const city = await db.city.findFirst({ where: { nameSlug: slug }, select: { id: true, name: true } })
    if (city) return { ok: true, name: city.name }
    return { ok: true, name: slug.replace(/-/g, ' ') }
  }
  if (targetType === 'UNIT') {
    const unit = await db.unit.findUnique({ where: { id: targetId }, select: { id: true, name: true, projectId: true } })
    return unit ? { ok: true, name: unit.name, projectId: unit.projectId } : { ok: false }
  }
  const project = await db.project.findUnique({ where: { id: targetId }, select: { id: true, name: true, approvalStatus: true, isActive: true, startPrice: true, units: { where: { price: { gt: 0 } }, take: 1, select: { id: true, price: true } } } })
  if (!project) return { ok: false }
  const visible = isPublicProject(project)
  return visible ? { ok: true, name: project.name } : { ok: false }
}

export async function GET() {
  try {
    const { error, userId } = await requireSelf()
    if (error) return error

    const watches = await db.watch.findMany({ where: { userId: userId! }, orderBy: { createdAt: 'desc' } })

    const out: Array<Record<string, unknown>> = []
    for (const w of watches) {
      const exists = await targetExists(w.targetType as WatchTargetType, w.targetId)
      let displayName = 'Removed item'
      let link: string | null = null
      let currentPrice: number | null = null
      if (exists.ok && w.targetType === 'UNIT') {
        const unit = await db.unit.findUnique({
          where: { id: w.targetId },
          select: { name: true, price: true, status: true, project: { select: { slug: true, name: true } } },
        })
        if (unit) {
          displayName = `${unit.name} — ${unit.project?.name || ''}`.trim()
          link = unit.project?.slug ? `/projects/${unit.project.slug}` : null
          currentPrice = typeof unit.price === 'number' ? unit.price : null
        }
      } else if (exists.ok && w.targetType === 'PROJECT') {
        const project = await db.project.findUnique({ where: { id: w.targetId }, select: { name: true, startPrice: true, status: true, slug: true } })
        if (project) {
          displayName = project.name
          link = `/projects/${project.slug}`
          currentPrice = typeof project.startPrice === 'number' ? project.startPrice : null
        }
      }
      out.push({
        id: w.id,
        targetType: w.targetType,
        targetId: w.targetId,
        name: displayName,
        link,
        exists: exists.ok,
        // Live price next to the watch-time `snapshot.price` so clients can
        // surface a "price dropped" indicator without extra round-trips.
        currentPrice,
        alertsEnabled: w.alertsEnabled,
        lastNotifiedAt: w.lastNotifiedAt ? new Date(w.lastNotifiedAt).toISOString() : null,
        snapshot: parseJsonSafe<Record<string, unknown>>(w.snapshot, {}),
        createdAt: new Date(w.createdAt).toISOString(),
      })
    }
    return NextResponse.json({ watches: out })
  } catch (e) {
    console.error('Watch list error:', e)
    return NextResponse.json({ error: 'Failed to load watchlist' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { error, userId } = await requireSelf()
    if (error) return error

    const body = await req.json()
    const targetType = String(body.targetType || '').toUpperCase() as AnyWatchTarget
    const targetId = String(body.targetId || '')
    const isCity = targetType === CITY_TYPE
    if ((!isCity && !VALID_TYPES.includes(targetType as WatchTargetType)) || !targetId) {
      return NextResponse.json({ error: 'targetType (UNIT|PROJECT|CITY) and targetId are required' }, { status: 400 })
    }

    // City follows carry the city SLUG in `targetId` (never trust it blindly).
    const watchTargetId = isCity ? (normalizeCitySlug(targetId) ?? '') : targetId
    if (!watchTargetId) {
      return NextResponse.json({ error: 'Invalid city — pick an area from the list' }, { status: 400 })
    }

    const exists = await targetExists(targetType, watchTargetId)
    if (!exists.ok) return NextResponse.json({ error: 'Target not found or not visible' }, { status: 404 })

    const snapshot = isCity
      ? { citySlug: watchTargetId, followedAt: new Date().toISOString() }
      : await readTargetSnapshot(targetType as WatchTargetType, watchTargetId)
    const watch = await db.watch.upsert({
      where: { userId_targetType_targetId: { userId: userId!, targetType, targetId: watchTargetId } },
      update: { alertsEnabled: true },
      create: { userId: userId!, targetType, targetId: watchTargetId, snapshot: JSON.stringify(snapshot || {}) },
    })
    await logAudit({ userId: userId!, action: 'WATCH_ADDED', entity: targetType, entityId: watchTargetId, changes: { watchId: watch.id } })
    return NextResponse.json({ watch: { id: watch.id, targetType, targetId: watchTargetId, alertsEnabled: watch.alertsEnabled } }, { status: 201 })
  } catch (e) {
    console.error('Watch create error:', e)
    return NextResponse.json({ error: 'Failed to add to watchlist' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { error, userId } = await requireSelf()
    if (error) return error

    const body = await req.json()
    const { id, alertsEnabled } = body
    if (!id || typeof alertsEnabled !== 'boolean') {
      return NextResponse.json({ error: 'id and boolean alertsEnabled are required' }, { status: 400 })
    }
    const existing = await db.watch.findUnique({ where: { id } })
    if (!existing || existing.userId !== userId) {
      return NextResponse.json({ error: 'Watch not found' }, { status: 404 })
    }
    const watch = await db.watch.update({ where: { id }, data: { alertsEnabled } })
    return NextResponse.json({ watch: { id: watch.id, alertsEnabled: watch.alertsEnabled } })
  } catch (e) {
    console.error('Watch update error:', e)
    return NextResponse.json({ error: 'Failed to update watch' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { error, userId } = await requireSelf()
    if (error) return error

    const body = await req.json().catch(() => ({}))
    const { searchParams } = new URL(req.url)
    const id = body.id || searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const existing = await db.watch.findUnique({ where: { id } })
    if (!existing || existing.userId !== userId) {
      return NextResponse.json({ error: 'Watch not found' }, { status: 404 })
    }
    await db.watch.delete({ where: { id } })
    await logAudit({ userId: userId!, action: 'WATCH_REMOVED', entity: existing.targetType, entityId: existing.targetId, changes: { watchId: id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Watch delete error:', e)
    return NextResponse.json({ error: 'Failed to remove watch' }, { status: 500 })
  }
}
