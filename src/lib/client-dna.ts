import { db } from '@/lib/db'
import { parseNaturalLanguageQuery } from '@/lib/ai-search-parser'

// ─── AI CLIENT DNA (Feature 1) ─────────────────────────────
// A preference profile built ONLY from real user interactions.
// Hard rules:
//   • Never invent a preference — every field must trace to evidence.
//   • Evidence sources are concrete interactions (chat messages the user
//     actually typed, searches, favorites, leads, profile fields, manual edits).
//   • Extraction is deterministic (regex/parser), not generative.
//   • The owner can view and edit their own DNA (USER_EDIT wins on merge).

export type DnaSource =
  | 'USER_EDIT'      // manual edit by the client
  | 'PROFILE'        // UserProfile budget/preferences fields
  | 'LEAD'           // lead record linked to this account (email match)
  | 'AI_CHAT'        // explicit statement the user typed in AI chat
  | 'SAVED_SEARCH'   // filters the user saved
  | 'AI_SEARCH'      // query/filters the user searched with
  | 'FAVORITE'       // units the user saved (type/bedroom/location signals)
  | 'INQUIRY'        // inquiry message text
  | 'VIEWING'        // viewing booking (urgency signal)
  | 'VIEW_EVENT'     // what they viewed on the site

export interface DnaEvidence {
  field: string           // budget | locations | propertyTypes | bedrooms | area | listingType | intent | urgency | financial | amenities
  value: unknown          // JSON-serializable value actually observed
  source: DnaSource
  refId?: string          // id of the interaction record
  at: string              // ISO time of evidence
  quote?: string          // short excerpt (max ~160 chars) for text sources
}

export interface ClientDna {
  budget?: { min?: number; max?: number; currency: string }
  locations: string[]
  propertyTypes: string[]
  bedrooms?: number
  area?: { min?: number; max?: number }
  listingType?: string
  financial?: { paymentPreference?: string; installmentYears?: number }
  intent?: 'LIVING' | 'INVESTMENT'
  urgency?: 'LOW' | 'MEDIUM' | 'HIGH'
  amenities: string[]
  sources: Record<string, number>   // source → number of evidence items
  fields: number                    // how many populated fields
  evidenceCount: number
  confidence: number                // 0..1 — evidence breadth/diversity
}

export interface DnaSnapshot {
  dna: ClientDna
  evidence: DnaEvidence[]
  confidence: number
  updatedAt: string | null
}

// ─── Deterministic extraction from explicit text ──────────

function quote(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > 160 ? `${t.slice(0, 157)}…` : t
}

/** Extract ONLY explicitly-stated preferences from a message the user typed.
 *  Uses the existing rule-based search parser + a few keyword rules.
 *  Returns [] when the message contains no explicit preference. */
