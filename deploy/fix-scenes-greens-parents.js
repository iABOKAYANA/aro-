// Fix-up after stage-create-parents run:
// 1) scenes-new (created, 0u) → reparent its phase into 1391-scenes, archive scenes-new
// 2) hyde-park-greens-cluster-23-1 → rename to compound "Hyde Park Greens",
//    phase renamed "Cluster 23" (unit stays attached)
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
  // 1) SCENES
  const scenesParent = await p.project.findUnique({ where: { slug: '1391-scenes' }, select: { id: true, name: true } })
  const scNew = await p.project.findUnique({ where: { slug: 'scenes-new' }, select: { id: true } })
  if (!scenesParent || !scNew) throw new Error('missing scenes parents')
  const phs = await p.projectPhase.findMany({ where: { projectId: scNew.id }, select: { id: true, name: true } })
  for (const ph of phs) {
    const clash = await p.projectPhase.findFirst({ where: { projectId: scenesParent.id, name: ph.name }, select: { id: true } })
    if (!clash) await p.projectPhase.update({ where: { id: ph.id }, data: { projectId: scenesParent.id, name: 'New Phase' } })
    else await p.projectPhase.delete({ where: { id: ph.id } })
  }
  const scCount = await p.projectPhase.count({ where: { projectId: scNew.id } })
  if (scCount === 0) await p.project.update({ where: { id: scNew.id }, data: { isActive: false, approvalStatus: 'ARCHIVED' } })
  console.log('SCENES fixed, extra parent archived (phases moved:', phs.length + ')')

  // 2) Hyde Park Greens cluster-23 parent rename
  const cg = await p.project.findUnique({ where: { slug: 'hyde-park-greens-cluster-23-1' }, select: { id: true } })
  if (!cg) throw new Error('missing greens parent')
  let slug = 'hyde-park-greens'
  let n = 1
  while (await p.project.findUnique({ where: { slug }, select: { id: true } })) slug = `hyde-park-greens-${n++}`
  await p.project.update({ where: { id: cg.id }, data: { slug, name: 'Hyde Park Greens', nameArabic: 'هايد بارك جرينز', metaTitle: null, metaDescription: null } })
  const gphs = await p.projectPhase.findMany({ where: { projectId: cg.id }, select: { id: true, name: true } })
  for (const ph of gphs) {
    if (ph.name === 'Hyde Park Greens - Cluster 23') await p.projectPhase.update({ where: { id: ph.id }, data: { name: 'Cluster 23' } })
  }
  console.log('Hyde Park Greens parent fixed →', slug)

  // recompute both parents' totals
  for (const parentId of [scenesParent.id, cg.id]) {
    const where = { projectId: parentId, status: { in: ['AVAILABLE', 'Vacant'] }, isSample: false }
    const agg = await p.unit.aggregate({ where, _count: { id: true }, _min: { price: true }, _max: { price: true } })
    const types = await p.unit.groupBy({ where, by: ['unitType'] })
    if (agg._count.id > 0) {
      const proj = await p.project.findUnique({ where: { id: parentId }, select: { propertyTypes: true } })
      const oldTypes = JSON.parse(proj.propertyTypes || '[]')
      await p.project.update({
        where: { id: parentId },
        data: { startPrice: agg._min.price, endPrice: agg._max.price, propertyTypes: JSON.stringify([...new Set([...oldTypes, ...types.map((t) => t.unitType)])]) },
      })
    }
    const phases = await p.projectPhase.findMany({ where: { projectId: parentId }, select: { id: true } })
    for (const ph of phases) {
      const pa = await p.unit.aggregate({ where: { phaseId: ph.id }, _count: { id: true }, _min: { price: true }, _max: { price: true } })
      await p.projectPhase.update({ where: { id: ph.id }, data: { totalUnits: pa._count.id, startPrice: pa._min.price ?? null, endPrice: pa._max.price ?? null } })
    }
  }
  console.log('totals recomputed')
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => p.$disconnect())
