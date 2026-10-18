// ─── SODIC availability import (owner-supplied 15-Oct-2026 export) ───
// Workbook is filtered by its source to Available + Sale units. The preparation
// script normalizes merged project/type cells, strips export metadata/PII, maps
// rows to existing SODIC catalog projects, and creates two source-named entries
// that are absent from the catalog. All Final Total Unit Price values are used.
// Area=0 is reserved for the one source row with no area at all; UI hides it.
// Idempotent by (projectId, unitNumber); phases by (projectId, name).
// Run on VPS: cd /opt/ghaya && node deploy/import-sodic-availability.js

const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const DATA = require('./sodic-availability-2026-10-15.json')

async function main() {
  const dev = await p.developerProfile.findFirst({
    where: { companyName: { contains: 'SODIC' } },
    select: { id: true },
  })
  if (!dev) throw new Error('SODIC developer profile not found')

  const newProjectIds = {}
  let projectsCreated = 0, unitsCreated = 0, unitsSkipped = 0, phasesCreated = 0
  const touched = new Set()

  for (const meta of Object.values(DATA.newProjects)) {
    let project = await p.project.findUnique({ where: { slug: meta.slug }, select: { id: true } })
    if (!project) {
      project = await p.project.create({
        data: {
          developerId: dev.id,
          name: meta.name,
          nameArabic: meta.nameArabic,
          slug: meta.slug,
          propertyTypes: '[]',
          isActive: true,
          approvalStatus: 'PUBLISHED',
        },
        select: { id: true },
      })
      projectsCreated++
    }
    newProjectIds[meta.slug] = project.id
    touched.add(project.id)
  }

  for (const row of DATA.rows) {
    let projectId = newProjectIds[row.target]
    if (!projectId) {
      const project = await p.project.findUnique({ where: { slug: row.target }, select: { id: true, isActive: true } })
      if (!project) throw new Error(`Target project not found: ${row.target}`)
      if (!project.isActive) throw new Error(`Refusing to import into inactive project: ${row.target}`)
      projectId = project.id
    }

    let phaseId = null
    if (row.phase) {
      let phase = await p.projectPhase.findFirst({ where: { projectId, name: row.phase }, select: { id: true } })
      if (!phase) {
        phase = await p.projectPhase.create({ data: { projectId, name: row.phase } })
        phasesCreated++
      }
      phaseId = phase.id
    }

    const existing = await p.unit.findFirst({
      where: { projectId, unitNumber: row.unitNumber },
      select: { id: true },
    })
    if (existing) {
      unitsSkipped++
      touched.add(projectId)
      continue
    }

    const pricePerSqm = row.unitType === 'VILLA' || row.area <= 0 ? null : Math.round(row.price / row.area)
    await p.unit.create({
      data: {
        projectId,
        phaseId,
        name: row.nameEn,
        nameArabic: row.nameAr,
        unitNumber: row.unitNumber,
        unitType: row.unitType,
        listingType: 'SALE',
        status: 'AVAILABLE',
        bedrooms: row.bedrooms,
        area: row.area,
        gardenArea: row.gardenArea,
        roofArea: row.roofArea,
        floor: row.floor,
        price: row.price,
        pricePerSqm,
        currency: 'EGP',
        finishingType: row.finishingType,
        deliveryTerms: row.deliveryTerms,
      },
    })
    unitsCreated++
    touched.add(projectId)
  }

  console.log(`DONE — units created=${unitsCreated}, skipped=${unitsSkipped}, phases created=${phasesCreated}, projects created=${projectsCreated}`)

  for (const projectId of touched) {
    const phases = await p.projectPhase.findMany({ where: { projectId }, select: { id: true } })
    for (const phase of phases) {
      const agg = await p.unit.aggregate({ where: { phaseId: phase.id, status: { in: ['AVAILABLE', 'Vacant'] } }, _count: { id: true }, _min: { price: true }, _max: { price: true } })
      await p.projectPhase.update({
        where: { id: phase.id },
        data: { totalUnits: agg._count.id, startPrice: agg._min.price ?? null, endPrice: agg._max.price ?? null },
      })
    }
    const where = { projectId, status: { in: ['AVAILABLE', 'Vacant'] }, isSample: false }
    const agg = await p.unit.aggregate({ where, _count: { id: true }, _min: { price: true }, _max: { price: true } })
    const types = await p.unit.groupBy({ where, by: ['unitType'] })
    const project = await p.project.findUnique({ where: { id: projectId }, select: { slug: true, propertyTypes: true } })
    let existingTypes = []
    try {
      const parsed = JSON.parse(project.propertyTypes || '[]')
      if (Array.isArray(parsed)) existingTypes = parsed.filter((v) => typeof v === 'string')
    } catch {
      throw new Error(`Invalid propertyTypes JSON for ${project.slug}`)
    }
    const propertyTypes = [...new Set([...existingTypes, ...types.map((t) => t.unitType)])]
    await p.project.update({
      where: { id: projectId },
      data: {
        startPrice: agg._min.price ?? null,
        endPrice: agg._max.price ?? null,
        propertyTypes: JSON.stringify(propertyTypes),
      },
    })
    console.log(`${project.slug}: availableUnits=${agg._count.id} start=${agg._min.price ?? '—'} end=${agg._max.price ?? '—'}`)
  }
}

main()
  .catch((error) => { console.error(error); process.exit(1) })
  .finally(() => p.$disconnect())
