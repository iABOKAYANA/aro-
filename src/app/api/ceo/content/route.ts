import { NextRequest, NextResponse } from 'next/server'
import { requireActor } from '@/lib/lead-access'
import { db } from '@/lib/db'
import {
  generateContent, saveDraft, listDrafts, approveDraft, rejectDraft,
  CONTENT_KINDS, type ContentKind,
} from '@/lib/content-gen'

export const dynamic = 'force-dynamic'

// ─── AI CONTENT STUDIO (Feature 5) ──────────────────────────
// CEO/ADMIN: any project, approve/publish.
// DEVELOPER: generate drafts for own projects only (publish stays CEO).

async function assertProjectAccess(ctx: { isCEO: boolean; developerId: string | null }, projectId: string): Promise<{ ok: boolean; project?: { id: string; name: string; developerId: string } }> {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, developerId: true } })
  if (!project) return { ok: false }
  if (ctx.isCEO) return { ok: true, project }
  if (ctx.developerId && ctx.developerId === project.developerId) return { ok: true, project }
  return { ok: false }
}

export async function GET(req: Request) {
  try {
    const gate = await requireActor(['DEVELOPER'])
    if (!gate.ok) return gate.response
    const ctx = gate.ctx

    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('projectId')

    if (projectId) {
      const access = await assertProjectAccess(ctx, projectId)
      if (!access.ok) return NextResponse.json({ error: 'Forbidden — not your project' }, { status: 403 })
    } else if (!ctx.isCEO) {
      // Non-CEO actors must scope drafts to a project they own (no cross-tenant leak)
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }
    const drafts = await listDrafts(projectId || undefined)
    return NextResponse.json({ drafts, kinds: CONTENT_KINDS })
  } catch (e) {
    console.error('Content drafts fetch error:', e)
    return NextResponse.json({ error: 'Failed to load drafts' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireActor(['DEVELOPER'])
    if (!gate.ok) return gate.response
    const ctx = gate.ctx

    const body = await req.json()
    const { projectId, kind, autoSave } = body
    if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    if (!CONTENT_KINDS.includes(kind)) {
      return NextResponse.json({ error: `kind must be one of: ${CONTENT_KINDS.join(', ')}` }, { status: 400 })
    }

    const access = await assertProjectAccess(ctx, projectId)
    if (!access.ok) return NextResponse.json({ error: 'Forbidden — not your project' }, { status: 403 })

    const generated = await generateContent(projectId, kind as ContentKind)
    if ('error' in generated) return NextResponse.json({ error: generated.error }, { status: 400 })

    // autoSave=true → store as a pending draft (default for CEO workflow)
    if (autoSave !== false) {
      const draft = await saveDraft({
        projectId,
        projectName: access.project!.name,
        kind: kind as ContentKind,
        content: generated.content,
        engine: generated.engine,
        factsText: generated.factsText,
        actorId: ctx.userId,
      })
      return NextResponse.json({ draft, engine: generated.engine, facts: generated.factsText })
    }
    return NextResponse.json({ content: generated.content, engine: generated.engine, facts: generated.factsText })
  } catch (e) {
    console.error('Content generate error:', e)
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  }
}

/** Approve/reject a draft. Publishing to the project is CEO/ADMIN only. */
export async function PATCH(req: NextRequest) {
  try {
    const gate = await requireActor(['DEVELOPER'])
    if (!gate.ok) return gate.response
    const ctx = gate.ctx

    const body = await req.json()
    const { approvalId, decision, publish, note } = body
    if (!approvalId || !decision) return NextResponse.json({ error: 'approvalId and decision (approve|reject) are required' }, { status: 400 })

    const draftRow = await db.approvalRequest.findUnique({ where: { id: approvalId } })
    if (!draftRow) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })

    // Developers may only act on drafts of their own projects — and never publish
    if (!ctx.isCEO) {
      if (!draftRow.entityId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      const access = await assertProjectAccess(ctx, draftRow.entityId)
      if (!access.ok) return NextResponse.json({ error: 'Forbidden — not your project' }, { status: 403 })
    }

    if (decision === 'approve') {
      const wantPublish = publish !== false
      if (wantPublish && !ctx.isCEO) {
        return NextResponse.json({ error: 'Only CEO/ADMIN can publish content' }, { status: 403 })
      }
      const result = await approveDraft({ approvalId, actorId: ctx.userId, publish: wantPublish && ctx.isCEO })
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
      return NextResponse.json({ success: true, publishedField: result.published })
    }
    if (decision === 'reject') {
      const result = await rejectDraft({ approvalId, actorId: ctx.userId, note })
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
      return NextResponse.json({ success: true })
    }
    return NextResponse.json({ error: 'decision must be approve or reject' }, { status: 400 })
  } catch (e) {
    console.error('Content decision error:', e)
    return NextResponse.json({ error: 'Decision failed' }, { status: 500 })
  }
}
