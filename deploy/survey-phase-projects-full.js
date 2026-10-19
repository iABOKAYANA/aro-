// Full survey of phase-projects, all detection channels:
// 1) endash name ("Phase – Parent")          2) id-prefixed slug ending in parent base
// 3) unprefixed slug `${phase}-${parentBase}` 4) known imports' explicit cluster slugs
// Outputs curated candidate pairs w/ same-developer check.
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

// Explicit cluster slugs created by our imports' routing maps (import-mv-phase-split MOVE_MAP + Madaar/HP new clusters)
const KNOWN = {
  '537-lagoon-beach-park-mountain-view-i-city-new-cairo': '195-mountain-view-icity-new-cairo',
  '1619-club-park-icity-october': '422-mountain-view-icity-october',
  '693-lagoon-beach-park-mountain-view-i-city-october': '422-mountain-view-icity-october',
  '1889-mv-park-icity-new-october': '422-mountain-view-icity-october',
  '1621-club-park-icity-new-cairo': '195-mountain-view-icity-new-cairo',
  '2055-sea-mount-lvls': '989-lvls-mountain-view',
  '2334-the-beach-top-lvls': '989-lvls-mountain-view',
  '1981-kin-island-crysta': '1648-crysta',
  '2317-blue-island-crysta': '1648-crysta',
  '2693-indigo': '45-mountain-view-ras-el-hekma',
  '1322-central-park-aliva': '996-aliva-mountain-view-mostakbal-city',
  '1323-club-park-aliva': '996-aliva-mountain-view-mostakbal-city',
  '1324-lagoon-beach-park-aliva': '996-aliva-mountain-view-mostakbal-city',
  'lunas-azha-ras-el-hekma': '757-azha-north-coast',
  'velais-azha-ras-el-hekma': '757-azha-north-coast',
  'sea-veil-azha-ras-el-hekma': '757-azha-north-coast',
}

// Jirian + Grand Valleys + MV1.1 unprefixed `${phase}-${base}` slugs
const UNPREFIXED_BASE = [
  ['jirian-mountain-view', '1505-jirian-mountain-view'],
  ['grand-valleys-kayan-city', '1534-grand-valleys-kayan-city'],
  ['mountain-view-1.1', '655-mountain-view-1.1'],
]

async function main() {
  const projects = await p.project.findMany({
    where: { isActive: true },
    select: { id: true, slug: true, name: true, developerId: true, _count: { select: { units: true, phases: true } } },
  })
  const bySlug = new Map(projects.map((x) => [x.slug, x]))
  const byName = new Map(projects.map((x) => [x.name.trim().toLowerCase(), x]))
  const byBase = new Map()
  for (const x of projects) byBase.set(x.slug.replace(/^\d+-/, ''), x)

  const pairs = new Map() // childSlug → {parent, how}
  const add = (child, parentSlug, how) => {
    if (!bySlug.get(child) || !bySlug.get(parentSlug) || child === parentSlug) return
    const prev = pairs.get(child)
    if (prev && prev.parent !== parentSlug) console.error(`CONFLICT child=${child} ${prev.parent} vs ${parentSlug} (${how})`)
    pairs.set(child, { parent: parentSlug, how })
  }

  for (const pr of projects) {
    if (pr.name.includes('–')) {
      const right = pr.name.split('–')[1].trim().toLowerCase()
      const parent = byName.get(right) || byName.get(right.replace(/\s+/g, ' '))
      if (parent) add(pr.slug, parent.slug, 'endash')
    }
    const m = pr.slug.match(/^\d+-([A-Za-z0-9.]+)-(.+)$/)
    if (m) {
      const parent = byBase.get(m[2])
      if (parent) add(pr.slug, parent.slug, 'id-slug-base')
    }
    const m2 = pr.slug.match(/^([A-Za-z][A-Za-z0-9.]*[a-zA-Z0-9])-((?:[a-z0-9.]+)-(?:[a-z0-9.]+)[a-z0-9.-]*)$/)
    if (m2) {
      const parent = byBase.get(m2[2])
      if (parent) add(pr.slug, parent.slug, 'slug-base')
    }
  }
  for (const [child, parent] of Object.entries(KNOWN)) add(child, parent, 'known')
  for (const [base, parentSlug] of UNPREFIXED_BASE) {
    for (const x of projects) {
      if (x.slug.endsWith(`-${base}`)) add(x.slug, parentSlug, 'unprefixed-base')
    }
  }

  // same-developer gate + report
  const out = []
  for (const [child, info] of pairs) {
    const ch = bySlug.get(child); const pa = bySlug.get(info.parent)
    const sameDev = ch.developerId === pa.developerId
    out.push({ child, parent: info.parent, how: info.how, sameDev, childUnits: ch._count.units, childPhases: ch._count.phases, parentUnits: pa._count.units, parentPhases: pa._count.phases })
  }
  require('fs').writeFileSync('/root/phase-merge-candidates.json', JSON.stringify(out, null, 1))

  const diffDev = out.filter((o) => !o.sameDev)
  const merged = out.filter((o) => o.sameDev)
  console.log('total mappings:', out.length, ' sameDev:', merged.length)
  for (const o of merged.sort((a, b) => b.childUnits - a.childUnits)) {
    console.log(`${o.child} (${o.childUnits}u) -> ${o.parent}`)
  }
  console.log('--- different-developer (excluded):')
  for (const o of diffDev) console.log(`${o.child} -> ${o.parent} [${o.how}]`)
  await p.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
