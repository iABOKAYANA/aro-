// ─── Owner audit follow-up: are visible projects linked to the CANONICAL
// developer profile? Find duplicate developer profiles (similar names) among
// those actually used by visible projects, and list every used profile.
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

function norm(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

async function main() {
  const rows = await p.project.findMany({
    where: { isActive: true, approvalStatus: { in: ['PUBLISHED', 'APPROVED'] } },
    select: { developerId: true },
  })
  const usedIds = [...new Set(rows.map((r) => r.developerId))]
  const used = await p.developerProfile.findMany({
    where: { id: { in: usedIds } },
    select: { id: true, companyName: true, isActive: true },
  })
  console.log(`used profiles: ${used.length}`)
  for (const d of used.sort((a, b) => a.companyName.localeCompare(b.companyName)))
    console.log(`${d.id} | ${d.companyName} | active=${d.isActive}`)

  // duplicate detection: same normalized name, or one contains the other
  console.log('\n=== POSSIBLE DUPLICATES (among ALL profiles) ===')
  const all = await p.developerProfile.findMany({ select: { id: true, companyName: true, isActive: true } })
  const usedNorm = new Map(used.map((d) => [norm(d.companyName), d]))
  for (const d of all) {
    const n = norm(d.companyName)
    if (!n) continue
    for (const [un, canon] of usedNorm) {
      if (n === un && d.id !== canon.id) console.log(`EXACT-DUP: "${d.companyName}" (${d.id}, active=${d.isActive}) vs used "${canon.companyName}" (${canon.id})`)
      else if (n.length > 3 && (n.includes(un) || un.includes(n)) && n !== un)
        console.log(`SIMILAR:   "${d.companyName}" (${d.id}, active=${d.isActive}) vs used "${canon.companyName}" (${canon.id})`)
    }
  }
  await p.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
