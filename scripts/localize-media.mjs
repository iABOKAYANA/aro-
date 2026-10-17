#!/usr/bin/env node
// Backfill hot-linked Nawy media into public/images/uploads.
// Usage:
//   node scripts/localize-media.mjs [--limit N] [--covers-only] [--skip-galleries]
// Env:
//   LOCALIZE_BUDGET_MS  wall-clock cap, default 40min. Stops cleanly, reports leftovers.
//   Rerun leftovers with: node scripts/localize-media.mjs
// Safety: a row is updated ONLY after its file verifies on disk (size>0);
// rows whose download failed are NEVER touched (keep hotlink). No deps
// beyond @prisma/client (already in package.json) + node builtins.
import { PrismaClient } from '@prisma/client'
import { randomBytes } from 'node:crypto'
import { mkdir, stat, statfs, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const prisma = new PrismaClient()

const START = Date.now()
const BUDGET_MS = Number(process.env.LOCALIZE_BUDGET_MS || 40 * 60 * 1000)
const DEADLINE = START + BUDGET_MS
const MAX_BYTES = 15 * 1024 * 1024 // 15MB
const TIMEOUT_MS = 15_000
const CONC = 5
const MIN_DISK_BYTES = 2 * 1024 * 1024 * 1024 // stop if <2GB free
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

const args = process.argv.slice(2)
const LIMIT = Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? NaN)
const COVERS_ONLY = args.includes('--covers-only')
const SKIP_GALLERIES = args.includes('--skip-galleries')

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'images', 'uploads')

const EXT_BY_TYPE = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
  'image/svg+xml': '.svg',
  'application/pdf': '.pdf',
}

function sniffExt(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg'
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return '.png'
  if (buf.length >= 6 && buf.toString('ascii', 0, 6).startsWith('GIF8')) return '.gif'
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP')
    return '.webp'
  if (buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-') return '.pdf'
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 4, 8) === 'ftyp' &&
    ['avif', 'avis'].includes(buf.toString('ascii', 8, 12).toLowerCase())
  )
    return '.avif'
  return null
}

function acceptableType(ct) {
  return (
    ct.startsWith('image/') ||
    ct === 'application/pdf' ||
    ct === 'application/octet-stream' ||
    ct === 'binary/octet-stream' // e.g. S3 serves images this way; sniffed below
  )
}
const elapsed = () => ((Date.now() - START) / 1000).toFixed(0) + 's'
const outOfTime = (needMs = 0) => Date.now() + needMs >= DEADLINE

async function diskOk() {
  try {
    const s = await statfs(UPLOAD_DIR).catch(() => statfs(process.cwd()))
    return BigInt(s.bavail) * BigInt(s.bsize) > BigInt(MIN_DISK_BYTES)
  } catch {
    return true // can't probe: proceed, downloads fail safe anyway
  }
}

