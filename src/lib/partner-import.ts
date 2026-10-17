import { z } from 'zod'
import { randomBytes } from 'crypto'
import { db } from '@/lib/db'

// ────────────────────────────────────────────────────────────────
// Generic PARTNER catalog importer (Nawy Partners / any broker feed).
// No live credentials exist, so every path works in PREVIEW with the
// embedded sample fixture and goes live by config only (per-request
// source config in the POST body — held in memory, never persisted,
// never logged).
//
// Modes mirror src/lib/nawy-import.ts idioms:
//   PREVIEW → fetch + map (≤20 rows), ZERO writes.
//   IMPORT  → project target: writes PENDING/inactive drafts only —
//             drafts never auto-publish (house rule); any `publish`
//             flag is ignored. unit target: writes real Unit rows on
//             an existing project (see TARGETS below).
//
// ─── TARGETS ────────────────────────────────────────────────────
// `target: 'project' | 'unit'` (body flag, default 'project' — the
// legacy behaviour, unchanged).
//   'project' → every row becomes a PROJECT draft (PENDING/inactive).
//   'unit'    → every row becomes a real Unit row on an EXISTING
//               project matched by EXACT slug. Projects are NEVER
//               created implicitly in unit mode; an unknown slug is a
//               row error. Unit visibility follows the parent project,
//               so units on a PENDING draft project stay hidden until
//               the CEO approves it (same rule as the developer/CEO
//               unit routes — approval status never blocks the write).
//
// ─── UNIT-MODE FEED ROW SHAPE (CSV header / JSON keys) ──────────
//   project | name | unitType | listingType | area | price |
//   bedrooms? | bathrooms? | unitNumber? | floor? | status?
// Required: project, name, unitType, listingType, area, price.
//   project    → target project slug (exact match, read-only lookup)
//   area       → Unit.area (m², positive number; feed column "area"
//                is mapped onto our numeric "size" field — see
//                UNIT_DEFAULT_FIELD_MAP; a numeric "size"/"area"
//                column also works)
//   listingType is REQUIRED — the schema vocabulary is free-form with
//     no @default, so 'SALE' is NOT a universal default → no implicit
//     default. status defaults to 'AVAILABLE' (Unit @default).
//   images (optional extra column) → Unit.gallery JSON array via
//     toImages(); not required by the shape above.
// Strict: a row missing name/project/area/price/unitType/listingType
//   is an ERROR row — it writes nothing (no partial writes).
// ────────────────────────────────────────────────────────────────

// ─── caps (timeout mirrors nawy-import's 15s; size cap is new) ───
const FETCH_TIMEOUT_MS = 15_000
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB — broker feeds are small; refuse more
const PREVIEW_MAX = 20
const IMPORT_MAX = 50
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

// ─── our canonical fields a partner row maps onto ───────────────
// Per-target scopes (a row is only warned about fields its target uses):
export const PROJECT_OUR_FIELDS = [
  'name',
  'area',
  'price',
  'type',
  'bedrooms',
  'size',
  'images',
  'status',
] as const

export const UNIT_OUR_FIELDS = [
  'project',
  'name',
  'unitType',
  'listingType',
  'size',
  'price',
  'bedrooms',
  'bathrooms',
  'unitNumber',
  'floor',
  'finishingType',
  'status',
  'images',
] as const

// Public union (docs/GET surface). The first 8 entries are the original
// project fields — order kept for backward compatibility.
export const PARTNER_OUR_FIELDS = [
  ...PROJECT_OUR_FIELDS,
  'project',
  'bathrooms',
  'unitType',
  'listingType',
  'unitNumber',
  'floor',
  'finishingType',
] as const
export type PartnerOurField = (typeof PARTNER_OUR_FIELDS)[number]

export type PartnerTarget = 'project' | 'unit'

// ─── source config (per-request only — never persisted) ─────────
export const partnerKindZ = z.enum(['rest-json', 'csv', 'xml'])

export const partnerAuthZ = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bearer'), token: z.string().min(1).max(2000) }),
  z.object({
    type: z.literal('basic'),
    username: z.string().min(1).max(500),
    password: z.string().min(1).max(1000),
  }),
  z.object({
    type: z.literal('apikey'),
    key: z.string().min(1).max(200),
    value: z.string().min(1).max(2000),
    in: z.enum(['header', 'query']).default('header'),
  }),
])

// fieldMap: THEIR field name → OUR canonical field. Only values in
// PARTNER_OUR_FIELDS are honoured; anything else is reported as a
// warning and ignored.
export const partnerSourceConfigZ = z.object({
  kind: partnerKindZ,
  url: z
    .string()
    .url()
    .refine(
      (u) => {
        try {
          const p = new URL(u).protocol
          return p === 'http:' || p === 'https:'
        } catch {
          return false
        }
      },
      'Only http(s) feed URLs are allowed'
    ),
  auth: partnerAuthZ.nullable().default(null),
  // dot-path to the row array inside a JSON payload, e.g. "data.projects".
  // Empty = whole payload must be the array (or a single row object).
  dataPath: z.string().max(200).optional().default(''),
  fieldMap: z.record(z.string(), z.string()).default({}),
})

export type PartnerSourceConfig = z.infer<typeof partnerSourceConfigZ>
export type PartnerAuth = z.infer<typeof partnerAuthZ>

