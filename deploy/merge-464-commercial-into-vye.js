// ─── Owner screenshots round: 464 Acre Commercial / Safa Medi Plex / The Crown
// Extension — developers verified correct (SODIC's own availability feed maps
// "464 Acre" → Karmell or VYE or Commercial). Per the no-standalone-phase
// doctrine, the "Commercial" stage rows now move INTO 336-vye-sodic as a
// "Commercial" phase; the standalone "464 Acre Commercial" project is archived
// (reversible, backup prod-before-464-vye-merge.db).
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function recompute(projectId) {
  const units = await p.unit.findMany({
    where: { projectId, OR: [{ status: 'AVAILABLE' }, { status: 'Vacant' }], isSample: false },
    select: { unitType: true, price: true },
  })
  const types = [...new Set(units.map((u) => u.unitType).filter((t) => t && t !== 'UNKNOWN'))]
  const prices = units.map((u) => Number(u.price)).filter((x) => Number.isFinite(x))
  await p.project.update({
    where: { id: projectId },
    data: {
      totalUnits: units.length,
      startPrice: prices.length ? Math.min(...prices) : null,
      endPrice: prices.length ? Math.max(...prices) : null,
      propertyTypes: JSON.stringify(types),
    },
  })
  return { count: units.length, min: prices.length ? Math.min(...prices) : null, max: prices.length ? Math.max(...prices) : null, types }
}

async function main() {
  const old = await p.project.findUnique({ where: { slug: '464-acre-commercial-sodic' }, select: { id: true } })
  const vye = await p.project.findUnique({ where: { slug: '336-vye-sodic' }, select: { id: true } })
  if (!old || !vye) throw new Error('projects missing')
  const moved = await p.unit.updateMany({ where: { projectId: old.id }, data: { projectId: vye.id } })
  console.log('units moved to VYE:', moved.count)

  // phase: verbatim stage name "Commercial" under VYE; absorb old project's phases too
  const oldPhases = await p.projectPhase.findMany({ where: { projectId: old.id } })
  for (const op of oldPhases) {
    const dup = await p.projectPhase.findFirst({ where: { projectId: vye.id, name: op.name } })
    if (dup) await p.unit.updateMany({ where: { phaseId: op.id }, data: { phaseId: dup.id } })
    else await p.projectPhase.update({ where: { id: op.id }, data: { projectId: vye.id } })
  }
  // any unit still without a phase under VYE due to move → attach to "Commercial"
  const comPh = await p.projectPhase.create({ data: { projectId: vye.id, name: 'Commercial' } }).catch(async () => {
    return p.projectPhase.findFirst({ where: { projectId: vye.id, name: 'Commercial' } })
  })
  await p.unit.updateMany({ where: { projectId: vye.id, phaseId: null }, data: { phaseId: comPh.id } })

  // phase totals for all VYE phases
  const phases = await p.projectPhase.findMany({ where: { projectId: vye.id }, select: { id: true } })
  for (const ph of phases) {
    const us = await p.unit.findMany({ where: { phaseId: ph.id, OR: [{ status: 'AVAILABLE' }, { status: 'Vacant' }], isSample: false }, select: { price: true } })
    const prices = us.map((u) => Number(u.price)).filter(Number.isFinite)
    await p.projectPhase.update({
      where: { id: ph.id },
      data: { totalUnits: us.length, startPrice: prices.length ? Math.min(...prices) : null, endPrice: prices.length ? Math.max(...prices) : null },
    })
  }
  const summary = await recompute(vye.id)
  console.log('VYE totals:', JSON.stringify(summary))

  await p.project.update({ where: { id: old.id }, data: { isActive: false, approvalStatus: 'ARCHIVED' } })
  console.log('archived: 464-acre-commercial-sodic')
  await p.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
