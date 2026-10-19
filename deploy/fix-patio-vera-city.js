// ─── Fix: El Patio Vera is in Sheikh Zayed (La Vista), NOT 6th of October.
// Evidence: nawy.com/compound/1138-el-patio-vera "El Patio Vera Sheikh Zayed",
// abouthomeeg "El Patio Vera Sheikh Zayed Compound by La Vista".
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
async function main() {
  const cities = await p.city.findMany({ select: { id: true, name: true } })
  const target = cities.find((c) => /sheikh\s*zayed/i.test(c.name))
  console.log('sheikh zayed city row:', target ? `${target.id} ${target.name}` : 'NOT FOUND')
  const pr = await p.project.findUnique({ where: { slug: '1138-el-patio-vera' }, select: { id: true, name: true, city: { select: { name: true } } } })
  console.log('project now:', pr.city?.name)
  if (target && pr) {
    await p.project.update({ where: { id: pr.id }, data: { cityId: target.id } })
    console.log('UPDATED →', target.name)
  }
  await p.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