// POST body: source required unless useSample (offline fixture path).
// `target` selects the destination row type — default 'project' keeps the
// legacy behaviour byte-for-byte (export/UX preview is backward compatible).
export const partnerImportBodyZ = z
  .object({
    mode: z.enum(['PREVIEW', 'IMPORT']),
    target: z.enum(['project', 'unit']).optional().default('project'),
    useSample: z.boolean().optional().default(false),
    limit: z.number().int().min(1).max(IMPORT_MAX).optional().default(20),
    source: partnerSourceConfigZ.optional(),
    fieldMap: z.record(z.string(), z.string()).optional(), // overrides source.fieldMap
  })
  .superRefine((v, ctx) => {
    if (!v.useSample && !v.source) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'source config is required (or set useSample)', path: ['source'] })
    }
  })

export type PartnerImportBody = z.infer<typeof partnerImportBodyZ>

// ─── defaults + config schema (surfaced by GET for the owner) ───
export const DEFAULT_FIELD_MAP: Record<string, PartnerOurField> = {
  project_title: 'name',
  zone: 'area',
  list_price: 'price',
  category: 'type',
  rooms: 'bedrooms',
  plot_size: 'size',
  photo_links: 'images',
  availability: 'status',
}

// Unit-mode defaults — identity map onto the documented unit feed shape
// (project | name | unitType | listingType | area | price | bedrooms? |
// bathrooms? | unitNumber? | floor? | status?). NOTE: the feed column
// `area` lands on our numeric `size` field, which is what Unit.area takes
// (our project-mode `area` is a free-text location string). `size`,
// `finishing_type`/`finishingType` are extra optional column aliases so a
// feed without them still maps warning-free.
export const UNIT_DEFAULT_FIELD_MAP: Record<string, PartnerOurField> = {
  project: 'project',
  name: 'name',
  unitType: 'unitType',
  listingType: 'listingType',
  area: 'size',
  size: 'size',
  price: 'price',
  bedrooms: 'bedrooms',
  bathrooms: 'bathrooms',
  unitNumber: 'unitNumber',
  floor: 'floor',
  status: 'status',
  images: 'images',
  finishing_type: 'finishingType',
  finishingType: 'finishingType',
}

export const PARTNER_CONFIG_SCHEMA = {
  target: { type: "'project' | 'unit'", required: false, note: "Body-level destination flag. Default 'project' (legacy: every row becomes a PENDING/inactive project draft). 'unit' writes real Unit rows onto an existing project matched by exact slug — unknown slugs are row errors, projects are never created implicitly." },
  kind: { type: "'rest-json' | 'csv' | 'xml'", required: true, note: 'Feed format. JSON + CSV fully supported; XML is basic flat-record parsing only (see limits).' },
  url: { type: 'string (http/https URL)', required: true, note: 'Feed endpoint. Query strings are redacted in all logs/errors.' },
  auth: {
    type: "null | { type: 'bearer', token } | { type: 'basic', username, password } | { type: 'apikey', key, value, in: 'header'|'query' }",
    required: false,
    note: 'Sent per-request in the POST body only. Held in memory, never stored, never logged.',
  },
  dataPath: { type: 'string (dot-path)', required: false, note: "JSON only: path to the row array, e.g. 'data.projects'. Empty = payload root." },
  fieldMap: {
    type: 'Record<their-field, our-field>',
    required: true,
    note: `Their-field → our-field. Our fields: ${PARTNER_OUR_FIELDS.join(', ')}. Unmapped source fields are ignored with a warning.`,
  },
} as const

// ─── sample fixture (clearly fake; offline PREVIEW path) ────────
// NOTE: kept inline (not a separate JSON file) so the importer ships
// as exactly two new files. Served via `useSample: true` — no fetch.
export const PARTNER_SAMPLE_ROWS: Record<string, unknown>[] = [
  { ext_id: 'SAMPLE-001', project_title: 'SAMPLE Project Palm Oasis', zone: 'SAMPLE District, New Cairo', list_price: '8500000', category: 'Apartment', rooms: '3', plot_size: '145', photo_links: 'https://example.com/sample1a.jpg|https://example.com/sample1b.jpg', availability: 'available', extra_notes: 'ignored field demo' },
  { ext_id: 'SAMPLE-002', project_title: 'SAMPLE Project Coral Bay', zone: 'SAMPLE Coast, Ain Sokhna', list_price: 12200000, category: 'Chalet', rooms: 2, plot_size: 110, photo_links: 'https://example.com/sample2a.jpg', availability: 'available' },
  { ext_id: 'SAMPLE-003', project_title: 'SAMPLE Project Olive Hills', zone: 'SAMPLE Ridge, 6th of October', list_price: '31000000', category: 'Villa', rooms: '5', plot_size: '420', photo_links: '', availability: 'offplan' },
  { ext_id: 'SAMPLE-004', project_title: 'SAMPLE Project Downtown Lofts', zone: 'SAMPLE Core, New Capital', list_price: '4950000', category: 'Studio', rooms: '1', plot_size: '68', photo_links: 'https://example.com/sample4a.jpg;https://example.com/sample4b.jpg', availability: 'available' },
  { ext_id: 'SAMPLE-005', project_title: 'SAMPLE Project (broken row demo)', zone: '', list_price: 'not-a-price', category: 'Penthouse', rooms: '4', plot_size: '260', photo_links: 'not-a-url', availability: 'reserved' },
]

