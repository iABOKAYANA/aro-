import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import path from 'node:path'
import { saveUpload } from '@/lib/blob-store'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/permissions'
import { requireActor, leadAccessLevel } from '@/lib/lead-access'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// Contract — POST /api/voice-notes (multipart):
//   fields: `leadId` (string), `audio` (File: m4a/mp3/webm), `durationSec`? (int seconds)
//   auth: BROKER | CEO | ADMIN (mirrors POST /api/leads role gate); the lead must
//   additionally be visible to the caller via leadAccessLevel (broker ⇒ own lead).
//   caps: 10MB, duration ≤ 180s (UI auto-stops at 120s). Storage: the shared
//   blob-store (Blob URL when configured, else public/audio/voice-notes/<name>),
//   answered as `{ voiceNote: { id, leadId, audioUrl, durationSec, createdById, createdAt } }`.
// GET /api/voice-notes?leadId= — any lead-API role (BROKER/DEVELOPER/CEO/ADMIN),
//   scoped through the same leadAccessLevel check as GET /api/leads/[id]
//   (broker sees own, developer masked, CEO all). Answers `{ voiceNotes: [...] }`
//   newest-first with `createdBy: { id, name }` so clients can mirror delete gating.
// DELETE /api/voice-notes?id= — creator or CEO/ADMIN only (server-enforced);
//   removes the DB row and its audio file. Answers `{ success: true }`.
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

// Hard ceiling; the UIs auto-stop at 120s and the extra headroom only absorbs
// stop-latency so a 2-minute memo is never rejected for overshooting by a second.
const MAX_DURATION_SEC = 180

const ALLOWED_MIME: Record<string, string> = {
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/m4a': '.m4a',
  'audio/aac': '.m4a',
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/webm': '.webm',
}

const ALLOWED_EXT = new Set(['m4a', 'mp3', 'webm'])

function extensionOf(name: string): string | null {
  const base = name.split('/').pop() ?? ''
  const dot = base.lastIndexOf('.')
  if (dot < 0) return null
  const ext = base.slice(dot + 1).toLowerCase()
  return ext || null
}

/**
 * Magic-byte check so a renamed script can't pass as a voice memo.
 * Mirrors the resume magic idiom in src/lib/uploads.ts: the allow-list
 * above trusts the client-sent MIME type (or bare filename extension),
 * so content is sniffed before anything is stored. Fail closed.
 */
function looksLikeAudio(buf: Buffer, ext: string): boolean {
  if (buf.length < 12) return false
  if (ext === '.mp3') {
    // ID3v2 tag, or an MPEG frame-sync header (0xFF + top 3 bits set).
    if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true // ID3
    return buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0
  }
  if (ext === '.m4a') {
    // MP4/M4A/AAC-in-MP4: ISO-BMFF box — 'ftyp' at offset 4.
    return buf.toString('ascii', 4, 8) === 'ftyp'
  }
  if (ext === '.webm') {
    // EBML header 0x1A45DFA3 (WebM/Matroska container).
    return buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3
  }
  return false
}

async function leadForAccess(id: string) {
  return db.lead.findUnique({
    where: { id },
    select: {
      id: true,
      brokerId: true,
      developerId: true,
      project: { select: { developerId: true } },
    },
  })
}

// ─── GET /api/voice-notes?leadId= — scoped list ─────────
export async function GET(req: Request) {
  try {
    const actor = await requireActor(['BROKER', 'DEVELOPER', 'CEO', 'ADMIN'])
    if (!actor.ok) return actor.response
    const { ctx } = actor

    const leadId = new URL(req.url).searchParams.get('leadId')
    if (!leadId) return NextResponse.json({ error: 'leadId is required' }, { status: 400 })

    const lead = await leadForAccess(leadId)
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    const level = leadAccessLevel(ctx, {
      brokerId: lead.brokerId,
      developerId: lead.developerId,
      projectDeveloperId: lead.project?.developerId ?? null,
    })
    if (level === 'none') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const voiceNotes = await db.voiceNote.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { id: true, name: true } } },
    })
    return NextResponse.json({ voiceNotes })
  } catch (e) {
    console.error('Voice notes fetch error:', e)
    return NextResponse.json({ error: 'Failed to fetch voice notes' }, { status: 500 })
  }
}

