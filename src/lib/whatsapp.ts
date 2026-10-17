import { ollamaChat } from '@/lib/ai/ollama'

// ─── WhatsApp structured extraction (Ollama, existing infra only) ───
// Reuses `ollamaChat` from src/lib/ai/ollama.ts (same helper the AI chat and
// content-gen paths use). Strict-JSON prompt; the RAW message text is ALWAYS
// kept alongside — on any LLM failure `extracted` is null and the staging
// row still holds everything the CEO needs to review manually.

export interface WhatsAppExtracted {
  name: string | null
  nameArabic: string | null
  city: string | null
  price: number | null
  area: number | null
  downPayment: number | null
  years: number | null
  location: string | null
  description: string | null
  amenities: string[]
}

const EXTRACT_KEYS: (keyof WhatsAppExtracted)[] = [
  'name', 'nameArabic', 'city', 'price', 'area',
  'downPayment', 'years', 'location', 'description', 'amenities',
]

const SYSTEM_PROMPT =
  'You extract Egyptian real-estate listing facts from WhatsApp messages. ' +
  'Output ONLY a JSON object with exactly these keys (null when unknown): ' +
  '{"name","nameArabic","city","price","area","downPayment","years","location","description","amenities"}. ' +
  'Rules: price/area/downPayment/years are numbers or null (price in EGP, downPayment as a percent number); ' +
  'amenities is an array of short strings (empty array when none); all other keys are strings or null; ' +
  'never invent values — use null when the message does not state them. ' +
  'No preamble, no code fences, JSON only.'

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const m = v.replace(/,/g, '').match(/-?\d+(\.\d+)?/)
    if (m) {
      const n = Number(m[0])
      if (Number.isFinite(n)) return n
    }
  }
  return null
}

function toText(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, 2000) : null
}

export function sanitizeExtracted(raw: unknown): WhatsAppExtracted | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const amenities = Array.isArray(r.amenities)
    ? (r.amenities as unknown[]).filter((a): a is string => typeof a === 'string' && a.trim() !== '').map((a) => a.trim().slice(0, 120)).slice(0, 30)
    : []
  return {
    name: toText(r.name),
    nameArabic: toText(r.nameArabic),
    city: toText(r.city),
    price: toNumber(r.price),
    area: toNumber(r.area),
    downPayment: toNumber(r.downPayment),
    years: toNumber(r.years),
    location: toText(r.location),
    description: toText(r.description),
    amenities,
  }
}

export async function extractListingFacts(text: string): Promise<{ extracted: WhatsAppExtracted | null; engine: 'LLM' | 'RAW' }> {
  const input = text.slice(0, 4000)
  if (!input.trim()) return { extracted: null, engine: 'RAW' }
  try {
    const res = await Promise.race([
      ollamaChat([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: input },
      ]),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('llm-timeout')), 45_000)),
    ])
    let content = (res.message?.content || '').trim()
    if (!content) throw new Error('empty llm output')
    // Strip markdown fences if the model wraps the JSON.
    const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(content)
    if (fence) content = fence[1]
    const start = content.indexOf('{')
    const end = content.lastIndexOf('}')
    if (start === -1 || end <= start) throw new Error('no json object')
    const parsed = JSON.parse(content.slice(start, end + 1)) as Record<string, unknown>
    const picked: Record<string, unknown> = {}
    for (const k of EXTRACT_KEYS) picked[k] = (parsed as Record<string, unknown>)[k] ?? null
    const extracted = sanitizeExtracted(picked)
    if (!extracted) throw new Error('unusable extraction')
    return { extracted, engine: 'LLM' }
  } catch {
    return { extracted: null, engine: 'RAW' }
  }
}

// ─── Fuzzy project matching ────────────────────────────────
// Rule (reported to UI agents): normalize both sides (lowercase, collapse
// whitespace, strip punctuation, fold Arabic alef/hamza variants + ى→ي),
// then a normalized-CONTAINS match in either direction with at least 4
// overlapping characters. Score = overlap/min(lenA,lenB); the best candidate
// with score ≥ 0.30 becomes suggestedProjectId. No auto-merge — the CEO picks.

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ى/g, 'ي')
    // Strip punctuation but keep Latin/Latin-extended, Arabic blocks, digits.
    .replace(/[^a-z0-9À-ɏ؀-ۿݐ-ݿ\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function matchProjectName(
  extractedName: string | null,
  projects: Array<{ id: string; name: string; nameArabic?: string | null }>
): { suggestedProjectId: string | null; matchScore: number | null } {
  const needle = extractedName ? normalizeName(extractedName) : ''
  if (needle.length < 4) return { suggestedProjectId: null, matchScore: null }
  let best: { id: string; score: number } | null = null
  for (const p of projects) {
    for (const candidate of [p.name, p.nameArabic].filter((x): x is string => !!x)) {
      const hay = normalizeName(candidate)
      if (hay.length < 4) continue
      const contains = hay.includes(needle) || needle.includes(hay)
      if (!contains) continue
      const overlap = Math.min(hay.length, needle.length)
      if (overlap < 4) continue
      const score = overlap / Math.max(hay.length, needle.length)
      if (!best || score > best.score) best = { id: p.id, score }
    }
  }
  if (!best || best.score < 0.3) return { suggestedProjectId: null, matchScore: null }
  return { suggestedProjectId: best.id, matchScore: Math.round(best.score * 1000) / 1000 }
}