export function extractFromMessage(text: string): DnaEvidence[] {
  const out: DnaEvidence[] = []
  if (!text || text.trim().length < 3) return out
  const at = new Date().toISOString()
  const lower = text.toLowerCase()

  const parsed = parseNaturalLanguageQuery(text)
  const f = parsed.filters
  const q = quote(text)

  if (f.minPrice !== undefined || f.maxPrice !== undefined) {
    out.push({
      field: 'budget',
      value: { min: f.minPrice, max: f.maxPrice, currency: 'EGP' },
      source: 'AI_CHAT', at, quote: q,
    })
  }
  if (f.city) out.push({ field: 'locations', value: [f.city], source: 'AI_CHAT', at, quote: q })
  if (f.propertyType) out.push({ field: 'propertyTypes', value: [f.propertyType], source: 'AI_CHAT', at, quote: q })
  if (f.bedrooms !== undefined) out.push({ field: 'bedrooms', value: f.bedrooms, source: 'AI_CHAT', at, quote: q })
  if (f.minArea !== undefined || f.maxArea !== undefined) {
    out.push({ field: 'area', value: { min: f.minArea, max: f.maxArea }, source: 'AI_CHAT', at, quote: q })
  }
  if (f.listingType) out.push({ field: 'listingType', value: f.listingType, source: 'AI_CHAT', at, quote: q })

  // Intent — only on explicit wording
  if (/استثمار|investment|invest in|للاستثمار/.test(lower)) {
    out.push({ field: 'intent', value: 'INVESTMENT', source: 'AI_CHAT', at, quote: q })
  } else if (/لسكن|للسكن|أعيش|عيشة|living with|family use|لأعيش/.test(lower)) {
    out.push({ field: 'intent', value: 'LIVING', source: 'AI_CHAT', at, quote: q })
  }

  // Urgency — only on explicit wording
  if (/مستعجل|فوري|urgent|asap|dari|دلوقتي|within a month|خلال شهر|this month/.test(lower)) {
    out.push({ field: 'urgency', value: 'HIGH', source: 'AI_CHAT', at, quote: q })
  } else if (/محتاج أشوف|just looking|مستكشف|بستكشف|for now|مش هستعجل/.test(lower)) {
    out.push({ field: 'urgency', value: 'LOW', source: 'AI_CHAT', at, quote: q })
  }

  // Financial preference
  const payment: string[] = []
  if (/تقسيط|installment|payment plan|أقساط|قسط/.test(lower)) payment.push('INSTALLMENT')
  if (/كاش|cash|نقدي/.test(lower)) payment.push('CASH')
  const yearsMatch = text.match(/(\d+)\s*(?:year|سنة|سنه|سنوات)\s*(?:of\s*)?(?:installment|payment|تقسيط|أقساط)?/i)
  if (payment.length || yearsMatch) {
    out.push({
      field: 'financial',
      value: {
        paymentPreference: payment[0],
        installmentYears: yearsMatch ? parseInt(yearsMatch[1]) : undefined,
      },
      source: 'AI_CHAT', at, quote: q,
    })
  }

  return out
}

// ─── Evidence collection from real interactions ───────────

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try { return JSON.parse(raw) as T } catch { return fallback }
}

function arr(raw: string | null | undefined): string[] {
  const v = parseJson<unknown[]>(raw, [])
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string')
}

