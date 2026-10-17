import { db } from '@/lib/db'
import { notifyUser } from '@/lib/notify'
import { readBoolSetting } from '@/lib/system-settings'

// ─── PRICE & AVAILABILITY WATCH (Feature 7) ────────────────
// Watches fire notifications ONLY when verified database information
// actually changes. The snapshot field guarantees the same unchanged
// state never notifies twice.
//
// Legal `targetType` values: UNIT | PROJECT | CITY.
//   UNIT    → `targetId` is a Unit id.
//   PROJECT → `targetId` is a Project id.
//   CITY    → `targetId` is a city SLUG (`City.nameSlug`, lower-cased,
//             e.g. `new-cairo`) — never a project id, never a city id.
//             City follows fan out via `notifyCityWatchersForProject()` in
//             `src/lib/price-alerts.ts`, which resolves the slug server-side.

export type WatchTargetType = 'UNIT' | 'PROJECT' | 'CITY'

interface WatchSnapshot {
  price?: number
  status?: string
  citySlug?: string
  lastUnitId?: string
  planSignature?: string
  fields?: string[]
}

function fmtEGP(n: number): string {
  return `${Math.round(n).toLocaleString('en-US')} EGP`
}

async function globalAlertsOn(): Promise<boolean> {
  return readBoolSetting('watchAlertsEnabled', true)
}

async function userAlertsOn(userId: string): Promise<boolean> {
  try {
    const pref = await db.notificationPreference.findUnique({ where: { userId } })
    if (!pref) return true
    return pref.watchAlerts !== false
  } catch {
    return true
  }
}

/** Shared engine: notify watchers only if the built state differs from their snapshot. */
async function notifyWatchers(opts: {
  targetType: WatchTargetType
  targetId: string
  build: (snap: WatchSnapshot) => { changed: boolean; next: WatchSnapshot; type: string; title: string; message: string; link?: string } | null
}): Promise<number> {
  if (!(await globalAlertsOn())) return 0
  let watches: Array<{ id: string; userId: string; snapshot: string; alertsEnabled: boolean }>
  try {
    watches = await db.watch.findMany({
      where: { targetType: opts.targetType, targetId: opts.targetId, alertsEnabled: true },
      select: { id: true, userId: true, snapshot: true, alertsEnabled: true },
    })
  } catch (e) {
    console.error('[watch] lookup failed:', e)
    return 0
  }

  let sent = 0
  for (const w of watches) {
    let snap: WatchSnapshot = {}
    try { snap = JSON.parse(w.snapshot || '{}') } catch { /* fresh */ }
    let result
    try {
      result = opts.build(snap)
    } catch (e) {
      console.error('[watch] build failed:', e)
      continue
    }
    if (!result || !result.changed) continue
    if (!(await userAlertsOn(w.userId))) {
      // keep snapshot current so re-enabling doesn't replay old alerts
      await db.watch.update({ where: { id: w.id }, data: { snapshot: JSON.stringify(result.next), lastNotifiedAt: null } }).catch(() => {})
      continue
    }
    await notifyUser(w.userId, {
      type: result.type,
      title: result.title,
      message: result.message,
      link: result.link || null,
      metadata: { targetType: opts.targetType, targetId: opts.targetId },
    })
    await db.watch
      .update({ where: { id: w.id }, data: { snapshot: JSON.stringify(result.next), lastNotifiedAt: new Date() } })
      .catch(() => {})
    sent++
  }
  return sent
}

// ─── Hooks (called from the existing write APIs) ───────────

export async function onUnitPriceChanged(unitId: string, oldPrice: number, newPrice: number): Promise<number> {
  if (oldPrice === newPrice) return 0
  const unit = await db.unit.findUnique({
    where: { id: unitId },
    select: { name: true, slug: true, project: { select: { slug: true, name: true } } },
  })
  if (!unit) return 0
  const link = unit.slug ? `/units/${unit.slug}` : `/units/${unitId}`
  return notifyWatchers({
    targetType: 'UNIT',
    targetId: unitId,
    build: (snap) => {
      if (snap.price === newPrice) return null
      return {
        changed: true,
        next: { ...snap, price: newPrice },
        type: 'WATCH_PRICE',
        title: 'Price update',
        message: `The price of ${unit.name} (${unit.project?.name || 'property you watch'}) changed from ${fmtEGP(oldPrice)} to ${fmtEGP(newPrice)}.`,
        link,
      }
    },
  })
}

