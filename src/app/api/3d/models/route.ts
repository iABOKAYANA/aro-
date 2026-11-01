import { NextResponse } from 'next/server'
import { getPublicModel3D } from '@/lib/models3d'

export const dynamic = 'force-dynamic'

/**
 * Public 3D-model registry — returns the row's SAFE public payload (never the
 * storage key) but ONLY while the master switch is ON and the row is
 * PUBLISHED on a publicly visible source. Otherwise: 404, same response shape
 * as any missing route, so probing endpoints reveals nothing.
 */
export async function GET(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get('id') || ''
    if (!id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const model = await getPublicModel3D(id)
    if (!model) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(
      { model },
      { headers: { 'Cache-Control': 'private, max-age=60', 'X-Robots-Tag': 'noindex, nofollow' } }
    )
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
