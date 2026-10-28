/**
 * AI knowledge ingest — TS companion of deploy/train-ai-knowledge.js for the
 * runtime surfaces (CEO "train from URL" page + cron endpoint). Public
 * marketing content only, never PII.
 */
import { db } from '@/lib/db'

const UA = 'GHAYA-EYNTrainer/1.0 (+https://ghayaestate.com)'
const TIMEOUT_MS = 20_000
const CHUNK = 1800
const OVERLAP = 150
const MAX_CHUNKS_PER_PAGE = 6
const PRIORITY_LINK_RE = /(project|compound|portfolio|community|residential|neighborhood|masterplan|about)/i

export function stripHtml(html: string): string {
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

function chunkText(text: string): string[] {
  const chunks: string[] = []
  for (let i = 0; i < text.length && chunks.length < MAX_CHUNKS_PER_PAGE; i += CHUNK - OVERLAP) {
    chunks.push(text.slice(i, i + CHUNK))
  }
  return chunks
}

async function fetchHtml(url: string): Promise<{ ok: boolean; html?: string; status?: number }> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
      redirect: 'follow',
    })
    if (!res.ok) return { ok: false, status: res.status }
    const type = res.headers.get('content-type') || ''
    if (!/text\/html|application\/xhtml/.test(type)) return { ok: false, status: res.status }
    return { ok: true, html: (await res.text()).slice(0, 800_000) }
  } catch {
    return { ok: false }
  }
}

async function upsertChunks(
  source: string,
  url: string,
  title: string,
  text: string
): Promise<{ added: number; updated: number }> {
  if (text.length < 200) return { added: 0, updated: 0 }
  let added = 0
  let updated = 0
  const chunks = chunkText(text)
  for (let i = 0; i < chunks.length; i++) {
    const key = i === 0 ? url : `${url}#c${i}`
    const wc = chunks[i].split(/\s+/).length
    const existing = await db.aIKnowledge.findUnique({ where: { url: key }, select: { id: true, content: true } })
    if (existing) {
      if (existing.content !== chunks[i]) {
        await db.aIKnowledge.update({ where: { id: existing.id }, data: { title, content: chunks[i], wordCount: wc, updatedAt: new Date() } })
        updated++
      }
    } else {
      await db.aIKnowledge.create({ data: { source, url: key, title, content: chunks[i], chunkIdx: i, wordCount: wc } })
      added++
    }
  }
  return { added, updated }
}

function pickTitle(html: string, fallback: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return m ? stripHtml(m[1]).slice(0, 120) || fallback : fallback
}

/** Ingest ONE page (+0 sub-pages). Used by the CEO train-from-URL button. */
export async function ingestUrl(rawUrl: string, source = 'developer-site'): Promise<{ added: number; updated: number; error?: string }> {
  let target: URL
  try {
    target = new URL(rawUrl.trim())
    if (target.protocol !== 'http:' && target.protocol !== 'https:') throw new Error('scheme')
    if (/^(localhost|127\.|0\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(target.hostname)) {
      throw new Error('blocked')
    }
  } catch {
    return { added: 0, updated: 0, error: 'invalid url' }
  }
  const res = await fetchHtml(target.href)
  if (!res.ok || !res.html) return { added: 0, updated: 0, error: `fetch failed${res.status ? ` (${res.status})` : ''}` }
  const out = await upsertChunks(source, target.href, pickTitle(res.html, target.hostname), stripHtml(res.html))
  return out
}

/** Re-ingest every developer site + own guides (weekly cron / retrain-all). */
export async function ingestAllDeveloperSites(): Promise<{ pages: number; added: number; updated: number; failed: string[] }> {
  const failed: string[] = []
  let pages = 0
  let added = 0
  let updated = 0

  const own = ['https://ghayaestate.com/faq', 'https://ghayaestate.com/areas', 'https://ghayaestate.com/about']
  for (const url of own) {
    pages++
    const r = await fetchHtml(url)
    if (!r.ok || !r.html) { failed.push(url); continue }
    const o = await upsertChunks('own-site', url, pickTitle(r.html, 'GHAYA'), stripHtml(r.html))
    added += o.added
    updated += o.updated
  }

  const devs = await db.developerProfile.findMany({
    where: { website: { not: null }, projects: { some: { isActive: true } } },
    select: { companyName: true, website: true },
    take: 40,
  })

  const seen = new Set<string>()
  for (const dev of devs) {
    const base = dev.website!.replace(/\/+$/, '')
    if (seen.has(base)) continue
    seen.add(base)
    const res = await fetchHtml(base)
    if (!res.ok || !res.html) { failed.push(base); continue }
    pages++
    const title = pickTitle(res.html, dev.companyName)
    const o = await upsertChunks('developer-site', base, title, stripHtml(res.html))
    added += o.added
    updated += o.updated

    // Up to 3 priority sub-pages per developer site
    const links = new Set<string>()
    for (const m of res.html.matchAll(/href="(\/?[^"#:]{2,200})"/g)) {
      try {
        const u = new URL(m[1], base)
        if (u.hostname !== new URL(base).hostname) continue
        if (/\.(pdf|jpg|jpeg|png|svg|webp|css|js|zip|mp4)$/i.test(u.pathname)) continue
        const s = u.origin + u.pathname
        if (PRIORITY_LINK_RE.test(s) && !seen.has(s)) links.add(s)
        if (links.size >= 3) break
      } catch { /* skip malformed href */ }
    }
    for (const sub of links) {
      seen.add(sub)
      const sr = await fetchHtml(sub)
      if (!sr.ok || !sr.html) { failed.push(sub); continue }
      pages++
      const so = await upsertChunks('developer-site', sub, pickTitle(sr.html, dev.companyName), stripHtml(sr.html))
      added += so.added
      updated += so.updated
    }
  }

  return { pages, added, updated, failed }
}
