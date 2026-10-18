const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
  const projects = await p.project.findMany({
    where: { developer: { companyName: { contains: 'Taj' } } },
    select: { id: true },
  })
  let deleted = 0
  for (const project of projects) {
    const oldPhases = await p.projectPhase.findMany({
      where: {
        projectId: project.id,
        OR: [
          { name: { contains: '10% DP over 10 years' } },
          { name: { contains: '5% + 5% after 3 months over 15 years' } },
        ],
      },
      select: { id: true, name: true },
    })
    for (const phase of oldPhases) {
      await p.projectPhase.delete({ where: { id: phase.id } })
      deleted++
    }
  }
  console.log(`Deleted legacy payment-plan-labelled phases: ${deleted}`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => p.$disconnect())
