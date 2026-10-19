// VX 90 (catalog: 679-gravity-7) — owner's availability message, 14 aggregate
// rows ( Commercial/Retail/Duplex/Admin/Clinic). The catalog startPrice
// 6,648,571 exactly equals the message minimum (Clinic 37m) → price-confirmed
// routing. Each row = its own card (unitNumber:null). Idempotent key:
// (projectId, unitNumber:null + name/type/area/price). Terms verbatim.
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const DATA = require('./vx90-availability-aggregate.json')
const PROJECT_SLUG = '679-gravity-7'

async function main() {
  const project = await p.project.findUnique({ where: { slug: PROJECT_SLUG }, select: { id: true, propertyTypes: true } })
  if (!project) throw new Error(`Project not found: ${PROJECT_SLUG}`)
  let created = 0
  for (const row of DATA.groups) {
    const name = `${row.type} · ${row.area} sqm`
    const existing = await p.unit.findFirst({
      where: { projectId: project.id, unitNumber: null, unitType: row.unitType, area: row.area, price: row.price, name },
      select: { id: true },
    })
    if (existing) continue
    await p.unit.create({
      data: {
        projectId: project.id,
        unitNumber: null,
        name,
        nameArabic: `${row.type} · ${row.area} م²`,
        unitType: row.unitType,
        listingType: 'SALE',
        status: 'AVAILABLE',
        area: row.area,
        price: row.price,
        pricePerSqm: row.area ? Math.round(row.price / row.area) : null,
        currency: 'EGP',
        finishingType: 'Fully Finished',
        deliveryTerms: `${DATA.terms} · area ${row.area} sqm`,
      },
    })
    created++
  }
  const where = { projectId: project.id, status: 'AVAILABLE', isSample: false }
  const agg = await p.unit.aggregate({ where, _min: { price: true }, _max: { price: true } })
  const types = await p.unit.groupBy({ where, by: ['unitType'] })
  const oldTypes = JSON.parse(project.propertyTypes || '[]')
  await p.project.update({
    where: { id: project.id },
    data: {
      startPrice: agg._min.price,
      endPrice: agg._max.price,
      propertyTypes: JSON.stringify([...new Set([...oldTypes, ...types.map((t) => t.unitType)])]),
    },
  })
  console.log(`DONE — created=${created}; project=${PROJECT_SLUG}`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => p.$disconnect())
