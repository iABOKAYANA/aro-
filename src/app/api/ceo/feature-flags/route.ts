import { NextResponse } from 'next/server'
import { requireCEOApi, logAudit } from '@/lib/permissions'
import { FLAG_DEFS, getFeatureFlags, setFeatureFlag } from '@/lib/feature-flags'

export const dynamic = 'force-dynamic'

/** GET — all flags with their definitions. */
export async function GET() {
  try {
    const { error } = await requireCEOApi()
    if (error) return error
    const flags = await getFeatureFlags()
    return NextResponse.json({
      flags,
      defs: FLAG_DEFS,
    })
  } catch (err) {
    console.error('feature-flags GET error:', err)
    return NextResponse.json({ error: 'Failed to load flags' }, { status: 500 })
  }
}

/** PATCH { key, enabled } — toggle one flag. */
export async function PATCH(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error
    const body = (await req.json().catch(() => ({}))) as { key?: unknown; enabled?: unknown }
    if (typeof body.key !== 'string' || typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'key (string) and enabled (boolean) are required' }, { status: 400 })
    }
    const flags = await setFeatureFlag(body.key, body.enabled)
    await logAudit({
      userId: (session!.user as { id?: string })?.id,
      action: 'FEATURE_FLAG_TOGGLE',
      entity: 'FEATURE_FLAG',
      entityId: body.key,
      changes: { enabled: body.enabled },
    })
    return NextResponse.json({ flags })
  } catch (err) {
    console.error('feature-flags PATCH error:', err)
    return NextResponse.json({ error: 'Failed to update flag' }, { status: 500 })
  }
}
