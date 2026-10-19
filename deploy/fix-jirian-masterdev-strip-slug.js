// ─── Owner fixes round 2 ───
// 1) jirian (bare "Jirian" = the city) → master developer Nations of Sky
//    Developments (evidence: nationsofsky.com/portfolio/jirian-nile-islands
//    "Led by Nations of Sky, the master developer of JIRIAN City"; the MV slice
//    stays on 1505-jirian-mountain-view).
// 2) Rename slug `28-the-strip-[-commercial-]` → `28-the-strip-commercial`
//    (brackets break the page lookup → live page rendered "Project Not Found").
// 3) List every other slug in the DB containing characters that can break
//    URL routing/lookup.
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
  // 1) Nations of Sky profile
  let nos = await p.developerProfile.findFirst({ where: { companyName: { contains: 'Nations of Sky' } } })
  if (!nos) {
    nos = await p.developerProfile.create({
      data: { companyName: 'Nations of Sky Developments', website: 'https://nationsofsky.com' },
    })
    console.log('created developer profile:', nos.id, nos.companyName)
  } else console.log('profile exists:', nos.id, nos.companyName)

  const jr = await p.project.findUnique({ where: { slug: 'jirian' }, select: { id: true, developerId: true } })
  if (jr) {
    await p.project.update({ where: { id: jr.id }, data: { developerId: nos.id } })
    console.log('jirian developer → Nations of Sky Developments')
  }

  // 2) The Strip slug rename
  const strip = await p.project.findUnique({ where: { slug: '28-the-strip-[-commercial-]' }, select: { id: true, name: true } })
  if (strip) {
    const clash = await p.project.findUnique({ where: { slug: '28-the-strip-commercial' }, select: { id: true } })
    if (!clash) {
      await p.project.update({ where: { id: strip.id }, data: { slug: '28-the-strip-commercial' } })
      console.log('strip slug → 28-the-strip-commercial')
    } else console.log('CLASH on 28-the-strip-commercial — not renamed')
  } else console.log('strip project not found (already renamed?)')

  // 3) audit all slugs with URL-hostile characters
  const all = await p.project.findMany({ where: { isActive: true, approvalStatus: { in: ['PUBLISHED', 'APPROVED'] } }, select: { slug: true, name: true } })
  const bad = all.filter((x) => /[[\](){}%#$&+,\s:;@"'<>?\\^~|]/.test(x.slug))
  console.log(`\nslugs with hostile chars (visible): ${bad.length}`)
  for (const b of bad) console.log(`  ${b.slug} | ${b.name}`)
  await p.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
