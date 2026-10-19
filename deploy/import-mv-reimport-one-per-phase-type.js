// ─── MV full re-import (owner-approved: "اعملهم كلهم بقا وفلتر") ───
// 1) Re-run the 15-Oct MV availability import (1034 rows, no PII) — idempotent,
//    keyed (projectId, unitNumber). Creekview (2248) rows ARE imported but its
//    project stays ARCHIVED (activation still awaiting owner confirmation).
// 2) Then the destructive filter: keep exactly ONE unit per
//    (project, phase, unitType) — median-area representative — so the catalog
//    stays light. Aggregate category rows (unitNumber null) are never touched.
// Backups: prod-before-mv-reimport-filter.db
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const DATA = require('./mv-availability-2026-10-15.json')

function groupKey(unit) {
  return `${unit.projectId}::${unit.phaseId || 'NOPHASE'}::${unit.unitType || 'UNKNOWN'}`
}

async function main() {
  // ── 1) import missing rows ──
  let created = 0, skipped = 0, phasesCreated = 0, unknownSlug = 0
  for (const u of DATA) {
    const pr = await p.project.findUnique({ where: { slug: u.slug }, select: { id: true } })
    if (!pr) { unknownSlug++; continue }
    let phaseId = null
    if (u.phase) {
      let phase = await p.projectPhase.findFirst({ where: { projectId: pr.id, name: u.phase }, select: { id: true } })
      if (!phase) { phase = await p.projectPhase.create({ data: { projectId: pr.id, name: u.phase } }); phasesCreated++ }
      phaseId = phase.id
    }
    const exists = await p.unit.findFirst({ where: { projectId: pr.id, unitNumber: u.unitNumber }, select: { id: true } })
    if (exists) { skipped++; continue }
    const pricePerSqm = u.unitType === 'VILLA' ? null : u.area ? Math.round(u.price / u.area) : null
    await p.unit.create({
      data: {
        projectId: pr.id, phaseId, name: u.nameEn, nameArabic: u.nameAr, unitNumber: u.unitNumber,
        unitType: u.unitType, listingType: 'SALE', status: 'AVAILABLE', bedrooms: u.beds,
        area: u.area ?? 0, gardenArea: u.garden, roofArea: u.roof, price: u.price, pricePerSqm,
        currency: 'EGP', view: u.view, deliveryTerms: u.deliveryTerms, floorPlan: u.floorPlan,
      },
    })
    created++
  }
  console.log(`IMPORT — created=${created} skippedAlready=${skipped} newPhases=${phasesCreated} unknownSlug=${unknownSlug}`)
  const total = await p.unit.count()
  console.log('total units in DB now:', total)

  // ── 2) filter: one unit per (project, phase, unitType) ──
  const units = await p.unit.findMany({ select: { id: true, projectId: true, phaseId: true, unitType: true, area: true, price: true, status: true, isSample: true, unitNumber: true } })
  const groups = new Map()
  for (const unit of units) {
    if (unit.unitNumber === null || unit.unitNumber === undefined) continue // aggregate rows never filtered
    const key = groupKey(unit)
    const list = groups.get(key) || []
    list.push(unit); groups.set(key, list)
  }
  const keep = new Set()
  for (const list of groups.values()) {
    const available = list.filter((u) => !u.isSample && (u.status === 'AVAILABLE' || u.status === 'Vacant'))
    const candidates = available.length ? available : list.filter((u) => !u.isSample).length ? list.filter((u) => !u.isSample) : list
    candidates.sort((a, b) => (a.area || 0) - (b.area || 0) || (a.price || 0) - (b.price || 0))
    keep.add(candidates[Math.floor((candidates.length - 1) / 2)].id)
  }
  const remove = units.filter((u) => (u.unitNumber !== null && u.unitNumber !== undefined) && !keep.has(u.id)).map((u) => u.id)
  console.log(`FILTER — codedGroups=${groups.size} keep=${keep.size} delete=${remove.length}`)
  for (let i = 0; i < remove.length; i += 400) {
    await p.unit.deleteMany({ where: { id: { in: remove.slice(i, i + 400) } } })
  }

  // ── 3) recompute MV-family project/phase totals ──
  const slugs = [...new Set(DATA.map((d) => d.slug))]
  for (const slug of slugs) {
    const pr = await p.project.findUnique({ where: { slug }, select: { id: true } })
    if (!pr) continue
    const where = { projectId: pr.id, status: { in: ['AVAILABLE', 'Vacant'] }, isSample: false }
    const agg = await p.unit.aggregate({ where, _count: { id: true }, _min: { price: true }, _max: { price: true } })
    const types = await p.unit.groupBy({ where, by: ['unitType'] })
    if (agg._count.id > 0) {
      const proj = await p.project.findUnique({ where: { id: pr.id }, select: { propertyTypes: true } })
      const oldTypes = JSON.parse(proj.propertyTypes || '[]')
      await p.project.update({ where: { id: pr.id }, data: { startPrice: agg._min.price, endPrice: agg._max.price, propertyTypes: JSON.stringify([...new Set([...oldTypes, ...types.map((t) => t.unitType)])]) } })
    }
    const phases = await p.projectPhase.findMany({ where: { projectId: pr.id }, select: { id: true } })
    for (const ph of phases) {
      const pa = await p.unit.aggregate({ where: { phaseId: ph.id }, _count: { id: true }, _min: { price: true }, _max: { price: true } })
      await p.projectPhase.update({ where: { id: ph.id }, data: { totalUnits: pa._count.id, startPrice: pa._min.price ?? null, endPrice: pa._max.price ?? null } })
    }
    console.log(`${slug}: recomputed`)
  }
  const after = await p.unit.count()
  console.log(`DONE — DB units ${total} → ${after}`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => p.$disconnect())
