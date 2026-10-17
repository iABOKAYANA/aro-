import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Make sure CEO account is active
  const ceo = await prisma.user.findFirst({ where: { role: 'CEO' } })
  if (ceo) {
    await prisma.user.update({
      where: { id: ceo.id },
      data: {
        isActive: true,
        status: 'ACTIVE',
        isVerified: true,
      },
    })
    console.log('✅ CEO account updated:')
    console.log('   Email:', ceo.email)
    console.log('   isActive: true')
    console.log('   status: ACTIVE')
  } else {
    console.log('❌ No CEO account found!')
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
