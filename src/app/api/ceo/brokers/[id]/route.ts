import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { requireCEOApi, logAudit } from '@/lib/permissions'
import { isValidImageUrl } from '@/lib/image-url'

export const dynamic = 'force-dynamic'

const VALID_USER_STATUSES = ['ACTIVE', 'PENDING', 'SUSPENDED', 'REJECTED', 'DISABLED']

/** Scalar BrokerProfile fields the CEO may edit. */
const PROFILE_FIELDS = [
  'agencyName',
  'agencyNameArabic',
  'licenseNumber',
  'yearsExperience',
  'totalDeals',
  'rating',
  'reviewCount',
  'commissionRate',
  'bio',
  'coverImage',
  'featuredRank',
] as const

/** BrokerProfile fields stored as a JSON array string. */
const JSON_ARRAY_FIELDS = ['specialization', 'serviceAreas', 'languagesSpoken'] as const

/** User fields returned to the client — no password hash. */
const USER_OUTPUT = {
  id: true,
  name: true,
  nameArabic: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  isActive: true,
  isVerified: true,
  avatar: true,
}

async function loadBroker(id: string) {
  return db.brokerProfile.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          nameArabic: true,
          email: true,
          phone: true,
          status: true,
          isActive: true,
          isVerified: true,
          avatar: true,
        },
      },
    },
  })
}

// ─── PATCH /api/ceo/brokers/[id] ─────────────────────────
// Verify/unverify, edit profile data, and manage the linked account.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error
    const actorId = (session!.user as any)?.id as string

    const broker = await loadBroker(params.id)
    if (!broker) {
      return NextResponse.json({ error: 'Broker not found' }, { status: 404 })
    }

    const body = await req.json()
    const isSelf = broker.userId === actorId

    const profileData: Record<string, unknown> = {}
    const userData: Record<string, unknown> = {}

    const NUMERIC_FIELDS = new Set(['rating', 'commissionRate', 'yearsExperience', 'totalDeals', 'reviewCount'])
    const NULLABLE_NUMERIC_FIELDS = new Set(['commissionRate', 'yearsExperience'])

    for (const field of PROFILE_FIELDS) {
      if (body[field] === undefined) continue
      const raw = body[field]

      // next/image throws on non-URL image values — reject them, empty → null.
      if (field === 'coverImage' && typeof raw === 'string' && raw.trim() !== '') {
        if (!isValidImageUrl(raw.trim())) {
          return NextResponse.json({ error: 'coverImage must be a valid image URL starting with http(s):// or /' }, { status: 400 })
        }
        profileData[field] = raw.trim()
        continue
      }

      if (NUMERIC_FIELDS.has(field)) {
        if (raw === '' || raw === null) {
          if (NULLABLE_NUMERIC_FIELDS.has(field)) profileData[field] = null
          continue
        }
        const value = Number(raw)
        if (!Number.isFinite(value)) {
          return NextResponse.json({ error: `${field} must be a number` }, { status: 400 })
        }
        profileData[field] = value
        continue
      }

      if (raw === null) continue
      profileData[field] = raw
    }

    if (body.rating !== undefined && body.rating !== null) {
      const rating = Number(body.rating)
      if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
        return NextResponse.json({ error: 'Rating must be between 0 and 5' }, { status: 400 })
      }
      profileData.rating = rating
    }
    if (body.commissionRate !== undefined && body.commissionRate !== null) {
      const rate = Number(body.commissionRate)
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        return NextResponse.json({ error: 'Commission rate must be between 0 and 100' }, { status: 400 })
      }
      profileData.commissionRate = rate
    }
    if (body.yearsExperience !== undefined && body.yearsExperience !== null) {
      const years = Number(body.yearsExperience)
      if (!Number.isInteger(years) || years < 0) {
        return NextResponse.json({ error: 'Years of experience must be 0 or more' }, { status: 400 })
      }
      profileData.yearsExperience = years
    }

    for (const field of JSON_ARRAY_FIELDS) {
      if (body[field] === undefined) continue
      const value = body[field]
      if (Array.isArray(value)) profileData[field] = JSON.stringify(value)
      else if (typeof value === 'string') profileData[field] = JSON.stringify(value.split(',').map((s) => s.trim()).filter(Boolean))
      else if (value === null) profileData[field] = '[]'
    }

    // socialLinks is a free-form JSON string on the profile.
    if (body.socialLinks !== undefined) {
      const v = body.socialLinks
      if (v === null || (typeof v === 'string' && !v.trim())) {
        profileData.socialLinks = null
      } else if (typeof v === 'string') {
        const t = v.trim()
        try {
          JSON.parse(t)
          profileData.socialLinks = t
        } catch {
          return NextResponse.json({ error: 'socialLinks must be valid JSON or an object' }, { status: 400 })
        }
      } else if (typeof v === 'object') {
        profileData.socialLinks = JSON.stringify(v)
      } else {
        return NextResponse.json({ error: 'Invalid socialLinks' }, { status: 400 })
      }
    }

    // Verification is a profile flag — mirror it on the account too so
    // public-facing surfaces agree with the CEO panel.
    if (body.isVerified !== undefined) {
      profileData.isVerified = !!body.isVerified
      userData.isVerified = !!body.isVerified
    }

    if (body.name !== undefined) userData.name = String(body.name).trim()
    if (body.nameArabic !== undefined) {
      const na = typeof body.nameArabic === 'string' ? body.nameArabic.trim() : ''
      if (na.length > 100) {
        return NextResponse.json({ error: 'nameArabic too long' }, { status: 400 })
      }
      userData.nameArabic = na || null
    }
    if (body.avatar !== undefined) {
      const av = typeof body.avatar === 'string' ? body.avatar.trim() : ''
      if (av && !isValidImageUrl(av)) {
        return NextResponse.json({ error: 'Avatar must be a valid image URL starting with http(s):// or /' }, { status: 400 })
      }
      userData.avatar = av || null
    }
    if (body.preferredLang !== undefined) {
      const lang = typeof body.preferredLang === 'string' ? body.preferredLang.trim().slice(0, 10) : ''
      if (!lang) return NextResponse.json({ error: 'Invalid preferredLang' }, { status: 400 })
      userData.preferredLang = lang
    }
    if (body.preferredCurrency !== undefined) {
      const cur = typeof body.preferredCurrency === 'string' ? body.preferredCurrency.trim().toUpperCase().slice(0, 10) : ''
      if (!cur) return NextResponse.json({ error: 'Invalid preferredCurrency' }, { status: 400 })
      userData.preferredCurrency = cur
    }
    // Full control includes credential reset — hash server-side, never echo.
    if (body.password !== undefined) {
      if (typeof body.password !== 'string' || body.password.length < 10) {
        return NextResponse.json({ error: 'Password must be at least 10 characters' }, { status: 400 })
      }
      userData.passwordHash = await bcrypt.hash(body.password, 12)
    }
    if (body.phone !== undefined) userData.phone = body.phone ? String(body.phone).trim() : null
    if (body.email !== undefined) {
      const email = String(body.email).trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
      }
      const taken = await db.user.findFirst({ where: { email, id: { not: broker.userId } } })
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

    const existing = { ...broker, ...(broker.user as Record<string, unknown>) }

    const updated = await db.$transaction(async (tx) => {
      const profile = Object.keys(profileData).length
        ? await tx.brokerProfile.update({ where: { id: params.id }, data: profileData })
        : broker
      const user = Object.keys(userData).length
        ? await tx.user.update({
            where: { id: broker.userId },
            data: userData,
            // never echo credentials back to the client
            select: USER_OUTPUT,
          })
        : broker.user
      return { profile, user }
    })

    const changes: Record<string, unknown> = {}
    for (const [key, value] of [
      ...Object.entries(profileData),
      ...Object.entries(userData),
    ]) {
      // Never write secret material into the audit trail.
      if (key === 'passwordHash') {
        changes.password = { from: '***', to: '***' }
        continue
      }
      const before = (existing as Record<string, unknown>)[key]
      if (JSON.stringify(before) !== JSON.stringify(value)) {
        changes[key] = { from: before, to: value }
      }
    }

    if (Object.keys(changes).length > 0) {
      await logAudit({
        action: 'BROKER_UPDATED',
        entity: 'BrokerProfile',
        entityId: params.id,
        userId: actorId,
        changes: { brokerEmail: broker.user.email, fields: changes },
      })
    }

    return NextResponse.json({ broker: updated.profile, user: updated.user })
  } catch (err) {
    console.error('CEO update broker error:', err)
    return NextResponse.json({ error: 'Failed to update broker' }, { status: 500 })
  }
}

