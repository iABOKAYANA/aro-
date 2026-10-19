// Final verification: every visible project now has a cover + files exist on disk.
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const fs = require('fs')
async function main() {
  const rows = await p.project.findMany({
    where: { isActive: true, approvalStatus: { in: ['PUBLISHED', 'APPROVED'] } },
    select: { slug: true, name: true, coverImage: true },
  })
  const noImg = rows.filter((x) => !x.coverImage)
  console.log('visible:', rows.length, '| still without cover:', noImg.length)
  for (const x of noImg) console.log('  MISSING:', x.slug, x.name)
  // on-disk check for the 10 assigned files
  const targets = ['hyde-park-central-villas', 'palm-hills-one', 'the-crown-extension', '464-acre-commercial-sodic', 'v-editions-sodic', 'forty-west', 'jirian', 'safa-medi-plex', 'hyde-park-greens']
  for (const slug of targets) {
    const pr = await p.project.findUnique({ where: { slug }, select: { coverImage: true } })
    if (!pr?.coverImage) { console.log(slug, ': none'); continue }
    const f = `/opt/ghaya/public${pr.coverImage}`
    const ok = fs.existsSync(f)
    const size = ok ? fs.statSync(f).size : 0
    console.log(`${slug}: ${pr.coverImage} exists=${ok} ${(size / 1024).toFixed(0)}KB`)
  }
  await p.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
