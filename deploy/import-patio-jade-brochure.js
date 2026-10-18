// ─── Patio Jade brochure category aggregate ───
// The brochure gives category-level average pricing, not unit numbers or counts.
// Per the owner's explicit request, represent the one available category with a
// single aggregate Unit row; name preserves the full brochure price range. This
// is not a claim that the project has exactly one physical unit.
// SOLD categories are deliberately excluded. No schema changes.
// Idempotent: projectId + null unitNumber + exact aggregate name.
// Run on VPS: cd /opt/ghaya && node deploy/import-patio-jade-brochure.js

const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const DATA = require('./patio-jade-brochure-aggregate.json')

async function main() {
  const project = await p.project.findUnique({
    where: { slug: DATA.projectSlug },
    select: { id: true, slug: true, name: true, propertyTypes: true },
  })
  if (!project) throw new Error(`Project not found: ${DATA.projectSlug}`)

  let created = 0
  for (const category of DATA.availableCategories) {
    const existing = await p.unit.findFirst({
      where: {
        projectId: project.id,
        unitNumber: null,
        name: category.name,
      },
      select: { id: true },
    })
    if (existing) continue

    await p.unit.create({
      data: {
        projectId: project.id,
        name: category.name,
        nameArabic: category.nameArabic,
        unitNumber: null,
        unitType: category.unitType,
        listingType: 'SALE',
        status: 'AVAILABLE',
        bedrooms: null,
        area: category.area,
        gardenArea: category.gardenArea,
        price: category.price,
        pricePerSqm: null,
        currency: 'EGP',
        finishingType: category.finishingType,
      },
    })
    created++
  }

  // Preserve existing catalog types and add the brochure-confirmed villa type.
  let currentTypes = []
  try {
    const parsed = JSON.parse(project.propertyTypes || '[]')
    if (Array.isArray(parsed)) currentTypes = parsed.filter((v) => typeof v === 'string')
  } catch {
    throw new Error(`Invalid propertyTypes JSON for ${project.slug}; refusing to overwrite`)
  }
  const propertyTypes = [...new Set([...currentTypes, ...DATA.availableCategories.map((c) => c.unitType)])]
  await p.project.update({
    where: { id: project.id },
    data: { propertyTypes: JSON.stringify(propertyTypes) },
  })

  const units = await p.unit.findMany({
    where: { projectId: project.id, status: { in: ['AVAILABLE', 'Vacant'] }, isSample: false },
    select: { name: true, unitType: true, area: true, gardenArea: true, price: true, finishingType: true },
  })
  console.log(`DONE — ${project.slug}: aggregate category rows created=${created}; buyable rows=${units.length}`)
  for (const unit of units) console.log(JSON.stringify(unit))
}

main()
  .catch((error) => { console.error(error); process.exit(1) })
  .finally(() => p.$disconnect())
