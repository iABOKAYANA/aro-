import { db } from '@/lib/db'
import { notifyUser } from '@/lib/notify'

// ─── Viewing-completed → rate-your-visit nudge ─────────────────
// Called (fail-soft, never throws) from PATCH /api/ceo/viewings when a
// viewing transitions TO completed. The visitor did the hard part —
// showing up — so this is one honest nudge toward the rating form, not a
// drip campaign: exactly one unread nudge per viewing, ever.
//
// Dedupe mirrors src/lib/price-alerts.ts: skip when an UNREAD nudge with
// the same viewingId metadata already exists.
//
// Link `/projects/<slug>?review=<viewingId>` — the website bell navigates
// with `window.location.href` (query intact, reviews tab opens with the
// viewing preselected via `src/components/projects/project-detail.tsx`),
// and the mobile `resolveLink()` mapper forwards `?review=` onto
// `/project/[slug]` (same preselect in `mobile/src/app/project/[slug].tsx`).
// No schema changes: reuses the existing Notification model.

export const VIEWING_COMPLETED_TYPE = 'VIEWING_COMPLETED'

async function hasUnreadCompletedNudge(userId: string, viewingId: string): Promise<boolean> {
  try {
    const rows = await db.notification.findMany({
      where: { userId, type: VIEWING_COMPLETED_TYPE, isRead: false },
      select: { metadata: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    return rows.some((r) => {
      try {
        const meta = JSON.parse(r.metadata || '{}') as { viewingId?: unknown }
        return meta.viewingId === viewingId
      } catch {
        return false
      }
    })
  } catch {
    return false
  }
}

export async function notifyViewingCompleted(viewingId: string): Promise<void> {
  try {
    const viewing = await db.viewing.findUnique({
      where: { id: viewingId },
      select: {
        id: true,
        userId: true,
        status: true,
        project: { select: { id: true, name: true, slug: true } },
        unit: {
          select: {
            id: true,
            name: true,
            project: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    })
    if (!viewing) return
    if ((viewing.status ?? '').toUpperCase() !== 'COMPLETED') return
    // Guest bookings carry no account — there is no inbox to nudge.
    if (!viewing.userId) return
    const project = viewing.project ?? viewing.unit?.project ?? null
    if (!project?.slug) return

    // Dedupe: one pending (unread) nudge per viewing is enough. A read
    // nudge followed by a re-completion (unlikely) may nudge once more —
    // never twice for one viewing while the first is still unread.
    if (await hasUnreadCompletedNudge(viewing.userId, viewing.id)) return

    await notifyUser(viewing.userId, {
      type: VIEWING_COMPLETED_TYPE,
      title: 'Your visit is complete — rate it',
      message: `How was «${project.name}»? Rate your visit — it takes a minute and shows after review.`,
      link: `/projects/${project.slug}?review=${viewing.id}`,
      metadata: { viewingId: viewing.id, projectId: project.id, slug: project.slug },
    })
  } catch (e) {
    console.error('[viewing-completed] notify failed:', e)
  }
}
