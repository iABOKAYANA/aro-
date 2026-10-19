// Check which MV-JSON slugs are active / archived / missing after the phase merges.
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const DATA = require('./mv-availability-2026-10-15.json')

async function main() {
  const slugs = {}
  for (const d of DATA) slugs[d.slug] = (slugs[d.slug] || 0) + 1
  const found = await p.project.findMany({
    where: { slug: { in: Object.keys(slugs) } },
    select: { slug: true, name: true, isActive: true, approvalStatus: true, _count: { select: { units: true } } },
  })
  const map = new Map(found.map((f) => [f.slug, f]))
  const rows = Object.entries(slugs).map(([s, c]) => {
    const m = map.get(s)
    return { slug: s, rows: c, active: m ? m.isActive : null, status: m ? m.approvalStatus : null, units: m ? m._count.units : null, name: m ? m.name : null }
  }).sort((a, b) => b.rows - a.rows)
  for (const r of rows) {
    const tag = r.active === false ? 'ARCH' : r.active ? 'OK  ' : 'MISS'
    console.log(`${tag} ${r.slug} rows=${r.rows} units=${r.units ?? '-'} ${r.name ?? ''}`)
  }
  console.log('distinct slugs:', rows.length, 'total rows:', DATA.length)
  await p.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
