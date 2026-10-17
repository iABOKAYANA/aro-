import { db } from '@/lib/db'
import { notifyUser } from '@/lib/notify'
import { readBoolSetting } from '@/lib/system-settings'

// ─── BUYER JOURNEY EVENTS (Feature 6 + F1 evidence) ────────
// Lightweight, privacy-respecting interaction events.
// No PII is stored in events — only an authenticated userId or a random
// visitor id (anonId) that the client generates locally.

export const JOURNEY_EVENT_TYPES = [
  'VISIT', 'PROJECT_VIEW', 'UNIT_VIEW', 'SEARCH', 'AI_CHAT',
  'SAVE', 'CONTACT', 'VIEWING_BOOKED', 'REGISTER',
  'RESERVATION', 'CONTRACT', 'SOLD', 'WATCH',
] as const
export type JourneyEventType = (typeof JOURNEY_EVENT_TYPES)[number]

export interface RecordEventInput {
  userId?: string | null
  anonId?: string | null
  type: string
  entityType?: string | null
  entityId?: string | null
  meta?: Record<string, unknown>
}

/** Fire-and-forget event write. Never throws — tracking must not break pages. */
export async function recordEvent(input: RecordEventInput): Promise<void> {
  if (!input.userId && !input.anonId) return
  try {
    let meta: string | undefined
    if (input.meta) {
      const raw = JSON.stringify(input.meta)
      meta = raw.length > 1000 ? raw.slice(0, 1000) : raw
    }
    await db.userEvent.create({
      data: {
        userId: input.userId || null,
        anonId: input.userId ? null : input.anonId || null,
        type: input.type,
        entityType: input.entityType || null,
        entityId: input.entityId || null,
        meta: meta || '{}',
      },
    })
  } catch (e) {
    console.error('[journey] record failed:', e)
  }
}

function iso(d: Date): string {
  return d.toISOString()
}

async function countDistinctIdentities(from: Date, to: Date, types?: string[]): Promise<number> {
  try {
    const where: Record<string, unknown> = { createdAt: { gte: from, lte: to } }
    if (types && types.length) where.type = { in: types }
    const rows = await db.userEvent.findMany({ where, select: { userId: true, anonId: true } })
    const ids = new Set<string>()
    for (const r of rows) {
      const key = r.userId || r.anonId
      if (key) ids.add(key)
    }
    return ids.size
  } catch (e) {
    console.error('[journey] distinct count failed:', e)
    return 0
  }
}

export interface FunnelStage {
  key: string
  label: string
  count: number
  note?: string
}

/** Aggregate the buyer-journey funnel over a date range using REAL tables. */
export async function journeyFunnel(from: Date, to: Date): Promise<FunnelStage[]> {
  const range = { gte: from, lte: to }

  const [visitors, registrations, aiConversations, propertyViews, saves, contacts, viewings, reservations, contracts, sold] =
    await Promise.all([
      countDistinctIdentities(from, to),
      db.user.count({ where: { createdAt: range, role: { notIn: ['CEO', 'ADMIN'] } } }),
      db.aIConversation.count({ where: { createdAt: range } }),
      countDistinctIdentities(from, to, ['PROJECT_VIEW', 'UNIT_VIEW']),
      db.favorite.count({ where: { createdAt: range } }),
      db.inquiry.count({ where: { createdAt: range } }),
      db.viewing.count({ where: { createdAt: range } }),
      db.deal.count({ where: { createdAt: range, status: { in: ['RESERVATION', 'CONTRACT', 'SOLD'] } } }),
      db.deal.count({ where: { createdAt: range, status: { in: ['CONTRACT', 'SOLD'] } } }),
      db.deal.count({ where: { createdAt: range, status: 'SOLD' } }),
    ])

  return [
    { key: 'VISITORS', label: 'Visitors', count: visitors, note: 'Unique visitors (no personal data stored)' },
    { key: 'REGISTRATIONS', label: 'Registrations', count: registrations, note: 'New buyer/broker/developer accounts' },
    { key: 'AI_CONSULTATION', label: 'AI Consultations', count: aiConversations, note: 'AI chat conversations started' },
    { key: 'PROPERTY_VIEWS', label: 'Property Views', count: propertyViews, note: 'Unique identities viewing projects/units' },
    { key: 'SAVED_PROPERTY', label: 'Saved Properties', count: saves },
    { key: 'CONTACTED_BROKER', label: 'Contacted Broker', count: contacts, note: 'Inquiries submitted' },
    { key: 'VIEWING', label: 'Viewings', count: viewings },
    { key: 'RESERVATION', label: 'Reservations', count: reservations },
    { key: 'CONTRACT', label: 'Contracts', count: contracts },
    { key: 'SOLD', label: 'Sold', count: sold },
  ]
}

/** Per-day event trend + per-type counts + most viewed projects. */
export async function journeyDetails(from: Date, to: Date) {
  const events = await db.userEvent.findMany({
    where: { createdAt: { gte: from, lte: to } },
    select: { type: true, createdAt: true, entityId: true, entityType: true },
  })

  const byType: Record<string, number> = {}
  const byDay: Record<string, number> = {}
  const viewCounts: Record<string, number> = {}
  for (const e of events) {
    byType[e.type] = (byType[e.type] || 0) + 1
    const day = iso(e.createdAt).slice(0, 10)
    byDay[day] = (byDay[day] || 0) + 1
    if ((e.type === 'PROJECT_VIEW' || e.type === 'UNIT_VIEW') && e.entityId) {
      viewCounts[e.entityId] = (viewCounts[e.entityId] || 0) + 1
    }
  }

  const topIds = Object.entries(viewCounts).sort((a, b) => b[1] - a[1]).slice(0, 10)
  let topProjects: Array<{ id: string; name: string; views: number }> = []
  if (topIds.length) {
    const projects = await db.project.findMany({
      where: { id: { in: topIds.map(([id]) => id) } },
      select: { id: true, name: true },
    })
    topProjects = topIds
      .map(([id, views]) => {
        const p = projects.find((x) => x.id === id)
        return p ? { id, name: p.name, views } : null
      })
      .filter((x): x is { id: string; name: string; views: number } => x !== null)
  }

  return {
    totalEvents: events.length,
    byType,
    byDay: Object.fromEntries(Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b))),
    topProjects,
  }
}

/** Most recent events (CEO overview; anonymous ids only for visitors). */
export async function journeyRecentEvents(limit = 50) {
  const events = await db.userEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, userId: true, anonId: true, type: true, entityType: true, entityId: true, createdAt: true },
  })
  if (!events.length) return []
  const userIds = [...new Set(events.map((e) => e.userId).filter((x): x is string => !!x))]
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, role: true } })
    : []
  return events.map((e) => ({
    ...e,
    visitor: e.userId ? users.find((u) => u.id === e.userId)?.name ?? 'User' : `visitor-${(e.anonId || '').slice(0, 8)}`,
  }))
}

// ─── Availability check (used by settings page + API) ─────
export async function journeyTrackingEnabled(): Promise<boolean> {
  return readBoolSetting('journeyTrackingEnabled', true)
}
