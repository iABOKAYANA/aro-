import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const brokers = await db.brokerProfile.findMany({
      where: {
        user: { isActive: true, status: 'ACTIVE' },
      },
      select: {
        id: true,
        agencyName: true,
        isVerified: true,
        rating: true,
        user: { select: { name: true, avatar: true } },
      },
      orderBy: { rating: 'desc' },
      take: 20,
    })

    return NextResponse.json(
      { brokers },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
    )
  } catch (error) {
    console.error('Fetch brokers error:', error)
    return NextResponse.json({ brokers: [] })
  }
}
