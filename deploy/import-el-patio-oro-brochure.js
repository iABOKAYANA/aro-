const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const DATA = require('./el-patio-oro-brochure-aggregate.json')

async function main() {
  const touched = new Set(); let created = 0
  for (const group of DATA.groups) {
    const project = await p.project.findUnique({ where: { slug: group.projectSlug }, select: { id: true, slug: true, propertyTypes: true } })
    if (!project) throw new Error(`Project not found: ${group.projectSlug}`)
    touched.add(project.id)
    const name = `${group.type} · ${group.area} sqm`
    const details = `${group.terms} · area range ${group.area}–${group.areaMax ?? group.area} sqm · price range EGP ${group.price.toLocaleString('en-US')}–${(group.priceMax ?? group.price).toLocaleString('en-US')}${group.gardenArea ? ` · garden ${group.gardenArea}–${group.gardenAreaMax ?? group.gardenArea} sqm` : ''}${group.roofArea ? ` · roof ${group.roofArea} sqm` : ''}`
    const existing = await p.unit.findFirst({ where: { projectId: project.id, unitNumber: null, unitType: group.unitType, area: group.area, price: group.price }, select: { id: true } })
    if (existing) { await p.unit.update({ where: { id: existing.id }, data: { name, nameArabic: `${group.type} · ${group.area} م²`, bedrooms: group.bedrooms, gardenArea: group.gardenArea ?? null, roofArea: group.roofArea ?? null, finishingType: group.terms.includes('Fully Finished') ? 'Fully Finished' : 'Semi-Finished', deliveryTerms: details } }); continue }
    await p.unit.create({ data: { projectId: project.id, unitNumber: null, name, nameArabic: `${group.type} · ${group.area} م²`, unitType: group.unitType, listingType: 'SALE', status: 'AVAILABLE', bedrooms: group.bedrooms, area: group.area, gardenArea: group.gardenArea ?? null, roofArea: group.roofArea ?? null, price: group.price, currency: 'EGP', finishingType: group.terms.includes('Fully Finished') ? 'Fully Finished' : 'Semi-Finished', deliveryTerms: details } })
    created++
  }
  for (const projectId of touched) {
    const where = { projectId, status: 'AVAILABLE', isSample: false }
    const agg = await p.unit.aggregate({ where, _min: { price: true }, _max: { price: true } })
    const types = await p.unit.groupBy({ where, by: ['unitType'] })
    const project = await p.project.findUnique({ where: { id: projectId }, select: { propertyTypes: true } })
    const oldTypes = JSON.parse(project.propertyTypes || '[]')
    await p.project.update({ where: { id: projectId }, data: { startPrice: agg._min.price, endPrice: agg._max.price, propertyTypes: JSON.stringify([...new Set([...oldTypes, ...types.map((x) => x.unitType)])]) } })
  }
  console.log(`DONE — created=${created}; sold groups excluded=${DATA.soldExcluded.length}; projects=${touched.size}`)
}
main().catch((e) => { console.error(e); process.exit(1) }).finally(() => p.$disconnect())
