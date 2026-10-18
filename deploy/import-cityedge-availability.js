// ─── City Edge unit-availability import (owner-supplied export "Ava 13OCT.xlsx", 13 Oct 2026) ───
// Source: City Edge Development's internal unit-availability export (1623 real units,
// per-unit plan pricing). Data extracted 1:1 into deploy/cityedge-availability-2026-10-13.json
// — nothing invented. Every value (area, beds, baths, garden, floor, price) is verbatim.
//
// Plan selection is TRANSPARENT: each row in the export lists TOTAL prices under several
// installment lengths (1Y/3Y/5Y/7Y/9Y/10Y/12Y). The importer stores the price under the
// LONGEST plan available for that row and records that length in Unit.installmentYears,
// so any displayed price is always a real total paired with its real plan length.
//
// Columns with no matching Unit field are intentionally skipped (not invented):
//   - per-unit Maintenance amount (EGP — project plans store pct, not per-unit amounts)
//   - Nuca Admin Fee
//   - Parking Slot (empty for all 1623 rows)
//   - releaseDate (internal ERP release semantics unclear)
//
// Idempotent: keyed by (projectId, unitNumber). Re-running skips existing rows.
// Run on VPS:  cd /opt/ghaya && node deploy/import-cityedge-availability.js

const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const DATA = require('./cityedge-availability-2026-10-13.json')

async function main() {
  let created = 0, skipped = 0, unknownProject = 0
  const perSlug = {}

  for (const u of DATA) {
    const pr = await p.project.findUnique({ where: { slug: u.slug }, select: { id: true } })
    if (!pr) {
      unknownProject++
      console.error('SKIP unknown slug:', u.slug)
      continue
    }
    const exists = await p.unit.findFirst({
      where: { projectId: pr.id, unitNumber: u.unitNumber },
      select: { id: true },
    })
    if (exists) { skipped++; continue }

    // pricePerSqm only where price/area is unambiguous (villas price includes the garden)
    const pricePerSqm = u.unitType === 'VILLA' ? null : Math.round(u.price / u.area)

    await p.unit.create({
      data: {
        projectId: pr.id,
        name: u.nameEn,
        nameArabic: u.nameAr,
        unitNumber: u.unitNumber,
        floor: u.floor,
        unitType: u.unitType,
        listingType: 'SALE',
        status: 'AVAILABLE',
        bedrooms: u.beds,
        bathrooms: u.baths,
        area: u.area,
        gardenArea: u.garden,
        price: u.price,
        pricePerSqm,
        currency: 'EGP',
        installmentYears: u.years,
      },
    })
    created++
    perSlug[u.slug] = (perSlug[u.slug] || 0) + 1
  }

  console.log(`DONE — created: ${created}, skipped(existing): ${skipped}, unknown-slugs: ${unknownProject}`)
  for (const [slug, n] of Object.entries(perSlug).sort()) console.log(`  ${slug}: +${n}`)

  // final per-project unit counts across the 19 target projects
  const slugs = [...new Set(DATA.map((d) => d.slug))]
  console.log('--- totals per project ---')
  for (const slug of slugs) {
    const pr = await p.project.findUnique({
      where: { slug },
      include: { _count: { select: { units: true } } },
    })
    if (!pr) { console.log(`${slug}: NOT FOUND`); continue }
    console.log(`${slug}: unitsTotal=${pr._count.units} start=${pr.startPrice}`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => p.$disconnect())