export async function onUnitAvailabilityChanged(unitId: string, oldStatus: string, newStatus: string): Promise<number> {
  if (oldStatus === newStatus) return 0
  const unit = await db.unit.findUnique({
    where: { id: unitId },
    select: { name: true, slug: true, status: true, price: true, project: { select: { slug: true, name: true } } },
  })
  if (!unit) return 0
  const link = unit.slug ? `/units/${unit.slug}` : `/units/${unitId}`
  const nowUnavailable = newStatus !== 'AVAILABLE'
  return notifyWatchers({
    targetType: 'UNIT',
    targetId: unitId,
    build: (snap) => {
      if (snap.status === newStatus) return null
      return {
        changed: true,
        next: { ...snap, status: newStatus, price: unit.price },
        type: 'WATCH_AVAILABILITY',
        title: nowUnavailable ? 'Availability update' : 'Unit available again',
        message: nowUnavailable
          ? `${unit.name} (${unit.project?.name || 'property you watch'}) is now marked ${newStatus.replace(/_/g, ' ').toLowerCase()}.`
          : `${unit.name} (${unit.project?.name || 'property you watch'}) is available again.`,
        link,
      }
    },
  })
}

export async function onProjectUnitAdded(projectId: string, unitId: string, unitName: string, price: number): Promise<number> {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { name: true, slug: true } })
  if (!project) return 0
  return notifyWatchers({
    targetType: 'PROJECT',
    targetId: projectId,
    build: (snap) => {
      if (snap.lastUnitId === unitId) return null
      return {
        changed: true,
        next: { ...snap, lastUnitId: unitId },
        type: 'WATCH_NEW_UNIT',
        title: 'New unit listed',
        message: `A new unit (${unitName}, ${fmtEGP(price)}) was listed in ${project.name}, a project you watch.`,
        link: `/projects/${project.slug}`,
      }
    },
  })
}

export async function onPaymentPlanChanged(projectId: string, planSummary: string): Promise<number> {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { name: true, slug: true } })
  if (!project) return 0
  const signature = planSummary.trim().toLowerCase()
  return notifyWatchers({
    targetType: 'PROJECT',
    targetId: projectId,
    build: (snap) => {
      if (snap.planSignature === signature) return null
      return {
        changed: true,
        next: { ...snap, planSignature: signature },
        type: 'WATCH_PAYMENT_PLAN',
        title: 'Payment plan update',
        message: `The payment plan for ${project.name} changed: ${planSummary}`,
        link: `/projects/${project.slug}`,
      }
    },
  })
}

export async function onProjectInfoChanged(projectId: string, changedFields: string[]): Promise<number> {
  if (!changedFields.length) return 0
  const project = await db.project.findUnique({ where: { id: projectId }, select: { name: true, slug: true, startPrice: true } })
  if (!project) return 0
  const significant = changedFields.filter((f) =>
    ['startPrice', 'endPrice', 'deliveryDate', 'status', 'downPaymentMin', 'installmentYears'].includes(f),
  )
  if (!significant.length) return 0
  const key = significant.slice().sort().join(',')
  return notifyWatchers({
    targetType: 'PROJECT',
    targetId: projectId,
    build: (snap) => {
      if ((snap.fields || []).join(',') === key) return null
      return {
        changed: true,
        next: { ...snap, fields: significant },
        type: 'WATCH_PROJECT_UPDATE',
        title: 'Project update',
        message: `${project.name} was updated (${significant.join(', ')}).`,
        link: `/projects/${project.slug}`,
      }
    },
  })
}

/** Convenience for the watch API: current observable state of a target. */
export async function readTargetSnapshot(
  targetType: WatchTargetType,
  targetId: string,
): Promise<WatchSnapshot | null> {
  if (targetType === 'UNIT') {
    const unit = await db.unit.findUnique({ where: { id: targetId }, select: { price: true, status: true } })
    return unit ? { price: unit.price, status: unit.status } : null
  }
  if (targetType === 'CITY') {
    // City follows carry the city SLUG in `targetId` — resolve it as a slug
    // only, never as a project id.
    const slug = targetId.trim().toLowerCase()
    if (!slug || slug.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null
    const city = await db.city.findFirst({ where: { nameSlug: slug }, select: { id: true } })
    // Unknown-but-well-formed slugs stay followable (fresh areas), so a
    // snapshot is returned even when the City row is not known yet.
    void city
    return { citySlug: slug }
  }
  const project = await db.project.findUnique({ where: { id: targetId }, select: { startPrice: true, status: true } })
  return project ? { price: project.startPrice ?? undefined, status: project.status } : null
}
