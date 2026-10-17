import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireActor } from '@/lib/lead-access'
import { logAudit } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

/**
 * Resolve the signed-in user's OWN broker profile id.
 * CEO/ADMIN pass the role gate but only get a profile when one is actually
 * linked to their account — they can never reach another broker's row.
 */
async function myBrokerId(userId: string): Promise<string | null> {
  const broker = await db.brokerProfile.findFirst({
    where: { userId },
    select: { id: true },
  })
  return broker?.id ?? null
}

const SAFE_PROFILE = {
  id: true,
  agencyName: true,
  agencyNameArabic: true,
  licenseNumber: true,
  bio: true,
  yearsExperience: true,
  commissionRate: true,
  rating: true,
  reviewCount: true,
  totalDeals: true,
  isVerified: true,
} as const

const SAFE_USER = {
  id: true,
  name: true,
  phone: true,
} as const

// ─── GET /api/broker/profile — my own profile + contact ──
export async function GET() {
  try {
    const gate = await requireActor(['BROKER'])
    if (!gate.ok) return gate.response
    const brokerId = await myBrokerId(gate.ctx.userId)
    if (!brokerId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const broker = await db.brokerProfile.findUnique({
      where: { id: brokerId },
      select: { ...SAFE_PROFILE, user: { select: SAFE_USER } },
    })
    if (!broker) return NextResponse.json({ error: 'Broker not found' }, { status: 404 })

    return NextResponse.json({ profile: broker })
  } catch (error) {
    console.error('Broker profile fetch error:', error)
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 })
  }
}

// ─── PATCH /api/broker/profile — edit my own data ────────
// Whitelist only. Privileged fields (commissionRate, rating, reviewCount,
// totalDeals, isVerified, account status) are NEVER taken from the body, so
// there is no privilege-escalation path by construction.
export async function PATCH(req: Request) {
  try {
    const gate = await requireActor(['BROKER'])
    if (!gate.ok) return gate.response
    const brokerId = await myBrokerId(gate.ctx.userId)
    if (!brokerId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => ({}))

    const profileData: Record<string, unknown> = {}
    const userData: Record<string, unknown> = {}

    const text = (v: unknown, max: number): string | null | undefined => {
      if (v === undefined) return undefined
      if (v === null) return null
      const s = String(v).trim()
      if (!s) return null
      return s.slice(0, max)
    }

    const agencyName = text(body.agencyName, 200)
    if (agencyName !== undefined) profileData.agencyName = agencyName
    const agencyNameArabic = text(body.agencyNameArabic, 200)
    if (agencyNameArabic !== undefined) profileData.agencyNameArabic = agencyNameArabic
    const licenseNumber = text(body.licenseNumber, 100)
    if (licenseNumber !== undefined) profileData.licenseNumber = licenseNumber
    const bio = text(body.bio, 2000)
    if (bio !== undefined) profileData.bio = bio

    if (body.yearsExperience !== undefined) {
      if (body.yearsExperience === null || body.yearsExperience === '') {
        profileData.yearsExperience = null
      } else {
        const years = Number(body.yearsExperience)
        if (!Number.isInteger(years) || years < 0 || years > 80) {
          return NextResponse.json(
            { error: 'yearsExperience must be a whole number between 0 and 80' },
            { status: 400 }
          )
        }
        profileData.yearsExperience = years
      }
    }

    if (body.name !== undefined) {
      const name = String(body.name).trim().slice(0, 100)
      if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
      userData.name = name
    }
    if (body.phone !== undefined) {
      if (body.phone === null || String(body.phone).trim() === '') {
        userData.phone = null
      } else {
        const phone = String(body.phone).replace(/[\s\-().]/g, '')
        if (!/^\+?\d{7,15}$/.test(phone)) {
          return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
        }
        userData.phone = phone
      }
    }

    if (Object.keys(profileData).length === 0 && Object.keys(userData).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const broker = await db.brokerProfile.findUnique({
      where: { id: brokerId },
      select: { id: true, userId: true },
    })
    if (!broker) return NextResponse.json({ error: 'Broker not found' }, { status: 404 })

    const updated = await db.$transaction(async (tx) => {
      const profile = Object.keys(profileData).length
        ? await tx.brokerProfile.update({
            where: { id: brokerId },
            data: profileData,
            select: SAFE_PROFILE,
          })
        : await tx.brokerProfile.findUniqueOrThrow({
            where: { id: brokerId },
            select: SAFE_PROFILE,
          })
      const user = Object.keys(userData).length
        ? await tx.user.update({
            where: { id: broker.userId },
            data: userData,
            select: SAFE_USER,
          })
        : await tx.user.findUniqueOrThrow({
            where: { id: broker.userId },
            select: SAFE_USER,
          })
      return { profile, user }
    })

    await logAudit({
      userId: gate.ctx.userId,
      action: 'BROKER_PROFILE_SELF_UPDATED',
      entity: 'BrokerProfile',
      entityId: brokerId,
      changes: {
        profile: profileData,
        user: userData,
      },
    }).catch(() => undefined)

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Broker profile update error:', error)
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }
}
