// ─── Owner-approved catalog-wide phase merge ───
// Every standalone phase-project (stage/cluster entries) becomes a ProjectPhase
// row INSIDE its parent project, then the child project is archived (isActive =
// false, approvalStatus ARCHIVED) so it stops listing as a separate compound.
// Children/parents come from /root/phase-merge-candidates.json (same-developer
// evidence only) + explicit extra. Full DB backup taken before running.
// Idempotent: already-archived children skipped; moves are keyed to labels.
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const CANDIDATES = require('/root/phase-merge-candidates.json')
const EXTRA = { '2703-mountain-view-11-phase-2': '655-mountain-view-1.1' }

function childLabel(child, parent) {
  let label = String(child.name || '').split('–')[0].trim()
  const leftDash = String(child.name || '').replace('–', '-').split('-').map((s) => s.trim()).filter(Boolean)
  // prefer the leftmost dash token that is NOT equal to the parent name
  for (const tok of leftDash) {
    if (!parent.name || !parent.name.toLowerCase().includes(tok.toLowerCase())) { label = tok; break }
  }
  if (!label || label.length < 3) label = String(child.name || child.slug.replace(/^\d+-/, '')).trim()
  return label
}

async function movePaymentRelatedIntoParent(childId, parentId) {
  await p.paymentPlan.updateMany({ where: { projectId: childId }, data: { projectId: parentId } }).catch(() => {})
  await p.projectBrochure.updateMany({ where: { projectId: childId }, data: { projectId: parentId } }).catch(() => {})
  await p.masterPlanImage.updateMany({ where: { projectId: childId }, data: { projectId: parentId } }).catch(() => {})
  await p.nearbyPlace.updateMany({ where: { projectId: childId }, data: { projectId: parentId } }).catch(() => {})
  await p.projectAmenity.updateMany({ where: { projectId: childId }, data: { projectId: parentId } }).catch(() => {})
}

async function main() {
  const pairs = []
  for (const c of CANDIDATES) if (c.sameDev) pairs.push([c.child, c.parent, c.how])
  for (const [child, parent] of Object.entries(EXTRA)) pairs.push([child, parent, 'extra'])
  console.log('merge pairs:', pairs.length)

  let processed = 0, skipped = 0, unitsMoved = 0, phasesMoved = 0, archived = 0
  const touchedParents = new Set()

  for (const [childSlug, parentSlug, how] of pairs) {
    const child = await p.project.findUnique({ where: { slug: childSlug }, include: { _count: { select: { units: true, phases: true } } } })
    const parent = await p.project.findUnique({ where: { slug: parentSlug } })
    if (!child || !parent) throw new Error(`missing ${childSlug} or ${parentSlug}`)
    if (child.id === parent.id) throw new Error(`self pair ${childSlug}`)

    if (!child.isActive) { skipped++; continue }

    const label = childLabel(child, parent)

    // 1) find-or-create the parent phase carrying the child's identity
    let labelPhase = await p.projectPhase.findFirst({ where: { projectId: parent.id, name: label }, select: { id: true } })
    if (!labelPhase) labelPhase = await p.projectPhase.create({ data: { projectId: parent.id, name: label }, select: { id: true } })
    touchedParents.add(parent.id)

    // 2) reassign the child's own ProjectPhase rows into the parent (keep names, prefixed on conflict)
    const childPhases = await p.projectPhase.findMany({ where: { projectId: child.id }, select: { id: true, name: true } })
    for (const ph of childPhases) {
      let newName = childPhases.length === 1 ? label : `${label} – ${ph.name}`
      const clash = await p.projectPhase.findFirst({ where: { projectId: parent.id, name: newName }, select: { id: true } })
      if (clash) newName = `${newName} (${childSlug.replace(/^\d+-/, '').replace(/-/g, ' ')})`
      await p.projectPhase.update({ where: { id: ph.id }, data: { projectId: parent.id, name: newName } })
      phasesMoved++
    }

    // 3) move units — keep units that had an inner phase (rows now live on the
    //    parent), give the rest the label phase
    const units = await p.unit.findMany({ where: { projectId: child.id }, select: { id: true, phaseId: true } })
    for (const u of units) {
      const innerPhaseOk = u.phaseId ? childPhases.some((cp) => cp.id === u.phaseId) : false
      await p.unit.update({
        where: { id: u.id },
        data: innerPhaseOk ? { projectId: parent.id } : { projectId: parent.id, phaseId: labelPhase.id },
      })
      unitsMoved++
    }

    // 4) payment plans / brochures / media follow the units
    await movePaymentRelatedIntoParent(child.id, parent.id)

    // 5) archive the child so it no longer lists as a standalone project
    await p.project.update({
      where: { id: child.id },
      data: { isActive: false, approvalStatus: 'ARCHIVED', isFeatured: false },
    })
    archived++
    processed++
    console.log(`merged ${childSlug} -> ${parentSlug} as phase "${label}" [${how}] (${units.length}u, ${childPhases.length}phases)`)
  }

  // 6) recompute parents' totals + phase totals from AVAILABLE/Vacant real rows
  for (const parentId of touchedParents) {
    const where = { projectId: parentId, status: { in: ['AVAILABLE', 'Vacant'] }, isSample: false }
    const agg = await p.unit.aggregate({ where, _count: { id: true }, _min: { price: true }, _max: { price: true } })
    const types = await p.unit.groupBy({ where, by: ['unitType'] })
    if (agg._count.id > 0) {
      const project = await p.project.findUnique({ where: { id: parentId }, select: { propertyTypes: true } })
      const oldTypes = JSON.parse(project.propertyTypes || '[]')
      await p.project.update({
        where: { id: parentId },
        data: {
          startPrice: agg._min.price,
          endPrice: agg._max.price,
          propertyTypes: JSON.stringify([...new Set([...oldTypes, ...types.map((t) => t.unitType)])]),
        },
      })
    }
    const phases = await p.projectPhase.findMany({ where: { projectId: parentId }, select: { id: true } })
    for (const ph of phases) {
      const pa = await p.unit.aggregate({ where: { phaseId: ph.id }, _count: { id: true }, _min: { price: true }, _max: { price: true } })
      await p.projectPhase.update({ where: { id: ph.id }, data: { totalUnits: pa._count.id, startPrice: pa._min.price ?? null, endPrice: pa._max.price ?? null } })
    }
  }

  console.log(`DONE — processed=${processed} skipped(already-archived)=${skipped} unitsMoved=${unitsMoved} phasesMoved=${phasesMoved} archived=${archived}`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => p.$disconnect())
