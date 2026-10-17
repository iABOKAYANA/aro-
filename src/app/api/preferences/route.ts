import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

// ─── NOTIFICATION PREFERENCES (per user) ────────────────────
// Wires the previously dead "Notification Preferences" settings card.

const ALLOWED = [
  'emailInquiries', 'emailLeads', 'emailPayments', 'emailViewings', 'emailMarketing',
  'pushInquiries', 'pushLeads', 'pushPayments', 'pushViewings',
  'smsNotifications', 'whatsappNotifications', 'watchAlerts',
] as const

async function requireSelf() {
  const session = await auth()
  const user = session?.user as { id?: string } | undefined
  if (!user?.id) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), userId: null }
  return { error: null, userId: user.id }
}

export async function GET() {
  try {
    const { error, userId } = await requireSelf()
    if (error) return error

    const pref = await db.notificationPreference.findUnique({ where: { userId: userId! } })
    return NextResponse.json({ preferences: pref, exists: !!pref })
  } catch (e) {
    console.error('Preferences fetch error:', e)
    return NextResponse.json({ error: 'Failed to load preferences' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { error, userId } = await requireSelf()
    if (error) return error

    const body = await req.json()
    const data: Record<string, unknown> = {}
    for (const key of ALLOWED) {
      if (body[key] !== undefined) {
        if (typeof body[key] !== 'boolean') {
          return NextResponse.json({ error: `${key} must be boolean` }, { status: 400 })
        }
        data[key] = body[key]
      }
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: `No valid fields supplied (${ALLOWED.join(', ')})` }, { status: 400 })
    }

    const pref = await db.notificationPreference.upsert({
      where: { userId: userId! },
      update: data,
      create: { userId: userId!, ...data },
    })
    await logAudit({ userId: userId!, action: 'PREFERENCES_UPDATED', entity: 'NotificationPreference', entityId: userId!, changes: { fields: Object.keys(data) } })
    return NextResponse.json({ success: true, preferences: pref })
  } catch (e) {
    console.error('Preferences update error:', e)
    return NextResponse.json({ error: 'Failed to save preferences' }, { status: 500 })
  }
}
