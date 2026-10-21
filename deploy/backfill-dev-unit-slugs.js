// Backfill public slugs for in-use DeveloperProfiles (transliterated company
// names) + unit slugs for every publicly visible unit missing one.
// Idempotent: skips existing, dedupes with numeric suffix.
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

async function uniqueSlug(base, exists) {
  let slug = base
  let i = 2
  while (await exists(slug)) slug = `${base}-${i++}`
  return slug
}

async function main() {
  // ── Developer slugs ──
  const devs = await p.developerProfile.findMany({
    where: { slug: null, projects: { some: { isActive: true } } },
    select: { id: true, companyName: true },
  })
  const devDone = []
  for (const d of devs) {
    const base = slugify(d.companyName) || 'developer'
    const slug = await uniqueSlug(base, (s) => p.developerProfile.findFirst({ where: { slug: s, NOT: { id: d.id } }, select: { id: true } }))
    await p.developerProfile.update({ where: { id: d.id }, data: { slug } })
    devDone.push(`${d.companyName} -> ${slug}`)
  }

  // ── Unit slugs ──
  const units = await p.unit.findMany({
    where: {
      slug: null,
      isSample: false,
      status: { not: 'SOLD_OUT' },
      price: { not: 0 },
      project: { isActive: true, approvalStatus: { in: ['APPROVED', 'PUBLISHED'] } },
    },
    select: { id: true, unitType: true, area: true, project: { select: { slug: true } } },
  })
  const unitDone = []
  for (const u of units) {
    const type = (u.unitType || 'unit').toLowerCase().replace(/[^a-z0-9]/g, '')
    const parts = [u.project.slug, type]
    if (u.area > 0) parts.push(Math.round(u.area) + 'sqm')
    const base = slugify(parts.join('-')) + '-' + u.id.slice(-6)
    const slug = await uniqueSlug(base, (s) => p.unit.findFirst({ where: { slug: s, NOT: { id: u.id } }, select: { id: true } }))
    await p.unit.update({ where: { id: u.id }, data: { slug } })
    unitDone.push(slug)
  }

  console.log(JSON.stringify({ devSlugs: devDone.length, devDone, unitSlugs: unitDone.length, unitSample: unitDone.slice(0, 8) }, null, 1))
  await p.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
