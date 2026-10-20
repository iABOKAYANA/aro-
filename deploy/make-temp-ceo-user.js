// Create a temporary CEO user for a REAL end-to-end login/UI verification.
// Deleted right after the audit (see delete-temp-ceo-user.js).
const bcrypt = require('bcryptjs')
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
  const email = 'ceo-audit-temp@estateai.eg'
  const pw = 'Ghaya-CEO-Audit-2026!'
  await p.user.upsert({
    where: { email },
    update: { passwordHash: bcrypt.hashSync(pw, 10), role: 'CEO', status: 'ACTIVE', isActive: true },
    create: {
      email,
      name: 'CEO Audit Temp',
      passwordHash: bcrypt.hashSync(pw, 10),
      role: 'CEO',
      status: 'ACTIVE',
      isActive: true,
    },
  })
  console.log(`temp CEO user ready: ${email} / ${pw}`)
  await p.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
