// Stage-2 merge: remaining stage/phase-cloned projects (Jirian PX, El Patio Oro,
// Forty West, Naia Bay, Al Burouj, …) merge into their parent project as phases
// inside it; the child gets archived. Parent resolved by stripping the phase
// suffix from the child name, choosing a same-developer parent (never self).
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

const SUFFIX = /[\s\-–]*(phase|cluster)\s*(one|two|three|1|2|3|4|i|ii|iii|iv|-phase1|new)?[,\s]*(,\s*villette)?[.\s]*$/i

function baseName(child) {
  let b = child.name.replace(SUFFIX, '').trim()
  b = b.replace(/[\-–,\s]+$/, '').trim()
  return b
}

async function resolveParent(child, all) {
  const base = baseName(child).toLowerCase()
  if (!base) return null
  const same = all.filter((x) => x.id !== child.id && x.developerId === child.developerId && x.isActive)
  if (!same.length) return null
  const exact = same.find((x) => x.name.toLowerCase() === base)
  if (exact) return exact
  const contains = same
    .filter((x) => x.name.toLowerCase().includes(base) || base.includes(x.name.toLowerCase()))
    .sort((a, b) => Math.abs(a.name.length - base.length) - Math.abs(b.name.length - base.length))
  if (contains.length) {
    // sanity: token overlap must cover the whole base or base covers it
    return contains[0]
  }
  return null
}

function childLabel(child) {
  const b = baseName(child)
  return (b && b.length >= 2 ? b : child.name).trim()
}

async function main() {
  const all = await p.project.findMany({
    where: { isActive: true },
    select: { id: true, slug: true, name: true, nameArabic: true, developerId: true, _count: { select: { units: true, phases: true } } },
  })
  const stageLike = await p.project.findMany({
    where: { isActive: true },
    select: { id: true, slug: true, name: true, nameArabic: true, developerId: true, _count: { select: { units: true, phases: true } } },
  })
  const names = new Set(all.map((x) => x.id + '|' + x.name.toLowerCase()))
  const candidates = stageLike.filter((x) =>
    /phase|مرحلة|المرحلة|cluster/i.test(x.name) || /phase|المرحلة/i.test(x.nameArabic || ''))

  let merged = 0, noParent = 0, unitsMoved = 0, phasesMoved = 0, archived = 0
  const touchedParents = new Set()
  const unresolved = []

  for (const child of candidates) {
    const parent = await resolveParent(child, all)
    if (!parent) { noParent++; unresolved.push(child.slug + ' | ' + child.name); continue }
    const label = childLabel(child) === parent.name ? `${child.name}` : childLabel(child)

    let labelPhase = await p.projectPhase.findFirst({ where: { projectId: parent.id, name: label }, select: { id: true } })
    if (!labelPhase) labelPhase = await p.projectPhase.create({ data: { projectId: parent.id, name: label }, select: { id: true } })
    touchedParents.add(parent.id)

    const childPhases = await p.projectPhase.findMany({ where: { projectId: child.id }, select: { id: true, name: true } })
    for (const ph of childPhases) {
      let newName = childPhases.length === 1 ? label : `${label} – ${ph.name}`
      const clash = await p.projectPhase.findFirst({ where: { projectId: parent.id, name: newName }, select: { id: true } })
      if (clash) newName = `${newName} (${child.slug.replace(/^\d+-/, '').replace(/-/g, ' ')})`
      await p.projectPhase.update({ where: { id: ph.id }, data: { projectId: parent.id, name: newName } })
      phasesMoved++
    }

    const units = await p.unit.findMany({ where: { projectId: child.id }, select: { id: true, phaseId: true } })
    for (const u of units) {
      const innerOk = u.phaseId ? childPhases.some((cp) => cp.id === u.phaseId) : false
      await p.unit.update({ where: { id: u.id }, data: innerOk ? { projectId: parent.id } : { projectId: parent.id, phaseId: labelPhase.id } })
      unitsMoved++
    }

    await p.paymentPlan.updateMany({ where: { projectId: child.id }, data: { projectId: parent.id } }).catch(() => {})
    await p.projectBrochure.updateMany({ where: { projectId: child.id }, data: { projectId: parent.id } }).catch(() => {})
    await p.masterPlanImage.updateMany({ where: { projectId: child.id }, data: { projectId: parent.id } }).catch(() => {})
    await p.projectAmenity.updateMany({ where: { projectId: child.id }, data: { projectId: parent.id } }).catch(() => {})

    await p.project.update({ where: { id: child.id }, data: { isActive: false, approvalStatus: 'ARCHIVED' } })
    archived++
    merged++
    console.log(`merged ${child.slug} -> ${parent.slug} as phase "${label}" (${units.length}u)`)
  }

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

  console.log(`DONE — merged=${merged} archived=${archived} unitsMoved=${unitsMoved} phasesMoved=${phasesMoved} unresolved=${noParent}`)
  if (unresolved.length) console.log('UNRESOLVED:\n' + unresolved.join('\n'))
}
main().catch((e) => { console.error(e); process.exit(1) }).finally(() => p.$disconnect())
