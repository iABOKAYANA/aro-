// Verify Al Marasem brochure import (read-only).
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
  const slugs = {
    fifth: '192-fifth-square-al-marasem',
    marbay: '1212-mar-bay-ras-el-hekma',
    marville: '1027-mar-ville',
    mares: '2316-marresidence',
  }
  for (const [k, slug] of Object.entries(slugs)) {
    const pr = await p.project.findUnique({
      where: { slug },
      include: { units: { orderBy: { price: 'asc' } }, paymentPlans: true },
    })
    console.log('===', slug, 'startPrice:', pr.startPrice)
    pr.units.forEach((u) =>
      console.log(
        '   unit:',
        u.name,
        '| EGP',
        u.price,
        '| beds', u.bedrooms,
        '| area', u.area,
        'g', u.gardenArea, 'r', u.roofArea,
        '|', u.installmentYears + 'y',
        '|', u.deliveryTerms,
      ),
    )
    pr.paymentPlans.forEach((x) =>
      console.log('   plan:', x.name, '| dp:', x.downPaymentPct + '%', '|', x.installmentYears + 'y', '| cash:', x.cashDiscount, '| maint:', x.maintenanceFeePct),
    )
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => p.$disconnect())
