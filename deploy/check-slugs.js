// Check specific slugs' identity for final merge-list curation.
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const SLUGS = ['1322-central-park-aliva', '1323-club-park-aliva', '1324-lagoon-beach-park-aliva', '996-aliva-mountain-view-mostakbal-city', '1611-the-park', '2703-mountain-view-11-phase-2', '655-mountain-view-1.1', '757-azha-north-coast', '38-hyde-park', '1268-village', '1248-mwv-mamsha-views', '1012-mamsha-views', '1495-hyde-park-central', '1427-patio-vida', '455-netflat-kinda', '399-kinda']
async function main() {
  for (const slug of SLUGS) {
    const pr = await p.project.findUnique({ where: { slug }, select: { slug: true, name: true, nameArabic: true, isActive: true, approvalStatus: true, _count: { select: { units: true, phases: true } } } })
    console.log(JSON.stringify(pr))
  }
  await p.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