/** Returns local path on success, null on ANY failure (caller keeps hotlink). */
async function download(url, kind) {
  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url.trim())) return null
  const src = url.trim()
  try {
    const res = await fetch(src, {
      headers: { 'user-agent': UA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (!acceptableType(ct)) throw new Error(`bad type ${ct}`)
    const len = res.headers.get('content-length')
    if (len && Number(len) > MAX_BYTES) throw new Error('too large')
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length || buf.length > MAX_BYTES) throw new Error('bad size')
    let ext = sniffExt(buf) || EXT_BY_TYPE[ct]
    if (!ext && ct.startsWith('image/')) ext = '.jpg'
    if (!ext) throw new Error(`unrecognized bytes for ${ct}`)
    const name = `${Date.now()}-${randomBytes(4).toString('hex')}${ext}`
    await mkdir(UPLOAD_DIR, { recursive: true })
    const full = path.join(UPLOAD_DIR, name)
    await writeFile(full, buf)
    const st = await stat(full)
    if (!st.size) throw new Error('zero-byte')
    return `/images/uploads/${name}`
  } catch (err) {
    console.warn(`[backfill] kept hotlink (${kind}): ${src.slice(0, 120)} — ${err.message || err}`)
    return null
  }
}

/** Row-pool: fn(row) -> 'localized'|'failed'; logs every 50 rows. Stops at deadline. */
async function runRows(label, rows, conc, fn, counts) {
  let i = 0
  const total = rows.length
  const workers = Array.from({ length: Math.max(1, Math.min(conc, total)) }, async () => {
    while (i < total) {
      if (outOfTime()) {
        counts.stopped = true
        return
      }
      const k = i++
      try {
        const r = await fn(rows[k])
        if (r === 'localized') counts.localized++
        else counts.failed++
      } catch (err) {
        counts.failed++
        console.warn(`[backfill] ${label} row error: ${err.message || err}`)
      }
      const done = counts.localized + counts.failed
      if (done % 50 === 0) console.log(`[backfill] ${label}: ${done}/${total} (ok=${counts.localized} fail=${counts.failed}) [${elapsed()}]`)
    }
  })
  await Promise.all(workers)
  console.log(`[backfill] ${label} done: ok=${counts.localized} fail=${counts.failed} [${elapsed()}]`)
}

const summary = {}

async function phaseCovers() {
  const counts = { localized: 0, failed: 0, stopped: false }
  let rows = await prisma.project.findMany({
    where: { coverImage: { startsWith: 'http' } },
    select: { id: true, coverImage: true },
  })
  if (Number.isFinite(LIMIT)) rows = rows.slice(0, LIMIT)
  console.log(`[backfill] covers: ${rows.length} hotlinked project covers [${elapsed()}]`)
  await runRows(
    'covers',
    rows,
    CONC,
    async (r) => {
      const local = await download(r.coverImage, 'cover')
      if (!local) return 'failed'
      await prisma.project.update({ where: { id: r.id }, data: { coverImage: local } })
      return 'localized'
    },
    counts
  )
  summary.covers = { ...counts, total: rows.length }
  return !counts.stopped
}

async function phaseScalar(label, model, idField, urlField, kind, extraWhere) {
  const counts = { localized: 0, failed: 0, stopped: false }
  let rows = await model.findMany({
    where: { ...extraWhere, [urlField]: { startsWith: 'http' } },
    select: { [idField]: true, [urlField]: true },
  })
  if (Number.isFinite(LIMIT)) rows = rows.slice(0, LIMIT)
  console.log(`[backfill] ${label}: ${rows.length} rows [${elapsed()}]`)
  await runRows(
    label,
    rows,
    CONC,
    async (r) => {
      const local = await download(r[urlField], kind)
      if (!local) return 'failed'
      await model.update({ where: { [idField]: r[idField] }, data: { [urlField]: local } })
      return 'localized'
    },
    counts
  )
  summary[label] = { ...counts, total: rows.length }
  return !counts.stopped
}

async function phaseGalleries() {
  const counts = { localized: 0, failed: 0, stopped: false }
  let rows = await prisma.project.findMany({
    where: { gallery: { contains: 'http' } },
    select: { id: true, gallery: true },
  })
  if (Number.isFinite(LIMIT)) rows = rows.slice(0, LIMIT)
  console.log(`[backfill] galleries: ${rows.length} projects [${elapsed()}]`)
  await runRows(
    'galleries',
    rows,
    2, // rows in parallel; each fans out to 5 downloads
    async (r) => {
      let urls
      try {
        urls = JSON.parse(r.gallery)
        if (!Array.isArray(urls)) return 'failed'
      } catch {
        return 'failed'
      }
      const hot = urls.filter((u) => typeof u === 'string' && u.startsWith('http'))
      if (!hot.length) return 'failed'
      // concurrency-limited per-file, keeps hotlink per failed file
      const out = new Array(urls.length)
      let j = 0
      await Promise.all(
        Array.from({ length: Math.min(CONC, urls.length) }, async () => {
          while (j < urls.length) {
            const k = j++
            const u = urls[k]
            if (typeof u === 'string' && u.startsWith('http')) {
              if (outOfTime()) {
                out[k] = u
                continue
              }
              out[k] = (await download(u, 'gallery')) || u
            } else {
              out[k] = u
            }
          }
        })
      )
      const changed = out.some((u, k) => u !== urls[k])
      if (!changed) return 'failed' // nothing verified: NEVER touch the row
      await prisma.project.update({ where: { id: r.id }, data: { gallery: JSON.stringify(out) } })
      return 'localized'
    },
    counts
  )
  summary.galleries = { ...counts, total: rows.length }
  return !counts.stopped
}

async function main() {
  console.log(`[backfill] start budget=${Math.round(BUDGET_MS / 60000)}min limit=${Number.isFinite(LIMIT) ? LIMIT : 'none'}`)
  if (!(await diskOk())) {
    console.log('[backfill] disk critically low at start — aborting, nothing touched')
    return
  }
  if (!(await phaseCovers())) return done()
  if (COVERS_ONLY) return done()
  if (!(await diskOk())) return done('disk low — stopping')
  if (!(await phaseScalar('logos', prisma.developerProfile, 'id', 'logo', 'logo'))) return done()
  if (!(await diskOk())) return done('disk low — stopping')
  if (!(await phaseScalar('masterplans', prisma.masterPlanImage, 'id', 'url', 'masterplan'))) return done()
  if (!(await diskOk())) return done('disk low — stopping')
  if (!(await phaseScalar('brochures', prisma.projectBrochure, 'id', 'url', 'brochure'))) return done()
  if (SKIP_GALLERIES) return done('galleries skipped by flag')
  if (!(await diskOk())) return done('disk low — stopping')
  await phaseGalleries()
  done()

  function done(note) {
    console.log(`[backfill] SUMMARY ${note ? '(' + note + ')' : ''} elapsed=${elapsed()}`)
    for (const [k, v] of Object.entries(summary)) console.log(`  ${k}: total=${v.total} ok=${v.localized} fail=${v.failed}`)
    console.log('[backfill] rerun leftovers with: node scripts/localize-media.mjs')
  }
}

await main()
  .catch((e) => {
    console.error('[backfill] fatal:', e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
