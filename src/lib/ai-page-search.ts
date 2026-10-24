/**
 * عين على صفحات الموقع — not just in the chat.
 *
 * The listing pages (/projects) accept a free-text `q`. This module decides,
 * with the SAME engines the chat uses, what عين understood from it:
 *
 * 1. A project name (fuzzy, matches "هايد بارک؟" and English spellings) →
 *    the results become those exact projects — the phrase itself would
 *    never survive an ILIKE whole-phrase query.
 * 2. Otherwise the colloquial parser (ai-search-parser, the chat's own)
 *    extracts structured filters. Only fields searchProjects really filters
 *    by are honored — عين never claims to understand something the engine
 *    doesn't apply.
 *
 * URL filter params always win over parsed values: عين refines, it never
 * overrides an explicit choice the user made with the advanced controls.
 */
import { parseNaturalLanguageQuery } from '@/lib/ai-search-parser'

export interface AiUnderstandingChip {
  /** Stable field key the client renders a localized label for. */
  field: string
  /** Display value, locale-neutral (names, "Chalet", "8M", "3"). */
  value: string
}

export interface AiSearchUnderstanding {
  /** When عين matched project name(s): show exactly these projects. */
  ids?: string[]
  /** Structured filter values to overlay onto the listing query. */
  patch: Record<string, string | number>
  /** true = the raw phrase must not run as free-text (it would zero out). */
  dropQ: boolean
  chips: AiUnderstandingChip[]
}

/** Fields searchProjects genuinely filters on — honesty boundary for chips. */
const SEARCHABLE_FIELDS = [
  'city', 'governorate', 'propertyType', 'listingType',
  'bedrooms', 'bathrooms', 'minPrice', 'maxPrice', 'minArea', 'maxArea',
] as const

/**
 * Name evidence floor. resolveProjectName scores full-coverage alias matches
 * 10_000+ and partial (single-noun) matches far below — a query whose only
 * hit is the generic noun "شاله/شاليات/فيلا" inside a compound name
 * ("Mazarine Chalet Extension") must NOT re-rank the entire listing around
 * that compound. Same spirit as the chat's ambiguity gate.
 */
const NAME_EVIDENCE_FLOOR = 10_000

interface ResolvedMention {
  project: { id: string; name: string; archived?: boolean }
  score: number
}

export function projectSearchUnderstanding(
  rawQ: string,
  searchParams: Record<string, string | undefined>,
  matches: ResolvedMention[],
): AiSearchUnderstanding {
  const empty: AiSearchUnderstanding = { patch: {}, dropQ: false, chips: [] }
  const q = rawQ?.trim()
  if (!q) return empty

  // 1) Named project(s) — resolver output with the evidence floor applied.
  // Archived register entries are NOT publicly listed: excluded outright.
  const publicMentions = matches.filter(
    (m) => !m.project.archived && m.score >= NAME_EVIDENCE_FLOOR,
  )
  if (publicMentions.length > 0) {
    return {
      ids: publicMentions.map((m) => m.project.id),
      patch: {},
      dropQ: true,
      chips: publicMentions.map((m) => ({ field: 'project', value: m.project.name })),
    }
  }

  // 2) Free colloquial query → structured filters, same as the chat turn.
  const parsed = parseNaturalLanguageQuery(q)
  const patch: Record<string, string | number> = {}
  const chips: AiUnderstandingChip[] = []
  const parsedFilters = parsed.filters as Record<string, unknown>
  for (const field of SEARCHABLE_FIELDS) {
    const value = parsedFilters[field]
    if ((value === undefined || value === null) || searchParams[field] !== undefined) continue
    patch[field] = value as string | number
    const meta = parsed.summary.find((s) => s.field === field)
    if (meta) chips.push({ field: meta.field, value: meta.value })
  }
  // Developer comes through the summary (the parser records it without a
  // filters key); the search layer expands aliases itself.
  if (!searchParams.developer) {
    const dev = parsed.summary.find((s) => s.field === 'developer')?.value
    if (dev) {
      patch.developer = dev
      chips.push({ field: 'developer', value: dev })
    }
  }
  if (chips.length === 0) return empty
  return { patch, dropQ: true, chips }
}
