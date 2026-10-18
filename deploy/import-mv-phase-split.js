// ─── Mountain View phase split (owner-approved: "الأولى والأخيرة") ───
// (1) Phase groups whose MV catalog entry EXISTS and is ACTIVE receive their units:
//     the ProjectPhase row itself is reassigned (projectId → target) so units keep
//     their phaseId — zero duplication, counts stay honest.
//     Phases whose only entries are INACTIVE (OFF) in the catalog stay under the
//     active parent so the units remain publicly visible.
// (3) Phase groups with NO catalog entry become new published projects (real MV
//     phase codes as names, geo/developer copied from the parent, totals derived).
// Idempotent. Run on VPS:  cd /opt/ghaya && node deploy/import-mv-phase-split.js

const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const RAW = require('./mv-availability-2026-10-15.json')
const DATA = Array.isArray(RAW) ? { rows: RAW } : RAW

// (parentSlug, phaseName) → existing ACTIVE catalog entry
const MOVE_MAP = {
  '1648-crysta|KI2': '1981-kin-island-crysta',
  '1648-crysta|KI3': '1981-kin-island-crysta',
  '1648-crysta|BI1': '2317-blue-island-crysta',
  '422-mountain-view-icity-october|Club': '1619-club-park-icity-october',
  '422-mountain-view-icity-october|Lagoon Park': '693-lagoon-beach-park-mountain-view-i-city-october',
  '422-mountain-view-icity-october|MV Park': '1889-mv-park-icity-new-october',
  '195-mountain-view-icity-new-cairo|Club': '1621-club-park-icity-new-cairo',
  '195-mountain-view-icity-new-cairo|Lagoon Park': '537-lagoon-beach-park-mountain-view-i-city-new-cairo',
  '989-lvls-mountain-view|Beach Top': '2334-the-beach-top-lvls',
  '989-lvls-mountain-view|Sea Mount': '2055-sea-mount-lvls',
  '989-lvls-mountain-view|SM': '2055-sea-mount-lvls',
  '45-mountain-view-ras-el-hekma|Indigo': '2693-indigo',
}

// groups that must NOT be touched (their catalog entries are INACTIVE → stay under parent)
const KEEP = /^(2248-mountain-view-5th-settlement|996-aliva-mountain-view-mostakbal-city|655-mountain-view-1\.1|195-mountain-view-icity-new-cairo\|The North Park)/

async function main() {
  // inventory of phase groups from the imported feed
  const groups = new Map() // "parentSlug|phase" → count
  for (const r of DATA.rows) if (r.phase) groups.set(`${r.slug}|${r.phase}`, (groups.get(`${r.slug}|${r.phase}`) || 0) + 1)

  const moved = [], created = [], kept = []
  const touched = new Set()

  for (const key of groups.keys()) {
    if (MOVE_MAP[key]) moved.push(key)
    else if (KEEP.test(key)) kept.push(key)
    else created.push(key)
  }
  const unhandled = created.filter((k) => !k)
  if (kept.length + moved.length + created.length !== groups.size) throw new Error('group accounting broken')
  console.log(`groups: total=${groups.size} move=${moved.length} keep=${kept.length} new=${created.length}`)
  if (moved.length + created.length + kept.length !== groups.size || unhandled.length) throw new Error('bad accounting')

  // 1) create new projects for unlisted phase groups (keep = remaining parent phases stay)
  const targetIds = {}
  for (const key of created) {
    const [parentSlug, phase] = key.split('|')
    const parent = await p.project.findUnique({ where: { slug: parentSlug }, select: { id: true, name: true, nameArabic: true, developerId: true, cityId: true, governorateId: true, districtId: true, status: true, propertyTypes: true } })
    if (!parent) throw new Error(`parent missing: ${parentSlug}`)
    const base = parentSlug.replace(/^\d+-/, '')
    const phaseSlug = phase.toLowerCase().replace(/\./g, '-').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    const slug = `${phaseSlug}-${base}`
    let target = await p.project.findUnique({ where: { slug }, select: { id: true } })
    if (!target) {
      target = await p.project.create({
        data: {
          slug,
          name: `${phase} – ${parent.name.split(' - ')[0]}`,
          nameArabic: `${phase} – ${parent.nameArabic || parent.name}`,
          isActive: true,
          approvalStatus: 'PUBLISHED',
          propertyTypes: parent.propertyTypes || '',
          status: parent.status || 'UNDER_CONSTRUCTION',
          ...(Object.fromEntries(Object.entries({ developerId: parent.developerId, cityId: parent.cityId, governorateId: parent.governorateId, districtId: parent.districtId }).filter(([, v]) => v != null))),
        },
        select: { id: true },
      })
      console.log(`  + new project: ${slug}`)
    }
    targetIds[key] = target.id
    touched.add(target.id)
    touched.add(parent.id)
  }

  // 2) reassign phase rows (and their units) to targets
  for (const key of [...moved, ...created]) {
    const [parentSlug, phase] = key.split('|')
    const parent = await p.project.findUnique({ where: { slug: parentSlug }, select: { id: true } })
    if (!parent) continue
    const ph = await p.projectPhase.findFirst({ where: { projectId: parent.id, name: phase }, select: { id: true, projectId: true } })
    if (!ph) throw new Error(`phase row missing: ${key}`)
    const targetId = MOVE_MAP[key] ? (await p.project.findUnique({ where: { slug: MOVE_MAP[key] }, select: { id: true } })).id : targetIds[key]
    await p.unit.updateMany({ where: { phaseId: ph.id }, data: { projectId: targetId } })
    await p.projectPhase.update({ where: { id: ph.id }, data: { projectId: targetId } })
    touched.add(parent.id)
    touched.add(targetId)
  }
  console.log('phase rows reassigned')

  // 3) recompute every touched project's totals + every touched project's phase totals
  for (const projectId of touched) {
    const phases = await p.projectPhase.findMany({ where: { projectId }, select: { id: true } })
    for (const ph of phases) {
      const agg = await p.unit.aggregate({ where: { phaseId: ph.id }, _count: { id: true }, _min: { price: true }, _max: { price: true } })
      await p.projectPhase.update({ where: { id: ph.id }, data: { totalUnits: agg._count.id, startPrice: agg._min.price ?? null, endPrice: agg._max.price ?? null } })
    }
    const agg = await p.unit.aggregate({ where: { projectId }, _count: { id: true }, _min: { price: true }, _max: { price: true } })
    let propertyTypes
    if (agg._count.id) {
      propertyTypes = await p.unit.groupBy({ where: { projectId }, by: ['unitType'] }).then((g) => g.map((x) => x.unitType).join(', '))
    }
    await p.project.update({
      where: { id: projectId },
      data: { startPrice: agg._min.price ?? null, endPrice: agg._max.price ?? null, ...(propertyTypes ? { propertyTypes } : {}) },
    })
  }
  console.log('totals recomputed for', touched.size, 'projects')

  // summary print
  const slugs = [...touched]
  for (const id of slugs) {
    const pr = await p.project.findUnique({ where: { id }, select: { slug: true, isActive: true, startPrice: true, _count: { select: { units: true, phases: true } } } })
    console.log(`  ${pr.slug}: units=${pr._count.units} phases=${pr._count.phases} start=${pr.startPrice ?? '—'} ${pr.isActive ? 'ACTIVE' : 'OFF'}`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => p.$disconnect())