// Unit-mode fixture (offline PREVIEW path for target:'unit'). Slugs are
// intentionally fake: preview reports them as unknown-project-slug errors
// (read-only lookup — a unit import NEVER creates a project). Row 3 is a
// missing-listingType demo, row 5 a missing-area demo.
export const PARTNER_UNIT_SAMPLE_ROWS: Record<string, unknown>[] = [
  { project: 'sample-palm-oasis', name: 'SAMPLE A-101', unitType: 'Apartment', listingType: 'SALE', area: '145', price: '8500000', bedrooms: '3', bathrooms: '2', unitNumber: 'A-101', floor: '1', status: 'available', images: 'https://example.com/unit1a.jpg|https://example.com/unit1b.jpg' },
  { project: 'sample-coral-bay', name: 'SAMPLE B-202', unitType: 'Chalet', listingType: 'SALE', area: '110', price: 12200000, bedrooms: 2, bathrooms: '1', unitNumber: 'B-202', floor: '2' },
  { project: 'sample-olive-hills', name: 'SAMPLE C-303', unitType: 'Villa', listingType: '', area: '420', price: '31000000', bedrooms: '5', bathrooms: '3' },
  { project: 'sample-downtown-lofts', name: 'SAMPLE D-404', unitType: 'Studio', listingType: 'RENT', area: '68', price: '4950000', bedrooms: '1', floor: '4', finishingType: 'Finished' },
  { project: 'sample-broken-row-demo', name: 'SAMPLE E-505', unitType: 'Penthouse', listingType: 'SALE', area: '', price: 'not-a-price', bedrooms: '4' },
]

// ─── fetch with timeout + size cap (credential never logged) ─────

export class PartnerFetchError extends Error {
  upstreamStatus: number | null
  constructor(message: string, upstreamStatus: number | null = null) {
    super(message)
    this.upstreamStatus = upstreamStatus
  }
}

// Redact query strings (may carry an apikey) before any log/error.
export function redactUrl(url: string): string {
  try {
    const u = new URL(url)
    u.search = ''
    return u.toString()
  } catch {
    return '[feed url]'
  }
}

function authHeaders(auth: PartnerAuth | null, url: string): { headers: Record<string, string>; url: string } {
  const headers: Record<string, string> = { 'user-agent': UA, accept: '*/*' }
  let out = url
  if (!auth) return { headers, url: out }
  if (auth.type === 'bearer') {
    headers.authorization = `Bearer ${auth.token}`
  } else if (auth.type === 'basic') {
    headers.authorization = `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`
  } else if (auth.in === 'header') {
    headers[auth.key.toLowerCase()] = auth.value
  } else {
    const u = new URL(out)
    u.searchParams.append(auth.key, auth.value)
    out = u.toString()
  }
  return { headers, url: out }
}

export async function fetchPartnerText(source: PartnerSourceConfig): Promise<string> {
  const { headers, url } = authHeaders(source.auth ?? null, source.url)
  const safe = redactUrl(source.url)
  let res: Response
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: 'no-store' })
  } catch (err) {
    throw new PartnerFetchError(
      err instanceof Error && err.name === 'TimeoutError' ? `Feed timed out after 15s: ${safe}` : `Feed unreachable: ${safe}`
    )
  }
  if (res.status === 401 || res.status === 403) {
    // passthrough status, generic message — never echo credential hints
    throw new PartnerFetchError(`Feed rejected the credentials (HTTP ${res.status}): ${safe}`, res.status)
  }
  if (!res.ok) throw new PartnerFetchError(`Feed HTTP ${res.status}: ${safe}`)
  // size-capped read (mirror caps: refuse oversized payloads)
  const reader = res.body?.getReader()
  if (!reader) {
    const text = await res.text().catch(() => '')
    if (text.length > MAX_BYTES) throw new PartnerFetchError(`Feed exceeds 5MB cap: ${safe}`)
    return text
  }
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      total += value.byteLength
      if (total > MAX_BYTES) {
        await reader.cancel().catch(() => {})
        throw new PartnerFetchError(`Feed exceeds 5MB cap: ${safe}`)
      }
      chunks.push(value)
    }
  }
  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)))
  return buf.toString('utf8')
}

// ─── parsers (no new deps) ───────────────────────────────────────

function getPath(obj: unknown, path: string): unknown {
  if (!path) return obj
  return path.split('.').reduce<unknown>((acc, k) => {
    if (acc && typeof acc === 'object' && k in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[k]
    }
    return undefined
  }, obj)
}

function asRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
  if (payload && typeof payload === 'object') return [payload as Record<string, unknown>]
  throw new PartnerFetchError('JSON feed did not contain an object or array of rows')
}

export function parseJsonFeed(text: string, dataPath: string): Record<string, unknown>[] {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new PartnerFetchError('Feed is not valid JSON')
  }
  const node = dataPath ? getPath(json, dataPath) : json
  if (node === undefined) throw new PartnerFetchError(`dataPath "${dataPath}" not found in JSON feed`)
  return asRows(node)
}

// Minimal quote-aware CSV parser (RFC-4180 subset: quoted fields,
// escaped "" quotes, CRLF). Enough for broker exports.
export function parseCsvFeed(text: string): Record<string, unknown>[] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  const s = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((f) => f.trim() !== '')) rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  row.push(field)
  if (row.some((f) => f.trim() !== '')) rows.push(row)
  if (rows.length < 2) throw new PartnerFetchError('CSV feed has no header + data rows')
  const header = rows[0].map((h) => h.trim())
  return rows.slice(1).map((r) => {
    const rec: Record<string, unknown> = {}
    header.forEach((h, idx) => {
      if (h) rec[h] = (r[idx] ?? '').trim()
    })
    return rec
  })
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

