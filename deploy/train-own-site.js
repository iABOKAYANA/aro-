// ─────────────────────────────────────────────────────────────────────────────
// train-own-site.js — deep-train عين on GHAYA's OWN public content.
//
// The first ingest (train-ai-knowledge.js) stored ONE page-dump per own page —
// /faq ended up as a single 236-word chunk, far too coarse for retrieval. This
// wave answers with finer, drift-proof sources:
//
//   1) FAQ per-Q&A (source 'own-site-faq'): parsed straight from the SSR
//      FAQPage JSON-LD on ghayaestate.com/faq — the SAME graph search engines
//      see, so training can never claim an answer the published page doesn't
//      (Arabic question + answer, English question appended for recall).
//      One chunk per Q&A slot, url /faq#cN stable per index.
//   2) Own pages (source 'own-site'): /guides/buying-offplan, /about, /areas,
//      /press, /privacy, /terms — re-chunked from the rendered SSR HTML.
//      /faq itself skips the page-dump (handled per-slot above) — existing
//      /faq dump row is replaced with a pointer-style intro chunk so old
//      retrieval still hits *something* for generic FAQ words.
//
// Idempotent: upsert keyed by URL; stale chunks (FAQ indexes no longer on the
// page, pages removed from the list) are deactivated. Never touches
// ghaya-catalog-* or developer-site rows.
// Run:  cd /opt/ghaya && node --env-file=.env deploy/train-own-site.js
// ─────────────────────────────────────────────────────────────────────────────
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

const BASE = (process.env.PUBLIC_BASE_URL || 'https://ghayaestate.com').replace(/\/$/, '')
const UA = 'GHAYA-AynTrainer/2.0 (+https://ghayaestate.com)'
const TIMEOUT_MS = 25_000
const CHUNK = 1800
const OVERLAP = 150
const MAX_CHUNKS_PER_PAGE = 6

/** Leading-alef normalization so keyword recall matches the retriever. */
const normAr = (s) => (s ? s.replace(/[إأٱ]/g, 'ا') : s)

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function chunkText(text) {
  const chunks = []
  let i = 0
  while (i < text.length) {
    chunks.push(text.slice(i, i + CHUNK))
    i += CHUNK - OVERLAP
    if (chunks.length >= MAX_CHUNKS_PER_PAGE) break
  }
  return chunks
}

async function fetchPage(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': UA },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } catch (e) {
    throw new Error(`${url}: ${String(e).slice(0, 120)}`)
  }
}

/** All application/ld+json blocks of a page, parsed. */
function jsonLdBlocks(html) {
  const out = []
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi
  let m
  while ((m = re.exec(html)) !== null) {
    try { out.push(JSON.parse(m[1])) } catch { /* corrupt block ignored */ }
  }
  return out
}

const tally = { faqChunks: 0, pageChunks: 0, deactivated: 0 }
const seenUrls = new Set()

async function upsert(url, title, source, content) {
  const body = normAr(content).slice(0, 2600)
  const row = await p.aIKnowledge.findUnique({ where: { url } })
  const data = { title, content: body, source, wordCount: body.split(/\s+/).filter(Boolean).length }
  if (row) {
    const same = row.content === body && row.title === title && row.source === source
    if (!same || !row.isActive) {
      // Re-train OR reactivate: neither stale nor inactive chunks linger.
      await p.aIKnowledge.update({ where: { url }, data: { ...data, isActive: true, updatedAt: new Date() } })
    }
  } else {
    await p.aIKnowledge.create({ data: { url, ...data } })
  }
  seenUrls.add(url)
}

