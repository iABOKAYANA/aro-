// MAYAN (STM Developments) — owner's price tables for New Cairo & El Sherouk.
// Aggregated brochure rows (no unit numbers in the source): one Unit row per
// distinct type+area+price, keyed by (projectId, unitNumber:null + name/type/
// area/price) so re-runs are idempotent. Sold-out types are excluded and
// recorded in the JSON's soldExcluded. Payment plan + fees verbatim into
// deliveryTerms; card title = type + area + price only (no plan in titles).
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const DATA = require('./mayan-stm-availability-aggregate.json')

async function main() {
  let created = 0; const touched = new Set()
  for (const row of DATA.groups) {
    const project = await p.project.findUnique({ where: { slug: row.projectSlug }, select: { id: true, propertyTypes: true } })
    if (!project) throw new Error(`Project not found: ${row.projectSlug}`)
    touched.add(project.id)
    const name = `${row.type} · ${row.area} sqm`
    const nameArabic = `${row.type} · ${row.area} م²`
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
        nameArabic,
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

  for (const projectId of touched) {
    const where = { projectId, status: 'AVAILABLE', isSample: false }
    const agg = await p.unit.aggregate({ where, _min: { price: true }, _max: { price: true } })
    const types = await p.unit.groupBy({ where, by: ['unitType'] })
    const project = await p.project.findUnique({ where: { id: projectId }, select: { propertyTypes: true } })
    const oldTypes = JSON.parse(project.propertyTypes || '[]')
    await p.project.update({
      where: { id: projectId },
      data: {
        startPrice: agg._min.price,
        endPrice: agg._max.price,
        propertyTypes: JSON.stringify([...new Set([...oldTypes, ...types.map((t) => t.unitType)])]),
      },
    })
  }
  console.log(`DONE — created=${created}; soldExcluded=${DATA.soldExcluded.length}; projects=${touched.size}`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => p.$disconnect())
