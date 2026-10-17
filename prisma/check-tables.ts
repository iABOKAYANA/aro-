import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Check if Invitation table exists and has data
  try {
    const count = await prisma.invitation.count()
    console.log('Invitation table exists. Count:', count)
  } catch (e) {
    console.error('Invitation table error:', e)
  }

  // Check if user CEO exists
  try {
    const ceo = await prisma.user.findFirst({ where: { role: 'CEO' } })
    console.log('CEO user:', ceo ? { id: ceo.id, email: ceo.email, role: ceo.role, status: ceo.status, isActive: ceo.isActive } : 'NOT FOUND')
  } catch (e) {
    console.error('User query error:', e)
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
