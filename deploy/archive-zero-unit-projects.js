// ─── Owner: "شيل المشاريع الي مفيهاش وحدات" ───
// Archive (isActive=false, approvalStatus=ARCHIVED, isFeatured=false) every
// project with ZERO unit rows that is publicly visible (PUBLISHED/APPROVED).
// Developer submissions (PENDING/DRAFT/REJECTED) stay untouched — they are
// invisible publicly already and belong to their developers' workflow.
// Archiving (not deleting) keeps every row restorable. Full DB backup first.
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
  const doomed = await p.project.findMany({
    where: { isActive: true, approvalStatus: { in: ['PUBLISHED', 'APPROVED'] }, units: { none: {} } },
    select: { id: true, slug: true, name: true, approvalStatus: true, developer: { select: { companyName: true } }, _count: { select: { phases: true } } },
  })
  console.log('zero-unit visible projects:', doomed.length)

  const byDev = new Map()
  for (const x of doomed) {
    const d = x.developer?.companyName || '—'
    byDev.set(d, (byDev.get(d) || 0) + 1)
  }
  for (const [d, c] of [...byDev.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ${c}× ${d}`)
  }
  require('fs').writeFileSync('/root/no-units-archived.json', JSON.stringify(doomed.map((x) => ({ slug: x.slug, name: x.name, dev: x.developer?.companyName })), null, 1))

  const ids = doomed.map((x) => x.id)
  for (let i = 0; i < ids.length; i += 400) {
    await p.project.updateMany({ where: { id: { in: ids.slice(i, i + 400) } }, data: { isActive: false, approvalStatus: 'ARCHIVED', isFeatured: false } })
  }

  const [visibleNow, pendingLeft, totalProjects] = await Promise.all([
    p.project.count({ where: { isActive: true, approvalStatus: { in: ['PUBLISHED', 'APPROVED'] } } }),
    p.project.count({ where: { isActive: true, approvalStatus: { in: ['PENDING', 'DRAFT', 'REJECTED'] }, units: { none: {} } } }),
    p.project.count(),
  ])
  console.log(`DONE — archived=${ids.length} | visible projects now: ${visibleNow} | zero-unit dev submissions left untouched: ${pendingLeft} | total rows: ${totalProjects}`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => p.$disconnect())
