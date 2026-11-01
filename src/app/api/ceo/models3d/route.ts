import { NextResponse } from 'next/server'
import { requireCEOApi, logAudit } from '@/lib/permissions'
import {
  getModel3DGating,
  listAdminModels3D,
  validateModel3DInput,
  sourceExists,
  type Model3DSourceType,
} from '@/lib/models3d'
import { saveModel3DFile, validateModel3DBytes, model3dExtensionAllowed, MODEL3D_MAX_BYTES } from '@/lib/models3d-store'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * CEO 3D-model registry. NOTHING inside this file publishes anything to the
 * public site — public exposure is gated by getModel3DGating() reads.
 *
 * GET  → full list + master switch state
 * POST → create a row, optionally carrying an uploaded .glb/.gltf (multipart)
 */
export async function GET(req: Request) {
  try {
    const { error } = await requireCEOApi()
    if (error) return error
    const url = new URL(req.url)
    const st = (url.searchParams.get('sourceType') || '').toUpperCase()
    const [gating, models] = await Promise.all([
      getModel3DGating(),
      listAdminModels3D(st === 'PROJECT' || st === 'UNIT' ? (st as Model3DSourceType) : undefined),
    ])
    return NextResponse.json({ gating, models })
  } catch (err) {
    console.error('ceo models3d GET error:', err)
    return NextResponse.json({ error: 'Failed to load 3D models' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error

    let input: ReturnType<typeof validateModel3DInput>
    let file: { buffer: Buffer; ext: '.glb' | '.gltf'; originalName: string } | null = null

    const contentType = req.headers.get('content-type') || ''
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const raw = form.get('payload')
      if (typeof raw !== 'string') return NextResponse.json({ error: 'Missing payload' }, { status: 400 })
      input = validateModel3DInput(JSON.parse(raw))
      const f = form.get('file')
      if (f instanceof File && f.size > 0) {
        const ext = model3dExtensionAllowed(f.name)
        if (!ext) {
          return NextResponse.json({ error: 'Only .glb or .gltf model files are allowed' }, { status: 400 })
        }
        if (f.size > MODEL3D_MAX_BYTES) {
          return NextResponse.json({ error: `Model file is too large (max ${Math.round(MODEL3D_MAX_BYTES / 1024 / 1024)}MB)` }, { status: 413 })
        }
        const buffer = Buffer.from(await f.arrayBuffer())
        if (!validateModel3DBytes(buffer, ext)) {
          return NextResponse.json(
            { error: ext === '.glb' ? 'This is not a valid glTF 2.0 binary (.glb) file' : 'This is not a valid glTF (.gltf) JSON file' },
            { status: 400 }
          )
        }
        file = { buffer, ext, originalName: f.name.slice(0, 140) }
      }
    } else {
      input = validateModel3DInput((await req.json().catch(() => ({}))) as Record<string, unknown>)
    }
    if (input.error) return NextResponse.json({ error: input.error }, { status: 400 })
    if (!input.sourceType || !input.sourceId || !input.kind) {
      return NextResponse.json({ error: 'sourceType, sourceId and kind are required' }, { status: 400 })
    }
    if (!(await sourceExists(input.sourceType, input.sourceId))) {
      return NextResponse.json({ error: 'The linked Project/Unit does not exist' }, { status: 400 })
    }

    let storageKey: string | null = null
    let originalName: string | null = null
    let sizeBytes: number | null = null
    if (file) {
      storageKey = await saveModel3DFile(file.buffer, file.ext)
      originalName = file.originalName
      sizeBytes = file.buffer.length
    }

    const row = await db.propertyModel3D.create({
      data: {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        kind: input.kind,
        labelAr: input.labelAr ?? null,
        labelEn: input.labelEn ?? null,
        fallbackImageUrl: input.fallbackImageUrl ?? null,
        storageKey,
        originalName,
        sizeBytes,
        uploadedByEmail: session!.user?.email ?? null,
      },
      select: { id: true },
    })
    await logAudit({
      userId: (session!.user as { id?: string })?.id,
      action: 'MODEL3D_CREATE',
      entity: 'PROPERTY_MODEL_3D',
      entityId: row.id,
      changes: { sourceType: input.sourceType, sourceId: input.sourceId, hasFile: !!file },
    })
    return NextResponse.json({ id: row.id })
  } catch (err) {
    console.error('ceo models3d POST error:', err)
    return NextResponse.json({ error: 'Failed to create the 3D model' }, { status: 500 })
  }
}
