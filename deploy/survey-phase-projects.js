// Survey phase-projects (projects that are actually phases/clusters of a parent)
// Two detection channels:
//  D endash-name: name = "Phase – ParentName" (phase-split convention)
//  S slug-base:  slug = <id>-<phaseToken>-<parentBase> and project <id>-<parentBase> exists
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
  const projects = await p.project.findMany({
    where: { isActive: true },
    select: { id: true, slug: true, name: true, nameArabic: true, _count: { select: { units: true, phases: true } } },
  })
  const byName = new Map(projects.map((x) => [x.name.trim().toLowerCase(), x]))
  const bySlugBase = new Map(projects.map((x) => [x.slug.replace(/^\d+-/, ''), x]))
  const cand = []
  for (const pr of projects) {
    // self-phase guard: parent phase rows inside it don't matter
    const lines = pr.name.split(/['"\n]/)
    void lines
    const hasDash = pr.name.includes('–')
    const sm = pr.slug.match(/^\d+-([A-Za-z0-9.]+)-(.+)$/)
    let parent = null
    let how = null
    if (hasDash) {
      const right = pr.name.split('–')[1].trim().toLowerCase()
      parent = byName.get(right) || byName.get(right.replace(/\s+/g, ' '))
      if (parent && parent.id !== pr.id) how = 'endash-name'
    }
    if (!parent && sm && !hasDash) {
      const parentBySlug = bySlugBase.get(sm[2])
      if (parentBySlug && parentBySlug.id !== pr.id) { parent = parentBySlug; how = 'slug-base' }
    }
    if (parent && how) {
      cand.push({ slug: pr.slug, name: pr.name, parent: parent.slug, parentName: parent.name, units: pr._count.units, phases: pr._count.phases, how })
    }
  }
  const jsonPath = '/root/phase-merge-survey.json'
  require('fs').writeFileSync(jsonPath, JSON.stringify(cand, null, 1))
  console.log('candidates:', cand.length, '→', jsonPath)
  const summary = new Map()
  for (const c of cand) {
    const k = c.parent
    const row = summary.get(k) || { parent: k, children: 0, units: 0 }
    row.children++
    row.units += c.units
    summary.set(k, row)
  }
  for (const row of [...summary.values()].sort((a, b) => b.units - a.units)) {
    console.log(`${row.parent}  children=${row.children} units=${row.units}`)
  }
  await p.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
