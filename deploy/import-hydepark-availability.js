// ─── Hyde Park availability import (owner-supplied "Sales Availability Report (7).csv") ───
// Source: Hyde Park sales export — 519 real units (one CRM test unit "Test/HPD" excluded)
// routed 1:1 into the catalog: clusters with price-confirmed catalog entries go to that
// project; clusters without an entry become new published projects (owner-approved policy
// from the Mountain View batch). Parents kept whole (One Hyde Park, Signature, Business
// District, Terraces) get ProjectPhase rows per cluster, enriched with derived totals.
// Every value verbatim: type, rooms, BUA, garden/roof areas, price, floor, finishing type,
// building (kept in the unit name). Land Area has no Unit column → skipped (see report).
// Idempotent: units keyed by (projectId, unitNumber); new projects keyed by slug.
// Run on VPS:  cd /opt/ghaya && node deploy/import-hydepark-availability.js

const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const DATA = require('./hp-availability-2026-10-18.json')

// parent projects whose units stay inside them (clusters = phases)
const PARENT_SLUGS = new Set([
  '2644-one-hyde-park',
  '1793-hyde-park-signature',
  '198-hyde-park-business-district',
  '2583-hyde-park-terraces',
])

// immutable project fields copied from the parent into new cluster-projects
const COPY_FIELDS = [
  'developerId', 'cityId', 'governorateId', 'districtId', 'currency',
  'status', 'projectType', 'metaTitle', 'metaDescription',
]

async function main() {
  let unitsCreated = 0, unitsSkipped = 0, phasesCreated = 0, projectsCreated = 0
  const touched = new Set()

  // 1) ensure new cluster-projects exist (copied geo/developer from parent, totals filled later)
  const newProjects = {}
  for (const key of Object.keys(DATA.newProjects)) {
    const meta = DATA.newProjects[key]
    const existing = await p.project.findUnique({ where: { slug: meta.slug }, select: { id: true } })
    if (existing) { newProjects[key] = existing.id; touched.add(existing.id); continue }
    if (meta.parentSlug) throw new Error('legacy JSON shape (parentSlug missing)')
    const parent = await p.project.findUnique({ where: { slug: meta.parent } })
    if (!parent) throw new Error(`parent not found for new project ${meta.slug}: ${meta.parent}`)
    const created = await p.project.create({
      data: {
        slug: meta.slug,
        name: meta.name,
        nameArabic: meta.ar,
        isActive: true,
        approvalStatus: 'PUBLISHED',
        isPublic: parent.isPublic,
        startPrice: null,
        endPrice: null,
        propertyTypes: parent.propertyTypes || '',
        ...(Object.fromEntries(
          COPY_FIELDS.filter((f) => parent[f] !== undefined && parent[f] !== null).map((f) => [f, parent[f]]),
        )),
      },
      select: { id: true },
    })
    newProjects[key] = created.id
    projectsCreated++
    touched.add(created.id)
  }

  // 2) units (and phases for parent-stay clusters)
  for (const r of DATA.rows) {
    let projectId
    if (r.isNew) projectId = newProjects[r.target]
    else {
      const pr = await p.project.findUnique({ where: { slug: r.target }, select: { id: true, name: true } })
      if (!pr) throw new Error(`target project not found: ${r.target}`)
      projectId = pr.id
    }
    let phaseId = null
    if (r.phase) {
      if (!PARENT_SLUGS.has(r.target)) throw new Error(`unexpected phase on non-parent ${r.target}`)
      let phase = await p.projectPhase.findFirst({
        where: { projectId, name: r.phase },
        select: { id: true },
      })
      if (!phase) {
        phase = await p.projectPhase.create({ data: { projectId, name: r.phase } })
        phasesCreated++
      }
      phaseId = phase.id
    }
    const exists = await p.unit.findFirst({ where: { projectId, unitNumber: r.unitNumber }, select: { id: true } })
    if (exists) { unitsSkipped++; touched.add(projectId); continue }

    const pricePerSqm = r.unitType === 'VILLA' ? null : r.area ? Math.round(r.price / r.area) : null
    await p.unit.create({
      data: {
        projectId,
        phaseId,
        name: r.nameEn,
        nameArabic: r.nameAr,
        unitNumber: r.unitNumber,
        unitType: r.unitType,
        listingType: 'SALE',
        status: 'AVAILABLE',
        bedrooms: r.beds,
        area: r.area ?? 0,
        gardenArea: r.garden,
        roofArea: r.roof,
        price: r.price,
        pricePerSqm,
        currency: 'EGP',
        floor: r.floor,
        finishingType: r.finishingType,
      },
    })
    unitsCreated++
    touched.add(projectId)
  }
  console.log(`DONE — units created: ${unitsCreated}, skipped: ${unitsSkipped}, phases created: ${phasesCreated}, new projects: ${projectsCreated}`)

  // 3) derived totals: phase count/min/max, project startPrice/endPrice (real aggregates)
  for (const projectId of touched) {
    const phases = await p.projectPhase.findMany({ where: { projectId }, select: { id: true } })
    for (const ph of phases) {
      const agg = await p.unit.aggregate({
        where: { phaseId: ph.id },
        _count: { id: true }, _min: { price: true }, _max: { price: true },
      })
      await p.projectPhase.update({
        where: { id: ph.id },
        data: { totalUnits: agg._count.id, startPrice: agg._min.price ?? null, endPrice: agg._max.price ?? null },
      })
    }
    const agg = await p.unit.aggregate({
      where: { projectId },
      _count: { id: true }, _min: { price: true }, _max: { price: true },
    })
    await p.project.update({
      where: { id: projectId },
      data: {
        startPrice: agg._min.price ?? null,
        endPrice: agg._max.price ?? null,
        propertyTypes: agg._count.id ? await p.unit.groupBy({ where: { projectId }, by: ['unitType'] }).then((g) => g.map((x) => x.unitType).join(', ')) : undefined,
      },
    })
    const pr = await p.project.findUnique({ where: { id: projectId }, select: { slug: true, startPrice: true, endPrice: true } })
    console.log(`  ${pr.slug}: units=${agg._count.id} start=${pr.startPrice ?? '—'} end=${pr.endPrice ?? '—'}`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => p.$disconnect())
