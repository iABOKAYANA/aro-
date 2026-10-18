// ─── Palm Hills availability import (owner-supplied "Sales Availability 14 Oct.xlsx") ───
// Source: Palm Hills Developments sales export — 2506 real units across 18 projects,
// extracted 1:1 into deploy/ph-availability-2026-10-14.json (no PII / no test rows).
// Routing policy (owner-established): stage groups with exact-price-confirmed standalone
// phase-entries go there (Jirian P1/P2, VDLG P1/P2); remaining stages stay under their
// ACTIVE parent as ProjectPhase rows; stages with no entry become new projects
// (Palm Hills One, The Crown Extension). Every value verbatim: type, Built/Garden/Roof
// areas, Grand Total price, dates → deliveryTerms ('Delivery Jun 2030' / 'Delivered' when
// an Actual Delivery Date exists — derived, not invented). Columns without Unit fields
// (finishing price, club fee, Category code, basement/land/garage/pergola/storage areas,
// Finishing Specs code) are skipped by design — see report.
// propertyTypes is stored as a proper JSON array (["APARTMENT",…]); totals computed from
// AVAILABLE/Vacant units only. Idempotent: units keyed by (projectId, unitNumber).
// Run on VPS:  cd /opt/ghaya && node deploy/import-palmhills-availability.js

const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const DATA = require('./ph-availability-2026-10-14.json')

// parent projects whose units stay inside them (stages = phases)
const PARENT_SLUGS = new Set([
  '223-badya', '167-capital-gardens', '1466-hacienda-blue', '1200-hacienda-heneish',
  '2310-hacienda-ras-el-hekma', '1261-hacienda-waters', '1057-palmet-new-cairo',
  '1154-px', '64-palm-parks', '817-palmet', '1841-97-hills', '148-palm-hills-new-cairo',
  '201-palm-hills-alexandria', '1636-bamboo-lll',
])

const COPY_FIELDS = ['developerId', 'cityId', 'governorateId', 'districtId', 'status']

const pricePerSqmOf = (unitType, area, price) =>
  unitType === 'VILLA' || !area ? null : Math.round(price / area)

async function main() {
  let unitsCreated = 0, unitsSkipped = 0, phasesCreated = 0, projectsCreated = 0
  const touched = new Set()

  const newProjects = {}
  const newIds = new Set()
  for (const key of Object.keys(DATA.newProjects)) {
    const meta = DATA.newProjects[key]
    const existing = await p.project.findUnique({ where: { slug: meta.slug }, select: { id: true } })
    if (existing) { newProjects[key] = existing.id; newIds.add(existing.id); touched.add(existing.id); continue }
    const parent = await p.project.findUnique({ where: { slug: meta.parent } })
    if (!parent) throw new Error(`parent not found for new project ${meta.slug}: ${meta.parent}`)
    const created = await p.project.create({
      data: {
        slug: meta.slug,
        name: meta.name,
        nameArabic: meta.ar,
        isActive: true,
        approvalStatus: 'PUBLISHED',
        propertyTypes: '[]',
        ...(Object.fromEntries(COPY_FIELDS.filter((f) => parent[f] != null).map((f) => [f, parent[f]]))),
      },
      select: { id: true },
    })
    newProjects[key] = created.id
    newIds.add(created.id)
    projectsCreated++
    touched.add(created.id)
  }

  for (const r of DATA.rows) {
    let projectId
    if (r.isNew) projectId = newProjects[r.target]
    else {
      const pr = await p.project.findUnique({ where: { slug: r.target }, select: { id: true } })
      if (!pr) throw new Error(`target project not found: ${r.target}`)
      projectId = pr.id
    }
    let phaseId = null
    if (r.phase) {
      if (!PARENT_SLUGS.has(r.target) && !newIds.has(projectId)) throw new Error(`unexpected phase on non-parent ${r.target}`)
      let phase = await p.projectPhase.findFirst({ where: { projectId, name: r.phase }, select: { id: true } })
      if (!phase) {
        phase = await p.projectPhase.create({ data: { projectId, name: r.phase } })
        phasesCreated++
      }
      phaseId = phase.id
    }
    const exists = await p.unit.findFirst({ where: { projectId, unitNumber: r.unitNumber }, select: { id: true } })
    if (exists) { unitsSkipped++; touched.add(projectId); continue }

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
        area: r.area ?? 0,
        gardenArea: r.garden,
        roofArea: r.roof,
        price: r.price,
        pricePerSqm: pricePerSqmOf(r.unitType, r.area, r.price),
        currency: 'EGP',
        deliveryTerms: r.deliveryTerms,
      },
    })
    unitsCreated++
    touched.add(projectId)
  }
  console.log(`DONE — units created: ${unitsCreated}, skipped: ${unitsSkipped}, phases created: ${phasesCreated}, new projects: ${projectsCreated}`)

  for (const projectId of touched) {
    const phases = await p.projectPhase.findMany({ where: { projectId }, select: { id: true } })
    for (const ph of phases) {
      const agg = await p.unit.aggregate({ where: { phaseId: ph.id }, _count: { id: true }, _min: { price: true }, _max: { price: true } })
      await p.projectPhase.update({ where: { id: ph.id }, data: { totalUnits: agg._count.id, startPrice: agg._min.price ?? null, endPrice: agg._max.price ?? null } })
    }
    const agg = await p.unit.aggregate({ where: { projectId, status: { in: ['AVAILABLE', 'Vacant'] } }, _min: { price: true }, _max: { price: true } })
    const types = await p.unit.groupBy({ where: { projectId, status: { in: ['AVAILABLE', 'Vacant'] } }, by: ['unitType'] })
    await p.project.update({
      where: { id: projectId },
      data: {
        startPrice: agg._min.price ?? null,
        endPrice: agg._max.price ?? null,
        propertyTypes: types.length ? JSON.stringify(types.map((t) => t.unitType)) : undefined,
      },
    })
    const pr = await p.project.findUnique({ where: { id: projectId }, select: { slug: true, startPrice: true, endPrice: true } })
    console.log(`  ${pr.slug}: start=${pr.startPrice ? Math.round(pr.startPrice).toLocaleString('en-US') : '—'} end=${pr.endPrice ? Math.round(pr.endPrice).toLocaleString('en-US') : '—'}`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => p.$disconnect())
