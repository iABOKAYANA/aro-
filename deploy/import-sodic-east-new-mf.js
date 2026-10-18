// ─── SODIC East New MF category price table ───
// The supplied image lists average areas and starting prices, not unit numbers
// or inventory counts. Store one category aggregate per listed type; the first
// category enriches the existing The Lakes row with the exact matching 6.7M
// price instead of duplicating it. This does not claim one physical unit/type.
// Idempotent; no schema changes.

const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const DATA = require('./sodic-east-new-mf-aggregate.json')

async function main() {
  const project = await p.project.findUnique({
    where: { slug: DATA.projectSlug },
    select: { id: true, slug: true, propertyTypes: true },
  })
  if (!project) throw new Error(`Project not found: ${DATA.projectSlug}`)

  let created = 0
  for (const category of DATA.categories) {
    const data = {
      name: category.nameEn,
      nameArabic: category.nameAr,
      unitType: category.unitType,
      listingType: 'SALE',
      status: 'AVAILABLE',
      bedrooms: category.bedrooms,
      area: category.averageArea,
      price: category.startingPrice,
      pricePerSqm: null,
      currency: 'EGP',
    }

    // The previous availability export contained this exact 1B starting-price
    // record without area/type. Enrich it from the matching source table row.
    let existing = category.key === '1B'
      ? await p.unit.findFirst({
          where: { projectId: project.id, unitNumber: 'SODIC Community App Unit - Lakes - 1' },
          select: { id: true },
        })
      : null

    if (existing) {
      await p.unit.update({ where: { id: existing.id }, data })
      continue
    }

    existing = await p.unit.findFirst({
      where: { projectId: project.id, unitNumber: null, name: category.nameEn },
      select: { id: true },
    })
    if (existing) continue

    await p.unit.create({
      data: {
        projectId: project.id,
        unitNumber: null,
        ...data,
      },
    })
    created++
  }

  let currentTypes = []
  try {
    const parsed = JSON.parse(project.propertyTypes || '[]')
    if (Array.isArray(parsed)) currentTypes = parsed.filter((v) => typeof v === 'string')
  } catch {
    throw new Error(`Invalid propertyTypes JSON for ${project.slug}; refusing to overwrite`)
  }
  const propertyTypes = [...new Set([...currentTypes, ...DATA.categories.map((c) => c.unitType)])]
  const agg = await p.unit.aggregate({
    where: { projectId: project.id, status: { in: ['AVAILABLE', 'Vacant'] }, isSample: false },
    _count: { id: true },
    _min: { price: true },
    _max: { price: true },
  })
  await p.project.update({
    where: { id: project.id },
    data: {
      propertyTypes: JSON.stringify(propertyTypes),
      startPrice: agg._min.price ?? null,
      endPrice: agg._max.price ?? null,
    },
  })
  console.log(`DONE — ${project.slug}: categoryRowsCreated=${created}; buyableRows=${agg._count.id}; start=${agg._min.price}; end=${agg._max.price}`)
}

main()
  .catch((error) => { console.error(error); process.exit(1) })
  .finally(() => p.$disconnect())
