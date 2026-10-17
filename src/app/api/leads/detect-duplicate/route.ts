import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireActor } from '@/lib/lead-access'
import { findDuplicateLead, normalizePhone, normalizeEmail } from '@/lib/lead-protection'

export const dynamic = 'force-dynamic'

// ─── POST /api/leads/detect-duplicate ─────────────────────
// Returns a neutral ownership answer only — never the other
// broker's client details.
export async function POST(req: Request) {
  try {
    const actor = await requireActor(['BROKER', 'CEO', 'ADMIN'])
    if (!actor.ok) return actor.response
    const { ctx } = actor

    const body = await req.json()
    const phone = typeof body.phone === 'string' ? body.phone : ''
    const email = typeof body.email === 'string' ? body.email : ''
    if (!phone && !email) {
      return NextResponse.json({ error: 'phone or email required' }, { status: 400 })
    }

    const match = await findDuplicateLead({ phone, email })
    if (!match) {
      return NextResponse.json({ duplicate: false, message: 'No duplicate found — safe to register.' })
    }

    const mine = !!match.brokerId && ctx.brokerId === match.brokerId
    const ceo = ctx.isCEO

    return NextResponse.json({
      duplicate: true,
      sameBroker: mine,
      // CEO gets the id for dispute resolution; brokers get a neutral message
      leadId: ceo ? match.id : undefined,
      leadCode: ceo || mine ? match.leadCode : undefined,
      message: mine
        ? 'This client is already registered on your account.'
        : 'This client may already be registered on EstateAI by another partner. The case can be submitted for review.',
      normalized: { phone: normalizePhone(phone), email: normalizeEmail(email) },
    })
  } catch (error) {
    console.error('Detect duplicate error:', error)
    return NextResponse.json({ error: 'Duplicate check failed' }, { status: 500 })
  }
}
