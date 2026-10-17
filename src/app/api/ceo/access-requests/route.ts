import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi, logAudit } from '@/lib/permissions'
import bcrypt from 'bcryptjs'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const role = searchParams.get('role')
    const rawPage = parseInt(searchParams.get('page') || '1', 10)
    const rawLimit = parseInt(searchParams.get('limit') || '50', 10)
    const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1
    const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, rawLimit)) : 50
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {}
    if (status) {
      if (!['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      where.status = status
    }
    if (role) {
      if (!['BUYER', 'BROKER', 'DEVELOPER', 'SELLER'].includes(role)) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
      }
      where.role = role
    }

    const [requests, total] = await Promise.all([
      db.accessRequest.findMany({
        where,
        include: {
          reviewer: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.accessRequest.count({ where }),
    ])

    const statusCounts = await db.accessRequest.groupBy({
      by: ['status'],
      _count: { id: true },
    })

    const counts: Record<string, number> = {}
    statusCounts.forEach((s) => { counts[s.status] = s._count.id })

    return NextResponse.json({
      requests,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      statusCounts: counts,
    })
  } catch (error) {
    console.error('Fetch access requests error:', error)
    return NextResponse.json({ error: 'Failed to fetch requests' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error

    const body = await req.json()
    const { id, action, rejectionReason, password } = body
    if (!id || !action) {
      return NextResponse.json({ error: 'ID and action are required' }, { status: 400 })
    }

    const accessRequest = await db.accessRequest.findUnique({ where: { id } })
    if (!accessRequest) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }
    if (accessRequest.status !== 'PENDING') {
      return NextResponse.json({ error: 'Request has already been ' + accessRequest.status.toLowerCase() }, { status: 400 })
    }

    if (action === 'approve') {
      // Only staff/partner roles may be minted here — never CEO/ADMIN, no
      // matter what a stale row carries. request-access is closed, but old
      // PENDING rows predate that and must not become a privilege escalator.
      const VALID_APPROVAL_ROLES = ['BUYER', 'BROKER', 'DEVELOPER', 'SELLER']
      if (!VALID_APPROVAL_ROLES.includes(accessRequest.role)) {
        return NextResponse.json({ error: 'This request carries an invalid role' }, { status: 400 })
      }
      if (typeof password !== 'undefined' && password !== null && (typeof password !== 'string' || password.length < 6 || password.length > 128)) {
        return NextResponse.json({ error: 'Password must be 6–128 characters' }, { status: 400 })
      }
      const existing = await db.user.findUnique({ where: { email: accessRequest.email } })
      if (existing) {
        return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 })
      }
      const tempPassword = password || 'ChangeMe123!'
      const passwordHash = await bcrypt.hash(tempPassword, 12)

      const user = await db.user.create({
        data: {
          email: accessRequest.email,
          name: accessRequest.name,
          phone: accessRequest.phone,
          passwordHash,
          role: accessRequest.role,
          status: 'ACTIVE',
          isActive: true,
          isVerified: true,
        },
      })

      if (accessRequest.role === 'DEVELOPER') {
        await db.developerProfile.create({
          data: {
            userId: user.id,
            companyName: accessRequest.company || accessRequest.name + ' Development',
          },
        })
      } else if (accessRequest.role === 'BROKER') {
        await db.brokerProfile.create({
          data: { userId: user.id },
        })
      } else if (accessRequest.role === 'SELLER') {
        await db.sellerProfile.create({
          data: {
            userId: user.id,
            companyName: accessRequest.company || null,
          },
        })
      }

      await db.accessRequest.update({
        where: { id },
        data: {
          status: 'APPROVED',
          reviewedById: (session!.user as any).id,
          reviewedAt: new Date(),
          rejectionReason: null,
          userId: user.id,
        },
      })

      await logAudit({
        action: 'ACCESS_REQUEST_APPROVED',
        entity: 'AccessRequest',
        entityId: id,
        userId: (session!.user as any).id,
        changes: {
          email: accessRequest.email,
          role: accessRequest.role,
          createdUserId: user.id,
        },
      })

      return NextResponse.json({
        success: true,
        message: `Account created for ${accessRequest.email}. Password: ${tempPassword}`,
        user: { id: user.id, email: user.email, role: user.role },
      })
    }

    if (action === 'reject') {
      if (!rejectionReason || typeof rejectionReason !== 'string' || !rejectionReason.trim()) {
        return NextResponse.json({ error: 'Rejection reason is required' }, { status: 400 })
      }
      const cleanReason = rejectionReason.trim().slice(0, 2000)

      await db.accessRequest.update({
        where: { id },
        data: {
          status: 'REJECTED',
          rejectionReason: cleanReason,
          reviewedById: (session!.user as any).id,
          reviewedAt: new Date(),
        },
      })

      await logAudit({
        action: 'ACCESS_REQUEST_REJECTED',
        entity: 'AccessRequest',
        entityId: id,
        userId: (session!.user as any).id,
        changes: {
          email: accessRequest.email,
          role: accessRequest.role,
          reason: cleanReason,
        },
      })

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action. Use "approve" or "reject"' }, { status: 400 })
  } catch (error) {
    console.error('Process access request error:', error)
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 })
  }
}
