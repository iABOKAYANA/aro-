import { NextResponse } from 'next/server'
import { requireCEOApi, logAudit } from '@/lib/permissions'
import {
  parseHotspots,
  parseFloors,
  MODEL3D_STATUSES,
} from '@/lib/models3d'
import { deleteModel3DFile } from '@/lib/models3d-store'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

/** GET one admin row (full, raw config for the editor). */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { error } = await requireCEOApi()
    if (error) return error
    const row = await db.propertyModel3D.findUnique({ where: { id: ctx.params.id } })
    if (!row) return NextResponse.json({ error: 'Model not found' }, { status: 404 })
    return NextResponse.json({ model: row, hotspots: parseHotspots(row.hotspotData), floors: parseFloors(row.floorData) })
  } catch (err) {
    console.error('ceo models3d [id] GET error:', err)
    return NextResponse.json({ error: 'Failed to load the model' }, { status: 500 })
  }
}

/**
 * PATCH — configuration only (label, kind, hotspots, floors, status, link,
 * fallback image). Deliberately JSON, never multipart: replacing the model
 * binary is delete + re-create so stale bytes can never mix with new config.
 * Publish/unpublish goes through this same route but ONLY from the CEO
 * dashboard; the public site still refuses until the master switch is ON.
 */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const row = await db.propertyModel3D.findUnique({ where: { id: ctx.params.id } })
    if (!row) return NextResponse.json({ error: 'Model not found' }, { status: 404 })

    const data: Record<string, unknown> = {}

    if (typeof body.labelAr === 'string' || body.labelAr === null) {
      data.labelAr = typeof body.labelAr === 'string' ? body.labelAr.trim().slice(0, 80) || null : null
    }
    if (typeof body.labelEn === 'string' || body.labelEn === null) {
      data.labelEn = typeof body.labelEn === 'string' ? body.labelEn.trim().slice(0, 80) || null : null
    }
    if (typeof body.kind === 'string') {
      const kind = body.kind.toUpperCase()
      if (!['EXTERIOR', 'INTERIOR', 'BUILDING'].includes(kind)) {
        return NextResponse.json({ error: 'kind must be EXTERIOR, INTERIOR or BUILDING' }, { status: 400 })
      }
      data.kind = kind
    }
    if (typeof body.fallbackImageUrl === 'string' || body.fallbackImageUrl === null) {
      if (typeof body.fallbackImageUrl === 'string' && body.fallbackImageUrl) {
        const v = body.fallbackImageUrl.trim()
        if (!v.startsWith('/') && !/^https:\/\//.test(v)) {
          return NextResponse.json({ error: 'fallback image must be an uploaded image URL' }, { status: 400 })
        }
        data.fallbackImageUrl = v.slice(0, 400)
      } else {
        data.fallbackImageUrl = null
      }
    }
    // Hotspots/floors arrive as JSON strings or plain arrays; validate then
    // re-serialize — the row NEVER stores unvalidated editor JSON.
    for (const field of ['hotspotData', 'floorData'] as const) {
      if (body[field] === undefined) continue
      const parsed = field === 'hotspotData' ? parseHotspots(body[field]) : parseFloors(body[field])
      if (parsed === null) return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 })
      data[field] = JSON.stringify(parsed)
    }
    if (body.hotspots !== undefined) data.hotspotData = JSON.stringify(parseHotspots(body.hotspots))
    if (body.floors !== undefined) data.floorData = JSON.stringify(parseFloors(body.floors))
    if (typeof body.status === 'string') {
      const status = body.status.toUpperCase()
      if (!MODEL3D_STATUSES.includes(status as never)) {
        return NextResponse.json({ error: 'status must be DRAFT or PUBLISHED' }, { status: 400 })
      }
      // Publishing a row without any real file is allowed but the public page
      // will then clearly label it as the demo scene (owner's spec).
      data.status = status
    }

    const updated = await db.propertyModel3D.update({
      where: { id: row.id },
      data,
      select: { id: true, status: true },
    })
    await logAudit({
      userId: (session!.user as { id?: string })?.id,
      action: 'MODEL3D_UPDATE',
      entity: 'PROPERTY_MODEL_3D',
      entityId: row.id,
      changes: { ...data, hotspotData: undefined, floorData: undefined, sizes: { hotspots: (data.hotspotData as string || row.hotspotData || '').length, floors: (data.floorData as string || row.floorData || '').length } },
    })
    return NextResponse.json(updated)
  } catch (err) {
    console.error('ceo models3d [id] PATCH error:', err)
    return NextResponse.json({ error: 'Failed to update the model' }, { status: 500 })
  }
}

/** DELETE — remove the row AND its gated file bytes. */
export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error
    const row = await db.propertyModel3D.findUnique({ where: { id: ctx.params.id } })
    if (!row) return NextResponse.json({ error: 'Model not found' }, { status: 404 })
    await db.propertyModel3D.delete({ where: { id: row.id } })
    if (row.storageKey) await deleteModel3DFile(row.storageKey)
    await logAudit({
      userId: (session!.user as { id?: string })?.id,
      action: 'MODEL3D_DELETE',
      entity: 'PROPERTY_MODEL_3D',
      entityId: row.id,
      changes: { hadFile: !!row.storageKey },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('ceo models3d [id] DELETE error:', err)
    return NextResponse.json({ error: 'Failed to delete the model' }, { status: 500 })
  }
}
