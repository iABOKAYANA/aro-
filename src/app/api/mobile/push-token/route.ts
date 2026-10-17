import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireActor } from '@/lib/lead-access'

export const dynamic = 'force-dynamic'

/**
 * Register / inspect / revoke the calling device's Expo push token.
 *
 * Tokens are per-device credentials: a sign-out deletes only the token that
 * signed out, so one phone going away never silences another. Upsert-on-POST
 * keeps re-installs from stacking rows for a token the app already reported.
 *
 * `POST /api/mobile/auth/login` mints the session, so registration happens
 * after sign-in — which is also when the OS permission prompt belongs.
 */
export async function GET() {
  const gate = await requireActor()
  if (!gate.ok) return gate.response

  try {
    const rows = await db.pushSubscription.findMany({
      where: { userId: gate.ctx.userId },
      select: { id: true, token: true, platform: true, deviceName: true, lastSeenAt: true },
      orderBy: { lastSeenAt: 'desc' },
    })
    return NextResponse.json({ subscriptions: rows })
  } catch (error) {
    console.error('List push tokens error:', error)
    return NextResponse.json({ error: 'Failed to list devices' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const gate = await requireActor()
  if (!gate.ok) return gate.response

  let body: { token?: unknown; platform?: unknown; deviceName?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const token = typeof body.token === 'string' ? body.token.trim() : ''
  // Expo tokens look like `ExponentPushToken[xxxx]` / `ExpoPushToken[xxxx]`.
  // Anything else is a programming error or a forged row, not a device.
  if (!token || token.length > 512 || !/^[A-Za-z0-9_-]+\[[^\]]{1,256}\]$/.test(token)) {
    return NextResponse.json({ error: 'Invalid push token' }, { status: 400 })
  }

  const platform = ['ios', 'android', 'web'].includes(String(body.platform))
    ? String(body.platform)
    : 'ios'
  const deviceName =
    typeof body.deviceName === 'string' && body.deviceName.trim()
      ? body.deviceName.trim().slice(0, 120)
      : null

  try {
    const row = await db.pushSubscription.upsert({
      where: { userId_token: { userId: gate.ctx.userId, token } },
      create: { userId: gate.ctx.userId, token, platform, deviceName },
      update: { platform, deviceName, lastSeenAt: new Date() },
    })
    return NextResponse.json({ subscription: { id: row.id, token: row.token } })
  } catch (error) {
    console.error('Register push token error:', error)
    return NextResponse.json({ error: 'Failed to register this device' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const gate = await requireActor()
  if (!gate.ok) return gate.response

  const token = new URL(request.url).searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 })

  try {
    // Scoped by userId: a caller can only revoke their own devices.
    await db.pushSubscription.deleteMany({ where: { userId: gate.ctx.userId, token } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Revoke push token error:', error)
    return NextResponse.json({ error: 'Failed to revoke this device' }, { status: 500 })
  }
}