// ─── POST /api/voice-notes — record (multipart upload) ──
export async function POST(req: Request) {
  try {
    const actor = await requireActor(['BROKER', 'CEO', 'ADMIN'])
    if (!actor.ok) return actor.response
    const { ctx } = actor

    // 10MB files — throttle per user so audio storage cannot be filled by loop.
    const rl = rateLimit(`voice-note:${ctx.userId}`, { limit: 30, windowMs: 60 * 60_000 })
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many voice notes. Please wait a moment and try again.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))),
          },
        }
      )
    }

    const form = await req.formData()
    const leadId = form.get('leadId')
    const file = form.get('audio')

    if (typeof leadId !== 'string' || !leadId) {
      return NextResponse.json({ error: 'leadId is required' }, { status: 400 })
    }
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: 'No audio provided' }, { status: 400 })
    }

    const lead = await leadForAccess(leadId)
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    const level = leadAccessLevel(ctx, {
      brokerId: lead.brokerId,
      developerId: lead.developerId,
      projectDeveloperId: lead.project?.developerId ?? null,
    })
    if (level === 'none') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // MIME wins; fall back to the filename extension because some mobile
    // uploads arrive with a generic type but a real `.m4a` name.
    let ext = ALLOWED_MIME[file.type]
    if (!ext) {
      const raw = extensionOf((file as File).name || '')
      if (!raw || !ALLOWED_EXT.has(raw)) {
        return NextResponse.json({ error: 'Only voice memos are allowed (m4a, mp3, webm)' }, { status: 400 })
      }
      ext = `.${raw}`
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Voice note is too large (max 10MB)' }, { status: 400 })
    }

    let durationSec: number | null = null
    const rawDuration = form.get('durationSec')
    if (typeof rawDuration === 'string' && rawDuration.trim()) {
      const parsed = Math.round(Number(rawDuration))
      if (!Number.isFinite(parsed) || parsed < 0) {
        return NextResponse.json({ error: 'Invalid duration' }, { status: 400 })
      }
      if (parsed > MAX_DURATION_SEC) {
        return NextResponse.json({ error: 'Voice note is too long (max 2 minutes)' }, { status: 400 })
      }
      durationSec = parsed
    }

    const name = `${Date.now()}-${randomBytes(4).toString('hex')}${ext}`
    // Some mobile uploads arrive with an empty MIME — fall back by extension
    // so the Blob object still gets a playable content type.
    const contentType =
      file.type || ({ '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.webm': 'audio/webm' } as Record<string, string>)[ext] || 'application/octet-stream'
    // Sniff the leading bytes BEFORE storing: the MIME/extension allow-list
    // above trusts client-supplied values, so a renamed script fails closed.
    const audioBuffer = Buffer.from(await file.arrayBuffer())
    if (!looksLikeAudio(audioBuffer, ext)) {
      return NextResponse.json({ error: 'File content does not match its audio type' }, { status: 400 })
    }
    const { url: audioUrl } = await saveUpload({
      buffer: audioBuffer,
      contentType,
      ext,
      prefix: 'audio/voice-notes',
      filename: name,
    })

    const voiceNote = await db.voiceNote.create({
      data: { leadId, audioUrl, durationSec, createdById: ctx.userId },
    })
    await logAudit({
      userId: ctx.userId,
      action: 'VOICE_NOTE_CREATED',
      entity: 'VoiceNote',
      entityId: voiceNote.id,
      changes: { leadId },
    })

    return NextResponse.json({ voiceNote }, { status: 201 })
  } catch (e) {
    console.error('Voice note upload error:', e)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}

// ─── DELETE /api/voice-notes?id= — creator or CEO/ADMIN ─
export async function DELETE(req: Request) {
  try {
    const actor = await requireActor(['BROKER', 'DEVELOPER', 'CEO', 'ADMIN'])
    if (!actor.ok) return actor.response
    const { ctx } = actor

    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const note = await db.voiceNote.findUnique({
      where: { id },
      include: { lead: { select: { brokerId: true, developerId: true, project: { select: { developerId: true } } } } },
    })
    if (!note) return NextResponse.json({ error: 'Voice note not found' }, { status: 404 })

    const level = leadAccessLevel(ctx, {
      brokerId: note.lead.brokerId,
      developerId: note.lead.developerId,
      projectDeveloperId: note.lead.project?.developerId ?? null,
    })
    if (level === 'none') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (note.createdById !== ctx.userId && !ctx.isCEO) {
      return NextResponse.json({ error: 'Only the creator or an administrator can delete this' }, { status: 403 })
    }

    await db.voiceNote.delete({ where: { id } })
    // Local files are removed; Blob URLs (absolute https) are left in place —
    // Blob deletion is out of scope (no del), so they orphan harmlessly.
    if (note.audioUrl.startsWith('/audio/voice-notes/')) {
      const file = path.join(process.cwd(), 'public', note.audioUrl.replace(/^\//, ''))
      await unlink(file).catch(() => {})
    }
    await logAudit({
      userId: ctx.userId,
      action: 'VOICE_NOTE_DELETED',
      entity: 'VoiceNote',
      entityId: id,
      changes: { leadId: note.leadId },
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Voice note delete error:', e)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
