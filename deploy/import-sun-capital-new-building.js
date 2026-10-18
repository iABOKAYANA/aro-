// Sun Capital newly launched building — owner message aggregate import.
// No unit count or unit codes were supplied, so each row is a category card,
// not a claim that the project contains exactly one physical unit per row.
// Payment terms and price ranges stay in deliveryTerms/details, not the card title.
// Idempotent by project + phase + type + area + starting price.

const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const DATA = require('./sun-capital-new-building-aggregate.json')

async function main() {
  const project = await p.project.findUnique({ where: { slug: DATA.projectSlug }, select: { id: true, slug: true, propertyTypes: true } })
  if (!project) throw new Error(`Project not found: ${DATA.projectSlug}`)
  let phase = await p.projectPhase.findFirst({ where: { projectId: project.id, name: DATA.groups[0].phase }, select: { id: true } })
  if (!phase) phase = await p.projectPhase.create({ data: { projectId: project.id, name: DATA.groups[0].phase } })
  let created = 0
  for (const group of DATA.groups) {
    const name = `${group.type} · ${group.area} sqm`
    const existing = await p.unit.findFirst({ where: { projectId: project.id, phaseId: phase.id, unitNumber: null, unitType: group.unitType, area: group.area, price: group.price }, select: { id: true } })
    if (existing) {
      await p.unit.update({ where: { id: existing.id }, data: { gardenArea: group.gardenArea ?? null, roofArea: group.roofArea ?? null, deliveryTerms: group.terms, view: 'Prime views' } })
      continue
    }
    await p.unit.create({
      data: {
        projectId: project.id, phaseId: phase.id, unitNumber: null, name,
        nameArabic: `${group.type} · ${group.area} م²`, unitType: group.unitType,
        listingType: 'SALE', status: 'AVAILABLE', bedrooms: group.bedrooms,
        area: group.area, gardenArea: group.gardenArea ?? null, roofArea: group.roofArea ?? null, price: group.price,
        currency: 'EGP', view: 'Prime views', deliveryTerms: group.terms,
      },
    })
    created++
  }
  const where = { projectId: project.id, status: 'AVAILABLE', isSample: false }
  const agg = await p.unit.aggregate({ where, _min: { price: true }, _max: { price: true } })
  const types = await p.unit.groupBy({ where, by: ['unitType'] })
  let oldTypes = []
  try { oldTypes = JSON.parse(project.propertyTypes || '[]') } catch { throw new Error(`Invalid propertyTypes JSON: ${project.slug}`) }
  await p.project.update({ where: { id: project.id }, data: { startPrice: agg._min.price, endPrice: agg._max.price, propertyTypes: JSON.stringify([...new Set([...oldTypes, ...types.map((x) => x.unitType)])]) } })
  const phaseAgg = await p.unit.aggregate({ where: { phaseId: phase.id, status: 'AVAILABLE' }, _count: { id: true }, _min: { price: true }, _max: { price: true } })
  await p.projectPhase.update({ where: { id: phase.id }, data: { totalUnits: phaseAgg._count.id, startPrice: phaseAgg._min.price, endPrice: phaseAgg._max.price } })
  console.log(`DONE — ${project.slug}: rows created=${created}; available aggregate rows=${phaseAgg._count.id}; start=${agg._min.price}; end=${agg._max.price}`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => p.$disconnect())
