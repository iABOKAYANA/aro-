// ─── Mountain View availability import (owner-supplied "15-Oct-2026.xlsx", 11 sheets) ───
// Source: Mountain View's unit-availability export — 1034 real units with FINAL
// prices, extracted 1:1 into deploy/mv-availability-2026-10-15.json (no PII: the
// export's 14th column (salesperson contact) is deliberately excluded everywhere).
// Every value verbatim: category (raw MV product name kept in unit name), beds,
// BUILT_UP/GARDEN/ROOF areas, final price, orientation, delivery status, model.
// LAND_AREA has no Unit column → skipped (noted in report).
//
// Phases: one ProjectPhase per (project, Phase col) — created when missing, then
// linked to units and enriched with derived totals (count, min/max price).
// Idempotent: units keyed by (projectId, unitNumber); phases by (projectId, name).
// Run on VPS:  cd /opt/ghaya && node deploy/import-mv-oct-2026.js

const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const DATA = require('./mv-availability-2026-10-15.json')

async function main() {
  let unitsCreated = 0, unitsSkipped = 0, phasesCreated = 0, unknownSlug = 0
  const perSlug = {}

  for (const u of DATA) {
    const pr = await p.project.findUnique({ where: { slug: u.slug }, select: { id: true } })
    if (!pr) {
      unknownSlug++
      console.error('SKIP unknown slug:', u.slug)
      continue
    }
    // Phase upsert (real MV phases; units link to them like the site's phases tab)
    let phaseId = null
    if (u.phase) {
      let phase = await p.projectPhase.findFirst({
        where: { projectId: pr.id, name: u.phase },
        select: { id: true },
      })
      if (!phase) {
        phase = await p.projectPhase.create({
          data: { projectId: pr.id, name: u.phase },
        })
        phasesCreated++
      }
      phaseId = phase.id
    }
    const exists = await p.unit.findFirst({ where: { projectId: pr.id, unitNumber: u.unitNumber }, select: { id: true } })
    if (exists) { unitsSkipped++; continue }

    const pricePerSqm = u.unitType === 'VILLA' ? null : u.area ? Math.round(u.price / u.area) : null
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
        area: u.area ?? 0,
        gardenArea: u.garden,
        roofArea: u.roof,
        price: u.price,
        pricePerSqm,
        currency: 'EGP',
        view: u.view,
        deliveryTerms: u.deliveryTerms,
        floorPlan: u.floorPlan,
      },
    })
    unitsCreated++
    perSlug[u.slug] = (perSlug[u.slug] || 0) + 1
  }

  console.log(`DONE — units created: ${unitsCreated}, skipped: ${unitsSkipped}, phases created: ${phasesCreated}, unknown slugs: ${unknownSlug}`)

  // Derived phase totals (real aggregates from the imported rows)
  const slugs = [...new Set(DATA.map((d) => d.slug))]
  for (const slug of slugs) {
    const pr = await p.project.findUnique({ where: { slug }, select: { id: true } })
    if (!pr) continue
    const phases = await p.projectPhase.findMany({ where: { projectId: pr.id }, select: { id: true, name: true } })
    for (const ph of phases) {
      const agg = await p.unit.aggregate({
        where: { phaseId: ph.id },
        _count: { id: true },
        _min: { price: true },
        _max: { price: true },
      })
      await p.projectPhase.update({
        where: { id: ph.id },
        data: {
          totalUnits: agg._count.id,
          startPrice: agg._min.price ?? null,
          endPrice: agg._max.price ?? null,
        },
      })
    }
    const total = await p.unit.count({ where: { projectId: pr.id } })
    console.log(`${slug}: unitsTotal=${total} phasesLinked=${phases.length}`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => p.$disconnect())