// Basic flat-record XML only: finds the most frequent repeating
// element as the record tag and reads its flat <k>v</k> children.
// LIMITS (by design, no new deps): no namespaces, no attributes,
// no nested objects — nested markup is flattened to text. Prefer
// JSON or CSV when the partner offers them.
export function parseXmlFeed(text: string): Record<string, unknown>[] {
  const clean = text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\?[^?]*\?>/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .trim()
  if (!clean) throw new PartnerFetchError('XML feed is empty')
  const counts = new Map<string, number>()
  for (const m of clean.matchAll(/<([A-Za-z_][\w.-]*)(\s[^>]*)?>/g)) {
    counts.set(m[1], (counts.get(m[1]) ?? 0) + 1)
  }
  if (!counts.size) throw new PartnerFetchError('XML feed has no elements')
  // record tag = most frequent non-root tag (root typically occurs once)
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const recordTag = sorted.find(([, n]) => n > 1)?.[0]
  if (!recordTag) {
    // single record: flat children of the root
    const inner = clean.replace(/^<[^>]+>/, '').replace(/<\/[^>]+>\s*$/, '')
    return [flatXmlPairs(inner)]
  }
  const out: Record<string, unknown>[] = []
  const re = new RegExp(`<${recordTag}(\\s[^>]*)?>([\\s\\S]*?)<\\/${recordTag}>`, 'g')
  for (const m of clean.matchAll(re)) out.push(flatXmlPairs(m[2]))
  if (!out.length) throw new PartnerFetchError(`XML feed: no <${recordTag}> records parsed`)
  return out
}

