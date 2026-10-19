// ─── Bloomfields updated inventory (owner-supplied image, 12 aggregate rows) ───
// Aggregate category rows (no unit codes) → one card per row under the parent
// 202-bloomfields, attached to its real phases (Lakeside / Cluster / Terraces /
// Courtyard). Values verbatim: area+price ranges kept in the row name, price =
// range minimum (starting price). Type mapped ONLY where the feed says it
// (Apartment / Duplex); typeless rows stay UNKNOWN (never guessed). Payment
// plans + delivery text verbatim in deliveryTerms. Idempotent: keyed
// (projectId, unitNumber:null, name).
// Run on VPS: cd /opt/ghaya && node deploy/import-bloomfields-updated-inventory.js
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

const SLUG = '202-bloomfields'

const GROUPS = [
  {
    phase: 'Lakeside',
    delivery: 'Delivery: 4.5 Years',
    plans: 'Payment plans: 10Y: 5% Down Payment + quarterly installments | 5Y: 10% Down Payment + quarterly installments | 30% Discount',
    rows: [
      { nameEn: '2 BR · 120 m²', nameAr: '2 غرف · 120 م²', type: 'UNKNOWN', beds: 2, area: 120, price: 7987000, end: 8579000 },
      { nameEn: '3 BR · 155–160 m²', nameAr: '3 غرف · 155–160 م²', type: 'UNKNOWN', beds: 3, area: 155, price: 9889000, end: 12474000 },
    ],
  },
  {
    phase: 'Cluster',
    perRowDelivery: true,
    plans: 'Payment plans: 10Y: 5% Down Payment + 5% after 3 months + quarterly installments | 5Y: 5% Down Payment + quarterly installments | 30% Discount',
    rows: [
      { nameEn: '1 BR Apartment · 117 m²', nameAr: 'شقة غرفة · 117 م²', type: 'APARTMENT', beds: 1, area: 117, price: 9311000, end: 9311000, delivery: 'Delivery: 6 Months' },
      { nameEn: '2 BR Apartment · 123 m²', nameAr: 'شقة غرفتين · 123 م²', type: 'APARTMENT', beds: 2, area: 123, price: 9682000, end: 9682000, delivery: 'Delivery: 3 Months' },
      { nameEn: '3 BR Apartment · 167–285 m²', nameAr: 'شقة 3 غرف · 167–285 م²', type: 'APARTMENT', beds: 3, area: 167, price: 13397000, end: 19493000, delivery: 'Delivery: 3 Months' },
      { nameEn: 'Family Apartment · 247 m²', nameAr: 'شقة عائلية · 247 م²', type: 'APARTMENT', beds: null, area: 247, price: 18205000, end: 18205000, delivery: 'Delivery: 3 Months' },
      { nameEn: 'Duplex · 301–333 m²', nameAr: 'دوبلكس · 301–333 م²', type: 'DUPLEX', beds: null, area: 301, price: 22727000, end: 29759000, delivery: 'Delivery: 3 Months' },
    ],
  },
  {
    phase: 'Terraces',
    delivery: 'Delivery: 2 Years',
    plans: 'Payment plans: 10Y: 5% Down Payment + 2.18% after 3 months + quarterly installments | 5Y: 5% Down Payment + quarterly installments | 30% Discount',
    rows: [
      { nameEn: '2 BR · 125–140 m²', nameAr: '2 غرف · 125–140 م²', type: 'UNKNOWN', beds: 2, area: 125, price: 7732000, end: 9575000 },
      { nameEn: '3 BR · 175 m²', nameAr: '3 غرف · 175 م²', type: 'UNKNOWN', beds: 3, area: 175, price: 11663000, end: 11663000 },
    ],
  },
  {
    phase: 'Courtyard',
    delivery: 'Delivery: 1 Year',
    plans: 'Payment plans: 10Y: 5% Down Payment + 5% after 3 months + quarterly installments | 5Y: 5% Down Payment + quarterly installments | 30% Discount',
    rows: [
      { nameEn: '1 BR · 76 m²', nameAr: '1 غرف · 76 م²', type: 'UNKNOWN', beds: 1, area: 76, price: 5846000, end: 6688000 },
      { nameEn: '2 BR · 112 m²', nameAr: '2 غرف · 112 م²', type: 'UNKNOWN', beds: 2, area: 112, price: 8646000, end: 8814000 },
      { nameEn: '3 BR · 149–164 m²', nameAr: '3 غرف · 149–164 م²', type: 'UNKNOWN', beds: 3, area: 149, price: 11410000, end: 12397000, delivery: 'Delivery: 1 Year / 3 Months' },
    ],
  },
]

async function main() {
  const project = await p.project.findUnique({ where: { slug: SLUG }, select: { id: true, name: true } })
  if (!project) throw new Error('Bloomfields project missing')

  let created = 0, skipped = 0
  for (const g of GROUPS) {
    let phase = await p.projectPhase.findFirst({ where: { projectId: project.id, name: g.phase }, select: { id: true } })
    if (!phase) { phase = await p.projectPhase.create({ data: { projectId: project.id, name: g.phase }, select: { id: true } }); console.log(`+ phase ${g.phase}`) }
    for (const r of g.rows) {
      const exists = await p.unit.findFirst({ where: { projectId: project.id, unitNumber: null, name: r.nameEn }, select: { id: true } })
      if (exists) { skipped++; continue }
      await p.unit.create({
        data: {
          projectId: project.id,
          phaseId: phase.id,
          name: r.nameEn,
          nameArabic: r.nameAr,
          unitNumber: null,
          unitType: r.type,
          listingType: 'SALE',
          status: 'AVAILABLE',
          bedrooms: r.beds,
          area: r.area,
          price: r.price,
          currency: 'EGP',
          deliveryTerms: `${r.delivery || g.delivery}. ${g.plans}`,
        },
      })
      created++
    }
  }
  console.log(`IMPORT — created=${created} skipped=${skipped}`)

  // totals: AVAILABLE/Vacant real rows only
  const where = { projectId: project.id, status: { in: ['AVAILABLE', 'Vacant'] }, isSample: false }
  const agg = await p.unit.aggregate({ where, _count: { id: true }, _min: { price: true }, _max: { price: true } })
  const types = await p.unit.groupBy({ where, by: ['unitType'] })
  // catalog property types keep real categories; UNKNOWN (feed has no type) stays out
  const proj = await p.project.findUnique({ where: { id: project.id }, select: { propertyTypes: true } })
  const listed = types.map((t) => t.unitType).filter((t) => t !== 'UNKNOWN')
  await p.project.update({
    where: { id: project.id },
    data: { startPrice: agg._min.price, endPrice: agg._max.price, propertyTypes: JSON.stringify([...new Set([...JSON.parse(proj.propertyTypes || '[]'), ...listed])]) },
  })
  const phases = await p.projectPhase.findMany({ where: { projectId: project.id }, select: { id: true } })
  for (const ph of phases) {
    const pa = await p.unit.aggregate({ where: { phaseId: ph.id }, _count: { id: true }, _min: { price: true }, _max: { price: true } })
    await p.projectPhase.update({ where: { id: ph.id }, data: { totalUnits: pa._count.id, startPrice: pa._min.price ?? null, endPrice: pa._max.price ?? null } })
  }
  const total = await p.unit.count({ where: { projectId: project.id } })
  console.log(`DONE — ${SLUG} unitsTotal=${total} startPrice=${agg._min.price} endPrice=${agg._max.price}`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => p.$disconnect())