/** Collect evidence from every concrete interaction this user has. */
async function collectEvidence(userId: string): Promise<DnaEvidence[]> {
  const out: DnaEvidence[] = []

  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      favorites: { orderBy: { createdAt: 'desc' }, take: 30, include: { unit: { include: { project: { include: { city: true } } } } } },
      savedSearches: { orderBy: { createdAt: 'desc' }, take: 10 },
      aiSearchHistory: { orderBy: { createdAt: 'desc' }, take: 30 },
      aiConversations: { orderBy: { updatedAt: 'desc' }, take: 5, include: { messages: { where: { role: 'user' }, orderBy: { createdAt: 'desc' }, take: 40 } } },
      viewings: { orderBy: { createdAt: 'desc', }, take: 10 },
    },
  })
  if (!user) return out

  // 1. Profile (explicitly provided at registration)
  if (user.profile) {
    const at = user.profile as unknown as { createdAt?: Date }
    const iso = (at.createdAt ? new Date(at.createdAt) : new Date()).toISOString()
    if (user.profile.budgetMin !== null || user.profile.budgetMax !== null) {
      out.push({ field: 'budget', value: { min: user.profile.budgetMin ?? undefined, max: user.profile.budgetMax ?? undefined, currency: 'EGP' }, source: 'PROFILE', refId: user.profile.id, at: iso })
    }
    const types = arr(user.profile.preferredPropertyTypes)
    if (types.length) out.push({ field: 'propertyTypes', value: types, source: 'PROFILE', refId: user.profile.id, at: iso })
    const areas = arr(user.profile.preferredAreas)
    if (areas.length) out.push({ field: 'locations', value: areas, source: 'PROFILE', refId: user.profile.id, at: iso })
  }

  // 2. Lead records linked to this account (same email)
  const email = user.email.toLowerCase()
  const leads = await db.lead.findMany({
    where: { normalizedEmail: email, reviewStatus: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })
  for (const lead of leads) {
    const iso = new Date(lead.createdAt).toISOString()
    if (lead.budgetMin !== null || lead.budgetMax !== null) {
      out.push({ field: 'budget', value: { min: lead.budgetMin ?? undefined, max: lead.budgetMax ?? undefined, currency: 'EGP' }, source: 'LEAD', refId: lead.id, at: iso })
    }
    const types = arr(lead.preferredPropertyTypes)
    if (types.length) out.push({ field: 'propertyTypes', value: types, source: 'LEAD', refId: lead.id, at: iso })
    const areas = arr(lead.preferredAreas)
    if (areas.length) out.push({ field: 'locations', value: areas, source: 'LEAD', refId: lead.id, at: iso })
  }

  // 3. Saved searches (user-built filter sets = explicit)
  for (const s of user.savedSearches) {
    const filters = parseJson<Record<string, unknown>>(s.filters, {})
    const iso = new Date(s.createdAt).toISOString()
    const ev: DnaEvidence[] = []
    const min = typeof filters.minPrice === 'number' ? filters.minPrice : undefined
    const max = typeof filters.maxPrice === 'number' ? filters.maxPrice : undefined
    if (min !== undefined || max !== undefined) {
      ev.push({ field: 'budget', value: { min, max, currency: 'EGP' }, source: 'SAVED_SEARCH', refId: s.id, at: iso })
    }
    if (typeof filters.city === 'string') ev.push({ field: 'locations', value: [filters.city], source: 'SAVED_SEARCH', refId: s.id, at: iso })
    if (typeof filters.propertyType === 'string') ev.push({ field: 'propertyTypes', value: [filters.propertyType], source: 'SAVED_SEARCH', refId: s.id, at: iso })
    if (typeof filters.bedrooms === 'number') ev.push({ field: 'bedrooms', value: filters.bedrooms, source: 'SAVED_SEARCH', refId: s.id, at: iso })
    out.push(...ev)
  }

  // 4. AI search history (their own queries/filters)
  for (const h of user.aiSearchHistory) {
    const iso = new Date(h.createdAt).toISOString()
    const fromQuery = extractFromMessage(h.query)
    for (const e of fromQuery) out.push({ ...e, source: 'AI_SEARCH', refId: h.id, at: iso })
    const filters = parseJson<Record<string, unknown>>(h.filters, {})
    if (typeof filters.city === 'string') out.push({ field: 'locations', value: [filters.city], source: 'AI_SEARCH', refId: h.id, at: iso })
    if (typeof filters.propertyType === 'string') out.push({ field: 'propertyTypes', value: [filters.propertyType], source: 'AI_SEARCH', refId: h.id, at: iso })
  }

  // 5. AI chat messages the user actually typed (rule-extracted only)
  for (const conv of user.aiConversations) {
    for (const msg of conv.messages) {
      const iso = new Date(msg.createdAt).toISOString()
      for (const e of extractFromMessage(msg.content)) {
        out.push({ ...e, source: 'AI_CHAT', refId: msg.id, at: iso })
      }
    }
  }

  // 6. Favorites → property-type / bedroom / location signals (never budget)
  const favSignals: Record<string, Set<string>> = { propertyTypes: new Set(), locations: new Set() }
  let favBedrooms: number | undefined
  for (const fav of user.favorites) {
    const unit = fav.unit
    if (!unit) continue
    if (unit.unitType) favSignals.propertyTypes.add(unit.unitType)
    const slug = unit.project?.city?.nameSlug || unit.project?.city?.name
    if (slug) favSignals.locations.add(slug)
    if (unit.bedrooms !== null && favBedrooms === undefined) favBedrooms = unit.bedrooms
  }
  const favAt = user.favorites[0] ? new Date(user.favorites[0].createdAt).toISOString() : new Date().toISOString()
  if (favSignals.propertyTypes.size) {
    out.push({ field: 'propertyTypes', value: [...favSignals.propertyTypes], source: 'FAVORITE', at: favAt })
  }
  if (favSignals.locations.size) {
    out.push({ field: 'locations', value: [...favSignals.locations], source: 'FAVORITE', at: favAt })
  }
  if (favBedrooms !== undefined) out.push({ field: 'bedrooms', value: favBedrooms, source: 'FAVORITE', at: favAt })

  // 7. Inquiry messages (explicit text)
  const inquiries = await db.inquiry.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 10 })
  for (const inq of inquiries) {
    if (!inq.message) continue
    const iso = new Date(inq.createdAt).toISOString()
    for (const e of extractFromMessage(inq.message)) out.push({ ...e, source: 'INQUIRY', refId: inq.id, at: iso })
  }

  // 8. Viewings → urgency rule: booking a visit = high intent
  if (user.viewings.length) {
    const iso = new Date(user.viewings[0].createdAt).toISOString()
    out.push({ field: 'urgency', value: 'HIGH', source: 'VIEWING', refId: user.viewings[0].id, at: iso, quote: 'Booked a property viewing' })
  }

  // 9. Viewed events → what they browse (weakest signal, list-only)
  const events = await db.userEvent.findMany({
    where: { userId, entityType: 'UNIT', type: 'UNIT_VIEW' },
    orderBy: { createdAt: 'desc' },
    take: 40,
  })
  if (events.length) {
    const viewedUnits = await db.unit.findMany({
      // Showcase samples are illustrative, not buyable taste signals.
      where: { id: { in: [...new Set(events.map((e) => e.entityId).filter((x): x is string => !!x))] }, isSample: false },
      select: { unitType: true, bedrooms: true },
    })
    const types = [...new Set(viewedUnits.map((u) => u.unitType).filter(Boolean))]
    const at = new Date(events[0].createdAt).toISOString()
    if (types.length) out.push({ field: 'propertyTypes', value: types, source: 'VIEW_EVENT', at })
    const beds = [...new Set(viewedUnits.map((u) => u.bedrooms).filter((b): b is number => b !== null))]
    if (beds.length === 1) out.push({ field: 'bedrooms', value: beds[0], source: 'VIEW_EVENT', at })
  }

  return out
}

