// ─── Madaar (Azha) all-projects availability import (owner-supplied xlsx, 135 real units) ───
// Routing verified against the catalog with exact min-price evidence where it
// holds (Solis 89,595,000 / Diya 18,330,000 / Vela 27,503,000 / Elea 21,697,000
// / Hillage Village D 17,065,000) + conclusive name identity (Ogma, Ophelia).
// Clusters without entries (Lunas, Velais, Sea Veil) become new PUBLISHED
// projects copied from the Azha North Coast parent (owner-approved policy).
// Parent-stay clusters: Azha Sokhna (Lacerta, AQ Residence) inside 88-azha and
// The Hillage villages inside 2139-the-hillage get ProjectPhase rows.
// No PII in this feed (checked). LAND/Building columns kept in unit name/none.
// Idempotent: units keyed by (projectId, unitNumber); projects by slug.
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const DATA = require('./madaar-availability-2026-10-18.json')

const COPY_FIELDS = [
  'developerId', 'cityId', 'governorateId', 'districtId', 'currency',
  'status', 'projectType', 'metaTitle', 'metaDescription',
]

async function main() {
  let created = 0, skipped = 0, phasesCreated = 0, projectsCreated = 0
  const touched = new Set()

  const newprojects = {}
  for (const key of Object.keys(DATA.newProjects)) {
    const meta = DATA.newProjects[key]
    const existing = await p.project.findUnique({ where: { slug: meta.slug }, select: { id: true } })
    if (existing) { newprojects[key] = existing.id; touched.add(existing.id); continue }
    const parent = await p.project.findUnique({ where: { slug: meta.parent } })
    if (!parent) throw new Error(`parent not found for ${meta.slug}`)
    const c = await p.project.create({
      data: {
        slug: meta.slug,
        name: meta.name,
        nameArabic: meta.ar,
        isActive: true,
        approvalStatus: 'PUBLISHED',
        isPublic: parent.isPublic,
        propertyTypes: '[]',
        ...Object.fromEntries(COPY_FIELDS.filter((f) => parent[f] !== undefined && parent[f] !== null).map((f) => [f, parent[f]])),
      },
      select: { id: true },
    })
    newprojects[key] = c.id
    touched.add(c.id)
    projectsCreated++
  }

  for (const u of DATA.rows) {
    const pr = await p.project.findUnique({ where: { slug: u.slug }, select: { id: true } })
    if (!pr) throw new Error(`unknown slug ${u.slug}`)
    touched.add(pr.id)

    let phaseId = null
    if (u.phase) {
      let phase = await p.projectPhase.findFirst({ where: { projectId: pr.id, name: u.phase }, select: { id: true } })
      if (!phase) {
        phase = await p.projectPhase.create({ data: { projectId: pr.id, name: u.phase } })
        phasesCreated++
      }
      phaseId = phase.id
    }

    const exists = await p.unit.findFirst({ where: { projectId: pr.id, unitNumber: u.unitNumber }, select: { id: true } })
    if (exists) { skipped++; continue }

    await p.unit.create({
      data: {
        projectId: pr.id,
        phaseId,
        name: u.nameEn,
        nameArabic: u.nameAr,
        unitNumber: u.unitNumber,
        unitType: u.unitType,
        listingType: 'SALE',
        status: 'AVAILABLE',
        bedrooms: u.beds,
        area: u.area,
        gardenArea: u.garden,
        price: u.price,
        pricePerSqm: u.area ? Math.round(u.price / u.area) : null,
        currency: 'EGP',
      },
    })
    created++
  }

  // Recompute totals ONLY from AVAILABLE/Vacant real rows (never samples).
  for (const projectId of touched) {
    const where = { projectId, status: { in: ['AVAILABLE', 'Vacant'] }, isSample: false }
    const agg = await p.unit.aggregate({ where, _count: { id: true }, _min: { price: true }, _max: { price: true } })
    if (agg._count.id === 0) continue
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

  console.log(`DONE — units created: ${created}, skipped: ${skipped}, new projects: ${projectsCreated}, phases: ${phasesCreated}`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => p.$disconnect())
