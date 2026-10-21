// Cover/price touch-ups from the catalog health audit (2026-10-21):
//  1. Logo covers → the project's own real gallery render (also fixes the
//     Jirian-Palm-Hills-logo case). The old cover moves into the gallery so
//     nothing is lost.
//  2. Azha North Coast: startPrice recomputed from its cheapest AVAILABLE
//     unit (standing rule: totals recompute from real inventory).
async function main() {
  const p = new (require('@prisma/client').PrismaClient)()

  const swaps = [
    ['210-sun-capital', '/images/uploads/1791413876948-757aa2b7.webp'],
    ['1113-el-patio-town', '/images/uploads/1791414637120-5deefd5a.webp'],
    ['1505-jirian-mountain-view', '/images/uploads/1791414966924-eccc89f4.webp'],
  ]
  for (const [slug, img] of swaps) {
    const pr = await p.project.findUnique({ where: { slug }, select: { id: true, coverImage: true, gallery: true } })
    if (!pr) { console.log('skip, missing:', slug); continue }
    let g = []
    try { g = JSON.parse(pr.gallery || '[]') } catch (_) { /* keep empty */ }
    const nextGallery = [pr.coverImage, ...g.filter((u) => u !== img)].filter(Boolean)
    await p.project.update({ where: { slug }, data: { coverImage: img, gallery: JSON.stringify(nextGallery) } })
    console.log('cover-swapped:', slug, '→', img, `(old cover → gallery[${nextGallery.length}])`)
  }

  const az = await p.project.findUnique({ where: { slug: '757-azha-north-coast' }, select: { id: true, startPrice: true } })
  const minUnit = await p.unit.aggregate({ where: { projectId: az.id, status: 'AVAILABLE' }, _min: { price: true } })
  const newValue = minUnit._min.price
  console.log('azha startPrice:', az.startPrice, '→', newValue, `(min AVAILABLE unit)`)
  if (newValue && newValue !== az.startPrice) {
    await p.project.update({ where: { id: az.id }, data: { startPrice: newValue } })
    console.log('azha updated ✓')
  }
  await p.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
