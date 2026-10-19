// Stage-3 merge: remaining 43 phase-cloned projects whose PARENT compound does
// not exist in the catalog at all. Create the parent project (PUBLISHED, geo
// copied from the child), then merge the child into it as a labeled phase and
// archive the child. Parents get name/nameArabic from the curated map.
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

const AR = {
  'Forty West': 'فورتي ويست',
  'Joubal Lagoon': 'جوبال لاجون',
  'Sky Condos': 'سكاى كوندوس - فايليت',
  'Direction white': 'ديركشن وايت',
  'Jirian': 'جيريان',
  'PX': 'بي إكس',
  'One33': 'وان 33',
  'The Waterway North Coast': 'ذا واتر واي الساحل الشمالي',
  'J East': 'جي إيست',
  'Al Karma Kay': 'الكارما كاي',
  'Seazen': 'سيزن',
  'Roudy': 'روودي',
  'Jura': 'جورا',
  'V Levels': 'في ليفلز',
  'VILLAGE DE LA CAPITALE': 'فيلاج دو لا كابيتال',
  'Naia Bay': 'نايا باي',
  'La Vista 6': 'لا فيستا 6',
  'The Valleys': 'ذا فاليز',
  'Ras Soma': 'راس سومة',
  'El Patio Oro': 'إل باتيو أورو',
  'Al Burouj': 'البروج',
  'Safa Medi Plex': 'صفا ميدي بلكس',
  'SCENES': 'سينز',
  'Hyde Park Greens': 'هايد بارك جرينز',
}

const SUFFIX = /[\s\-–]*(phase|cluster)\s*(one|two|three|1|2|3|4|i|ii|iii|iv|new)?[,\s]*(,\s*villette)?[.\s]*$/i

function baseName(child) {
  let b = child.name.replace(SUFFIX, '').trim().replace(/[\-–,\s]+$/, '').trim()
  // special: 'xxx, Villette' suffix
  b = b.replace(/,?\s*villette\s*$/i, '').trim()
  return b
}

function slugify(s) {
  return s.toLowerCase().replace(/\+/g, 'plus').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

const COPY_FIELDS = [
  'developerId', 'cityId', 'governorateId', 'districtId',
  'listingTypes', 'status', 'metaTitle', 'metaDescription',
]

async function main() {
  const stageLike = await p.project.findMany({
    where: { isActive: true },
    select: { id: true, slug: true, name: true, nameArabic: true, developerId: true, governorateId: true, cityId: true, districtId: true, status: true, listingTypes: true, metaTitle: true, metaDescription: true, approvalStatus: true, _count: { select: { units: true, phases: true } } },
  })
  const candidates = stageLike.filter((x) => /phase|cluster/i.test(x.name))
  void stageLike

  const geoAll = await p.project.findMany({
    select: { id: true, slug: true, name: true, nameArabic: true, developerId: true, cityId: true, governorateId: true, districtId: true, status: true, listingTypes: true, metaTitle: true, metaDescription: true, isActive: true, _count: { select: { units: true } } },
  })

  let created = 0, merged = 0, unitsMoved = 0, phasesMoved = 0, archived = 0
  const touchedParents = new Set()

  for (const child of candidates) {
    const base = baseName(child)
    if (!base) { console.error('no base', child.slug); continue }

    // 1) resolve parent among ALL projects (active or archived), same developer
    let parent = geoAll
      .filter((x) => x.id !== child.id && x.developerId === child.developerId)
      .find((x) => x.name.toLowerCase() === base.toLowerCase() || x.name.toLowerCase().replace(/[\s-]/g, '') === base.toLowerCase().replace(/[\s-]/g, ''))

    // 2) create the parent when the compound truly is missing
    if (!parent) {
      const slugBase = slugify(base)
      let slug = slugBase
      let n = 1
      while (await p.project.findUnique({ where: { slug }, select: { id: true } })) { slug = `${slugBase}-${n++}` }
      const ar = Object.entries(AR).find(([k]) => base.toLowerCase().replace(/-/g, ' ').includes(k.toLowerCase().replace(/-/g, ' ')))
      parent = await p.project.create({
        data: {
          slug,
          name: base,
          nameArabic: ar ? AR[ar[0]] : (child.nameArabic || base),
          isActive: true,
          approvalStatus: 'PUBLISHED',
          propertyTypes: '[]',
          ...Object.fromEntries(COPY_FIELDS.filter((f) => child[f] !== undefined && child[f] !== null).map((f) => [f, child[f]])),
        },
        select: { id: true, slug: true, name: true },
      })
      geoAll.push({ ...parent, developerId: child.developerId, _count: { units: 0 } })
      created++
      console.log(`+ parent created: ${parent.slug} ("${parent.name}")`)
    }

    // 3) phase label = child name minus the compound base
    let label = child.name
    const cleaned = child.name.toLowerCase().replace(base.toLowerCase(), ' ')
    const cleanedTrim = cleaned.replace(/[\s\-–]+/g, ' ').trim()
    if (cleanedTrim) label = cleanedTrim.charAt(0).toUpperCase() + cleanedTrim.slice(1)

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

  console.log(`DONE — merged=${merged} parentsCreated=${created} archived=${archived} unitsMoved=${unitsMoved} phasesMoved=${phasesMoved}`)
}
main().catch((e) => { console.error(e); process.exit(1) }).finally(() => p.$disconnect())
