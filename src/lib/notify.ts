import { db } from '@/lib/db'
import { sendPushToUser } from '@/lib/push'

// ─── Notification Helpers ────────────────────────────────
// Reuses the existing Notification model. Every helper is fail-soft:
// a notification failure must never break the business operation.

async function safeCreate(data: {
  userId: string
  type: string
  title: string
  message: string
  link?: string | null
  metadata?: Record<string, unknown>
}) {
  try {
    await db.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        title: data.title,
        message: data.message,
        link: data.link || null,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      },
    })
  } catch (e) {
    console.error('[notify] create failed:', e)
  }

  // Second, best-effort channel: the in-app row is the source of truth, so a
  // failed push leaves the notification visible in the app's inbox either way.
  await sendPushToUser(data.userId, data.type, {
    title: data.title,
    body: data.message,
    link: data.link || null,
  })
}

export async function notifyUser(
  userId: string | null | undefined,
  params: { type: string; title: string; message: string; link?: string | null; metadata?: Record<string, unknown> }
) {
  if (!userId) return
  await safeCreate({ userId, ...params })
}

export async function notifyRole(
  roles: string[],
  params: { type: string; title: string; message: string; link?: string | null; metadata?: Record<string, unknown> }
) {
  try {
    const users = await db.user.findMany({
      where: { role: { in: roles }, isActive: true },
      select: { id: true },
    })
    await Promise.all(users.map((u) => safeCreate({ userId: u.id, ...params })))
  } catch (e) {
    console.error('[notify] role notify failed:', e)
  }
}

/** Broker user id behind a BrokerProfile. */
export async function brokerUserId(brokerId: string | null | undefined): Promise<string | null> {
  if (!brokerId) return null
  try {
    const profile = await db.brokerProfile.findUnique({
      where: { id: brokerId },
      select: { userId: true },
    })
    return profile?.userId ?? null
  } catch {
    return null
  }
}

/** Developer account user id behind a DeveloperProfile. */
export async function developerUserId(developerId: string | null | undefined): Promise<string | null> {
  if (!developerId) return null
  try {
    const profile = await db.developerProfile.findUnique({
      where: { id: developerId },
      select: { userId: true },
    })
    return profile?.userId ?? null
  } catch {
    return null
  }
}
