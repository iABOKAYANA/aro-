import { db } from '@/lib/db'
import { developerUserId, notifyUser } from '@/lib/notify'

// ─── Developer low-stock / sold-out hook ─────────────────
// Called (fail-soft, never throws) after a unit write that can only reduce
// buyable inventory: unit PATCH (status change) and unit DELETE (soft-delete
// to HIDDEN). Showcase samples (`isSample`) are excluded — same rule as the
// developer portal's unit counts.
//
// Rule: when the parent project's AVAILABLE (non-sample) unit count is ≤ 3,
// notify the owning developer. 0 is included as the sold-out case (decided:
// a developer needs to know the project has nothing left to sell).
// Dedupe mirrors src/lib/price-alerts.ts: skip when an UNREAD alert with the
// same type + projectId metadata already exists.
// Link `/developer` resolves in the mobile app (links.ts maps /^\/developer/)
// and lands on the website's developer portal.

export const LOW_STOCK_TYPE = 'PROJECT_LOW_STOCK'
export const LOW_STOCK_THRESHOLD = 3

async function hasUnreadLowStockAlert(userId: string, projectId: string): Promise<boolean> {
  try {
    const rows = await db.notification.findMany({
      where: { userId, type: LOW_STOCK_TYPE, isRead: false },
      select: { metadata: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    return rows.some((r) => {
      try {
        const meta = JSON.parse(r.metadata || '{}') as { projectId?: unknown }
        return meta.projectId === projectId
      } catch {
        return false
      }
    })
  } catch {
    return false
  }
}

export async function checkProjectLowStock(projectId: string): Promise<void> {
  try {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, slug: true, developerId: true },
    })
    if (!project) return

    const available = await db.unit.count({
      where: { projectId, status: 'AVAILABLE', isSample: false },
    })
    if (available > LOW_STOCK_THRESHOLD) return

    const devUserId = await developerUserId(project.developerId)
    if (!devUserId) return

    // Dedupe: one pending (unread) low-stock alert per project is enough.
    if (await hasUnreadLowStockAlert(devUserId, projectId)) return

    const soldOut = available === 0
    await notifyUser(devUserId, {
      type: LOW_STOCK_TYPE,
      title: soldOut ? 'Project sold out' : 'Low unit availability',
      message: soldOut
        ? `${project.name} has no available units left.`
        : `Only ${available} unit${available === 1 ? '' : 's'} left available in ${project.name}.`,
      link: '/developer',
      metadata: { projectId, slug: project.slug, availableCount: available, soldOut },
    })
  } catch (e) {
    console.error('[low-stock] check failed:', e)
  }
}
