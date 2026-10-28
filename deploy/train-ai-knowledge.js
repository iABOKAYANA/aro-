// ─────────────────────────────────────────────────────────────────────────────
// train-ai-knowledge.js — ingest public marketing pages into the AIKnowledge
// table so the عين assistant has persistent "training" knowledge.
//
// Sources (public content only, never PII):
//  1. GHAYA's own guides: /faq, /areas, /about
//  2. Every in-use developer's official website (DeveloperProfile.website) plus
//     up to 3 internal pages likely to carry project/community info.
//
// Idempotent: upsert keyed by URL; a page re-fetched with the same body is a
// no-op (updatedAt refresh only). Safe to re-run.
// ─────────────────────────────────────────────────────────────────────────────
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const UA = 'GHAYA-EYNTrainer/1.0 (+https://ghayaestate.com)'
const TIMEOUT_MS = 20_000
const CHUNK = 1800
const OVERLAP = 150
const MAX_TOTAL_PAGES = 60

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
    if (chunks.length > 6) break // cap chunk count per page
  }
  return chunks
}

async function fetchPage(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
      redirect: 'follow',
    })
    if (!res.ok) return { ok: false, status: res.status, html: '' }
    const type = res.headers.get('content-type') || ''
    if (!/text\/html|application\/xhtml/.test(type)) return { ok: false, status: res.status, html: '' }
    const html = (await res.text()).slice(0, 800_000)
    return { ok: true, status: res.status, html }
  } catch (e) {
    return { ok: false, status: 0, html: '', err: String(e).slice(0, 80) }
  }
}

function pickTitle(html, fallback) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (m) return stripHtml(m[1]).slice(0, 120) || fallback
  return fallback
}

const PRIORITY_LINK_RE = /(project|compound|portfolio|community|residential|neighborhood|masterplan|about|managed|about-us)/i

async function internalLinks(baseUrl, html) {
  try {
    const base = new URL(baseUrl)
    const out = new Set()
    for (const m of html.matchAll(/href="(\/?[^"#:]{2,200})"/g)) {
      let href = m[1]
      const u = new URL(href, base)
      if (u.hostname !== base.hostname) continue
      if (/\.(pdf|jpg|jpeg|png|svg|webp|css|js|zip|mp4)$/i.test(u.pathname)) continue
      const s = u.origin + u.pathname
      if (PRIORITY_LINK_RE.test(s) && s !== base.origin + base.pathname) out.add(s)
      if (out.size >= 3) break
    }
    return [...out]
  } catch {
    return []
  }
}

async function upsertPage(source, url, title, text) {
  if (text.length < 200) return { action: 'skip-thin' }
  const chunks = chunkText(text)
  let added = 0
  let updated = 0
  for (let i = 0; i < chunks.length; i++) {
    const key = url + (i === 0 ? '' : '#c' + i)
    const wc = chunks[i].split(/\s+/).length
    const existing = await p.aIKnowledge.findUnique({ where: { url: key }, select: { id: true, content: true } })
    if (existing) {
      if (existing.content !== chunks[i]) {
        await p.aIKnowledge.update({ where: { id: existing.id }, data: { title, content: chunks[i], wordCount: wc, updatedAt: new Date() } })
        updated++
      }
    } else {
      await p.aIKnowledge.create({
        data: { source, url: key, title, content: chunks[i], chunkIdx: i, wordCount: wc },
      })
      added++
    }
  }
  return { action: added ? 'added+' + added : updated ? 'updated+' + updated : 'same', chunks: chunks.length }
}

async function main() {
  const jobs = []
  const log = []

  // 1) Own guides
  for (const path of ['/faq', '/areas', '/about']) {
    jobs.push({ source: 'own-site', url: 'https://ghayaestate.com' + path })
  }

  // 2) Developer sites — only developers whose projects are actually visible
  const devs = await p.developerProfile.findMany({
    select: { companyName: true, website: true, projects: { select: { isActive: true } } },
  })
  const activeNames = new Set(await p.project.findMany({ where: { isActive: true }, select: { developerName: true, name: true } }).catch(() => []))
  void activeNames
  for (const d of devs) {
    if (!d.website || !/^https?:\/\//.test(d.website)) continue
    const hasVisible = d.projects.some((x) => x.isActive)
    if (!hasVisible) continue
    jobs.push({ source: 'developer-site', url: d.website.replace(/\/+$/, ''), developer: d.companyName })
  }

  const limited = jobs.slice(0, MAX_TOTAL_PAGES)
  const siteUrlsSeen = new Set()
  let totalAdded = 0
  let totalUpdated = 0
  let failures = 0

  for (const job of limited) {
    if (siteUrlsSeen.has(job.url)) continue
    siteUrlsSeen.add(job.url)
    const r = await fetchPage(job.url)
    if (!r.ok) {
      log.push({ url: job.url, status: r.status, error: r.err || 'non-200' })
      failures++
      continue
    }
    const title = pickTitle(r.html, job.developer || 'GHAYA')
    const text = stripHtml(r.html)
    const res = await upsertPage(job.source, job.url, title, text)
    log.push({ url: job.url, ...res })
    if (typeof res.action === 'string' && res.action.startsWith('added')) totalAdded += parseInt(res.action.replace('added+', ''), 10) || 0
    if (typeof res.action === 'string' && res.action.startsWith('updated')) totalUpdated += parseInt(res.action.replace('updated+', ''), 10) || 0

    // Sub-pages for developer sites only
    if (job.source === 'developer-site') {
      for (const sub of await internalLinks(job.url, r.html)) {
        if (siteUrlsSeen.has(sub)) continue
        siteUrlsSeen.add(sub)
        const sr = await fetchPage(sub)
        if (!sr.ok) { log.push({ url: sub, status: sr.status, error: sr.err || 'non-200' }); failures++; continue }
        const st = stripHtml(sr.html)
        const sres = await upsertPage(job.source, sub, pickTitle(sr.html, job.developer || 'Developer'), st)
        log.push({ url: sub, ...sres })
        if (typeof sres.action === 'string' && sres.action.startsWith('added')) totalAdded += parseInt(sres.action.replace('added+', ''), 10) || 0
        if (typeof sres.action === 'string' && sres.action.startsWith('updated')) totalUpdated += parseInt(sres.action.replace('updated+', ''), 10) || 0
      }
    }
  }

  const count = await p.aIKnowledge.count()
  console.log(JSON.stringify({ pagesAttempted: siteUrlsSeen.size, chunksAdded: totalAdded, chunksUpdated: totalUpdated, failures, totalChunksInTable: count, log: log.slice(0, 40) }, null, 1))
  await p.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
