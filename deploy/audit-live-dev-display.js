// ─── Owner: "فيه مشاريع لسه مش المطور بتاعهم" ───
// Extract what the LIVE public site actually DISPLAYS as developer on every
// visible project page (developer chip inside the page HTML), and join it with
// the DB FK value. Any page where displayed dev ≠ DB dev = stale/caching bug;
// any absurd pairing in the printout = candidate the owner is seeing.
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const http = require('http')

function get(url) {
  return new Promise((resolve) => {
    http.get(url, { timeout: 15000 }, (res) => {
      let b = ''
      res.on('data', (c) => (b += c))
      res.on('end', () => resolve(b))
    }).on('error', () => resolve(''))
  })
}

async function main() {
  const devs = await p.developerProfile.findMany({ select: { id: true, companyName: true, logo: true } })
  const devById = Object.fromEntries(devs.map((d) => [d.id, d]))
  const rows = await p.project.findMany({
    where: { isActive: true, approvalStatus: { in: ['PUBLISHED', 'APPROVED'] } },
    select: { slug: true, name: true, developerId: true },
    orderBy: { name: 'asc' },
  })
  for (const r of rows) {
    const html = await get(`http://127.0.0.1:3000/projects/${r.slug}`)
    const dbDev = devById[r.developerId]?.companyName || '??'
    // displayed: find DB dev name presence in page; and try to catch OTHER dev names present
    const dbInPage = dbDev !== '??' && html.includes(dbDev)
    const others = devs
      .filter((d) => d.companyName !== dbDev && d.companyName.length > 3 && html.includes(d.companyName))
      .map((d) => d.companyName)
    console.log(`${r.slug} | db=${dbDev} | inPage=${dbInPage ? 'yes' : 'NO'}${others.length ? ' | ALSO-MENTIONS=' + others.join(',') : ''}`)
  }
  await p.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
