import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ favorites: [] })

    const favorites = await db.favorite.findMany({
      where: { userId: (session.user as any).id },
      include: {
        unit: {
          include: {
            project: { select: { name: true, slug: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ favorites })
  } catch (error) {
    console.error('Fetch favorites error:', error)
    return NextResponse.json({ error: 'Failed to fetch favorites' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { unitId } = await req.json()
    if (!unitId) return NextResponse.json({ error: 'unitId required' }, { status: 400 })

    const unit = await db.unit.findUnique({ where: { id: unitId }, select: { id: true } })
    if (!unit) return NextResponse.json({ error: 'Unit not found' }, { status: 404 })

    const existing = await db.favorite.findFirst({
      where: { userId: (session.user as any).id, unitId },
    })

    if (existing) {
      return NextResponse.json({ favorite: existing })
    }

    const favorite = await db.favorite.create({
      data: { userId: (session.user as any).id, unitId },
    })

    return NextResponse.json({ favorite })
  } catch (error) {
    console.error('Add favorite error:', error)
    return NextResponse.json({ error: 'Failed to add favorite' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const unitId = searchParams.get('unitId')

    if (id) {
      await db.favorite.deleteMany({ where: { id, userId: (session.user as any).id } })
    } else if (unitId) {
      await db.favorite.deleteMany({
        where: { userId: (session.user as any).id, unitId },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Remove favorite error:', error)
    return NextResponse.json({ error: 'Failed to remove favorite' }, { status: 500 })
  }
}
