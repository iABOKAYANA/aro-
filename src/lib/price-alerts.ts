import { db } from '@/lib/db'
import { notifyUser } from '@/lib/notify'
import { readBoolSetting } from '@/lib/system-settings'
import { isPublicProject } from '@/lib/project-visibility'

// ─── PRICE-DROP ALERTS (watched homes) ─────────────────────
// One dedicated notification per watcher when a watched unit's price — or a
// watched project's startPrice — actually DECREASES. Rises and no-ops never
// notify here; generic change alerts stay in `src/lib/watch.ts`.
//
// Delivery reuses the existing pipeline: `notifyUser()` writes the
// Notification row (the website bell and the mobile notifications screen both
// read `GET /api/notifications`) and sends best-effort Expo push to the
// stored `PushSubscription` tokens (`src/lib/push.ts`, gated by the
// `watchAlerts` preference like every other `WATCH_*` type). Notification
// `link` values stay in website URL space (`/projects/{slug}`) so the mobile
// `resolveLink()` mapper and the website router both land correctly.

export type PriceDropTargetType = 'UNIT' | 'PROJECT'

/** Notification `type` for price drops — starts with `WATCH_` so push gating treats it as a watch alert. */
export const PRICE_DROP_TYPE = 'WATCH_PRICE_DROP'

/** Notification `type` for city follows — `WATCH_` prefixed so push gating treats it as a watch alert. */
export const CITY_NEW_PROJECT_TYPE = 'WATCH_CITY_NEW_PROJECT'

/** The same slug space the clients follow (`City.nameSlug`, lower-cased). */
export function normalizeCitySlug(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const slug = raw.trim().toLowerCase()
  if (!slug || slug.length > 80) return null
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null
  return slug
}

function derivedCitySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Server-resolved city slug for a project — the ONLY slug the fan-out trusts. */
export async function citySlugForProject(projectId: string): Promise<string | null> {
  try {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { city: { select: { name: true, nameSlug: true } } },
    })
    const city = project?.city
    if (!city?.name) return null
    const slug = normalizeCitySlug(city.nameSlug) ?? derivedCitySlug(city.name)
    return slug || null
  } catch {
    return null
  }
}

