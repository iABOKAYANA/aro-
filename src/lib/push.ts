import { db } from '@/lib/db'

// ─── Mobile push notifications ───────────────────────────────────────────
//
// Delivered through Expo's hosted push API (`POST /--/api/v2/push/send`) with
// a plain `fetch` rather than `expo-server-sdk`: the payload is one JSON array
// and the SDK would only re-encode it, so the app adds no dependency to the
// server for it.
//
// Every entry point here is fail-soft in the same way `src/lib/notify.ts` is —
// a push that cannot be sent must never fail the business operation that
// triggered it. The in-app Notification row is always written first; this is a
// second, best-effort delivery channel.

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send'
/** Expo caps one push request at 100 messages. */
const BATCH_SIZE = 100
const TIMEOUT_MS = 8000

export type PushPayload = {
  title: string
  body: string
  /** Deep link the app resolves (same `link` shape as an in-app notification). */
  link?: string | null
  data?: Record<string, unknown>
}

type PreferenceFlags = {
  pushInquiries: boolean
  pushLeads: boolean
  pushPayments: boolean
  pushViewings: boolean
  watchAlerts: boolean
}

/**
 * Which NotificationPreference gate a notification `type` passes through.
 *
 * Unmatched types are allowed: a new notification category should reach people
 * who never opted out of something they have never seen, rather than be
 * silently swallowed by a default.
 */
function allowedBy(type: string, pref: PreferenceFlags): boolean {
  const t = type.toUpperCase()
  if (t.startsWith('WATCH_') || t === 'SAVED_SEARCH_MATCH') return pref.watchAlerts
  if (t === 'VIEWING' || t.startsWith('VIEWING_') || t.startsWith('APPOINTMENT')) return pref.pushViewings
  if (t.startsWith('INQUIRY')) return pref.pushInquiries
  if (t.startsWith('COMMISSION') || t.startsWith('PAYMENT') || t.startsWith('DEAL')) return pref.pushPayments
  if (
    t.startsWith('LEAD') ||
    t.startsWith('PROTECTION') ||
    t.startsWith('DUPLICATE') ||
    t.startsWith('ASSIGNED') ||
    t === 'STATUS_CHANGED' ||
    t === 'NEW_ESTATEAI_LEAD'
  ) {
    return pref.pushLeads
  }
  return true
}

const DEFAULT_FLAGS: PreferenceFlags = {
  pushInquiries: true,
  pushLeads: true,
  pushPayments: true,
  pushViewings: true,
  watchAlerts: true,
}

async function flagsFor(userId: string): Promise<PreferenceFlags> {
  try {
    const pref = await db.notificationPreference.findUnique({
      where: { userId },
      select: {
        pushInquiries: true,
        pushLeads: true,
        pushPayments: true,
        pushViewings: true,
        watchAlerts: true,
      },
    })
    return pref ?? DEFAULT_FLAGS
  } catch {
    // Preferences are an optimisation, not a gate: no row means "not configured".
    return DEFAULT_FLAGS
  }
}

async function pushTokensFor(userId: string): Promise<string[]> {
  try {
    const rows = await db.pushSubscription.findMany({
      where: { userId },
      select: { token: true },
    })
    return rows.map((r) => r.token)
  } catch {
    return []
  }
}

type ExpoPushTicket =
  | { status: 'ok'; id?: string }
  | { status: 'error'; details?: { error?: string } }

async function postToExpo(messages: Record<string, unknown>[]): Promise<ExpoPushTicket[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
      signal: controller.signal,
    })
    if (!response.ok) return messages.map(() => ({ status: 'error' as const }))
    const payload = (await response.json()) as { data?: ExpoPushTicket[] }
    return Array.isArray(payload.data) ? payload.data : []
  } catch {
    return messages.map(() => ({ status: 'error' as const }))
  } finally {
    clearTimeout(timer)
  }
}

/** Tokens Expo says are dead — the app was uninstalled or the token rotated. */
function isDeviceGone(ticket: ExpoPushTicket): boolean {
  return ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered'
}

async function sendToTokens(tokens: string[], payload: PushPayload): Promise<void> {
  for (let offset = 0; offset < tokens.length; offset += BATCH_SIZE) {
    const batch = tokens.slice(offset, offset + BATCH_SIZE)
    const messages = batch.map((to) => ({
      to,
      sound: 'default',
      title: payload.title,
      body: payload.body,
      data: { link: payload.link ?? null, ...payload.data },
    }))

    const tickets = await postToExpo(messages)
    const dead = batch.filter((_, i) => isDeviceGone(tickets[i] ?? { status: 'error' }))
    if (dead.length) {
      try {
        await db.pushSubscription.deleteMany({ where: { token: { in: dead } } })
      } catch (e) {
        console.error('[push] pruning dead tokens failed:', e)
      }
    }
  }
}

/** Best-effort push to one user. Never throws. */
export async function sendPushToUser(
  userId: string | null | undefined,
  type: string,
  payload: PushPayload,
): Promise<void> {
  if (!userId) return
  try {
    const [tokens, flags] = await Promise.all([pushTokensFor(userId), flagsFor(userId)])
    if (tokens.length === 0 || !allowedBy(type, flags)) return
    await sendToTokens(tokens, payload)
  } catch (e) {
    console.error('[push] send failed:', e)
  }
}

/** Best-effort push to everyone holding one of these roles. Never throws. */
export async function sendPushToRole(
  roles: string[],
  type: string,
  payload: PushPayload,
): Promise<void> {
  try {
    const users = await db.user.findMany({
      where: { role: { in: roles }, isActive: true },
      select: { id: true },
    })
    await Promise.all(users.map((u) => sendPushToUser(u.id, type, payload)))
  } catch (e) {
    console.error('[push] role push failed:', e)
  }
}
