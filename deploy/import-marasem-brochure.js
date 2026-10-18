// ─── Al Marasem brochure import — units + payment-plan facts ───
// Source: official Al Marasem "ALL PROJECTS" brochure (owner-supplied).
// EVERY value below is transcribed verbatim from the brochure — nothing
// derived, nothing invented. Where the brochure states a STARTING price or
// a size RANGE, the Unit name carries it explicitly ("From / Starting") and
// the numeric columns hold the brochure's own figures only.
//
// Run on VPS:  node /tmp/import-marasem-brochure.js
// Needs @prisma/client from /opt/ghaya (run with cwd=/opt/ghaya).

const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

const SLUGS = {
  fifth: '192-fifth-square-al-marasem',
  marbay: '1212-mar-bay-ras-el-hekma',
  marville: '1027-mar-ville',
  mares: '2316-marresidence',
}

// ── Units (verbatim brochure lines) ─────────────────────────
const UNITS = [
  // Fifth Square New Cairo — READY TO MOVE (plan: 6y · 25% DP · 30% cash)
  ...[
    { en: '1BR — 115 sqm + 56 sqm garden (Ready to move)', ar: 'غرفة نوم — 115م + 56م حديقة (جاهز للتسليم)', bed: 1, area: 115, garden: 56, roof: null, price: 15_700_000, planY: 6 },
    { en: '3BR — 170 sqm + 115 sqm roof (Ready to move)', ar: '3 أوض — 170م + 115م روف (جاهز للتسليم)', bed: 3, area: 170, garden: null, roof: 115, price: 24_500_000, planY: 6 },
    { en: '3BR — 160 sqm + 66 sqm garden (Ready to move)', ar: '3 أوض — 160م + 66م حديقة (جاهز للتسليم)', bed: 3, area: 160, garden: 66, roof: null, price: 24_000_000, planY: 6 },
    { en: '3BR — 195 sqm + 112 sqm garden (Ready to move)', ar: '3 أوض — 195م + 112م حديقة (جاهز للتسليم)', bed: 3, area: 195, garden: 112, roof: null, price: 33_300_000, planY: 6 },
    { en: '3BR — 189 sqm + 202 sqm roof (Ready to move)', ar: '3 أوض — 189م + 202م روف (جاهز للتسليم)', bed: 3, area: 189, garden: null, roof: 202, price: 34_900_000, planY: 6 },
  ].map((u) => ({ ...u, slug: SLUGS.fifth, type: 'APARTMENT' })),

  // Fifth Square — DELIVERY ONE YEAR (plan: 8y · 5% DP · 39.6% cash)
  ...[
    { en: '1BR — 95 sqm + 58 sqm garden (Delivery in one year)', ar: 'غرفة نوم — 95م + 58م حديقة (تسليم خلال سنة)', bed: 1, area: 95, garden: 58, roof: null, price: 16_300_000, planY: 8 },
    { en: '2BR — 158 sqm + 6 sqm roof (Delivery in one year)', ar: 'أوضتين — 158م + 6م روف (تسليم خلال سنة)', bed: 2, area: 158, garden: null, roof: 6, price: 23_700_000, planY: 8 },
  ].map((u) => ({ ...u, slug: SLUGS.fifth, type: 'APARTMENT' })),

  // Mar Bay Ras El Hekma — starting prices per type (no unit sizes stated)
  ...[
    { en: '2BR Chalet — From 14.028M EGP', ar: 'شاليه 2 غرف — يبدأ من 14.028 مليون جنيه', bed: 2, price: 14_028_000, type: 'CHALET' },
    { en: '3BR Chalet — From 15.084M EGP', ar: 'شاليه 3 غرف — يبدأ من 15.084 مليون جنيه', bed: 3, price: 15_084_000, type: 'CHALET' },
    { en: '4BR Penthouse — From 24.135M EGP', ar: 'بنتهاوس 4 غرف — يبدأ من 24.135 مليون جنيه', bed: 4, price: 24_135_000, type: 'PENTHOUSE' },
    { en: 'Townhouse — From 21.662M EGP', ar: 'تاون هاوس — يبدأ من 21.662 مليون جنيه', bed: null, price: 21_662_000, type: 'TOWNHOUSE' },
    { en: 'Twin House — From 27.767M EGP', ar: 'توين هاوس — يبدأ من 27.767 مليون جنيه', bed: null, price: 27_767_000, type: 'VILLA' },
    { en: 'Standalone Villa — From 37.258M EGP', ar: 'فيلا مستقلة — يبدأ من 37.258 مليون جنيه', bed: null, price: 37_258_000, type: 'VILLA' },
  ].map((u) => ({ ...u, slug: SLUGS.marbay, planY: 10, area: 0, garden: null, roof: null })),

  // MA Residence Signature by Rotana — New Zayed (hotel apartments)
  ...[
    { en: 'Studio 49–62 sqm — Starting 8.8M EGP', ar: 'استوديو 49–62م — يبدأ من 8.8 مليون جنيه', bed: 0, area: 49, price: 8_800_000, type: 'STUDIO' },
    { en: '1BR 74–82 sqm — Starting 11.5M EGP', ar: 'غرفة نوم 74–82م — يبدأ من 11.5 مليون جنيه', bed: 1, area: 74, price: 11_500_000, type: 'APARTMENT' },
    { en: '2BR 113–117 sqm — Starting 19.7M EGP', ar: 'أوضتين 113–117م — يبدأ من 19.7 مليون جنيه', bed: 2, area: 113, price: 19_700_000, type: 'APARTMENT' },
  ].map((u) => ({ ...u, slug: SLUGS.mares, planY: 8, garden: null, roof: null })),

  // Marville New Zayed
  ...[
    { en: '1BR 96 sqm — Starting 9.5M EGP', ar: 'غرفة نوم 96م — يبدأ من 9.5 مليون جنيه', bed: 1, area: 96, price: 9_500_000, type: 'APARTMENT' },
    { en: '2BR 118–144 sqm — Starting 11.5M EGP', ar: 'أوضتين 118–144م — يبدأ من 11.5 مليون جنيه', bed: 2, area: 118, price: 11_500_000, type: 'APARTMENT' },
    { en: '3BR 166–268 sqm — Starting 15.5M EGP', ar: '3 أوض 166–268م — يبدأ من 15.5 مليون جنيه', bed: 3, area: 166, price: 15_500_000, type: 'APARTMENT' },
    { en: '4BR 240–272 sqm — Starting 23M EGP', ar: '4 أوض 240–272م — يبدأ من 23 مليون جنيه', bed: 4, area: 240, price: 23_000_000, type: 'APARTMENT' },
  ].map((u) => ({ ...u, slug: SLUGS.marville, planY: 10, garden: null, roof: null })),
]

