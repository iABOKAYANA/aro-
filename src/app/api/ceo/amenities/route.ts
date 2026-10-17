import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi, logAudit } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const amenities = await db.amenity.findMany({
      include: {
        _count: { select: { projects: true } },
      },
      orderBy: { sortOrder: 'asc' },
    })

    return NextResponse.json({ amenities })
  } catch (error) {
    console.error('CEO fetch amenities error:', error)
    return NextResponse.json({ error: 'Failed to fetch amenities' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error

    const body = await req.json()
    const { name, nameArabic, icon, image, category, sortOrder } = body

    if (!name || !nameArabic) {
      return NextResponse.json({ error: 'name and nameArabic are required' }, { status: 400 })
    }

    const existing = await db.amenity.findUnique({ where: { name } })
    if (existing) {
      return NextResponse.json({ error: 'Amenity with this name already exists' }, { status: 409 })
    }

    const amenity = await db.amenity.create({
      data: {
        name,
        nameArabic,
        icon: icon || null,
        image: image || null,
        category: category || 'LIFESTYLE',
        sortOrder: sortOrder ?? 0,
      },
    })

    await logAudit({
      userId: (session!.user as any).id,
      action: 'CREATE',
      entity: 'Amenity',
      entityId: amenity.id,
      changes: { name, nameArabic, category },
    })

    return NextResponse.json({ amenity }, { status: 201 })
  } catch (error) {
    console.error('CEO create amenity error:', error)
    return NextResponse.json({ error: 'Failed to create amenity' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error

    const body = await req.json()
    const { id, name, nameArabic, icon, image, category, isActive, sortOrder } = body

    if (!id) return NextResponse.json({ error: 'Amenity ID required' }, { status: 400 })

    const existing = await db.amenity.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Amenity not found' }, { status: 404 })

    if (name && name !== existing.name) {
      const duplicate = await db.amenity.findUnique({ where: { name } })
      if (duplicate) {
        return NextResponse.json({ error: 'Amenity with this name already exists' }, { status: 409 })
      }
    }

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (nameArabic !== undefined) updateData.nameArabic = nameArabic
    if (icon !== undefined) updateData.icon = icon
    if (image !== undefined) updateData.image = image
    if (category !== undefined) updateData.category = category
    if (isActive !== undefined) updateData.isActive = isActive
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder

    const amenity = await db.amenity.update({ where: { id }, data: updateData })

    await logAudit({
      userId: (session!.user as any).id,
      action: 'UPDATE',
      entity: 'Amenity',
      entityId: id,
      changes: updateData,
    })

    return NextResponse.json({ amenity })
  } catch (error) {
    console.error('CEO update amenity error:', error)
    return NextResponse.json({ error: 'Failed to update amenity' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Amenity ID required' }, { status: 400 })

    const existing = await db.amenity.findUnique({
      where: { id },
      include: { _count: { select: { projects: true } } },
    })
    if (!existing) return NextResponse.json({ error: 'Amenity not found' }, { status: 404 })

    if (existing._count.projects > 0) {
      await db.amenity.update({
        where: { id },
        data: { isActive: false },
      })

      await logAudit({
        userId: (session!.user as any).id,
        action: 'DEACTIVATE',
        entity: 'Amenity',
        entityId: id,
        changes: { name: existing.name, reason: 'Has associated projects' },
      })

      return NextResponse.json({ success: true, deactivated: true, message: 'Amenity deactivated (has associated projects)' })
    }

    await db.amenity.delete({ where: { id } })

    await logAudit({
      userId: (session!.user as any).id,
      action: 'DELETE',
      entity: 'Amenity',
      entityId: id,
      changes: { name: existing.name },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('CEO delete amenity error:', error)
    return NextResponse.json({ error: 'Failed to delete amenity' }, { status: 500 })
  }
}
