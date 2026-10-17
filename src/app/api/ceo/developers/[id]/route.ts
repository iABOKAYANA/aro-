import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi, logAudit } from '@/lib/permissions'
import { isValidImageUrl } from '@/lib/image-url'

export const dynamic = 'force-dynamic'

const VALID_USER_STATUSES = ['ACTIVE', 'PENDING', 'SUSPENDED', 'REJECTED', 'DISABLED']
const VALID_EDIT_MODES = ['DIRECT', 'REQUEST']

const PROFILE_FIELDS = [
  'companyName',
  'companyNameArabic',
  'logo',
  'coverImage',
  'crNumber',
  'taxId',
  'website',
  'foundedYear',
  'description',
  'descriptionArabic',
  'headquarters',
  'totalProjects',
  'totalUnitsSold',
  'reviewCount',
  'featuredRank',
  'contactEmail',
  'contactPhone',
] as const

const NULLABLE_STRING_FIELDS = new Set([
  'companyNameArabic', 'logo', 'coverImage', 'crNumber', 'taxId', 'website',
  'description', 'descriptionArabic', 'headquarters', 'contactEmail', 'contactPhone',
])
const INTEGER_FIELDS = new Set(['totalProjects', 'totalUnitsSold', 'reviewCount', 'featuredRank'])

/** User fields returned to the client — no password hash. */
const USER_OUTPUT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  isActive: true,
  isVerified: true,
  avatar: true,
}

async function loadDeveloper(id: string) {
  return db.developerProfile.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          isActive: true,
          isVerified: true,
        },
      },
      _count: { select: { projects: true, deals: true } },
    },
  })
}