// ─── Merge evidence → structured DNA ──────────────────────

const SOURCE_PRIORITY: Record<DnaSource, number> = {
  USER_EDIT: 100, PROFILE: 80, LEAD: 70, AI_CHAT: 60, SAVED_SEARCH: 55,
  AI_SEARCH: 50, INQUIRY: 45, FAVORITE: 30, VIEWING: 25, VIEW_EVENT: 10,
}

function mergeEvidence(evidence: DnaEvidence[]): ClientDna {
  const dna: ClientDna = { locations: [], propertyTypes: [], amenities: [], sources: {}, fields: 0, evidenceCount: evidence.length, confidence: 0 }
  const byField = new Map<string, DnaEvidence[]>()
  for (const e of evidence) {
    dna.sources[e.source] = (dna.sources[e.source] || 0) + 1
    const list = byField.get(e.field) || []
    list.push(e)
    byField.set(e.field, list)
  }

  const winner = (field: string): DnaEvidence | undefined => {
    const list = byField.get(field)
    if (!list || !list.length) return undefined
    return [...list].sort((a, b) => (SOURCE_PRIORITY[b.source] - SOURCE_PRIORITY[a.source]) || (Date.parse(b.at) - Date.parse(a.at)))[0]
  }

  // Budget: strongest source wins, but USER_EDIT can narrow it
  const budgetEv = winner('budget')
  if (budgetEv) {
    const v = budgetEv.value as { min?: number; max?: number; currency?: string }
    dna.budget = { min: v.min, max: v.max, currency: v.currency || 'EGP' }
  }
  // Locations / property types: union across sources (dedup)
  const locSet = new Set<string>()
  const typeSet = new Set<string>()
  const amenSet = new Set<string>()
  for (const e of byField.get('locations') || []) for (const x of (e.value as string[]) || []) locSet.add(x)
  for (const e of byField.get('propertyTypes') || []) for (const x of (e.value as string[]) || []) typeSet.add(x)
  for (const e of byField.get('amenities') || []) for (const x of (e.value as string[]) || []) amenSet.add(x)
  dna.locations = [...locSet]
  dna.propertyTypes = [...typeSet]
  dna.amenities = [...amenSet]

  const bedEv = winner('bedrooms')
  if (bedEv && typeof bedEv.value === 'number') dna.bedrooms = bedEv.value
  const areaEv = winner('area')
  if (areaEv) dna.area = areaEv.value as { min?: number; max?: number }
  const listEv = winner('listingType')
  if (listEv && typeof listEv.value === 'string') dna.listingType = listEv.value
  const finEv = winner('financial')
  if (finEv) dna.financial = finEv.value as ClientDna['financial']
  const intentEv = winner('intent')
  if (intentEv && (intentEv.value === 'LIVING' || intentEv.value === 'INVESTMENT')) dna.intent = intentEv.value
  const urgEv = winner('urgency')
  if (urgEv && (urgEv.value === 'LOW' || urgEv.value === 'MEDIUM' || urgEv.value === 'HIGH')) dna.urgency = urgEv.value

  // Confidence: more distinct sources + more populated fields = higher, capped at 0.95
  const populated =
    (dna.budget ? 1 : 0) + (dna.locations.length ? 1 : 0) + (dna.propertyTypes.length ? 1 : 0) +
    (dna.bedrooms !== undefined ? 1 : 0) + (dna.area ? 1 : 0) + (dna.listingType ? 1 : 0) +
    (dna.financial ? 1 : 0) + (dna.intent ? 1 : 0) + (dna.urgency ? 1 : 0) + (dna.amenities.length ? 1 : 0)
  const distinctSources = Object.keys(dna.sources).length
  dna.fields = populated
  dna.confidence = Math.min(0.95, Math.round((0.1 * distinctSources + 0.05 * populated) * 100) / 100)
  return dna
}

