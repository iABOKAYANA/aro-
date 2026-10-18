// Spot-verify City Edge unit import (read-only).
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
  // sample rows from the two biggest projects
  for (const slug of ['293-mazarine', '1099-new-garden-city', '1001-il-latini-city-edge']) {
    const units = await p.unit.findMany({
      where: { project: { slug } },
      orderBy: { price: 'asc' },
      take: 3,
    })
    console.log('===', slug, '(cheapest 3)')
    units.forEach((u) =>
      console.log('   ', u.unitNumber, '|', u.name, '|', u.nameArabic, '| EGP', u.price, '|', u.installmentYears + 'y', '| area', u.area, '| beds', u.bedrooms, '| floor', u.floor),
    )
  }
  // global totals
  const total = await p.unit.count()
  const perType = await p.unit.groupBy({ by: ['unitType'], _count: { unitType: true } })
  console.log('TOTAL UNITS IN DB:', total, '| by type:', perType.map((t) => t.unitType + '=' + t._count.unitType).join(', '))
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => p.$disconnect())
