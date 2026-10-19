const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
async function main() {
  const DATA = require('./mv-availability-2026-10-15.json')
  const slugs = [...new Set(DATA.map((d) => d.slug))]
  for (const slug of slugs) {
    const pr = await p.project.findUnique({ where: { slug }, select: { id: true, name: true, isActive: true } })
    if (!pr) continue
    const units = await p.unit.count({ where: { projectId: pr.id } })
    const phases = await p.projectPhase.count({ where: { projectId: pr.id } })
    console.log(`${slug} — units=${units} phases=${phases} active=${pr.isActive}`)
  }
  await p.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
