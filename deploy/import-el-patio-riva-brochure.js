// El Patio Riva brochure aggregate import. SOLD types are excluded. Since the
// brochure gives ranges rather than codes/counts, each available row is a
// category aggregate; minimum area and starting price drive the card, while
// ranges and brochure facts remain in deliveryTerms. Payment terms are never
// placed in the card title.

const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const DATA = require('./el-patio-riva-brochure-aggregate.json')

async function main() {
  const project = await p.project.findUnique({ where: { slug: DATA.projectSlug }, select: { id: true, slug: true, propertyTypes: true } })
  if (!project) throw new Error(`Project not found: ${DATA.projectSlug}`)
  let phase = await p.projectPhase.findFirst({ where: { projectId: project.id, name: DATA.phase }, select: { id: true } })
  if (!phase) phase = await p.projectPhase.create({ data: { projectId: project.id, name: DATA.phase } })
  let created = 0
  for (const group of DATA.groups) {
    const name = `${group.type} · ${group.area} sqm`
    const details = `${DATA.terms} · area range ${group.area}–${group.areaMax} sqm · price range EGP ${group.price.toLocaleString('en-US')}–${group.priceMax.toLocaleString('en-US')}${group.gardenArea ? ` · garden ${group.gardenArea}–${group.gardenAreaMax} sqm` : ''}${group.roofArea ? ` · roof ${group.roofArea} sqm` : ''}`
    const existing = await p.unit.findFirst({ where: { projectId: project.id, phaseId: phase.id, unitNumber: null, unitType: group.unitType, area: group.area, price: group.price }, select: { id: true } })
    if (existing) {
      await p.unit.update({ where: { id: existing.id }, data: { name, nameArabic: `${group.type} · ${group.area} م²`, gardenArea: group.gardenArea ?? null, roofArea: group.roofArea ?? null, deliveryTerms: details } })
      continue
    }
    await p.unit.create({ data: {
      projectId: project.id, phaseId: phase.id, unitNumber: null, name,
      nameArabic: `${group.type} · ${group.area} م²`, unitType: group.unitType,
      listingType: 'SALE', status: 'AVAILABLE', bedrooms: group.bedrooms,
      area: group.area, gardenArea: group.gardenArea ?? null, roofArea: group.roofArea ?? null,
      price: group.price, currency: 'EGP', deliveryTerms: details,
    } })
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
  console.log(`DONE — ${project.slug}: created=${created}; soldExcluded=${DATA.sold.length}; rows=${phaseAgg._count.id}; start=${agg._min.price}; end=${agg._max.price}`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => p.$disconnect())
