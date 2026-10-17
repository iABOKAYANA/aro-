import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const passwordHash = await bcrypt.hash('password123', 12)

  const existingCeo = await prisma.user.findFirst({ where: { role: 'CEO' } })
  if (existingCeo) {
    console.log('CEO account already exists:')
    console.log('Email:', existingCeo.email)
    console.log('Password: password123')
    return
  }

  const ceo = await prisma.user.create({
    data: {
      email: 'ceo@estateai.eg',
      name: 'CEO Admin',
      nameArabic: 'المدير التنفيذي',
      passwordHash,
      role: 'CEO',
      status: 'ACTIVE',
      isActive: true,
      isVerified: true,
    },
  })

  console.log('✅ CEO account created successfully!')
  console.log('Email: ceo@estateai.eg')
  console.log('Password: password123')
}

main()
  .catch((e) => {
    console.error('❌ Failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
