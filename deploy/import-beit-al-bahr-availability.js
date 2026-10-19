// Beit Al Bahr — owner's "Current Availability" message (8 stage groups).
// Aggregated rows (no unit numbers): one Unit row per group, keyed by
// (projectId, unitNumber:null + name/type/area/price) → idempotent re-runs.
// Prices verbatim from the message (printed millions). Skies stays under the
// active parent because its own entry is inactive (owner's standing rule).
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const DATA = require('./beit-al-bahr-availability-aggregate.json')

async function main() {
  let created = 0; const touched = new Set()
  for (const row of DATA.groups) {
    const project = await p.project.findUnique({ where: { slug: row.projectSlug }, select: { id: true, propertyTypes: true } })
    if (!project) throw new Error(`Project not found: ${row.projectSlug}`)
    touched.add(project.id)
    const range = row.areaMax ? `${row.area}–${row.areaMax} sqm` : `${row.area} sqm`
    const name = `${row.type} · ${range}`
    const nameArabic = `${row.type} · ${row.areaMax ? `${row.area}–${row.areaMax}` : row.area} م²`
    const existing = await p.unit.findFirst({
      where: { projectId: project.id, unitNumber: null, unitType: row.unitType, area: row.area, price: row.price, name },
      select: { id: true },
    })
    if (existing) continue
    const details = `${row.terms} · area ${range}${row.view ? ` · ${row.view}` : ''}`
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
        view: row.view || null,
        deliveryTerms: details,
      },
    })
    created++
  }

  for (const projectId of touched) {
    const where = { projectId, status: 'AVAILABLE', isSample: false }
    const agg = await p.unit.aggregate({ where, _min: { price: true }, _max: { price: true } })
    const types = await p.unit.groupBy({ where, by: ['unitType'] })
    const project = await p.project.findUnique({ where: { id: projectId }, select: { propertyTypes: true, isActive: true, approvalStatus: true } })
    if (project.isActive && ['APPROVED', 'PUBLISHED'].includes(project.approvalStatus)) {
      const oldTypes = JSON.parse(project.propertyTypes || '[]')
      await p.project.update({
        where: { id: projectId },
        data: {
          startPrice: agg._min.price,
          endPrice: agg._max.price,
          propertyTypes: JSON.stringify([...new Set([...oldTypes, ...types.map((t) => t.unitType)])]),
        },
      })
    } else {
      // Inactive entry (or receiving rows while OFF): keep stored totals off
      // the public counters — only enrich propertyTypes knowledge.
      console.log(`skip totals for inactive/non-public project ${projectId}`)
    }
  }
  console.log(`DONE — created=${created}; projects=${touched.size}`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => p.$disconnect())