// ─── Public API ───────────────────────────────────────────

function dedupeEvidence(list: DnaEvidence[]): DnaEvidence[] {
  const seen = new Set<string>()
  const out: DnaEvidence[] = []
  for (const e of [...list].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    const key = `${e.field}|${e.source}|${e.refId || ''}|${JSON.stringify(e.value)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(e)
  }
  return out
}

/** Read the DNA. Recomputes from interactions if missing or older than `maxAgeMs`. */
export async function getClientDna(userId: string, opts?: { force?: boolean; maxAgeMs?: number }): Promise<DnaSnapshot> {
  const profile = await db.userProfile.findUnique({ where: { userId } })
  const ageOk =
    profile?.dnaUpdatedAt &&
    Date.now() - new Date(profile.dnaUpdatedAt).getTime() < (opts?.maxAgeMs ?? 60 * 60 * 1000)
  if (profile && !opts?.force && ageOk) {
    return {
      dna: parseJson<ClientDna>(profile.dnaData, emptyDna()),
      evidence: parseJson<DnaEvidence[]>(profile.dnaEvidence, []),
      confidence: profile.dnaConfidence,
      updatedAt: profile.dnaUpdatedAt ? new Date(profile.dnaUpdatedAt).toISOString() : null,
    }
  }
  return recomputeDna(userId)
}

function emptyDna(): ClientDna {
  return { locations: [], propertyTypes: [], amenities: [], sources: {}, fields: 0, evidenceCount: 0, confidence: 0 }
}

/** Rebuild DNA from evidence (existing USER_EDIT entries + freshly collected interactions). */
export async function recomputeDna(userId: string): Promise<DnaSnapshot> {
  const profile = await db.userProfile.findUnique({ where: { userId } })
  const manual = profile
    ? parseJson<DnaEvidence[]>(profile.dnaEvidence, []).filter((e) => e.source === 'USER_EDIT')
    : []
  let interactions: DnaEvidence[] = []
  try {
    interactions = await collectEvidence(userId)
  } catch (e) {
    console.error('[dna] collect failed:', e)
  }

  const evidence = dedupeEvidence([...interactions, ...manual])
  const dna = mergeEvidence(evidence)
  const now = new Date()

  if (!profile) {
    // No profile row yet — create a minimal one so DNA persists
    const created = await db.userProfile.create({ data: { userId, dnaData: JSON.stringify(dna), dnaEvidence: JSON.stringify(evidence), dnaConfidence: dna.confidence, dnaUpdatedAt: now } })
    return { dna, evidence, confidence: dna.confidence, updatedAt: created.dnaUpdatedAt?.toISOString() ?? now.toISOString() }
  }

  await db.userProfile.update({
    where: { userId },
    data: { dnaData: JSON.stringify(dna), dnaEvidence: JSON.stringify(evidence), dnaConfidence: dna.confidence, dnaUpdatedAt: now },
  })
  return { dna, evidence, confidence: dna.confidence, updatedAt: now.toISOString() }
}

/** Append evidence captured from a live interaction (chat hook, watch, booking…). */
export async function recordDnaEvidence(userId: string, entries: DnaEvidence[]): Promise<void> {
  if (!entries.length) return
  try {
    const profile = await db.userProfile.findUnique({ where: { userId } })
    const existing = profile ? parseJson<DnaEvidence[]>(profile.dnaEvidence, []) : []
    const merged = dedupeEvidence([...existing, ...entries]).slice(-300)
    if (!profile) {
      await db.userProfile.create({ data: { userId, dnaEvidence: JSON.stringify(merged) } })
    } else {
      await db.userProfile.update({ where: { userId }, data: { dnaEvidence: JSON.stringify(merged) } })
    }
    await recomputeDna(userId)
  } catch (e) {
    console.error('[dna] record evidence failed:', e)
  }
}

/** Apply a manual edit by the profile owner. USER_EDIT outranks derived evidence. */
export async function applyUserEdit(userId: string, patch: Partial<ClientDna>): Promise<DnaSnapshot> {
  const at = new Date().toISOString()
  const entries: DnaEvidence[] = []
  if (patch.budget !== undefined) entries.push({ field: 'budget', value: patch.budget, source: 'USER_EDIT', at })
  if (patch.locations !== undefined) entries.push({ field: 'locations', value: patch.locations, source: 'USER_EDIT', at })
  if (patch.propertyTypes !== undefined) entries.push({ field: 'propertyTypes', value: patch.propertyTypes, source: 'USER_EDIT', at })
  if (patch.bedrooms !== undefined) entries.push({ field: 'bedrooms', value: patch.bedrooms, source: 'USER_EDIT', at })
  if (patch.area !== undefined) entries.push({ field: 'area', value: patch.area, source: 'USER_EDIT', at })
  if (patch.listingType !== undefined) entries.push({ field: 'listingType', value: patch.listingType, source: 'USER_EDIT', at })
  if (patch.financial !== undefined) entries.push({ field: 'financial', value: patch.financial, source: 'USER_EDIT', at })
  if (patch.intent !== undefined) entries.push({ field: 'intent', value: patch.intent, source: 'USER_EDIT', at })
  if (patch.urgency !== undefined) entries.push({ field: 'urgency', value: patch.urgency, source: 'USER_EDIT', at })
  if (patch.amenities !== undefined) entries.push({ field: 'amenities', value: patch.amenities, source: 'USER_EDIT', at })
  if (!entries.length) return getClientDna(userId, { force: true })

  // Replace previous USER_EDIT entries for the patched fields, keep the rest
  const profile = await db.userProfile.findUnique({ where: { userId } })
  const existing = profile ? parseJson<DnaEvidence[]>(profile.dnaEvidence, []) : []
  const patchedFields = new Set(entries.map((e) => e.field))
  const kept = existing.filter((e) => !(e.source === 'USER_EDIT' && patchedFields.has(e.field)))
  const next = dedupeEvidence([...kept, ...entries])
  if (!profile) {
    await db.userProfile.create({ data: { userId, dnaEvidence: JSON.stringify(next) } })
  } else {
    await db.userProfile.update({ where: { userId }, data: { dnaEvidence: JSON.stringify(next) } })
  }
  await recomputeDna(userId)
  return getClientDna(userId, { force: true })
}
