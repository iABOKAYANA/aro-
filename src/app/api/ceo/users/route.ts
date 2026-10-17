import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi, logAudit } from '@/lib/permissions'
import {
  parsePageLimit,
  encodePageCursor,
  decodePageCursor,
  invalidCursorResponse,
} from '@/lib/ceo-pagination'

export const dynamic = 'force-dynamic'

const VALID_ROLES = ['CEO', 'ADMIN', 'BROKER', 'DEVELOPER', 'SELLER', 'BUYER']

export async function GET(req: Request) {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')
    const roleFilter = searchParams.get('role')

    const where: Record<string, unknown> = {}
    if (roleFilter) where.role = roleFilter
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
      ]
    }

    // ─── Opt-in cursor pagination ───
    // No `cursor`/`limit` params → falls through to the legacy full-list
    // query below (byte-identical behavior for existing callers).
    // Anchor order: createdAt DESC + id DESC (createdAt alone is not unique,
    // so the cursor carries both values as opaque base64url-encoded JSON).
    const cursorRaw = searchParams.get('cursor')
    const limitRaw = searchParams.get('limit')
    if (cursorRaw !== null || limitRaw !== null) {
      const limit = parsePageLimit(limitRaw)
      let cursor: { createdAt: Date; id: string } | null = null
      if (cursorRaw !== null) {
        try {
          const payload = decodePageCursor(cursorRaw)
          if (
            typeof payload.createdAt !== 'string' ||
            typeof payload.id !== 'string' ||
            payload.id.length === 0
          ) {
            return invalidCursorResponse()
          }
          const createdAt = new Date(payload.createdAt)
          if (Number.isNaN(createdAt.getTime())) return invalidCursorResponse()
          cursor = { createdAt, id: payload.id }
        } catch {
          return invalidCursorResponse()
        }
      }

      const pageWhere: Record<string, unknown> = { ...where }
      if (cursor) {
        pageWhere.AND = [
          {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: { equals: cursor.createdAt }, id: { lt: cursor.id } },
            ],
          },
        ]
      }

      const rows = await db.user.findMany({
        where: pageWhere,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          isVerified: true,
          isActive: true,
          createdAt: true,
          lastLoginAt: true,
          _count: {
            select: {
              inquiries: true,
              favorites: true,
              viewings: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      })

      const hasNext = rows.length > limit
      const page = hasNext ? rows.slice(0, limit) : rows
      const nextCursor =
        hasNext && page.length > 0
          ? encodePageCursor({
              createdAt: page[page.length - 1].createdAt.toISOString(),
              id: page[page.length - 1].id,
            })
          : null
      return NextResponse.json({ items: page, nextCursor })
    }

    const users = await db.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        isVerified: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
        _count: {
          select: {
            inquiries: true,
            favorites: true,
            viewings: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ users })
  } catch (error) {
    console.error('CEO fetch users error:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const { session, error, role: actorRole } = await requireCEOApi()
    if (error) return error

    const body = await req.json()
    const { userId, role: newRole, status: newStatus, isActive, isVerified, name, email } = body
    if (!userId) return NextResponse.json({ error: 'User ID required' }, { status: 400 })

    if (userId === (session!.user as any).id) {
      return NextResponse.json({ error: 'Cannot change your own role or status' }, { status: 400 })
    }

    if (newRole && !VALID_ROLES.includes(newRole)) {
      return NextResponse.json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` }, { status: 400 })
    }

    // Only an existing CEO may assign the CEO role. ADMIN is allowed on this
    // endpoint but must never be able to mint CEOs (middleware likewise keeps
    // ADMIN out of CEO portals).
    if (newRole === 'CEO' && actorRole !== 'CEO') {
      return NextResponse.json({ error: 'Only a CEO can assign the CEO role' }, { status: 403 })
    }

    const validStatuses = ['ACTIVE', 'PENDING', 'SUSPENDED', 'REJECTED', 'DISABLED']
    if (newStatus && !validStatuses.includes(newStatus)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {}
    if (newRole !== undefined) updateData.role = newRole
    if (newStatus !== undefined) {
      updateData.status = newStatus
      updateData.isActive = newStatus === 'ACTIVE'
    }
    if (isActive !== undefined) {
      if (typeof isActive !== 'boolean') {
        return NextResponse.json({ error: 'isActive must be a boolean' }, { status: 400 })
      }
      updateData.isActive = isActive
    }
    if (isVerified !== undefined) {
      if (typeof isVerified !== 'boolean') {
        return NextResponse.json({ error: 'isVerified must be a boolean' }, { status: 400 })
      }
      updateData.isVerified = isVerified
    }
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) {
        return NextResponse.json({ error: 'name must be 1–120 characters' }, { status: 400 })
      }
      updateData.name = name.trim()
    }
    if (email !== undefined) {
      if (typeof email !== 'string') {
        return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
      }
      const cleanEmail = email.trim().toLowerCase().slice(0, 254)
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
        return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
      }
      updateData.email = cleanEmail
    }

    const user = await db.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        isActive: true,
        isVerified: true,
      },
    })

    await logAudit({
      action: 'USER_UPDATED',
      entity: 'User',
      entityId: userId,
      userId: (session!.user as any).id,
      changes: updateData,
    })

    return NextResponse.json({ user })
  } catch (error) {
    console.error('CEO update user error:', error)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}
