// Nest archived projects with real AVAILABLE inventory under their verified
// same-developer parent. Dry-run by default; pass --run to write.
// This list was reviewed against developer, city, and the exact parent-name
// relationship on 2026-10-21. Never unarchives or publishes a project.
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const RUN = process.argv.includes('--run')

const LINKS = [
  { child: '2583-hyde-park-terraces', parent: '38-hyde-park' },
  { child: 'hyde-park-central-villas', parent: '1495-hyde-park-central' },
  { child: 'the-crown-extension', parent: '166-the-crown' },
  { child: 'hyde-park-greens', parent: '38-hyde-park' },
]

async function validate(tx, childSlug, parentSlug) {
  const [child, parent] = await Promise.all([
    tx.project.findUnique({
      where: { slug: childSlug },
      select: {
        id: true, name: true, slug: true, developerId: true, cityId: true,
        approvalStatus: true, isActive: true, isParent: true, parentProjectId: true,
        childProjects: { select: { id: true } },
      },
    }),
    tx.project.findUnique({
      where: { slug: parentSlug },
      select: {
        id: true, name: true, slug: true, developerId: true, cityId: true,
        approvalStatus: true, isActive: true, isParent: true, parentProjectId: true,
      },
    }),
  ])
  if (!child || !parent) throw new Error(`Missing project for link ${childSlug} -> ${parentSlug}`)
  if (child.id === parent.id) throw new Error(`Self-parent link rejected: ${childSlug}`)
  if (child.developerId !== parent.developerId) throw new Error(`Developer mismatch: ${child.name} -> ${parent.name}`)
  if (child.cityId !== parent.cityId) throw new Error(`City mismatch: ${child.name} -> ${parent.name}`)
  if (child.approvalStatus !== 'ARCHIVED' || child.isActive) throw new Error(`Child is not archived: ${child.name}`)
  if (child.isParent || child.childProjects.length > 0) throw new Error(`Nested children are not allowed: ${child.name}`)
  if (parent.parentProjectId) throw new Error(`Parent is already nested: ${parent.name}`)
  if (child.parentProjectId && child.parentProjectId !== parent.id) throw new Error(`Child already belongs to another parent: ${child.name}`)

  const availableUnits = await tx.unit.count({
    where: { projectId: child.id, status: 'AVAILABLE', isSample: false },
  })
  if (availableUnits < 1) throw new Error(`No real AVAILABLE units: ${child.name}`)
  return { child, parent, availableUnits }
}

async function main() {
  const rows = []
  for (const link of LINKS) {
    const row = await validate(p, link.child, link.parent)
    const already = row.child.parentProjectId === row.parent.id && row.parent.isParent
    rows.push({
      child: row.child.name,
      childSlug: row.child.slug,
      parent: row.parent.name,
      parentSlug: row.parent.slug,
      availableUnits: row.availableUnits,
      action: already ? 'ALREADY_NESTED' : RUN ? 'NESTED' : 'WOULD_NEST',
    })
  }

  if (RUN) {
    await p.$transaction(async (tx) => {
      for (const link of LINKS) {
        const row = await validate(tx, link.child, link.parent)
        await tx.project.update({ where: { id: row.parent.id }, data: { isParent: true } })
        await tx.project.update({ where: { id: row.child.id }, data: { parentProjectId: row.parent.id } })
      }
    })
  }

  console.log(JSON.stringify({ mode: RUN ? 'run' : 'dry-run', count: rows.length, rows }, null, 2))
  await p.$disconnect()
}

main().catch(async (error) => {
  console.error(error.message || error)
  await p.$disconnect()
  process.exit(1)
})
