// Persist the verified official developer websites (SearXNG/websearch verified
// 2026-10-20) on the in-use DeveloperProfiles, so the AI trainer can ingest
// their public pages. Match by exact companyName (canonical profile names).
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

const SITES = {
  'Mountain View': 'https://www.mountainviewegypt.com/',
  'La Vista Developments': 'https://lavista-developments.com/',
  'SODIC': 'https://www.sodic.com/',
  'Hyde Park': 'https://www.hydeparkdevelopments.com/',
  'Palm Hills Developments': 'https://www.palmhillsdevelopments.com/',
  'Tatweer Misr': 'https://tatweermisr.com/',
  'Madaar Development': 'https://www.madaar.com/',
  'Al Marasem Development': 'https://almarasemdevelopment.com/',
  'Arabia Holding': 'https://arabia-holding.com/en',
  'City Edge Developments': 'https://cityedgedevelopments.com/',
  'Taj Misr Developments': 'https://www.tajmisr.com/',
  'Mercon Developments': 'https://mercondevelopments.com/',
  'STM Developments': 'https://stm.com.eg/',
  'Nations Of Sky': 'https://nationsofsky.com/',
  'Beit Al Bahr': 'https://www.beitalbahr.com/',
}

async function main() {
  const results = []
  for (const [name, site] of Object.entries(SITES)) {
    const dev = await p.developerProfile.findFirst({ where: { companyName: name }, select: { id: true, website: true, projects: { select: { isActive: true } } } })
    if (!dev) { results.push({ name, error: 'profile not found' }); continue }
    if (!dev.projects.some((x) => x.isActive)) { results.push({ name, skipped: 'no active projects' }); continue }
    await p.developerProfile.update({ where: { id: dev.id }, data: { website: site } })
    results.push({ name, website: site, was: dev.website })
  }
  console.log(JSON.stringify(results, null, 1))
  await p.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
