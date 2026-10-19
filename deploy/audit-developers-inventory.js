// ─── Owner: "اتاكد من كل المشاريع انو المطور بتاعو صح" ───
// Step 1: inventory of all VISIBLE projects + their developer.
// Step 2: for each, web-check via local SearXNG: does the current developer's
// name appear in top results for "<project> compound developer"? and does any
// OTHER known developer name (from DB) appear instead? Report mismatches.
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const http = require('http')

function searx(query, n = 6) {
  return new Promise((resolve) => {
    const url = `http://127.0.0.1:8888/search?q=${encodeURIComponent(query)}&format=json&language=en`
    http.get(url, (res) => {
      let b = ''
      res.on('data', (c) => (b += c))
      res.on('end', () => {
        try {
          const d = JSON.parse(b)
          resolve((d.results || []).slice(0, n).map((r) => `${r.title || ''} — ${r.content || ''}`))
        } catch { resolve([]) }
      })
    }).on('error', () => resolve([]))
  })
}

// company tokens → match in web text. long names need flexible matching.
function devTokens(company) {
  const stop = new Set(['developments', 'development', 'properties', 'real', 'estate', 'group', 'egypt', 'the', 'for'])
  return company.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !stop.has(w))
}

async function main() {
  const devs = await p.developerProfile.findMany({ select: { id: true, companyName: true } })
  const devById = Object.fromEntries(devs.map((d) => [d.id, d.companyName]))

  const rows = await p.project.findMany({
    where: { isActive: true, approvalStatus: { in: ['PUBLISHED', 'APPROVED'] } },
    select: { id: true, slug: true, name: true, developerId: true, city: { select: { name: true } } },
    orderBy: { name: 'asc' },
  })
  console.log(`visible: ${rows.length}, developers in DB: ${devs.length}`)
  console.log('=== INVENTORY ===')
  for (const r of rows) console.log(`${r.slug} | ${r.name} | ${devById[r.developerId] || '??(id ' + r.developerId + ')'} | ${r.city?.name || ''}`)
  await p.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