// ─── PATCH /api/ceo/developers/[id] ──────────────────────
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error
    const actorId = (session!.user as any)?.id as string

    const developer = await loadDeveloper(params.id)
    if (!developer) {
      return NextResponse.json({ error: 'Developer not found' }, { status: 404 })
    }

    const body = await req.json()
    const isSelf = developer.userId === actorId

    const profileData: Record<string, unknown> = {}
    const userData: Record<string, unknown> = {}

    for (const field of PROFILE_FIELDS) {
      if (body[field] === undefined) continue
      const raw = body[field]

      if (field === 'companyName') {
        const value = String(raw ?? '').trim()
        if (!value) {
          return NextResponse.json({ error: 'Company name is required' }, { status: 400 })
        }
        profileData.companyName = value
        continue
      }

      if (NULLABLE_STRING_FIELDS.has(field)) {
        // next/image throws on non-URL image values — reject them, empty → null.
        if ((field === 'logo' || field === 'coverImage') && typeof raw === 'string' && raw.trim() !== '') {
          if (!isValidImageUrl(raw.trim())) {
            return NextResponse.json({ error: `${field} must be a valid image URL starting with http(s):// or /` }, { status: 400 })
          }
          profileData[field] = raw.trim()
          continue
        }
        profileData[field] = raw === '' || raw === null ? null : String(raw)
        continue
      }

      if (INTEGER_FIELDS.has(field)) {
        if (raw === '' || raw === null) {
          if (field !== 'featuredRank') continue
          profileData[field] = null
          continue
        }
        const value = Number(raw)
        if (!Number.isInteger(value) || value < 0) {
          return NextResponse.json({ error: `${field} must be a whole number` }, { status: 400 })
        }
        profileData[field] = value
        continue
      }

      profileData[field] = raw
    }

    if (body.rating !== undefined && body.rating !== null) {
      const rating = Number(body.rating)
      if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
        return NextResponse.json({ error: 'Rating must be between 0 and 5' }, { status: 400 })
      }
      profileData.rating = rating
    }
    if (body.foundedYear !== undefined && body.foundedYear !== null && body.foundedYear !== '') {
      const year = Number(body.foundedYear)
      const thisYear = new Date().getFullYear()
      if (!Number.isInteger(year) || year < 1800 || year > thisYear) {
        return NextResponse.json({ error: `Founded year must be between 1800 and ${thisYear}` }, { status: 400 })
      }
      profileData.foundedYear = year
    } else if (body.foundedYear === '') {
      profileData.foundedYear = null
    }

    if (body.isVerified !== undefined) {
      profileData.isVerified = !!body.isVerified
      userData.isVerified = !!body.isVerified
    }

    // Permission mode toggle: DIRECT (legacy direct PATCH/DELETE) vs REQUEST
    // (direct writes blocked — developers use POST /api/developer/edit-requests).
    if (body.editMode !== undefined) {
      if (typeof body.editMode !== 'string' || !VALID_EDIT_MODES.includes(body.editMode)) {
        return NextResponse.json({ error: 'editMode must be one of: DIRECT, REQUEST' }, { status: 400 })
      }
      profileData.editMode = body.editMode
    }

    if (body.name !== undefined) userData.name = String(body.name).trim()
    if (body.phone !== undefined) userData.phone = body.phone ? String(body.phone).trim() : null
    if (body.email !== undefined) {
      const email = String(body.email).trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
      }
      const taken = await db.user.findFirst({ where: { email, id: { not: developer.userId } } })
      if (taken) {
        return NextResponse.json({ error: 'That email is already in use' }, { status: 409 })
      }
      userData.email = email
    }

    if (body.isActive !== undefined || body.status !== undefined) {
      if (isSelf) {
        return NextResponse.json({ error: 'You cannot change your own account status' }, { status: 400 })
      }
      if (body.status !== undefined && !VALID_USER_STATUSES.includes(body.status)) {
        return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_USER_STATUSES.join(', ')}` }, { status: 400 })
      }
      if (body.status !== undefined) {
        userData.status = body.status
        userData.isActive = body.status === 'ACTIVE'
      }
      if (body.isActive !== undefined) userData.isActive = !!body.isActive
    }

    if (Object.keys(profileData).length === 0 && Object.keys(userData).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const existing = { ...developer, ...(developer.user as Record<string, unknown>) }

    const updated = await db.$transaction(async (tx) => {
      const profile = Object.keys(profileData).length
        ? await tx.developerProfile.update({ where: { id: params.id }, data: profileData })
        : developer
      const user = Object.keys(userData).length
        ? await tx.user.update({
            where: { id: developer.userId },
            data: userData,
            select: USER_OUTPUT,
          })
        : developer.user
      return { profile, user }
    })

    const changes: Record<string, unknown> = {}
    for (const [key, value] of [
      ...Object.entries(profileData),
      ...Object.entries(userData),
    ]) {
      const before = (existing as Record<string, unknown>)[key]
      if (JSON.stringify(before) !== JSON.stringify(value)) {
        changes[key] = { from: before, to: value }
      }
    }

    if (Object.keys(changes).length > 0) {
      await logAudit({
        action: 'DEVELOPER_UPDATED',
        entity: 'DeveloperProfile',
        entityId: params.id,
        userId: actorId,
        changes: { company: developer.companyName, fields: changes },
      })
    }

    return NextResponse.json({ developer: updated.profile, user: updated.user })
  } catch (err) {
    console.error('CEO update developer error:', err)
    return NextResponse.json({ error: 'Failed to update developer' }, { status: 500 })
  }
}

// ─── DELETE /api/ceo/developers/[id]?hard=true ───────────
// Default suspends the account. Hard delete refuses to run while the
// developer still owns projects or deals (both cascade).
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error
    const actorId = (session!.user as any)?.id as string

    const developer = await loadDeveloper(params.id)
    if (!developer) {
      return NextResponse.json({ error: 'Developer not found' }, { status: 404 })
    }
    if (developer.userId === actorId) {
      return NextResponse.json({ error: 'You cannot remove your own account' }, { status: 400 })
    }

    const hard = new URL(req.url).searchParams.get('hard') === 'true'

    if (hard) {
      if (developer._count.deals > 0) {
        return NextResponse.json(
          { error: `This developer has ${developer._count.deals} deal(s) recorded. Suspend the account instead so deal history is preserved.` },
          { status: 409 }
        )
      }
      if (developer._count.projects > 0) {
        return NextResponse.json(
          { error: `This developer still has ${developer._count.projects} project(s). Archive or reassign them first — deleting would remove them and every unit underneath.` },
          { status: 409 }
        )
      }
      await db.$transaction([
        db.developerPartnership.deleteMany({ where: { developerId: params.id } }),
        db.user.delete({ where: { id: developer.userId } }),
      ])
      await logAudit({
        action: 'DEVELOPER_HARD_DELETED',
        entity: 'DeveloperProfile',
        entityId: params.id,
        userId: actorId,
        changes: { company: developer.companyName, email: developer.user.email },
      })
      return NextResponse.json({ success: true, mode: 'hard' })
    }

    await db.user.update({
      where: { id: developer.userId },
      data: { status: 'SUSPENDED', isActive: false },
    })
    await logAudit({
      action: 'DEVELOPER_SUSPENDED',
      entity: 'DeveloperProfile',
      entityId: params.id,
      userId: actorId,
      changes: { company: developer.companyName, email: developer.user.email, from: developer.user.status },
    })

    return NextResponse.json({ success: true, mode: 'ban' })
  } catch (err) {
    console.error('CEO delete developer error:', err)
    return NextResponse.json({ error: 'Failed to remove developer' }, { status: 500 })
  }
}
