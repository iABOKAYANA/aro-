/**
 * AI knowledge retrieval — the "training" side of عين.
 *
 * Chunks are ingested from developer/official marketing sites and our own
 * guides into the AIKnowledge table (deploy/train-ai-knowledge.js). At chat
 * time this module scores stored chunks against the user message and returns
 * a bounded context block. Public marketing content only — never PII.
 */
import { db } from '@/lib/db'

/** Tokens ≥4 chars that are not stopwords, capped for query size. */
function pickKeywords(text: string): string[] {
  const STOP = new Set([
    'عن', 'مين', 'فيه', 'هو', 'هي', 'هذا', 'هذه', 'الم', 'كام', 'علي', 'على',
    'إية', 'ايه', 'ودي', 'ليه', 'فين', 'إزي', 'ازي', 'حاجة', 'مش', 'بس',
    'with', 'this', 'that', 'what', 'where', 'when', 'much', 'many', 'about',
    'هل', 'ازاي', 'كيف', 'فقط', 'كل', 'بقى', 'مشروعية',
  ])
  // Arabic-block punctuation (؟ ، ؛ ...) sits INSIDE the \u0600-\u06FF range,
  // so it must be stripped BEFORE tokenizing or words keep it glued on
  // ("madaar؟" never matches the stored chunks).
  const words = text
    .toLowerCase()
    .replace(/[.,،؟?!؛:;()"'«»\[\]—–…\-\u0640!&]/g, ' ')
    .replace(/\s+/g, ' ')
    .match(/[a-z\u0600-\u06FF0-9]{4,}/g) || []
  const seen = new Set<string>()
  const out: string[] = []
  for (const w of words) {
    const t = w.replace(/^(إ|أ)/, 'ا')
    if (STOP.has(w) || STOP.has(t) || seen.has(t)) continue
    seen.add(t)
    out.push(t)
    if (out.length >= 8) break
  }
  return out
}

const HIT_LIMIT = 60
const CHUNKS_MAX = 3
const TOTAL_CHARS_MAX = 2600

/**
 * Retrieve the most relevant learned chunks for a message.
 * Cheap SQL prefilter (LIKE on each keyword, capped) then JS term-overlap
 * scoring — the corpus is small (hundreds of chunks), so this stays fast.
 */
export async function retrieveKnowledge(message: string): Promise<string> {
  const keywords = pickKeywords(message)
  if (!keywords.length) return ''

  try {
    const like = keywords.map((k) => ({ content: { contains: k } }))
    // prisma-or: LIKE chunks, then score in memory
    const rows = await db.aIKnowledge.findMany({
      where: { isActive: true, OR: like },
      select: { title: true, url: true, content: true },
      take: HIT_LIMIT,
      orderBy: { updatedAt: 'desc' },
    })
    if (!rows.length) return ''

    const set = new Set(keywords)
    // Keep the BEST chunk per URL (one slot per page), then top-N by hits.
    const best = new Map<string, { title: string; url: string; content: string; hits: number }>()
    for (const r of rows) {
      const lower = (r.content + ' ' + r.title).toLowerCase()
      let hits = 0
      for (const k of set) if (lower.includes(k)) hits++
      if (hits < Math.min(2, set.size)) continue
      const prev = best.get(r.url)
      if (!prev || prev.hits < hits) best.set(r.url, { ...r, hits })
    }
    const scored = [...best.values()].sort((a, b) => b.hits - a.hits).slice(0, CHUNKS_MAX)

    if (!scored.length) return ''
    const parts: string[] = []
    let total = 0
    for (const r of scored) {
      if (total + r.content.length > TOTAL_CHARS_MAX) break
      total += r.content.length
      parts.push(`### ${r.title}\n(source: ${r.url})\n${r.content}`)
    }
    if (!parts.length) return ''
    return (
      '[LEARNED CONTEXT — public marketing pages fetched earlier from official developer sites and guides. ' +
      'Use them to explain background/positioning/usps when the question is about these sources; ' +
      'for GHAYA catalog facts (prices, availability, plans) the DB tools always override this context. ' +
      'Cite the source URL when a claim comes from here.]\n\n' +
      parts.join('\n\n')
    )
  } catch {
    return '' // knowledge is a nicety — never fail the chat
  }
}

/** Count of learned chunks (for status surfaces). */
export async function knowledgeCount(): Promise<number> {
  try {
    return await db.aIKnowledge.count({ where: { isActive: true } })
  } catch {
    return 0
  }
}
