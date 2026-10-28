// ─────────────────────────────────────────────────────────────────────────────
// train-chat.js — عين learns from REAL chat conversations.
//
// The public chat already persists every turn (AIMessage rows: role, content,
// metadata.provider). This trainer turns that history into AIKnowledge chunks
// the retriever can pull at chat time — the loop the owner asked for
// («يتعلم من الناس اللي بيسألوه»):
//
//   • reads user → assistant message pairs, chronologically per conversation;
//   • keeps ONLY catalog-verified answers: the assistant turn's
//     metadata.provider === 'grounded' (tool/DB-backed), never free LLM text;
//   • PII-safe: user text is masked before storage — phone-like digit runs
//     (≥7 digits) and email addresses become ****; content capped;
//   • skips noise: greetings/affirmations/very short texts, connective
//     follow-ups ("وايه التاني"), lead-capture slots, tool-failure answers,
//     essay-length walls (tool loop runaway), and duplicate questions
//     (grouped by normalized text — the NEWEST pair wins);
//   • writes one chunk per distinct question, source 'learned-chat', url
//     'chat://learned/<hash16>' — idempotent by URL, stale rows for sources
//     no longer regenerated are deactivated (--prune), matching the
//     deactivate-stale policy of the other trainers.
//
// Usage (server): node --env-file=.env deploy/train-chat.js [--dry] [--prune]
// Reads the same DATABASE_URL as the app; no network calls.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

const p = new PrismaClient()

const DRY = process.argv.includes('--dry')
const PRUNE = process.argv.includes('--prune')
const SOURCE = 'learned-chat'

// Limits: keep chunks short enough for retrieval — a Q&A pair must stay
// answerable in one pull; walls are chat-loop bugs, not knowledge.
const MAX_Q = 300 // question length caps
const MAX_A = 900 // answer length caps
const MAX_HOLD = 2600 // chunk content cap (matches other trainers)
const MIN_WORDS = 3 // under this many words = greeting/affirmation noise
const SINCE_DAYS = 120 // learn from recent history only

/** Question text that means "nothing to learn": pure ack / short talk. */
const NOISE = /^(تمام|اوك|اوكي|كويس|اهلا|هاي|ازيك|السلام|صباح الخير|مساء الخير|شكرا|شكراً|من فضلك|ولا يهمك|معاك|تمام جد|اهلا بيك)/

/** Heuristic noise words that mark a contextual follow-up: never a good standalone Q&A. */
const FOLLOWUP = /^(و(ايه|ين|قز)?|طب|كمان|تاني|لون|بص|يعني|طيب|حسب|احكم|اللي قبل|فيه كمان)\b/i

/** Mask PII in user question text: phone-like runs and emails. */
function maskPii(text) {
  return String(text)
    .replace(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g, '****')
    .replace(/\d{7,}/g, () => '****')
}

/** Keep the assistant's own name consistent in learned chunks (owner: the
 * English name is EYN). Older stored answers may carry the old spellings. */
const fixName = (text) => String(text).replace(/\bAyn\b|\bAin\b/g, 'EYN')

/** Normalize a question to a dedup key: alef/hamza/ya-nun unify, diacritics out, no punct. */
const dedupKey = (q) =>
  String(q)
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670]/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140)

async function upsertChunk(url, title, content) {
  const body = content.slice(0, MAX_HOLD)
  const row = await p.aIKnowledge.findUnique({ where: { url } })
  if (row) {
    if (row.content === body && row.title === title) return 'unchanged'
    await p.aIKnowledge.update({ where: { id: row.id }, data: { title, content: body, isActive: true } })
    return 'updated'
  }
  await p.aIKnowledge.create({
    data: { url, title, content: body, source: SOURCE, chunkIdx: 0, wordCount: body.split(/\s+/).filter(Boolean).length },
  })
  return 'added'
}

