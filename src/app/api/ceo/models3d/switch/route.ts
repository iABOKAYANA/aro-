import { NextResponse } from 'next/server'
import { requireCEOApi, logAudit } from '@/lib/permissions'
import { getModel3DGating, setModel3DPublishEnabled } from '@/lib/models3d'

export const dynamic = 'force-dynamic'

/**
 * The 3D master publishing switch. Default state is permanently OFF — the
 * row simply does not exist until the owner flips it the first time, and any
 * restart/migration/redeploy can only ever RESTORE what this row says.
 * 'true'|'false' is stored as a plain string so a corrupt JSON payload can
 * never parse itself into an enabled state.
 */
export async function GET() {
  try {
    const { error } = await requireCEOApi()
    if (error) return error
    return NextResponse.json(await getModel3DGating())
  } catch (err) {
    console.error('models3d switch GET error:', err)
    return NextResponse.json({ error: 'Failed to read the publishing switch' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error
    const body = (await req.json().catch(() => ({}))) as { enabled?: unknown }
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled (boolean) is required' }, { status: 400 })
    }
    await setModel3DPublishEnabled(body.enabled)
    await logAudit({
      userId: (session!.user as { id?: string })?.id,
      action: body.enabled ? 'MODEL3D_PUBLISH_ON' : 'MODEL3D_PUBLISH_OFF',
      entity: 'SystemSetting',
      entityId: 'model3d_publish',
      changes: { publishEnabled: body.enabled },
    })
    return NextResponse.json({ publishEnabled: body.enabled })
  } catch (err) {
    console.error('models3d switch POST error:', err)
    return NextResponse.json({ error: 'Failed to update the publishing switch' }, { status: 500 })
  }
}