// ─── DELETE /api/ceo/brokers/[id]?hard=true ──────────────
// Default is a soft ban (suspend + deactivate). `hard=true` removes the
// account entirely, which first releases the broker's leads.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error
    const actorId = (session!.user as any)?.id as string

    const broker = await loadBroker(params.id)
    if (!broker) {
      return NextResponse.json({ error: 'Broker not found' }, { status: 404 })
    }
    if (broker.userId === actorId) {
      return NextResponse.json({ error: 'You cannot remove your own account' }, { status: 400 })
    }

    const hard = new URL(req.url).searchParams.get('hard') === 'true'

    if (hard) {
      const dealCount = await db.deal.count({ where: { brokerId: params.id } })
      if (dealCount > 0) {
        return NextResponse.json(
          { error: `This broker has ${dealCount} linked deal(s). Suspend the account instead so deal attribution is preserved.` },
          { status: 409 }
        )
      }
      const leadCount = await db.lead.count({ where: { brokerId: params.id } })
      await db.$transaction([
        // Lead.brokerId cascades on profile delete — release them first.
        db.lead.updateMany({ where: { brokerId: params.id }, data: { brokerId: null } }),
        db.user.delete({ where: { id: broker.userId } }),
      ])
      await logAudit({
        action: 'BROKER_HARD_DELETED',
        entity: 'BrokerProfile',
        entityId: params.id,
        userId: actorId,
        changes: { email: broker.user.email, releasedLeads: leadCount },
      })
      return NextResponse.json({ success: true, mode: 'hard' })
    }

    await db.user.update({
      where: { id: broker.userId },
      data: { status: 'SUSPENDED', isActive: false },
    })
    await logAudit({
      action: 'BROKER_SUSPENDED',
      entity: 'BrokerProfile',
      entityId: params.id,
      userId: actorId,
      changes: { email: broker.user.email, from: broker.user.status },
    })

    return NextResponse.json({ success: true, mode: 'ban' })
  } catch (err) {
    console.error('CEO delete broker error:', err)
    return NextResponse.json({ error: 'Failed to remove broker' }, { status: 500 })
  }
}
