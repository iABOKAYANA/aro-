// ─── Owner: "اي مشروع منغير صوره دور عليها وحطها" ───
// For each visible project without a coverImage: search images via the local
// SearXNG instance (127.0.0.1:8888), pick a candidate matching the project's
// tokens (title or image URL), download it into public/images/uploads (same
// convention as existing covers) and set coverImage. Social/blocked domains
// skipped. Anything left with no match is reported, never faked.
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const http = require('http')
const https = require('https')
const fs = require('fs')
const path = require('path')

const TARGETS = [
  { slug: 'hyde-park-central-villas', tokens: ['hyde park central villas', 'hyde-park-central'], developer: 'Hyde Park' },
  { slug: 'palm-hills-one', tokens: ['palm hills one compound', 'palm hills one 6th'], developer: 'Palm Hills' },
  { slug: 'the-crown-extension', tokens: ['the crown extension palm hills', 'crown extension compound'], developer: 'Palm Hills' },
  { slug: '464-acre-commercial-sodic', tokens: ['464 by sodic', 'sodic 464 acre'], developer: 'SODIC' },
  { slug: 'v-editions-sodic', tokens: ['v editions sodic', 'sodic v editions'], developer: 'SODIC' },
  { slug: 'forty-west', tokens: ['forty west sodic', '40 west sodic'], developer: 'SODIC' },
  { slug: 'jirian', tokens: ['jirian palm hills', 'jirian compound'], developer: 'Palm Hills' },
  { slug: 'safa-medi-plex', tokens: ['safa medi plex', 'safam medi plex hyde park'], developer: 'Hyde Park' },
  { slug: 'hyde-park-greens', tokens: ['hyde park greens new cairo', 'hyde-park-greens'], developer: 'Hyde Park' },
]

const BLOCKED = /pinterest\.|instagram\.|facebook\.|lookaside\.|tiktok\.|youtube\./
const GOOD_EXT = /\.(jpe?g|png|webp)(\?|$)/i

function searx(query) {
  return new Promise((resolve, reject) => {
    const url = `http://127.0.0.1:8888/search?q=${encodeURIComponent(query)}&categories=images&format=json&language=en`
    http.get(url, (res) => {
      let b = ''
      res.on('data', (c) => (b += c))
      res.on('end', () => { try { resolve(JSON.parse(b)) } catch (e) { reject(e) } })
    }).on('error', reject)
  })
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' }, timeout: 25000 }, (res) => {
      if (res.statusCode !== 200 || (res.headers['content-type'] || '').startsWith('text')) return reject(new Error(`http ${res.statusCode}`))
      const f = fs.createWriteStream(dest)
      res.pipe(f)
      f.on('finish', () => f.close(() => resolve(true)))
      f.on('error', reject)
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('timeout')) })
  })
}

async function main() {
  const UPLOADS = '/opt/ghaya/public/images/uploads'
  for (const t of TARGETS) {
    const pr = await p.project.findUnique({ where: { slug: t.slug }, select: { id: true, name: true, coverImage: true } })
    if (!pr) { console.log(`${t.slug}: MISSING PROJECT`); continue }
    if (pr.coverImage) { console.log(`${t.slug}: already has cover — skip`); continue }

    let picked = null
    for (const q of t.tokens) {
      let res
      try { res = await searx(q) } catch (e) { console.log(`${t.slug}: searx error`, e.message); break }
      const rows = (res.results || []).filter((r) => r.img_src && GOOD_EXT.test(r.img_src) && !BLOCKED.test(r.img_src))
      const match = rows.find((r) => {
        const hay = `${(r.title || '')} ${r.img_src}`.toLowerCase()
        const core = q.split(' ').filter((w) => w.length > 2)
        return core.filter((w) => hay.includes(w.replace(/\s+/g, '-')) || hay.includes(w)).length >= Math.min(2, core.length)
      })
      if (match) { picked = { url: match.img_src, title: match.title || '', query: q }; break }
    }

    if (!picked) { console.log(`${t.slug}: NO MATCH — needs manual photo`); continue }

    const mm = picked.url.match(GOOD_EXT)
    const extRaw = mm ? mm[1].toLowerCase() : 'png'
    const ext = extRaw === 'jpeg' ? 'jpg' : extRaw
    const fname = `${Date.now()}-${t.slug.replace(/[^a-z0-9]+/gi, '-')}.${ext}`
    const dest = path.join(UPLOADS, fname)
    try {
      await download(picked.url, dest)
      const size = fs.statSync(dest).size
      if (size < 15000) { fs.unlinkSync(dest); console.log(`${t.slug}: too small (${size}b) — skip ${picked.url.slice(0, 80)}`); continue }
      await p.project.update({ where: { id: pr.id }, data: { coverImage: `/images/uploads/${fname}` } })
      console.log(`${t.slug}: OK ${fname} (${(size / 1024).toFixed(0)}KB) ← "${picked.title.slice(0, 60)}" [${picked.query}]`)
    } catch (e) {
      console.log(`${t.slug}: download failed ${e.message} ${picked.url.slice(0, 80)}`)
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
  await p.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
