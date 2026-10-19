// Visible projects without a cover image — inventory before fetching.
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
async function main() {
  const rows = await p.project.findMany({
    where: { isActive: true, approvalStatus: { in: ['PUBLISHED', 'APPROVED'] } },
    select: { slug: true, name: true, coverImage: true, developer: { select: { companyName: true } }, city: { select: { name: true } }, _count: { select: { units: true } } },
  })
  const noImg = rows.filter((x) => !x.coverImage)
  console.log('visible:', rows.length, '— without cover:', noImg.length)
  for (const x of noImg) console.log(`${x.slug} | ${x.name} | ${x.developer?.companyName} | ${x.city?.name || ''} | ${x._count.units}u`)
  await p.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
