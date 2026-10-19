// Clean phase display names: batch-1 merge appended " (slug words)" on name
// clashes, e.g. "NF2 (nf2 jirian mountain view)". Strip the suffix; when a
// same-project phase already carries the clean name, move its units there and
// delete the duplicate row (units reassigned first — no orphans).
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
  const phases = await p.projectPhase.findMany({ select: { id: true, projectId: true, name: true, totalUnits: true } })
  const affectedIds = new Set()
  let renamed = 0, mergedRows = 0

  for (const ph of phases) {
    const m = ph.name.match(/^(.+) \([A-Za-z0-9.\- ]+\)$/)
    if (!m) continue
    const clean = m[1].trim()
    if (!clean) continue
    const twin = await p.projectPhase.findFirst({ where: { projectId: ph.projectId, name: clean, id: { not: ph.id } }, select: { id: true, totalUnits: true } })
    if (twin) {
      await p.unit.updateMany({ where: { phaseId: ph.id }, data: { phaseId: twin.id } })
      await p.projectPhase.delete({ where: { id: ph.id } })
      mergedRows++
      affectedIds.add(twin.id)
    } else {
      await p.projectPhase.update({ where: { id: ph.id }, data: { name: clean } })
      renamed++
    }
  }

  // recompute totals for every affected phase + their parents
  for (const id of affectedIds) {
    const ph = await p.projectPhase.findUnique({ where: { id }, select: { projectId: true } })
    if (ph) affectedIds.add(id)
  }
  const touchedPhases = affectedIds.size ? [...affectedIds] : []
  const projectIds = new Set()
  for (const ph of await p.projectPhase.findMany({ where: { id: { in: touchedPhases.length ? touchedPhases : ['__none__'] } }, select: { id: true, projectId: true } })) {
    projectIds.add(ph.projectId)
  }
  // also touched phases that were merely renamed still need honest totals
  for (const ph of await p.projectPhase.findMany({ where: { units: { some: {} } }, select: { id: true, projectId: true } })) {
    const pa = await p.unit.aggregate({ where: { phaseId: ph.id }, _count: { id: true }, _min: { price: true }, _max: { price: true } })
    await p.projectPhase.update({ where: { id: ph.id }, data: { totalUnits: pa._count.id, startPrice: pa._min.price ?? null, endPrice: pa._max.price ?? null } })
  }
  for (const projectId of projectIds) {
    const where = { projectId, status: { in: ['AVAILABLE', 'Vacant'] }, isSample: false }
    const agg = await p.unit.aggregate({ where, _count: { id: true }, _min: { price: true }, _max: { price: true } })
    if (agg._count.id > 0) {
      await p.project.update({ where: { id: projectId }, data: { startPrice: agg._min.price, endPrice: agg._max.price } })
    }
  }
  console.log(`DONE — renamed=${renamed} duplicatesMerged=${mergedRows}`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => p.$disconnect())
