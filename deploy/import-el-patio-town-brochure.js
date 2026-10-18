const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const DATA = require('./el-patio-town-brochure-aggregate.json')

async function main() {
  const project = await p.project.findUnique({ where: { slug: DATA.projectSlug }, select: { id: true, slug: true, propertyTypes: true } })
  if (!project) throw new Error(`Project not found: ${DATA.projectSlug}`)
  let created = 0
  for (const group of DATA.groups) {
    let phase = await p.projectPhase.findFirst({ where: { projectId: project.id, name: group.phase }, select: { id: true } })
    if (!phase) phase = await p.projectPhase.create({ data: { projectId: project.id, name: group.phase } })
    const name = `${group.type} · ${group.area} sqm`
    const existing = await p.unit.findFirst({ where: { projectId: project.id, phaseId: phase.id, unitNumber: null, unitType: group.unitType, area: group.area, price: group.price }, select: { id: true } })
    if (existing) {
      await p.unit.update({ where: { id: existing.id }, data: { name, nameArabic: `${group.type} · ${group.area} م²`, finishingType: group.phase.includes('Fully Finished') ? 'Fully Finished' : 'Core & Shell', deliveryTerms: group.terms } })
      continue
    }
    await p.unit.create({ data: {
      projectId: project.id, phaseId: phase.id, unitNumber: null, name,
      nameArabic: `${group.type} · ${group.area} م²`, unitType: group.unitType,
      listingType: 'SALE', status: 'AVAILABLE', area: group.area, price: group.price,
      currency: 'EGP', finishingType: group.phase.includes('Fully Finished') ? 'Fully Finished' : 'Core & Shell',
      deliveryTerms: group.terms,
    } })
    created++
  }
  const where = { projectId: project.id, status: 'AVAILABLE', isSample: false }
  const agg = await p.unit.aggregate({ where, _min: { price: true }, _max: { price: true } })
  const types = await p.unit.groupBy({ where, by: ['unitType'] })
  let oldTypes = []
  try { oldTypes = JSON.parse(project.propertyTypes || '[]') } catch { throw new Error(`Invalid propertyTypes JSON: ${project.slug}`) }
  await p.project.update({ where: { id: project.id }, data: { startPrice: agg._min.price, endPrice: agg._max.price, propertyTypes: JSON.stringify([...new Set([...oldTypes, ...types.map((x) => x.unitType)])]) } })
  console.log(`DONE — ${project.slug}: created=${created}; soldExcluded=${DATA.sold.length}; start=${agg._min.price}; end=${agg._max.price}`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => p.$disconnect())
