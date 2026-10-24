// ─────────────────────────────────────────────────────────────────────────────
// train-market-doc.js — train عين from the OWNER's market knowledge file
// (deploy/training-data/egyptian-market-knowledge-v1.md, versioned in the
// repo so training can never drift from what the owner wrote).
//
// Split:
//   • KNOWLEDGE sections (types, areas, parties, payment terms, finishing,
//     investment math, comparison factors, buyer checklist, data schema)
//     → AIKnowledge chunks (source 'market-doc-v1'), one per section part.
//   • BEHAVIORAL sections (role, style, freshness policy, verification
//     order, answer-quality checklist) → NOT chunks: they live in the
//     SYSTEM_PROMPT (always-on rules), and are skipped here.
//
// Honesty: the doc itself carries the banner "not a live price sheet —
// verify against the DB" which is quoted into chunk 0, and the intro chunk
// states the DB-catalog-first rule in plain Arabic.
//
// Idempotent: upsert keyed by URL `owner-doc://market-v1/sN[-pK]`; stale
// chunks of this source are deactivated. Never touches other sources.
// Run:  cd /opt/ghaya && node --env-file=.env deploy/train-market-doc.js
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs')
const path = require('path')
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

const DOC = path.join(__dirname, 'training-data', 'egyptian-market-knowledge-v1.md')
const SOURCE = 'market-doc-v1'
const MAX_CHUNK = 1500

// Sections whose instructions belong in the system prompt, not retrieval.
const BEHAVIORAL = new Set(['1', '12', '14', '15', '16'])

const normAr = (s) => s ? s.replace(/[إأٱ]/g, 'ا') : s

function mdToText(md) {
  return md
    // fenced JSON block keeps its braces but loses markup noise
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^> ?/gm, '')
    .replace(/\\$/, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/** Section-level split on `## N. ...` headings. */
function splitSections(md) {
  const out = []
  const lines = md.split('\n')
  let cur = { title: '(intro)', body: [] }
  for (const line of lines) {
    const m = /^## (\d+)\. ?(.+)$/.exec(line.trim())
    if (m) {
      if (cur.body.length) out.push(cur)
      cur = { title: `${m[1]}. ${m[2]}`, body: [] }
      cur.no = m[1]
    } else {
      cur.body.push(line)
    }
  }
  if (cur.body.length) out.push(cur)
  for (const s of out) s.text = mdToText(s.body.join('\n'))
  return out.filter((s) => s.text.length > 40)
}

/** Split a long section at `### ` boundaries; final fallback on sentence end. */
function splitLong(title, text) {
  if (text.length <= MAX_CHUNK) return [text]
  const parts = text.split(/\n(?=###)/g)
  if (parts.length < 2) {
    const out = []
    let i = 0
    while (i < text.length) {
      let end = i + MAX_CHUNK
      if (end < text.length) {
        const dot = text.lastIndexOf('.', end)
        const nl = text.lastIndexOf('\n', end)
        end = Math.max(dot, nl, i + 300)
      }
      out.push(text.slice(i, end).trim())
      i = end
    }
    return out
  }
  // merge sub-sections into ≤MAX_CHUNK parts
  const merged = []
  let buf = ''
  for (const part of parts) {
    if ((buf + part).length <= MAX_CHUNK) buf += '\n' + part
    else { if (buf.trim()) merged.push(buf.trim()); buf = part }
  }
  if (buf.trim()) merged.push(buf.trim())
  return merged.length ? merged : [text.slice(0, MAX_CHUNK)]
}

const tally = { chunks: 0, skipped: [] }
const seenUrls = new Set()

async function upsert(url, title, content) {
  const body = normAr(content).slice(0, 2600)
  const row = await p.aIKnowledge.findUnique({ where: { url } })
  const data = {
    title,
    content: body,
    source: SOURCE,
    wordCount: body.split(/\s+/).filter(Boolean).length,
  }
  if (row) {
    const same = row.content === body && row.title === title && row.source === SOURCE
    if (!same || !row.isActive) {
      await p.aIKnowledge.update({ where: { url }, data: { ...data, isActive: true, updatedAt: new Date() } })
    }
  } else {
    await p.aIKnowledge.create({ data: { url, ...data } })
  }
  seenUrls.add(url)
  tally.chunks++
}

async function main() {
  const md = fs.readFileSync(DOC, 'utf8')
  const sections = splitSections(md)

  // Chunk 0 — the versioned banner + catalog-first rule (always hit-able).
  const intro = md.split('\n## ')[0]
  await upsert(
    'owner-doc://market-v1/s0',
    `قاعدة معرفة السوق العقاري المصري — مقدمة وقواعد العم`,
    `${mdToText(intro)}\n\nقاعدة التطبيق على غاية: كل الأسعار والتوافر وخطط السداد والتسليم في كتالوج غاية (DB) هي مصدر الحقيقة أول بأول؛ القاعدة دي للفهم والمصطلحات والاختبار، مش أخبار أسعار. أي معلومة متغيرة مش مسجلة تقال "مش مسجلة" بصراحة.`.slice(0, MAX_CHUNK),
  )

  for (const s of sections) {
    if (BEHAVIORAL.has(s.no)) { tally.skipped.push(s.title); continue }
    const parts = splitLong(s.title, s.text)
    for (let k = 0; k < parts.length; k++) {
      const url = parts.length > 1 ? `owner-doc://market-v1/s${s.no}-p${k + 1}` : `owner-doc://market-v1/s${s.no}`
      await upsert(url, `قاعدة السوق § ${s.title}${parts.length > 1 ? ` (${k + 1}/${parts.length})` : ''}`, `§ ${s.title}\n${parts[k]}`)
    }
  }

  // Stale market-doc chunks no longer in the document version.
  const stale = await p.aIKnowledge.updateMany({
    where: { isActive: true, source: SOURCE, url: { notIn: [...seenUrls] } },
    data: { isActive: false },
  })

  const total = await p.aIKnowledge.count({ where: { isActive: true } })
  const bySource = await p.aIKnowledge.groupBy({ by: ['source'], _count: { _all: true } })
  console.log(JSON.stringify({
    sections: sections.length,
    chunks: tally.chunks,
    behavioralSkipped: tally.skipped,
    staleDeactivated: stale.count,
    totalActiveChunks: total,
    bySource: bySource.map((b) => ({ source: b.source, chunks: b._count._all })),
  }, null, 1))
  await p.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
