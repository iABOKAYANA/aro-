import { NextResponse } from 'next/server'
import { getPublicModel3D } from '@/lib/models3d'
import { readModel3DFile } from '@/lib/models3d-store'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

function contentTypeFor(key: string): string {
  if (key.endsWith('.gltf')) return 'model/gltf+json'
  return 'model/gltf-binary'
}

/**
 * Public 3D file stream. Gated THREE ways before a byte leaves the disk:
 * master switch ON + row PUBLISHED + linked source publicly visible.
 * Everything else → 404 with the same body as a missing route, and strict
 * noindex headers so the URL can never leak into a search engine.
 */
export async function GET(_req: Request, ctx: Ctx) {
  const notFound = NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    const model = await getPublicModel3D(ctx.params.id)
    if (!model || !model.hasRealModel) return notFound
    const row = await db.propertyModel3D.findUnique({
      where: { id: ctx.params.id },
      select: { storageKey: true },
    })
    if (!row?.storageKey) return notFound
    const buf = await readModel3DFile(row.storageKey)
    if (!buf) return notFound
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': contentTypeFor(row.storageKey),
        'Content-Length': String(buf.length),
        // Private + short — the gate can flip OFF at any moment.
        'Cache-Control': 'private, max-age=300',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    })
  } catch {
    return notFound
  }
}