// 1) FAQ — one trained chunk per Q&A slot, from the published JSON-LD.
// The graph is flatMap'd [AR-pair, EN-pair] per item, so every even index is
// the Arabic question and the one right after it is its English twin.
async function trainFaq() {
  const html = await fetchPage(`${BASE}/faq`)
  const graph = jsonLdBlocks(html)
  const faqPage = graph.find((g) => g && g['@type'] === 'FAQPage')
  if (!faqPage || !Array.isArray(faqPage.mainEntity)) {
    throw new Error('FAQ JSON-LD not found — /faq page changed shape; training skipped for /faq')
  }
  const pairs = Math.floor(faqPage.mainEntity.length / 2)
  for (let i = 0; i < pairs; i++) {
    const ar = faqPage.mainEntity[i * 2]
    const en = faqPage.mainEntity[i * 2 + 1]
    if (!ar || ar['@type'] !== 'Question') continue
    const arA = (ar.acceptedAnswer && ar.acceptedAnswer.text) || ''
    const enQ = en && en['@type'] === 'Question' ? (en.name || '') : ''
    const enA = en && en.acceptedAnswer && en.acceptedAnswer.text ? en.acceptedAnswer.text : ''
    const content = [ar.name, arA, enQ, enA].filter(Boolean).join('\n').slice(0, 2200)
    if (content.length < 20) continue
    tally.faqChunks++
    await upsert(`${BASE}/faq#c${i}`, ar.name, 'own-site-faq', content)
  }
  // The old single-dump /faq row is replaced by a compact topic-mover chunk —
  // the actual answers live in per-slot chunks above (finer recall, less
  // duplicate-answer dilution at scoring time).
  await upsert(
    `${BASE}/faq`,
    'الأسئلة الشائعة | FAQ | GHAYA REAL ESTATE',
    'own-site',
    `فهرس الأسئلة الشائعة في غاية (GHAYA REAL ESTATE): الحجز والمعاينة، الشفافية والأسعار، الحساب والعمولة، وشروط الاستخدام. كل إجابة منشورة كقطعة مستقلة مطابقة للصفحة ${BASE}/faq، وعين بترجع للإجابة المنشورة نفسها لو الوسائل ما ودّتهاش صفحة واحدة. تكتب أي فيهم: شروط الحجز؟ إزاي أحجز معاينة؟ ايه شفافية الأسعار؟ منين العمل بآول دفعة؟`,
  )
  return pairs
}

// 2) Own pages, re-chunked finer than the original dump.
const OWN_PAGES = [
  '/guides/buying-offplan',
  '/about',
  '/areas',
  '/press',
  '/privacy',
  '/terms',
]

async function trainOwnPages() {
  for (const path of OWN_PAGES) {
    const html = await fetchPage(`${BASE}${path}`)
    const bodyText = stripHtml(html)
    if (bodyText.length < 200) continue
    const chunks = chunkText(bodyText)
    for (let c = 0; c < chunks.length; c++) {
      const url = c === 0 ? `${BASE}${path}` : `${BASE}${path}#c${c}`
      const title = `${path.replace(/^\//, '').replace(/\//g, ' · ')} (${c + 1}/${chunks.length})`
      tally.pageChunks++
      await upsert(url, title, 'own-site', chunks[c])
    }
  }
}

async function main() {
  await trainFaq().catch((e) => { console.error('[faq]', e.message); process.exitCode = 1 })
  await trainOwnPages().catch((e) => { console.error('[pages]', e.message); process.exitCode = 1 })

  // Stale: own-site / own-site-faq chunks whose url no longer exists.
  const stale = await p.aIKnowledge.updateMany({
    where: {
      isActive: true,
      source: { in: ['own-site', 'own-site-faq'] },
      url: { notIn: [...seenUrls] },
    },
    data: { isActive: false },
  })
  tally.deactivated = stale.count

  const total = await p.aIKnowledge.count({ where: { isActive: true } })
  const bySource = await p.aIKnowledge.groupBy({ by: ['source'], _count: { _all: true } })
  console.log(JSON.stringify({
    ...tally,
    coveredUrls: seenUrls.size,
    totalActiveChunks: total,
    bySource: bySource.map((b) => ({ source: b.source, chunks: b._count._all })),
  }, null, 1))
  await p.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