/** True when this user still has an UNREAD new-project alert for the same city + project — the dedupe gate. */
async function hasUnreadCityAlert(userId: string, citySlug: string, projectId: string): Promise<boolean> {
  try {
    const rows = await db.notification.findMany({
      where: { userId, type: CITY_NEW_PROJECT_TYPE, isRead: false },
      select: { metadata: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    return rows.some((r) => {
      try {
        const meta = JSON.parse(r.metadata || '{}') as { citySlug?: unknown; projectId?: unknown }
        return meta.citySlug === citySlug && meta.projectId === projectId
      } catch {
        return false
      }
    })
  } catch {
    return false
  }
}

/**
 * Fan-out after a project becomes VISIBLE in a followed city. Called from the
 * project-creation / publish paths only (fail-soft there) — never throws.
 * Returns the number of watchers notified.
 *
 * Dedupe (mirrors the price-drop gate): one pending (unread) alert per
 * city + project is enough, and a watch whose snapshot already records this
 * project never fires twice (creation + publish must not double-notify).
 */
export async function notifyCityWatchersForProject(projectId: string): Promise<number> {
  try {
    if (!(await readBoolSetting('watchAlertsEnabled', true).catch(() => true))) return 0

    const project = await db.project
      .findUnique({
        where: { id: projectId },
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
          approvalStatus: true,
          startPrice: true,
          units: { where: { price: { gt: 0 } }, take: 1, select: { id: true, price: true } },
          city: { select: { name: true, nameArabic: true, nameSlug: true } },
        },
      })
      .catch(() => null)
    if (!project) return 0
    // Only visible, priced projects notify — drafts, hidden and priceless rows stay silent.
    if (!isPublicProject(project)) return 0
    const cityName = project.city?.name
    if (!cityName) return 0
    const citySlug =
      normalizeCitySlug(project.city?.nameSlug) ?? derivedCitySlug(cityName)
    if (!citySlug) return 0

    let watches: Array<{ id: string; userId: string; snapshot: string }>
    try {
      watches = await db.watch.findMany({
        where: { targetType: 'CITY', targetId: citySlug, alertsEnabled: true },
        select: { id: true, userId: true, snapshot: true },
      })
    } catch (e) {
      console.error('[city-alerts] lookup failed:', e)
      return 0
    }
    if (!watches.length) return 0

    const cityLabel = project.city?.nameArabic || cityName
    const link = `/projects/${project.slug}`
    const message = `مشروع جديد نزل في ${cityLabel} — «${project.name}». افتحه وشوف التفاصيل.`
    let sent = 0
    for (const w of watches) {
      let snap: Record<string, unknown> = {}
      try {
        snap = JSON.parse(w.snapshot || '{}') as Record<string, unknown>
      } catch {
        snap = {}
      }
      // Already told about this project (creation + publish both fan out).
      if (snap.lastProjectId === projectId) continue
      if (!(await userWatchAlertsOn(w.userId))) {
        // Stay silent but record the project so re-enabling the preference
        // doesn't replay this old launch.
        try {
          await db.watch.update({
            where: { id: w.id },
            data: { snapshot: JSON.stringify({ ...snap, lastProjectId: projectId }), lastNotifiedAt: null },
          })
        } catch { /* snapshot advance is best-effort */ }
        continue
      }
      // Dedupe: one pending (unread) alert per city + project is enough.
      if (await hasUnreadCityAlert(w.userId, citySlug, projectId)) {
        try {
          await db.watch.update({
            where: { id: w.id },
            data: { snapshot: JSON.stringify({ ...snap, lastProjectId: projectId }) },
          })
        } catch { /* snapshot advance is best-effort */ }
        continue
      }

      await notifyUser(w.userId, {
        type: CITY_NEW_PROJECT_TYPE,
        title: 'مشروع جديد في المدينة اللي بتتابعها!',
        message,
        link,
        metadata: { targetType: 'CITY', targetId: citySlug, citySlug, projectId },
      })
      try {
        await db.watch.update({
          where: { id: w.id },
          data: { snapshot: JSON.stringify({ ...snap, lastProjectId: projectId }), lastNotifiedAt: new Date() },
        })
      } catch { /* snapshot advance is best-effort */ }
      sent++
    }
    return sent
  } catch (e) {
    console.error('[city-alerts] fan-out failed:', e)
    return 0
  }
}

function fmtEGP(n: number): string {
  return `${Math.round(n).toLocaleString('en-US')} EGP`
}

async function userWatchAlertsOn(userId: string): Promise<boolean> {
  try {
    const pref = await db.notificationPreference.findUnique({ where: { userId } })
    if (!pref) return true
    return pref.watchAlerts !== false
  } catch {
    return true
  }
}

/** True when this user still has an UNREAD drop alert for the same target — the dedupe gate. */
async function hasUnreadDropAlert(userId: string, targetType: PriceDropTargetType, targetId: string): Promise<boolean> {
  try {
    const rows = await db.notification.findMany({
      where: { userId, type: PRICE_DROP_TYPE, isRead: false },
      select: { metadata: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    return rows.some((r) => {
      try {
        const meta = JSON.parse(r.metadata || '{}') as { targetType?: unknown; targetId?: unknown }
        return meta.targetType === targetType && meta.targetId === targetId
      } catch {
        return false
      }
    })
  } catch {
    return false
  }
}

async function resolveTarget(targetType: PriceDropTargetType, targetId: string): Promise<{ label: string; link: string } | null> {
  if (targetType === 'UNIT') {
    const unit = await db.unit.findUnique({
      where: { id: targetId },
      select: { name: true, slug: true, project: { select: { slug: true, name: true } } },
    })
    if (!unit) return null
    return {
      label: `«${unit.name}» (${unit.project?.name || 'الوحدة اللي بتتابعها'})`,
      link: unit.slug ? `/units/${unit.slug}` : `/units/${targetId}`,
    }
  }
  const project = await db.project.findUnique({ where: { id: targetId }, select: { name: true, slug: true } })
  if (!project) return null
  return { label: `«${project.name}»`, link: `/projects/${project.slug}` }
}

/**
 * Fan-out after a successful price DECREASE. Called from the price-mutation
 * routes only (fail-soft there) — never invents auth, never throws.
 * Returns the number of watchers notified.
 */
export async function notifyPriceDrop(opts: {
  targetType: PriceDropTargetType
  targetId: string
  oldPrice: number
  newPrice: number
}): Promise<number> {
  const { targetType, targetId, oldPrice, newPrice } = opts
  if (!Number.isFinite(oldPrice) || !Number.isFinite(newPrice) || !(newPrice < oldPrice)) return 0
  if (!(await readBoolSetting('watchAlertsEnabled', true).catch(() => true))) return 0

  const target = await resolveTarget(targetType, targetId).catch(() => null)
  if (!target) return 0

  let watches: Array<{ id: string; userId: string; snapshot: string }>
  try {
    watches = await db.watch.findMany({
      where: { targetType, targetId, alertsEnabled: true },
      select: { id: true, userId: true, snapshot: true },
    })
  } catch (e) {
    console.error('[price-alerts] lookup failed:', e)
    return 0
  }

  const message =
    targetType === 'UNIT'
      ? `${target.label} سعرها نزل من ${fmtEGP(oldPrice)} لـ ${fmtEGP(newPrice)}.`
      : `أسعار ${target.label} نزلت — البداية كانت ${fmtEGP(oldPrice)} وبقت ${fmtEGP(newPrice)}.`

  let sent = 0
  for (const w of watches) {
    if (!(await userWatchAlertsOn(w.userId))) {
      // Stay silent but keep the snapshot current so re-enabling the
      // preference doesn't replay this old drop.
      try {
        const snap = JSON.parse(w.snapshot || '{}') as Record<string, unknown>
        await db.watch.update({
          where: { id: w.id },
          data: { snapshot: JSON.stringify({ ...snap, price: newPrice }), lastNotifiedAt: null },
        })
      } catch { /* snapshot advance is best-effort */ }
      continue
    }
    // Dedupe: one pending (unread) drop alert per target is enough. The
    // snapshot is deliberately LEFT at the last-notified baseline so the
    // Watching tab can still surface the newer, lower price.
    if (await hasUnreadDropAlert(w.userId, targetType, targetId)) continue

    await notifyUser(w.userId, {
      type: PRICE_DROP_TYPE,
      title: 'السعر نزل!',
      message,
      link: target.link,
      metadata: { targetType, targetId, oldPrice, newPrice },
    })
    try {
      const snap = JSON.parse(w.snapshot || '{}') as Record<string, unknown>
      await db.watch.update({
        where: { id: w.id },
        data: { snapshot: JSON.stringify({ ...snap, price: newPrice }), lastNotifiedAt: new Date() },
      })
    } catch { /* snapshot advance is best-effort */ }
    sent++
  }
  return sent
}
