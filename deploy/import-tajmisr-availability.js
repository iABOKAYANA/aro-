// Taj Misr owner-message availability import. The message gives category/area/price
// aggregates, not unit codes or counts, so each row is explicitly an aggregate card.
// The residence phases are kept separate by delivery/payment terms. One ambiguous
// source price (Dejoya 3, 188m) is deliberately pending and not invented.
// Idempotent by project + phase + aggregate name.

const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const DATA = require('./tajmisr-availability-aggregate.json')
const TYPE_MAP = { Apartment: 'APARTMENT', Duplex: 'DUPLEX', Villa: 'VILLA', 'Twin House': 'VILLA', Standalone: 'VILLA' }

async function main() {
  let created = 0, phasesCreated = 0
  const touched = new Set()
  for (const group of DATA.groups) {
    const project = await p.project.findUnique({ where: { slug: group.projectSlug }, select: { id: true, slug: true, propertyTypes: true } })
    if (!project) throw new Error(`Project not found: ${group.projectSlug}`)
    let phase = await p.projectPhase.findFirst({ where: { projectId: project.id, name: group.phase }, select: { id: true } })
    if (!phase) {
      phase = await p.projectPhase.create({ data: { projectId: project.id, name: group.phase } })
      phasesCreated++
    }
    touched.add(project.id)
    for (const [rawType, area, price] of group.items) {
      const unitType = TYPE_MAP[rawType]
      if (!unitType) throw new Error(`Unknown Taj Misr type: ${rawType}`)
      const name = `${rawType} · ${area} sqm · ${group.phase}`
      const existing = await p.unit.findFirst({ where: { projectId: project.id, phaseId: phase.id, unitNumber: null, unitType, area, price }, select: { id: true } })
      if (existing) {
        await p.unit.update({ where: { id: existing.id }, data: { name, nameArabic: `${rawType} · ${area} م²`, deliveryTerms: group.terms } })
        continue
      }
      await p.unit.create({
        data: {
          projectId: project.id, phaseId: phase.id, unitNumber: null,
          name, nameArabic: `${rawType} · ${area} م²`, unitType,
          listingType: 'SALE', status: 'AVAILABLE', area, price, currency: 'EGP',
          deliveryTerms: group.terms,
        },
      })
      created++
    }
  }
  for (const projectId of touched) {
    const phases = await p.projectPhase.findMany({ where: { projectId }, select: { id: true } })
    for (const phase of phases) {
      const agg = await p.unit.aggregate({ where: { phaseId: phase.id, status: 'AVAILABLE' }, _count: { id: true }, _min: { price: true }, _max: { price: true } })
      await p.projectPhase.update({ where: { id: phase.id }, data: { totalUnits: agg._count.id, startPrice: agg._min.price, endPrice: agg._max.price } })
    }
    const where = { projectId, status: 'AVAILABLE', isSample: false }
    const agg = await p.unit.aggregate({ where, _min: { price: true }, _max: { price: true } })
    const types = await p.unit.groupBy({ where, by: ['unitType'] })
    const project = await p.project.findUnique({ where: { id: projectId }, select: { slug: true, propertyTypes: true } })
    let oldTypes = []
    try { oldTypes = JSON.parse(project.propertyTypes || '[]') } catch { throw new Error(`Invalid propertyTypes JSON: ${project.slug}`) }
    await p.project.update({ where: { id: projectId }, data: { startPrice: agg._min.price, endPrice: agg._max.price, propertyTypes: JSON.stringify([...new Set([...oldTypes, ...types.map((x) => x.unitType)])]) } })
    console.log(`${project.slug}: start=${agg._min.price} end=${agg._max.price}`)
  }
  console.log(`DONE — aggregate rows created=${created}; phases created=${phasesCreated}; pending=${DATA.pendingClarification.length}`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => p.$disconnect())