function flatXmlPairs(inner: string): Record<string, unknown> {
  const rec: Record<string, unknown> = {}
  for (const m of inner.matchAll(/<([A-Za-z_][\w.-]*)(\s[^>]*)?>([\s\S]*?)<\/\1>/g)) {
    const val = decodeXmlEntities(m[3].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    if (m[1] && !(m[1] in rec)) rec[m[1]] = val
  }
  return rec
}

// ─── mapping a raw row → our shape ──────────────────────────────

const partnerMappedRowZ = z.object({
  name: z.string().min(1).max(200),
  area: z.string().max(200).nullish(),
  price: z.number().positive().nullish(),
  type: z.string().max(50).nullish(),
  bedrooms: z.number().int().min(0).max(50).nullish(),
  size: z.number().positive().nullish(),
  images: z.array(z.string().url()).default([]),
  status: z.string().max(50).nullish(),
})

export type PartnerMappedRow = z.infer<typeof partnerMappedRowZ>

// Unit destination row. Required = name, project, unitType, listingType,
// area, price (strict: a missing one is a row ERROR, never a partial write).
// unitType/listingType are pass-through trimmed strings (free-form vocab —
// mirrors the developer/CEO unit routes, which do no vocabulary coercion).
// status defaults to 'AVAILABLE' (the Unit schema default).
const partnerUnitMappedRowZ = z.object({
  name: z.string().min(1).max(200),
  project: z.string().min(1).max(200), // target project slug — exact match
  unitType: z.string().min(1).max(50),
  listingType: z.string().min(1).max(50),
  area: z.number().positive(), // Unit.area (m²)
  price: z.number().min(0),
  bedrooms: z.number().int().min(0).max(50).nullish(),
  bathrooms: z.number().int().min(0).max(50).nullish(),
  unitNumber: z.string().max(100).nullish(),
  floor: z.number().int().nullish(),
  finishingType: z.string().max(50).nullish(),
  status: z.string().min(1).max(50).default('AVAILABLE'),
  images: z.array(z.string().url()).default([]),
})

export type PartnerUnitMappedRow = z.infer<typeof partnerUnitMappedRowZ>

function toNum(v: unknown): number | null {
  if (typeof v === 'number' && isFinite(v)) return v
  if (typeof v === 'string') {
    const neg = /^\s*-/.test(v)
    const digits = v.replace(/[^\d.]/g, '')
    if (!digits) return null
    const n = Number(digits)
    if (!isFinite(n)) return null
    return neg ? -n : n
  }
  return null
}

function toInt(v: unknown): number | null {
  const n = toNum(v)
  return n == null ? null : Math.trunc(n)
}

function toImages(v: unknown): string[] {
  let parts: unknown[] = []
  if (Array.isArray(v)) {
    parts = v
  } else if (typeof v === 'string') {
    const t = v.trim()
    if (!t) return []
    if (t.startsWith('[')) {
      try {
        const parsed: unknown = JSON.parse(t)
        parts = Array.isArray(parsed) ? parsed : [t]
      } catch {
        parts = [t]
      }
    } else {
      parts = t.split(/[|\n;]+/).flatMap((s) => s.split(',').filter((x) => /https?:\/\//.test(x)).length > 1 ? s.split(',') : [s])
    }
  }
  const out: string[] = []
  for (const p of parts) {
    if (typeof p !== 'string') continue
    const u = p.trim()
    if (/^https?:\/\//.test(u) && !out.includes(u)) out.push(u)
    if (out.length >= 10) break
  }
  return out
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

export interface MappedPartnerRow {
  row: PartnerMappedRow | null
  warnings: string[]
  error: string | null
}

export interface MappedUnitPartnerRow {
  row: PartnerUnitMappedRow | null
  warnings: string[]
  error: string | null
}

// invert their→our map: canonical → their-field(s), in fieldMap order.
// Values are arrays so a target can fall back across several source keys;
// legacy (project) code only ever reads the first one.
function invertFieldMap(fieldMap: Record<string, string>, warnings: string[]): Map<string, string[]> {
  const ourToTheir = new Map<string, string[]>()
  for (const [their, our] of Object.entries(fieldMap)) {
    if (!(PARTNER_OUR_FIELDS as readonly string[]).includes(our)) {
      warnings.push(`fieldMap maps "${their}" to unknown our-field "${our}" (ignored)`)
      continue
    }
    const list = ourToTheir.get(our)
    if (list) list.push(their)
    else ourToTheir.set(our, [their])
  }
  return ourToTheir
}

// target 'project' (default) → legacy row shape, unchanged behaviour.
// target 'unit' → strict Unit row (missing required field = error row).
export function mapPartnerRow(
  raw: Record<string, unknown>,
  fieldMap: Record<string, string>
): MappedPartnerRow
export function mapPartnerRow(
  raw: Record<string, unknown>,
  fieldMap: Record<string, string>,
  target: 'unit'
): MappedUnitPartnerRow
export function mapPartnerRow(
  raw: Record<string, unknown>,
  fieldMap: Record<string, string>,
  target: PartnerTarget
): MappedPartnerRow | MappedUnitPartnerRow
export function mapPartnerRow(
  raw: Record<string, unknown>,
  fieldMap: Record<string, string>,
  target: PartnerTarget = 'project'
): MappedPartnerRow | MappedUnitPartnerRow {
  const warnings: string[] = []
  const ourToTheir = invertFieldMap(fieldMap, warnings)
  // warn only about the fields the selected target actually consumes —
  // keeps project-mode warnings byte-identical to the legacy importer.
  const scope = target === 'unit' ? UNIT_OUR_FIELDS : PROJECT_OUR_FIELDS
  for (const f of scope) {
    if (!ourToTheir.has(f)) warnings.push(`no source field mapped to "${f}"`)
  }
  if (target === 'unit') return mapUnitPartnerRow(raw, warnings, ourToTheir)
  return mapProjectPartnerRow(raw, warnings, ourToTheir)
}

function mapProjectPartnerRow(
  raw: Record<string, unknown>,
  warnings: string[],
  ourToTheir: Map<string, string[]>
): MappedPartnerRow {
  const get = (f: PartnerOurField): unknown => {
    const their = ourToTheir.get(f)?.[0] // first key wins (legacy)
    return their ? raw[their] : undefined
  }

  const nameRaw = get('name')
  const name = typeof nameRaw === 'string' ? nameRaw.trim() : typeof nameRaw === 'number' ? String(nameRaw) : ''
  if (!name) return { row: null, warnings, error: 'missing required "name"' }

  const typeRaw = get('type')
  const images = toImages(get('images'))
  const imagesRaw = get('images')
  if (imagesRaw != null && (typeof imagesRaw !== 'string' || imagesRaw.trim() !== '') && !Array.isArray(imagesRaw) && images.length === 0 && String(imagesRaw).trim() !== '') {
    warnings.push('"images" had no usable http(s) URLs (dropped)')
  }

  const candidate = {
    name: name.slice(0, 200),
    area: (() => {
      const a = get('area')
      if (a == null || a === '') return null
      const t = String(a).trim()
      return t ? t.slice(0, 200) : null
    })(),
    price: (() => {
      const p = get('price')
      if (p == null || p === '') return null
      const n = toNum(p)
      if (n == null || n <= 0) {
        warnings.push(`unparseable "price" ${JSON.stringify(String(p)).slice(0, 40)} (set to null)`)
        return null
      }
      return n
    })(),
    type: typeof typeRaw === 'string' && typeRaw.trim() ? norm(typeRaw).toUpperCase().slice(0, 50) : null,
    bedrooms: (() => {
      const b = get('bedrooms')
      if (b == null || b === '') return null
      const n = toInt(b)
      if (n == null || n < 0 || n > 50) {
        warnings.push(`unparseable "bedrooms" ${JSON.stringify(String(b)).slice(0, 40)} (set to null)`)
        return null
      }
      return n
    })(),
    size: (() => {
      const s = get('size')
      if (s == null || s === '') return null
      const n = toNum(s)
      if (n == null || n <= 0) {
        warnings.push(`unparseable "size" ${JSON.stringify(String(s)).slice(0, 40)} (set to null)`)
        return null
      }
      return n
    })(),
    images,
    status: (() => {
      const st = get('status')
      if (st == null || st === '') return null
      const t = String(st).trim()
      return t ? t.toUpperCase().slice(0, 50) : null
    })(),
  }

  const parsed = partnerMappedRowZ.safeParse(candidate)
  if (!parsed.success) {
    return { row: null, warnings, error: parsed.error.issues[0]?.message ?? 'row failed validation' }
  }
  return { row: parsed.data, warnings, error: null }
}

// ─── UNIT target mapping (STRICT: every required field must be there,
//      an invalid value is a row error — never a partial row) ──────
function mapUnitPartnerRow(
  raw: Record<string, unknown>,
  warnings: string[],
  ourToTheir: Map<string, string[]>
): MappedUnitPartnerRow {
  // Prefer a mapped source key that actually carries a value in THIS row,
  // so a feed overriding e.g. "plot_size" alongside the default "area" key
  // still resolves. (Legacy project mode reads only the FIRST mapped key.)
  const get = (f: string): unknown => {
    const keys = ourToTheir.get(f)
    if (!keys || keys.length === 0) return undefined
    for (const k of keys) {
      const v = raw[k]
      if (v !== undefined && v !== null && v !== '') return v
    }
    return raw[keys[0]]
  }
  const firstNonEmpty = (...vals: unknown[]): unknown =>
    vals.find((v) => v !== undefined && v !== null && v !== '')

  const nameRaw = get('name')
  const name = typeof nameRaw === 'string' ? nameRaw.trim() : typeof nameRaw === 'number' ? String(nameRaw) : ''
  if (!name) return { row: null, warnings, error: 'missing required "name"' }

  const project = (() => {
    const p = get('project')
    if (p == null) return ''
    return String(p).trim()
  })()
  if (!project) return { row: null, warnings, error: 'missing required "project" (target project slug)' }

  // unitType falls back to the legacy our-field "type" (category) when the
  // feed reuses a project-style field map — values pass through trimmed
  // (free-form vocabulary, no coercion: mirrors the developer/CEO unit routes).
  const unitType = (() => {
    const t = firstNonEmpty(get('unitType'), get('type'))
    if (t == null) return null
    const s = String(t).trim()
    return s ? s.slice(0, 50) : null
  })()
  if (!unitType) return { row: null, warnings, error: 'missing required "unitType"' }

  const listingType = (() => {
    const t = get('listingType')
    if (t == null) return null
    const s = String(t).trim()
    return s ? s.slice(0, 50) : null
  })()
  if (!listingType) {
    return { row: null, warnings, error: 'missing required "listingType" (e.g. SALE | RENT — schema has no default)' }
  }

  // Unit.area (m²): our numeric "size" first (feed column `area` maps onto
  // it), then our free-text "area" — whichever yields a positive number.
  const area = (() => {
    const vals = [get('size'), get('area')].filter((v) => v !== undefined && v !== null && v !== '')
    if (!vals.length) return null
    for (const v of vals) {
      const n = toNum(v)
      if (n != null && n > 0) return { ok: true as const, value: n }
    }
    return { ok: false as const, raw: String(vals[0]) }
  })()
  if (area === null) return { row: null, warnings, error: 'missing required "area" (numeric m² — map a size/area column)' }
  if (!area.ok) {
    return { row: null, warnings, error: `invalid "area" ${JSON.stringify(area.raw.slice(0, 40))} (expected a positive number)` }
  }

  const price = (() => {
    const p = get('price')
    if (p == null || p === '') return null
    const n = toNum(p)
    if (n == null || n < 0) return { ok: false as const, raw: String(p) }
    return { ok: true as const, value: n }
  })()
  if (price === null) return { row: null, warnings, error: 'missing required "price"' }
  if (!price.ok) {
    return { row: null, warnings, error: `invalid "price" ${JSON.stringify(price.raw.slice(0, 40))} (expected a number)` }
  }

  const images = toImages(get('images'))
  const imagesRaw = get('images')
  if (imagesRaw != null && (typeof imagesRaw !== 'string' || imagesRaw.trim() !== '') && !Array.isArray(imagesRaw) && images.length === 0 && String(imagesRaw).trim() !== '') {
    warnings.push('"images" had no usable http(s) URLs (dropped)')
  }

  const intOrNull = (f: string, label: string, max: number): number | null => {
    const v = get(f)
    if (v == null || v === '') return null
    const n = toInt(v)
    if (n == null || n < 0 || n > max) {
      warnings.push(`unparseable "${label}" ${JSON.stringify(String(v)).slice(0, 40)} (set to null)`)
      return null
    }
    return n
  }

  const candidate = {
    name: name.slice(0, 200),
    project,
    unitType,
    listingType,
    area: area.value,
    price: price.value,
    bedrooms: intOrNull('bedrooms', 'bedrooms', 50),
    bathrooms: intOrNull('bathrooms', 'bathrooms', 50),
    unitNumber: (() => {
      const u = get('unitNumber')
      if (u == null) return null
      const s = String(u).trim()
      return s ? s.slice(0, 100) : null
    })(),
    floor: (() => {
      const f = get('floor')
      if (f == null || f === '') return null
      const n = toInt(f)
      if (n == null) {
        warnings.push(`unparseable "floor" ${JSON.stringify(String(f)).slice(0, 40)} (set to null)`)
        return null
      }
      return n
    })(),
    finishingType: (() => {
      const t = get('finishingType')
      if (t == null) return null
      const s = String(t).trim()
      return s ? s.slice(0, 50) : null
    })(),
    status: (() => {
      const st = get('status')
      if (st == null || st === '') return 'AVAILABLE' // Unit @default
      const t = String(st).trim()
      return t ? t.toUpperCase().slice(0, 50) : 'AVAILABLE'
    })(),
    images,
  }

  const parsed = partnerUnitMappedRowZ.safeParse(candidate)
  if (!parsed.success) {
    return { row: null, warnings, error: parsed.error.issues[0]?.message ?? 'row failed validation' }
  }
  return { row: parsed.data, warnings, error: null }
}

// ─── PREVIEW (no writes — unit mode only READS project slugs) ────

export interface PartnerPreviewRow {
  index: number
  mapped: PartnerMappedRow | PartnerUnitMappedRow | null
  warnings: string[]
  error: string | null
}

export interface PartnerPreview {
  rows: PartnerPreviewRow[]
  sourceFields: string[]
  unmappedSourceFields: string[]
  total: number
  shown: number
  offline: boolean
  target: PartnerTarget
}

const mappedProjectSlug = (m: PartnerPreviewRow['mapped']): string | null =>
  m && 'project' in m ? m.project : null

// Unit-mode preview: read-only exact-slug check against EXISTING projects.
// One findMany, zero writes — an unknown slug rejects the row (preview and
// import behave identically) and NEVER triggers a project create.
async function markUnknownProjectSlugs(rows: PartnerPreviewRow[]): Promise<void> {
  const slugs = [...new Set(rows.map((r) => mappedProjectSlug(r.mapped)).filter((s): s is string => !!s))]
  if (!slugs.length) return
  const existing = await db.project.findMany({ where: { slug: { in: slugs } }, select: { slug: true } })
  const known = new Set(existing.map((p) => p.slug))
  for (const r of rows) {
    const slug = mappedProjectSlug(r.mapped)
    if (!slug || known.has(slug)) continue
    r.mapped = null
    r.error = `unknown project slug "${slug}" — row rejected (unit imports never create projects)`
  }
}

export async function previewPartnerFeed(
  source: PartnerSourceConfig,
  opts: { limit?: number; fieldMapOverride?: Record<string, string>; target?: PartnerTarget }
): Promise<PartnerPreview> {
  const target: PartnerTarget = opts.target ?? 'project'
  const fieldMap = opts.fieldMapOverride ?? source.fieldMap ?? {}
  const text = await fetchPartnerText(source)
  const rawRows =
    source.kind === 'csv'
      ? parseCsvFeed(text)
      : source.kind === 'xml'
        ? parseXmlFeed(text)
        : parseJsonFeed(text, source.dataPath || '')
  const total = rawRows.length
  const slice = rawRows.slice(0, Math.min(opts.limit ?? PREVIEW_MAX, PREVIEW_MAX))
  const sourceFields = [...new Set(rawRows.flatMap((r) => Object.keys(r)))].sort()
  const unmappedSourceFields = sourceFields.filter((f) => !(f in fieldMap))
  const rows = slice.map((raw, i) => {
    const m = mapPartnerRow(raw, fieldMap, target)
    return { index: i, mapped: m.row, warnings: m.warnings, error: m.error }
  })
  if (target === 'unit') await markUnknownProjectSlugs(rows) // read-only
  return { rows, sourceFields, unmappedSourceFields, total, shown: rows.length, offline: false, target }
}

// Offline fixture path — no fetch, lets the owner test mapping today.
// NOTE: async since unit mode resolves project slugs (read-only lookup).
// Project mode performs NO db access at all — identical result to before.
export async function previewPartnerSample(
  fieldMap: Record<string, string>,
  limit = PARTNER_SAMPLE_ROWS.length,
  target: PartnerTarget = 'project'
): Promise<PartnerPreview> {
  const fixture = target === 'unit' ? PARTNER_UNIT_SAMPLE_ROWS : PARTNER_SAMPLE_ROWS
  const slice = fixture.slice(0, Math.min(limit, PREVIEW_MAX))
  const sourceFields = [...new Set(fixture.flatMap((r) => Object.keys(r)))].sort()
  const unmappedSourceFields = sourceFields.filter((f) => !(f in fieldMap))
  const rows = slice.map((raw, i) => {
    const m = mapPartnerRow(raw, fieldMap, target)
    return { index: i, mapped: m.row, warnings: m.warnings, error: m.error }
  })
  if (target === 'unit') await markUnknownProjectSlugs(rows) // read-only
  return {
    rows,
    sourceFields,
    unmappedSourceFields,
    total: fixture.length,
    shown: rows.length,
    offline: true,
    target,
  }
}

// ─── IMPORT · project target (drafts ONLY) ──────────────────────

export interface PartnerImportResult {
  imported: { slug: string; name: string }[]
  skipped: { name: string; reason: string }[]
  errors: { index: number; error: string }[]
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'partner-project'

async function resolvePartnerDeveloper(): Promise<string> {
  const companyName = 'Partner Feed Imports'
  const existing = await db.developerProfile.findFirst({ where: { companyName } })
  if (existing) return existing.id
  const user = await db.user.create({
    data: {
      email: `partner-feed-${randomBytes(4).toString('hex')}@partner-import.test`,
      name: companyName,
      role: 'DEVELOPER',
      isActive: false,
    },
  })
  const profile = await db.developerProfile.create({ data: { userId: user.id, companyName } })
  return profile.id
}

export async function importPartnerRows(mapped: PartnerMappedRow[]): Promise<PartnerImportResult> {
  const result: PartnerImportResult = { imported: [], skipped: [], errors: [] }
  if (!mapped.length) return result

  const baseSlugs = mapped.map((m) => slugify(m.name))
  const existing = await db.project.findMany({
    where: { slug: { in: baseSlugs } },
    select: { slug: true },
  })
  const existingSet = new Set(existing.map((p) => p.slug))
  const seen = new Set<string>()
  const developerId = await resolvePartnerDeveloper()

  for (let i = 0; i < mapped.length; i++) {
    const m = mapped[i]
    let slug = baseSlugs[i]
    if (existingSet.has(slug) || seen.has(slug)) {
      slug = `${slug}-${randomBytes(3).toString('hex')}`
      if (existingSet.has(slug)) {
        result.skipped.push({ name: m.name, reason: 'slug exists' })
        continue
      }
    }
    seen.add(slug)
    try {
      // DRAFT-ONLY: approvalStatus PENDING, inactive, never published.
      const created = await db.project.create({
        data: {
          name: m.name,
          slug,
          address: m.area ?? null,
          status: m.status || 'UNDER_CONSTRUCTION',
          approvalStatus: 'PENDING',
          isActive: false,
          publishedAt: null,
          startPrice: m.price ?? null,
          totalUnits: null,
          completionPercent: 0,
          propertyTypes: JSON.stringify(m.type ? [m.type] : []),
          keywords: JSON.stringify(['partner-feed', `bedrooms:${m.bedrooms ?? '—'}`, `size:${m.size ?? '—'}`]),
          gallery: JSON.stringify(m.images.slice(0, 10)),
          coverImage: m.images[0] ?? null,
          developer: { connect: { id: developerId } },
        },
      })
      result.imported.push({ slug: created.slug, name: created.name })
    } catch (err) {
      result.errors.push({ index: i, error: err instanceof Error ? err.message : 'insert failed' })
    }
  }
  return result
}

// ─── UNIT import (real Unit rows on an EXISTING project) ─────────
// Write-safety guarantees:
//   • projects are NEVER created here — the target project is resolved by
//     EXACT slug with a read-only findMany; unknown slug → row error.
//   • no developer/user is provisioned (unlike project mode) — a Unit only
//     needs projectId.
//   • project approvalStatus does NOT gate the write: mirrors the
//     developer/CEO unit routes ("any approval state — visibility follows
//     the project"), so units on a PENDING draft stay hidden until the CEO
//     approves the project.
//   • each row is written atomically by its own db.unit.create; a failed
//     row reports an error and writes nothing (no partial rows).
const unitCreateData = (m: PartnerUnitMappedRow, projectId: string, slug: string) => ({
  projectId,
  name: m.name,
  slug,
  unitType: m.unitType, // free-form vocab — pass-through trimmed (bulk-route mirror)
  listingType: m.listingType,
  status: m.status, // default 'AVAILABLE' (Unit @default)
  area: m.area,
  price: m.price, // price as given
  pricePerSqm: m.area > 0 ? m.price / m.area : null, // same derivation as the unit routes
  bedrooms: m.bedrooms ?? null,
  bathrooms: m.bathrooms ?? null,
  unitNumber: m.unitNumber ?? null,
  floor: m.floor ?? null,
  finishingType: m.finishingType ?? null,
  gallery: JSON.stringify(m.images.slice(0, 10)), // same toImages() path as project mode
  isSample: false,
  // viewCount/favoriteCount: Prisma @default(0)
})

const isUniqueViolation = (err: unknown): boolean =>
  !!err && typeof err === 'object' && (err as { code?: unknown }).code === 'P2002'

const unitNameSlug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'unit'

export async function importPartnerUnitRows(mapped: PartnerUnitMappedRow[]): Promise<PartnerImportResult> {
  const result: PartnerImportResult = { imported: [], skipped: [], errors: [] }
  if (!mapped.length) return result

  // 1) read-only project lookup by EXACT slug (never created implicitly).
  const projectSlugs = [...new Set(mapped.map((m) => m.project))]
  const projects = await db.project.findMany({
    where: { slug: { in: projectSlugs } },
    select: { id: true, slug: true },
  })
  const projectIdBySlug = new Map(projects.map((p) => [p.slug, p.id]))

  // 2) unit slug = <project-slug>-<unit-name>; uniqueness: -2, -3, … then a
  //    random suffix; the DB @unique + one retry closes any race.
  const bases = mapped.map((m) => `${m.project}-${unitNameSlug(m.name)}`.slice(0, 180))
  const probed = await db.unit.findMany({ where: { slug: { in: bases } }, select: { slug: true } })
  const taken = new Set(probed.map((u) => u.slug))
  const seen = new Set<string>()
  const candidates: (string | null)[] = []
  for (const base of bases) {
    let chosenSlug: string | null = null
    for (let n = 1; n <= 50 && !chosenSlug; n++) {
      const cand = n === 1 ? base : `${base}-${n}`
      if (!taken.has(cand) && !seen.has(cand)) chosenSlug = cand
    }
    for (let t = 0; t < 5 && !chosenSlug; t++) {
      const cand = `${base}-${randomBytes(3).toString('hex')}`
      if (!taken.has(cand) && !seen.has(cand)) chosenSlug = cand
    }
    if (chosenSlug) seen.add(chosenSlug) // in-batch dedupe: same base twice → -2
    candidates.push(chosenSlug)
  }
  // A `-2…-50` variant may already exist without having been probed above.
  const chosen = candidates.filter((c): c is string => !!c)
  const probed2 = await db.unit.findMany({ where: { slug: { in: chosen } }, select: { slug: true } })
  const collided = new Set(probed2.map((u) => u.slug))
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]
    if (!c || !collided.has(c)) continue
    collided.delete(c)
    for (let t = 0; t < 5; t++) {
      const next = `${c}-${randomBytes(3).toString('hex')}`
      if (!collided.has(next) && !seen.has(next)) {
        candidates[i] = next
        seen.add(next)
        break
      }
    }
  }

  for (let i = 0; i < mapped.length; i++) {
    const m = mapped[i]
    const projectId = projectIdBySlug.get(m.project)
    if (!projectId) {
      result.errors.push({
        index: i,
        error: `unknown project slug "${m.project}" — row rejected (projects are never created by unit imports)`,
      })
      continue
    }
    const slug = candidates[i]
    if (!slug) {
      result.errors.push({ index: i, error: 'could not derive a unique unit slug' })
      continue
    }
    try {
      const created = await db.unit.create({ data: unitCreateData(m, projectId, slug) })
      result.imported.push({ slug: created.slug ?? slug, name: created.name })
    } catch (err) {
      if (isUniqueViolation(err)) {
        // slug raced with a concurrent insert → one retry on a fresh suffix
        const retrySlug = `${slug}-${randomBytes(3).toString('hex')}`
        try {
          const created = await db.unit.create({ data: unitCreateData(m, projectId, retrySlug) })
          result.imported.push({ slug: created.slug ?? retrySlug, name: created.name })
          continue
        } catch (retryErr) {
          result.errors.push({ index: i, error: retryErr instanceof Error ? retryErr.message : 'insert failed' })
          continue
        }
      }
      result.errors.push({ index: i, error: err instanceof Error ? err.message : 'insert failed' })
    }
  }
  return result
}
