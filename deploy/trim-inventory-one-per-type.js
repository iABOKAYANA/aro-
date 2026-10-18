// Destructive owner-approved cleanup: keep exactly one representative unit per
// project + unitType; delete every other Unit row, including samples. The full
// pre-cleanup DB is backed up before this script is run.
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

function groupKey(unit) {
  return `${unit.projectId}::${unit.unitType || 'UNKNOWN'}`
}

async function main() {
  const units = await p.unit.findMany({
    select: { id: true, projectId: true, unitType: true, area: true, price: true, status: true, isSample: true, unitNumber: true },
  })
  const groups = new Map()
  for (const unit of units) {
    const key = groupKey(unit)
    const list = groups.get(key) || []
    list.push(unit)
    groups.set(key, list)
  }

  const keep = new Set()
  for (const list of groups.values()) {
    // Prefer real available inventory over sold/sample rows, then choose the
    // median area so the retained card is representative rather than cheapest.
    const available = list.filter((u) => !u.isSample && (u.status === 'AVAILABLE' || u.status === 'Vacant'))
    const candidates = available.length ? available : list.filter((u) => !u.isSample).length ? list.filter((u) => !u.isSample) : list
    candidates.sort((a, b) => (a.area || 0) - (b.area || 0) || (a.price || 0) - (b.price || 0))
    keep.add(candidates[Math.floor((candidates.length - 1) / 2)].id)
  }

  const remove = units.filter((u) => !keep.has(u.id)).map((u) => u.id)
  console.log(`BEFORE units=${units.length} projectTypeGroups=${groups.size} keep=${keep.size} delete=${remove.length}`)

  for (let i = 0; i < remove.length; i += 400) {
    await p.unit.deleteMany({ where: { id: { in: remove.slice(i, i + 400) } } })
  }

  const projects = await p.project.findMany({ where: { units: { some: {} } }, select: { id: true, slug: true, propertyTypes: true } })
  for (const project of projects) {
    const where = { projectId: project.id }
    const agg = await p.unit.aggregate({ where, _count: { id: true }, _min: { price: true }, _max: { price: true } })
    const types = await p.unit.groupBy({ where, by: ['unitType'] })
    await p.project.update({
      where: { id: project.id },
      data: {
        totalUnits: agg._count.id,
        startPrice: agg._min.price ?? null,
        endPrice: agg._max.price ?? null,
        propertyTypes: JSON.stringify(types.map((x) => x.unitType)),
      },
    })
    const phases = await p.projectPhase.findMany({ where: { projectId: project.id }, select: { id: true } })
    for (const phase of phases) {
      const pa = await p.unit.aggregate({ where: { phaseId: phase.id }, _count: { id: true }, _min: { price: true }, _max: { price: true } })
      await p.projectPhase.update({ where: { id: phase.id }, data: { totalUnits: pa._count.id, startPrice: pa._min.price ?? null, endPrice: pa._max.price ?? null } })
    }
  }
  const after = await p.unit.count()
  console.log(`AFTER units=${after} deleted=${units.length - after} projectsRecomputed=${projects.length}`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => p.$disconnect())