async function main() {
  const since = new Date(Date.now() - SINCE_DAYS * 24 * 60 * 60 * 1000)
  const convos = await p.aIConversation.findMany({
    where: { updatedAt: { gte: since } },
    select: { id: true },
    orderBy: { updatedAt: 'asc' },
  })

  // Walk messages conversation by conversation, pairing each user row with
  // the next assistant row (chronological, same conversation).
  const pairs = []
  for (const c of convos) {
    const msgs = await p.aIMessage.findMany({
      where: { conversationId: c.id },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true, metadata: true, createdAt: true },
    })
    for (let i = 0; i < msgs.length - 1; i++) {
      if (msgs[i].role !== 'user') continue
      const q = msgs[i].content
      let j = i + 1
      while (j < msgs.length && msgs[j].role !== 'assistant') j++
      if (j >= msgs.length) continue
      const a = msgs[j]
      pairs.push({ q, a: a.content, meta: a.metadata, at: a.createdAt })
      i = j
    }
  }

  const tally = { pairs: pairs.length, kept: 0, skipNoise: 0, skipAnswer: 0, skipWall: 0, skipDedup: 0 }
  const best = new Map() // key → { q, a, at }

  for (const { q, a, meta, at } of pairs) {
    const qRaw = fixName(maskPii(q).replace(/\s+/g, ' ').trim().slice(0, MAX_Q))
    if (!qRaw) { tally.skipNoise++; continue }
    if (qRaw.split(/\s+/).length < MIN_WORDS || NOISE.test(qRaw)) { tally.skipNoise++; continue }
    if (FOLLOWUP.test(qRaw)) { tally.skipNoise++; continue }

    let provider = null
    try { provider = JSON.parse(meta || '{}').provider } catch { /* none stored */ }
    if (provider !== 'grounded') { tally.skipAnswer++; continue }

    const aRaw = fixName(maskPii(String(a || '').replace(/\s+/g, ' ').trim().slice(0, MAX_A)))
    if (!aRaw || aRaw.length < 15) { tally.skipAnswer++; continue }
    // Tool-loop walls / failure strings are chat bugs, not learnable facts.
    if (aRaw.includes('عذراً') && aRaw.length > 700) { tally.skipWall++; continue }

    const key = dedupKey(qRaw)
    if (!key) { tally.skipNoise++; continue }
    const prev = best.get(key)
    if (prev && prev.at > at) { tally.skipDedup++; continue }
    best.set(key, { q: qRaw, a: aRaw, at })
  }

  tally.kept = best.size
  if (DRY) {
    console.log(JSON.stringify({ dry: true, ...tally }))
    await p.$disconnect()
    return
  }

  let res = { added: 0, updated: 0, unchanged: 0 }
  const seenUrls = new Set()
  for (const [key, { q, a, at }] of best) {
    // True hash (NOT a base64 prefix — prefixes collide for questions that
    // start with the same words, the most common case here).
    const hash = createHash('sha256').update(key).digest('base64url').slice(0, 16)
    const url = `chat://learned/${hash}`
    seenUrls.add(url)
    const title = `تعلم شات — ${q.slice(0, 60)}`
    const content = [
      `سؤال عميل حقيقي (تعلم غايا من محادثة ${at.toISOString().slice(0, 10)}): ${q}`,
      `الجواب المعتمد من كتالوج غايا: ${a}`,
    ].join('\n')
    const r = await upsertChunk(url, title, content)
    res[r === 'added' ? 'added' : r === 'updated' ? 'updated' : 'unchanged']++
  }

  // Stale learned rows (questions that no longer exist in the window/dedup set)
  let pruned = 0
  if (PRUNE) {
    pruned = await p.aIKnowledge.updateMany({
      where: { source: SOURCE, url: { notIn: [...seenUrls] }, isActive: true },
      data: { isActive: false },
    }).then((r) => r.count)
  }

  const total = await p.aIKnowledge.count({ where: { source: SOURCE, isActive: true } })
  console.log(JSON.stringify({ ...tally, chunksLearned: res, pruned, activeLearnedChunks: total }))
  await p.$disconnect()
}

main().catch((e) => {
  console.error('train-chat failed:', e?.message || e)
  process.exit(1)
})
