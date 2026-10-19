// Targeted cover fetches for the 4 remaining/flagged projects (owner's sites above).
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const https = require('https')
const http = require('http')
const fs = require('fs')
const path = require('path')

const PICKS = [
  { slug: 'safa-medi-plex', url: 'https://flatandvilla.com/wp-content/uploads/2026/09/Safa-Medi-Plex-Hyde-Park-New-Cairo.webp' },
  { slug: 'v-editions-sodic', url: 'https://iproperties.com.eg/wp-content/uploads/2022/02/Cover-1-11.jpg' },
  { slug: '464-acre-commercial-sodic', url: 'https://newcairo-developments.com/wp-content/uploads/2024/04/Sodic-East-New-Cairo-Compound.jpg' },
]

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' }, timeout: 25000 }, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`http ${res.statusCode}`))
      const f = fs.createWriteStream(dest)
      res.pipe(f)
      f.on('finish', () => f.close(() => resolve(true)))
      f.on('error', reject)
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('timeout')) })
  })
}

async function main() {
  for (const t of PICKS) {
    const pr = await p.project.findUnique({ where: { slug: t.slug }, select: { id: true, coverImage: true } })
    if (!pr) { console.log(`${t.slug}: project missing`); continue }
    const mm = t.url.match(/\.(jpe?g|png|webp)(\?|$)/i)
    const extRaw = mm ? mm[1].toLowerCase() : 'jpg'
    const ext = extRaw === 'jpeg' ? 'jpg' : extRaw
    const fname = `${Date.now()}-${t.slug.replace(/[^a-z0-9]+/gi, '-')}.${ext}`
    const dest = path.join('/opt/ghaya/public/images/uploads', fname)
    try {
      await download(t.url, dest)
      const size = fs.statSync(dest).size
      if (size < 20000) { fs.unlinkSync(dest); console.log(`${t.slug}: too small ${size}`); continue }
      await p.project.update({ where: { id: pr.id }, data: { coverImage: `/images/uploads/${fname}` } })
      console.log(`${t.slug}: OK ${fname} (${(size / 1024).toFixed(0)}KB)`)
    } catch (e) { console.log(`${t.slug}: FAIL ${e.message}`) }
  }
  await p.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
