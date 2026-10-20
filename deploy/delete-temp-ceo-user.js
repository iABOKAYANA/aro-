// Remove the temporary CEO audit user (was created only for a real login/UI
// verification — see make-temp-ceo-user.js).
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
  const email = 'ceo-audit-temp@estateai.eg'
  const u = await p.user.delete({ where: { email }, select: { id: true, email: true, role: true } })
  console.log('deleted temp CEO user:', JSON.stringify(u))
  await p.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
