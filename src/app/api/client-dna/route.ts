import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getClientDna, applyUserEdit, type ClientDna } from '@/lib/client-dna'
import { logAudit } from '@/lib/permissions'
import { readBoolSetting } from '@/lib/system-settings'

export const dynamic = 'force-dynamic'

// ─── CLIENT DNA (Feature 1) — the owner views/edits their own profile ───

async function requireSelf() {
  const session = await auth()
  const user = session?.user as { id?: string; role?: string } | undefined
  if (!user?.id) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), userId: null }
  return { error: null, userId: user.id }
}

export async function GET(req: Request) {
  try {
    const { error, userId } = await requireSelf()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const force = searchParams.get('force') === 'true'

    const enabled = await readBoolSetting('dnaEnabled', true)
    const snapshot = await getClientDna(userId!, { force })
    return NextResponse.json({ enabled, ...snapshot })
  } catch (e) {
    console.error('Client DNA fetch error:', e)
    return NextResponse.json({ error: 'Failed to load preferences' }, { status: 500 })
  }
}

const EDITABLE: Array<keyof ClientDna> = [
  'budget', 'locations', 'propertyTypes', 'bedrooms', 'area',
  'listingType', 'financial', 'intent', 'urgency', 'amenities',
]

export async function PATCH(req: NextRequest) {
  try {
    const { error, userId } = await requireSelf()
    if (error) return error

    const body = await req.json()
    const patch: Partial<ClientDna> = {}
    for (const key of EDITABLE) {
      if (body[key] !== undefined) patch[key] = body[key] as never
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No editable preference fields supplied' }, { status: 400 })
    }
    // Light validation — never accept invented shapes
    if (patch.budget && typeof patch.budget === 'object') {
      const b = patch.budget as { min?: number; max?: number }
      if ((b.min !== undefined && (typeof b.min !== 'number' || b.min < 0)) ||
          (b.max !== undefined && (typeof b.max !== 'number' || b.max < 0))) {
        return NextResponse.json({ error: 'budget min/max must be positive numbers' }, { status: 400 })
      }
      patch.budget = { min: b.min, max: b.max, currency: 'EGP' }
    }
    if (patch.locations && !Array.isArray(patch.locations)) return NextResponse.json({ error: 'locations must be an array' }, { status: 400 })
    if (patch.propertyTypes && !Array.isArray(patch.propertyTypes)) return NextResponse.json({ error: 'propertyTypes must be an array' }, { status: 400 })
    if (patch.intent && !['LIVING', 'INVESTMENT'].includes(patch.intent as string)) {
      return NextResponse.json({ error: 'intent must be LIVING or INVESTMENT' }, { status: 400 })
    }
    if (patch.urgency && !['LOW', 'MEDIUM', 'HIGH'].includes(patch.urgency as string)) {
      return NextResponse.json({ error: 'urgency must be LOW, MEDIUM or HIGH' }, { status: 400 })
    }

    const snapshot = await applyUserEdit(userId!, patch)
    await logAudit({
      userId: userId!,
      action: 'DNA_EDITED',
      entity: 'UserProfile',
      entityId: userId!,
      changes: { fields: Object.keys(patch) },
    })
    return NextResponse.json({ success: true, ...snapshot })
  } catch (e) {
    console.error('Client DNA update error:', e)
    return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 })
  }
}
