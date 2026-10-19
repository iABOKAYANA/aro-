// ─── Owner: "اتاكد من كل المشاريع انو المطور بتاعو صح واعمل سيرش" ───
// For every VISIBLE project: SearXNG web-search "<project> <city> compound developer"
// and detect which developer companies (from the DB's 395 profiles) appear in the
// top results. Output per project: current dev, matched devs, and flag when the
// current dev is NOT among the matched ones (or nothing matched at all).
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const http = require('http')

const SKIP_DEV_TOKENS = /^(developments?|properties|real estate|group|holding|egypt|the|for|and)$/

function searx(query, n = 6) {
  return new Promise((resolve) => {
    const url = `http://127.0.0.1:8888/search?q=${encodeURIComponent(query)}&format=json&language=en&safesearch=0`
    const req = http.get(url, { timeout: 20000 }, (res) => {
      let b = ''
      res.on('data', (c) => (b += c))
      res.on('end', () => {
        try {
          const d = JSON.parse(b)
          resolve((d.results || []).slice(0, n).map((r) => `${r.title || ''} || ${r.content || ''}`))
        } catch { resolve([]) }
      })
    })
    req.on('error', () => resolve([]))
    req.on('timeout', () => { req.destroy(); resolve([]) })
  })
}

function companyTokens(company) {
  return company
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .filter((w) => w.length > 2 && !SKIP_DEV_TOKENS.test(w))
}

async function main() {
  const devs = (await p.developerProfile.findMany({ select: { id: true, companyName: true } }))
    .map((d) => ({ ...d, tokens: companyTokens(d.companyName) }))
    .filter((d) => d.tokens.length > 0)
  const devById = Object.fromEntries(devs.map((d) => [d.id, d.companyName]))

  const rows = await p.project.findMany({
    where: { isActive: true, approvalStatus: { in: ['PUBLISHED', 'APPROVED'] } },
    select: { slug: true, name: true, developerId: true, city: { select: { name: true } } },
    orderBy: { name: 'asc' },
  })

  let flagged = 0
  for (const r of rows) {
    const cur = devById[r.developerId] || '??(id ' + r.developerId + ')'
    const q = `"${r.name}" ${r.city?.name || ''} compound developer Egypt`.replace(/\s+/g, ' ').trim()
    const texts = await searx(q)
    const hay = texts.join(' \n ').toLowerCase()
    const found = new Set()
    for (const d of devs) {
      if (d.tokens.every((t) => hay.includes(t))) found.add(d.companyName)
    }
    const foundArr = [...found]
    const currentOk = foundArr.some((f) => f === cur)
    const mismatch = foundArr.length > 0 && !currentOk
    const noInfo = foundArr.length === 0
    if (mismatch || noInfo) flagged++
    console.log(`${mismatch ? 'MISMATCH' : noInfo ? 'NO-INFO ' : 'ok      '} | ${r.slug} | cur=${cur} | found=${foundArr.join(' + ') || '-'}`)
    if (mismatch) for (const t of texts.slice(0, 3)) console.log(`    · ${t.slice(0, 150)}`)
    await new Promise((res) => setTimeout(res, 700))
  }
  console.log(`\nflagged: ${flagged}/${rows.length}`)
  await p.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
