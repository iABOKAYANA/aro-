import { db } from '@/lib/db'

// ─── Lead auto-routing engine (CEO feature, v1) ────────────
// Config lives in SystemSetting key `routing.config` (category "routing").
// pickBroker() assigns brokerless leads when mode != 'off'. The round-robin
// cursor is module-level (in-memory): it resets on restart and is NOT shared
// across server instances — concurrent creates may repeat a broker. v1
// limitation, reported honestly; a persisted cursor would race anyway.

export const ROUTING_KEY = 'routing.config'

export type RoutingMode = 'off' | 'round-robin'
export type RoutingFallback = 'unassigned' | 'first-active'

export interface RoutingDoc {
  mode: RoutingMode
  weights?: Record<string, number> // brokerProfileId -> weight (default 1, 0 = never)
  whitelist?: string[] // brokerProfileIds eligible; empty = all active brokers
  fallback?: RoutingFallback
}

export const DEFAULT_ROUTING_DOC: RoutingDoc = {
  mode: 'off',
  weights: {},
  whitelist: [],
  fallback: 'unassigned',
}

export function validateRoutingDoc(
  raw: unknown
): { ok: true; doc: RoutingDoc } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Body must be a routing object' }
  }
  const r = raw as Record<string, unknown>
  if (r.mode !== 'off' && r.mode !== 'round-robin') {
    return { ok: false, error: "mode must be 'off' or 'round-robin'" }
  }
  const doc: RoutingDoc = { mode: r.mode }
  if (r.weights !== undefined) {
    if (!r.weights || typeof r.weights !== 'object' || Array.isArray(r.weights)) {
      return { ok: false, error: 'weights must be an object of brokerId -> number' }
    }
    const w: Record<string, number> = {}
    for (const [k, v] of Object.entries(r.weights as Record<string, unknown>)) {
      if (!k || typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
        return { ok: false, error: `Invalid weight for broker ${k}` }
      }
      w[k] = v
    }
    doc.weights = w
  } else {
    doc.weights = {}
  }
  if (r.whitelist !== undefined) {
    if (
      !Array.isArray(r.whitelist) ||
      r.whitelist.some((x) => typeof x !== 'string' || !x.trim())
    ) {
      return { ok: false, error: 'whitelist must be an array of broker ids' }
    }
    doc.whitelist = (r.whitelist as string[]).map((s) => s.trim())
  } else {
    doc.whitelist = []
  }
  if (r.fallback !== undefined) {
    if (r.fallback !== 'unassigned' && r.fallback !== 'first-active') {
      return { ok: false, error: "fallback must be 'unassigned' or 'first-active'" }
    }
    doc.fallback = r.fallback
  } else {
    doc.fallback = 'unassigned'
  }
  return { ok: true, doc }
}

/** Read + normalize the routing doc. Fail-soft: corrupt/missing row → defaults. */
export async function getRoutingConfig(): Promise<RoutingDoc> {
  try {
    const row = await db.systemSetting.findUnique({ where: { key: ROUTING_KEY } })
    if (!row) return { ...DEFAULT_ROUTING_DOC }
    const parsed = JSON.parse(row.value) as unknown
    const v = validateRoutingDoc(parsed)
    return v.ok ? v.doc : { ...DEFAULT_ROUTING_DOC }
  } catch {
    return { ...DEFAULT_ROUTING_DOC }
  }
}

// In-memory round-robin cursor — see header note on the v1 limitation.
let rrCursor = 0

/** Pick a BrokerProfile id per the routing doc, or null (leave unassigned). */
export async function pickBroker(doc: RoutingDoc): Promise<string | null> {
  if (!doc || doc.mode !== 'round-robin') return null
  const active = await db.brokerProfile.findMany({
    where: { user: { isActive: true, status: 'ACTIVE' } },
    select: { id: true },
    orderBy: { user: { createdAt: 'asc' } },
  })
  if (active.length === 0) return null
  const ids = active.map((a) => a.id)
  let eligible = ids
  if (doc.whitelist && doc.whitelist.length > 0) {
    const allow = new Set(doc.whitelist)
    eligible = ids.filter((id) => allow.has(id))
  }
  if (eligible.length === 0) {
    return doc.fallback === 'first-active' ? ids[0] : null
  }
  const weights = doc.weights || {}
  const weighted: string[] = []
  for (const id of eligible) {
    const w = weights[id] === undefined ? 1 : Math.floor(weights[id])
    for (let i = 0; i < w; i++) weighted.push(id)
  }
  if (weighted.length === 0) {
    return doc.fallback === 'first-active' ? ids[0] : null
  }
  const pick = weighted[rrCursor % weighted.length]
  rrCursor = (rrCursor + 1) % Number.MAX_SAFE_INTEGER
  return pick
}

/** Fail-open entry point for lead-create hooks: never throws, null = unassigned. */
export async function routeNewLead(): Promise<string | null> {
  try {
    return await pickBroker(await getRoutingConfig())
  } catch {
    return null
  }
}
