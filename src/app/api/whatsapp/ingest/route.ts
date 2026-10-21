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

const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB per image (bridge caps at 16MB)
const MAX_DOC_SIZE = 16 * 1024 * 1024 // 16MB per document (xlsx/pdf)
const MAX_FILES = 10

const ALLOWED: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
}

/** Office/document attachments the owner sends from developers' groups. */
const DOC_EXTENSIONS: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-excel': '.xls',
  'text/csv': '.csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/msword': '.doc',
  'text/vcard': '.vcf',
  'text/x-vcard': '.vcf',
}

/** Extension fallback when the mime is missing/generic (bridge tells us the ext). */
function extForFile(f: File, declared: { ext?: string; name?: string }): string | null {
  const byMime = ALLOWED[f.type] || DOC_EXTENSIONS[f.type]
  if (byMime) return byMime
  const name = (declared.name || f.name || '').toLowerCase()
  const dot = name.lastIndexOf('.')
  if (dot !== -1) {
    const ext = `.${name.slice(dot + 1).slice(0, 10)}`
      .replace(/[^.a-z0-9]/g, '')
    if (/^\.(xlsx|xls|csv|pdf|docx|doc|vcf)$/.test(ext)) return ext
  }
  if (declared.ext && /^\.[a-z0-9]{2,5}$/.test(declared.ext)) return declared.ext
  return null
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

/** Magic bytes for documents: %PDF- (pdf), PK‥ (zip→xlsx/docx), CDF (doc). */
function looksLikeDocument(buf: Buffer, ext: string): boolean {
  if (ext === '.pdf') return buf.length > 5 && buf.toString('ascii', 0, 5) === '%PDF-'
  if (ext === '.xlsx' || ext === '.docx' || ext === '.xls') {
    // xlsx/docx are zip (PK\x03\x04); legacy xls uses the OLE CFB header.
    return (
      (buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) ||
      (buf.length > 8 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0)
    )
  }
  return true // csv/vcf are plain text — accept
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

    const { groupJid, groupName, senderName, senderPhone, messageIds, text, mediaMeta, source: payloadSource } = payload as {
      groupJid?: unknown
      groupName?: unknown
      senderName?: unknown
      senderPhone?: unknown
      messageIds?: unknown
      text?: unknown
      mediaMeta?: unknown
      source?: unknown
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

    // Collect media0..n files (cap 10). Kind-aware caps: images ≤10MB,
    // documents ≤16MB. The bridge's mediaMeta (media0 → meta) tells us the
    // declared kind/extension when the mime is missing or generic.
    const metaList: Array<{ kind?: string; ext?: string; name?: string; mime?: string }> =
      Array.isArray(mediaMeta)
        ? mediaMeta.filter(
            (m): m is { kind?: string; ext?: string; name?: string; mime?: string } =>
              !!m && typeof m === 'object'
          )
        : []
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

    const mediaKinds: Array<'image' | 'document'> = []
    const mediaUrls: Array<{ url: string; originalName?: string; mime: string }> = []
    for (let idx = 0; idx < media.length; idx++) {
      const f = media[idx]
        const meta = metaList[idx] || {}
        const isImage = ALLOWED[f.type] !== undefined || (meta.kind || '').toLowerCase() === 'image'
        const ext = extForFile(f, meta)
        if (!ext) {
          return NextResponse.json(
            { error: `Unsupported media type "${f.type || 'unknown'}" for ${meta.name || f.name || 'file'}` },
            { status: 400 }
          )
        }
        const cap = isImage ? MAX_IMAGE_SIZE : MAX_DOC_SIZE
        if (f.size > cap) {
          return NextResponse.json(
            { error: `${isImage ? 'Image' : 'Document'} is too large (max ${Math.round(cap / 1024 / 1024)}MB)` },
            { status: 400 }
          )
        }
        const buffer = Buffer.from(await f.arrayBuffer())
        // The bridge holds the secret, but a compromised bridge must still
        // not be able to land a script into the public folders.
        if (isImage) {
          if (!looksLikeImage(buffer, ext)) {
            return NextResponse.json(
              { error: 'File content does not match its image type' },
              { status: 415 }
            )
          }
        } else if (!looksLikeDocument(buffer, ext)) {
          return NextResponse.json(
            { error: 'File content does not match its document type' },
            { status: 415 }
          )
        }
        // Keep a readable original name for documents so the CEO recognizes
        // the developer sheet in the inbox; strip path traversal + control chars.
        const originalName = isImage
          ? undefined
          : (meta.name || f.name || '')
              .replace(/[/\\?%*:|"<>\x00-\x1f]/g, '')
              .slice(0, 120) || undefined
        const name = `${Date.now()}-${randomBytes(4).toString('hex')}${ext}`
        const { url } = await saveUpload({
          buffer,
          contentType: f.type || (isImage ? 'image/jpeg' : 'application/octet-stream'),
          ext,
          prefix: isImage ? 'images/whatsapp' : 'files/whatsapp',
          filename: name,
        })
        mediaUrls.push({ url, originalName, mime: f.type || 'application/octet-stream' })
        mediaKinds.push(isImage ? 'image' : 'document')
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
          mediaUrls: mediaUrls.map((m) => m.url),
          mediaFiles: mediaUrls.map((m, i) => ({ ...m, kind: mediaKinds[i] })),
          source: typeof payloadSource === 'string' ? payloadSource : 'WHATSAPP_GROUP',
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
