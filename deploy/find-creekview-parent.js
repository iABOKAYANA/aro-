// Where did Creekview (2248-mountain-view-5th-settlement) get merged into?
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
async function main() {
  const cand = require('/root/phase-merge-candidates.json')
  const hit = cand.filter((c) => c.child.includes('2248') || c.child.toLowerCase().includes('creekview') || c.parent.toLowerCase().includes('creekview'))
  console.log('candidates hit:', JSON.stringify(hit, null, 1))
  const pr = await p.project.findUnique({ where: { slug: '2248-mountain-view-5th-settlement' }, select: { name: true, nameArabic: true } })
  const label = pr.name.split('–')[0].trim()
  const phases = await p.projectPhase.findMany({ where: { name: { contains: label } }, select: { id: true, name: true, projectId: true, project: { select: { slug: true, isActive: true } } } })
  console.log('label:', label)
  console.log('phase rows:', JSON.stringify(phases, null, 1))
  // search any active MV project containing "creek" in name
  const creek = await p.project.findMany({ where: { isActive: true, OR: [{ name: { contains: 'Creek', mode: 'insensitive' } }, { nameArabic: { contains: 'كريك' } }] }, select: { slug: true, name: true, isActive: true, _count: { select: { units: true, phases: true } } } })
  console.log('creek projects:', JSON.stringify(creek, null, 1))
  await p.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
