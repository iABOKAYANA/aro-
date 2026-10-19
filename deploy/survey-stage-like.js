// Find remaining stage-like standalone projects by name patterns + family links.
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
async function main() {
  const patterns = ['phase', 'مرحلة', 'zone ', 'cluster', 'stage', 'district-', 'فاز', 'المرحلة']
  const projects = await p.project.findMany({
    where: { isActive: true },
    select: { id: true, slug: true, name: true, nameArabic: true, _count: { select: { units: true, phases: true } }, developer: { select: { companyName: true } }, city: { select: { name: true } } },
    orderBy: { slug: 'asc' },
  })
  const hits = []
  for (const pr of projects) {
    const n = pr.name.toLowerCase()
    const na = pr.nameArabic || ''
    const hit = patterns.some((x) => n.includes(x) || na.includes(x))
    if (hit) hits.push({ slug: pr.slug, name: pr.name, ar: pr.nameArabic, units: pr._count.units, phases: pr._count.phases, dev: pr.developer?.companyName, city: pr.city?.name })
  }
  console.log('stage-like projects:', hits.length)
  for (const h of hits) console.log(`${h.slug} | ${h.units}u | ${h.dev} | ${h.name}`)
  require('fs').writeFileSync('/root/stage-like.json', JSON.stringify(hits, null, 1))
  await p.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
