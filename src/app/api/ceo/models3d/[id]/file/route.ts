import { NextResponse } from 'next/server'
import { requireCEOApi } from '@/lib/permissions'
import { readModel3DFile } from '@/lib/models3d-store'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

/** Content-type map for model files. */
function contentTypeFor(key: string): string {
  if (key.endsWith('.gltf')) return 'model/gltf+json'
  return 'model/gltf-binary'
}

/**
 * CEO file stream — works while the row is still DRAFT. This is the preview
 * feed for the /ceo/3d/[id] configurator. It is auth-gated and sets
 * no-index headers, but it is NOT the public feed — /api/3d/file/[id] handles
 * the (gated) public stream.
 */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { error } = await requireCEOApi()
    if (error) return error
    const row = await db.propertyModel3D.findUnique({ where: { id: ctx.params.id } })
    if (!row) return NextResponse.json({ error: 'Model not found' }, { status: 404 })
    if (!row.storageKey) {
      return NextResponse.json({ error: 'This row has no uploaded model file' }, { status: 404 })
    }
    const buf = await readModel3DFile(row.storageKey)
    if (!buf) return NextResponse.json({ error: 'Model file missing on disk' }, { status: 404 })
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': contentTypeFor(row.storageKey),
        'Content-Length': String(buf.length),
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    })
  } catch (err) {
    console.error('ceo models3d [id] file GET error:', err)
    return NextResponse.json({ error: 'Failed to stream the model' }, { status: 500 })
  }
}