const DELIVERY = {
  [SLUGS.fifth]: 'Ready to move (جاهز للتسليم) — brochure: 6y · 25% DP · 30% cash',
  [SLUGS.marville]: 'Fully finished (تشطيب كامل)',
  [SLUGS.mares]: 'Fully finished & furnished (تشطيب وفرش كامل، إدارة Rotana)',
}

async function main() {
  let created = 0, updatedPlans = 0, skipped = 0

  // ── Payment-plan facts (brochure) ──
  // Fifth Square: existing 6y/25% + 8y/5% plans gain their brochure cash discounts.
  {
    const pr = await p.project.findUnique({ where: { slug: SLUGS.fifth }, include: { paymentPlans: true } })
    for (const plan of pr.paymentPlans) {
      const cash = plan.installmentYears === 6 ? 30 : plan.installmentYears === 8 ? 39.6 : null
      if (plan.cashDiscount !== cash) {
        await p.paymentPlan.update({ where: { id: plan.id }, data: { cashDiscount: cash, description: `Al Marasem brochure: cash discount ${cash}%` } })
        updatedPlans++
      }
    }
  }
  // Mar Bay: brochure plan = 5% down · 5% after 3 months · installments UP TO 10 YEARS.
  {
    const pr = await p.project.findUnique({ where: { slug: SLUGS.marbay }, include: { paymentPlans: true } })
    for (const plan of pr.paymentPlans) {
      await p.paymentPlan.update({
        where: { id: plan.id },
        data: {
          installmentYears: 10,
          name: '10 years · 5% down + 5% after 3 months',
          description: 'Al Marasem brochure: 5% down payment + 5% after 3 months, installments up to 10 years.',
          cashDiscount: null, // brochure states NO cash discount — old unknown-source value must not leak
        },
      })
      updatedPlans++
    }
  }
  // Marville: 10y/5% plan gains brochure facts (5% after 3 months, parking 300K, maintenance 7%).
  {
    const pr = await p.project.findUnique({ where: { slug: SLUGS.marville }, include: { paymentPlans: true } })
    for (const plan of pr.paymentPlans) {
      if (plan.installmentYears === 10) {
        await p.paymentPlan.update({
          where: { id: plan.id },
          data: {
            maintenanceFeePct: 7,
            description: 'Al Marasem brochure: 5% down + 5% after 3 months, installments 10 years, parking 300,000 EGP, maintenance 7%.',
          },
        })
        updatedPlans++
      }
    }
    // Brochure: 1-br units START at 9.5M — the old catalog start (8.8M) predates this brochure.
    if (pr.startPrice !== 9_500_000) {
      await p.project.update({ where: { slug: SLUGS.marville }, data: { startPrice: 9_500_000 } })
    }
  }
  // MA Residence: brochure states only "up to 8 years" — NO down % published.
  // The existing 8y plan (8% down, pre-brochure data) is NOT contradicted → left as is.
  // A new plan row would require downPaymentPct (invented) → none created.

  // ── Units: one row per brochure line, idempotent by (projectId, name) ──
  for (const u of UNITS) {
    const pr = await p.project.findUnique({ where: { slug: u.slug } })
    if (!pr) throw new Error(`project not found: ${u.slug}`)
    const exists = await p.unit.findFirst({ where: { projectId: pr.id, name: u.en } })
    if (exists) { skipped++; continue }
    const delivery = u.slug === SLUGS.fifth ? (u.planY === 6 ? DELIVERY[SLUGS.fifth] : 'Delivery in one year (تسليم خلال سنة)') : DELIVERY[u.slug]
    await p.unit.create({
      data: {
        projectId: pr.id,
        name: u.en,
        nameArabic: u.ar,
        unitType: u.type,
        listingType: 'SALE',
        status: 'AVAILABLE',
        bedrooms: u.bed,
        area: u.area,
        gardenArea: u.garden,
        roofArea: u.roof,
        price: u.price,
        currency: 'EGP',
        installmentYears: u.planY,
        deliveryTerms: delivery,
        finishingType: u.slug === SLUGS.mares || u.slug === SLUGS.marville ? 'Fully Finished (تشطيب كامل)' : null,
      },
    })
    created++
  }

  // Recompute unit counts sanity + report
  console.log(`DONE — units created: ${created}, skipped(dup): ${skipped}, plans updated: ${updatedPlans}`)
  for (const slug of Object.values(SLUGS)) {
    const pr = await p.project.findUnique({ where: { slug }, include: { _count: { select: { units: true, paymentPlans: true } } } })
    console.log(`${slug}: units=${pr._count.units} plans=${pr._count.paymentPlans} start=${pr.startPrice}`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => p.$disconnect())
