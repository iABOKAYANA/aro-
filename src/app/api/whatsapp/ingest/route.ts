import { NextResponse } from 'next/server'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { saveUpload } from '@/lib/blob-store'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/permissions'
import { extractListingFacts, matchProjectName } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'

// Env var: WHATSAPP_INGEST_SECRET — shared secret between the WhatsApp bridge
// and this endpoint. The bridge sends it as the `x-ingest-secret` header;
// requests without an exact match get 401. Set it in `.env`:
//   WHATSAPP_INGEST_SECRET=<long-random-string>
// If the var is not configured, ingestion is refused with 500 (fail closed).

const MAX_SIZE = 5 * 1024 * 1024 // 5MB — same ceiling as the upload routes
const MAX_FILES = 10

const ALLOWED: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
}

/** Magic-byte check so a renamed script can't pass as an image. */
function looksLikeImage(buf: Buffer, ext: string): boolean {
  if (buf.length < 12) return false
  if (ext === '.jpg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
  if (ext === '.png')
    return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
  if (ext === '.gif') return buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 // GIF
  if (ext === '.webp')
    return (
      buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP'
    )
  if (ext === '.avif') return buf.toString('ascii', 4, 8) === 'ftyp' // ISO-BMFF
  return false
}

function secretsEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ab.length !== bb.length) return false
  try {
    return timingSafeEqual(ab, bb)
  } catch {
    return false
  }
}

/**
 * POST /api/whatsapp/ingest — secret-gated WhatsApp group intake.
 *
 * Headers: `x-ingest-secret` must equal `WHATSAPP_INGEST_SECRET` (else 401).
 * Multipart form: `payload` JSON string
 * `{ groupJid, groupName?, senderName?, senderPhone?, messageIds[], text }`
 * plus `media0..media9` image files (≤5MB each, max 10 → else 400).
 *
 * Flow: save media via the shared blob-store (Blob URL when configured,
 * else public/images/whatsapp/) → Ollama structured extraction
 * `{name?, nameArabic?, city?, price?, area?, downPayment?, years?,
 * location?, description?, amenities?[]}` (RAW text always kept; LLM failure
 * → extracted=null) → fuzzy name match vs existing projects →
 * StagingItem NEW. → 201 { item }
 */
export async function POST(req: Request) {
  try {
    const secret = process.env.WHATSAPP_INGEST_SECRET
    if (!secret) {
      return NextResponse.json({ error: 'Ingest is not configured' }, { status: 500 })
    }
    const provided = req.headers.get('x-ingest-secret')
    if (!provided || !secretsEqual(provided, secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const form = await req.formData()
    const payloadRaw = form.get('payload')
    if (typeof payloadRaw !== 'string') {
      return NextResponse.json({ error: 'payload must be a JSON string' }, { status: 400 })
    }
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(payloadRaw) as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: 'payload must be valid JSON' }, { status: 400 })
    }

    const { groupJid, groupName, senderName, senderPhone, messageIds, text } = payload as {
      groupJid?: unknown
      groupName?: unknown
      senderName?: unknown
      senderPhone?: unknown
      messageIds?: unknown
      text?: unknown
    }

    if (typeof groupJid !== 'string' || !groupJid.trim()) {
      return NextResponse.json({ error: 'payload.groupJid is required' }, { status: 400 })
    }
    if (groupJid.trim().length > 200) {
      return NextResponse.json({ error: 'payload.groupJid is too long' }, { status: 400 })
    }
    if (!Array.isArray(messageIds)) {
      return NextResponse.json({ error: 'payload.messageIds must be an array' }, { status: 400 })
    }
    if (messageIds.length > 100) {
      return NextResponse.json({ error: 'payload.messageIds is too long' }, { status: 400 })
    }
    const rawText = typeof text === 'string' ? text.slice(0, 20_000) : ''

    // Collect media0..n image files (cap 10).
    const media: File[] = []
    for (let i = 0; ; i++) {
      const f = form.get(`media${i}`)
      if (f === null) break
      if (!(f instanceof File)) {
        return NextResponse.json({ error: `media${i} must be a file` }, { status: 400 })
      }
      // Skip empty slots (some bridges send blank fields); stop at first gap.
      if (f.size === 0 && !f.type) break
      media.push(f)
      if (media.length > MAX_FILES) {
        return NextResponse.json({ error: `Too many media files (max ${MAX_FILES})` }, { status: 400 })
      }
    }

    if (!rawText.trim() && media.length === 0) {
      return NextResponse.json({ error: 'Either text or at least one media file is required' }, { status: 400 })
    }

    for (const f of media) {
      if (!ALLOWED[f.type]) {
        return NextResponse.json(
          { error: 'Only image files are allowed (jpg, png, webp, gif, avif)' },
          { status: 400 }
        )
      }
      if (f.size > MAX_SIZE) {
        return NextResponse.json({ error: 'Image is too large (max 5MB)' }, { status: 400 })
      }
    }

    const mediaUrls: string[] = []
    if (media.length > 0) {
      for (const f of media) {
        const ext = ALLOWED[f.type]
        const buffer = Buffer.from(await f.arrayBuffer())
        // The bridge holds the secret, but a compromised bridge must still
        // not be able to land a script into the public image folder.
        if (!looksLikeImage(buffer, ext)) {
          return NextResponse.json(
            { error: 'File content does not match its image type' },
            { status: 415 }
          )
        }
        const name = `${Date.now()}-${randomBytes(4).toString('hex')}${ext}`
        const { url } = await saveUpload({
          buffer,
          contentType: f.type,
          ext,
          prefix: 'images/whatsapp',
          filename: name,
        })
        mediaUrls.push(url)
      }
    }

    const { extracted, engine } = await extractListingFacts(rawText)

    let suggestedProjectId: string | null = null
    let matchScore: number | null = null
    if (extracted?.name) {
      const projects = await db.project.findMany({
        select: { id: true, name: true, nameArabic: true },
        take: 2000,
      })
      const match = matchProjectName(extracted.name, projects)
      suggestedProjectId = match.suggestedProjectId
      matchScore = match.matchScore
    }

    const item = await db.stagingItem.create({
      data: {
        source: 'WHATSAPP',
        groupJid: groupJid.trim().slice(0, 200),
        groupName: typeof groupName === 'string' && groupName.trim() ? groupName.trim().slice(0, 200) : null,
        senderName: typeof senderName === 'string' && senderName.trim() ? senderName.trim().slice(0, 200) : null,
        senderPhone: typeof senderPhone === 'string' && senderPhone.trim() ? senderPhone.trim().slice(0, 40) : null,
        messageIds: JSON.stringify(messageIds),
        payload: JSON.stringify({
          raw: rawText,
          extracted,
          extractionEngine: engine,
          mediaUrls,
          suggestedProjectId,
          matchScore,
          receivedAt: new Date().toISOString(),
        }),
        status: 'NEW',
      },
    })

    await logAudit({
      action: 'WHATSAPP_INGESTED',
      entity: 'StagingItem',
      entityId: item.id,
      changes: {
        groupJid: item.groupJid,
        groupName: item.groupName,
        senderPhone: item.senderPhone,
        engine,
        hasExtracted: !!extracted,
        suggestedProjectId,
        matchScore,
        mediaCount: mediaUrls.length,
      },
    })

    return NextResponse.json({ item }, { status: 201 })
  } catch (e) {
    console.error('WhatsApp ingest error:', e)
    return NextResponse.json({ error: 'Ingest failed' }, { status: 500 })
  }
}
