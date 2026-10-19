const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
async function main() {
  const pr = await p.project.findUnique({
    where: { slug: '202-bloomfields' },
    select: { id: true, name: true, isActive: true, approvalStatus: true, startPrice: true, propertyTypes: true, deliveryTerms: true, phases: { select: { id: true, name: true, nameArabic: true, totalUnits: true, startPrice: true, endPrice: true, description: true } }, _count: { select: { units: true } } },
  })
  console.log(JSON.stringify(pr, null, 1))
  const units = await p.unit.findMany({ where: { projectId: pr.id }, select: { name: true, unitNumber: true, unitType: true, area: true, price: true, phase: { select: { name: true } }, deliveryTerms: true }, take: 30 })
  console.log('units sample:')
  for (const u of units) console.log(JSON.stringify({ n: u.unitNumber, name: u.name, type: u.unitType, area: u.area, price: u.price, ph: u.phase?.name, dt: u.deliveryTerms }))
  await p.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
