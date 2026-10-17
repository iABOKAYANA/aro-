import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireOwnProject } from '@/lib/developer-projects'
import { logAudit } from '@/lib/permissions'
import { blockWhenRequestOnly } from '@/lib/edit-requests'
import { isValidImageUrl } from '@/lib/image-url'

export const dynamic = 'force-dynamic'

// Accepts absolute http(s) URLs and site-relative paths (the upload doors
// mint `/images/uploads/<name>`), mirroring the CEO URL guards.
const URL_LIKE = /^(https?:\/\/|\/)/i

/**
 * PATCH /api/developer/projects/[id] — media fields ONLY on an OWN project:
 * `coverImage`, `gallery`, `videoUrl`, `virtualTourUrl`.
 *
 * Works in any approval state (DRAFT through PUBLISHED — edits to a
 * published project go live immediately). Unknown/non-media fields are
 * ignored; at least one media field is required. Ownership via
 * `requireOwnProject`: 401/403 from the role gate, 403 with no linked
 * profile, 404 when missing, 403 when foreign.
 * → 200 { project }
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const gate = await requireOwnProject(params.id)
    if (!gate.ok) return gate.response
    // Permission mode: REQUEST-mode developers edit via edit-requests only.
    const blocked = await blockWhenRequestOnly(gate.developerId)
    if (blocked) return blocked

    const body = await req.json()
    const updateData: Record<string, unknown> = {}

    if (body.coverImage !== undefined) {
      const raw = body.coverImage
      if (raw === null || (typeof raw === 'string' && raw.trim() === '')) {
        updateData.coverImage = null
      } else if (typeof raw === 'string' && isValidImageUrl(raw.trim())) {
        updateData.coverImage = raw.trim()
      } else {
        return NextResponse.json(
          { error: 'coverImage must be a valid image URL starting with http(s):// or /' },
          { status: 400 }
        )
      }
    }

    if (body.gallery !== undefined) {
      let gallery = body.gallery
      if (typeof gallery === 'string') {
        try {
          gallery = JSON.parse(gallery)
        } catch {
          gallery = gallery.split('\n').map((s: string) => s.trim()).filter(Boolean)
        }
      }
      if (!Array.isArray(gallery)) {
        return NextResponse.json({ error: 'gallery must be an array' }, { status: 400 })
      }
      const urls = (gallery as unknown[])
        .filter((x): x is string => typeof x === 'string')
        .map((x) => x.trim())
        .filter(Boolean)
      const bad = urls.filter((u) => !isValidImageUrl(u))
      if (bad.length > 0) {
        return NextResponse.json(
          { error: 'gallery entries must be valid image URLs starting with http(s):// or /' },
          { status: 400 }
        )
      }
      updateData.gallery = JSON.stringify(urls)
    }

    for (const field of ['videoUrl', 'virtualTourUrl'] as const) {
      if (body[field] !== undefined) {
        const raw = body[field]
        if (raw === null || (typeof raw === 'string' && raw.trim() === '')) {
          updateData[field] = null
        } else if (typeof raw === 'string' && URL_LIKE.test(raw.trim())) {
          updateData[field] = raw.trim()
        } else {
          return NextResponse.json(
            { error: `${field} must be a valid URL starting with http(s):// or /` },
            { status: 400 }
          )
        }
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const existing = await db.project.findUnique({ where: { id: params.id } })
    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const changes: Record<string, unknown> = {}
    for (const key of Object.keys(updateData)) {
      const oldVal = (existing as Record<string, unknown>)[key]
      const newVal = updateData[key]
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes[key] = { from: oldVal, to: newVal }
      }
    }

    const project =
      Object.keys(changes).length > 0
        ? await db.project.update({ where: { id: params.id }, data: updateData })
        : existing

    if (Object.keys(changes).length > 0) {
      await logAudit({
        userId: gate.ctx.userId,
        action: 'PROJECT_MEDIA_UPDATED',
        entity: 'Project',
        entityId: params.id,
        changes: { fields: changes, approvalStatus: existing.approvalStatus },
      })
    }

    return NextResponse.json({ project })
  } catch (error) {
    console.error('Developer media update error:', error)
    return NextResponse.json({ error: 'Failed to update project media' }, { status: 500 })
  }
}
