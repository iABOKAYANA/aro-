import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { saveUpload } from '@/lib/blob-store'
import { requireActor } from '@/lib/lead-access'
import { logAudit } from '@/lib/permissions'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const MAX_SIZE = 5 * 1024 * 1024 // 5MB

const ALLOWED: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
}

// Developer image upload: same contract as POST /api/ceo/upload (multipart
// field literally named `file`, 5MB ceiling, same allow-list; storage is the
// shared blob-store — Blob URL when configured, else
// public/images/uploads, answered as `{ url }`).
// Gated DEVELOPER (CEO/ADMIN pass the role gate but hold no developer
// profile, so they keep their own door). Uploads are not project-scoped —
// any authed developer may upload; the gallery PATCH wires URLs to projects.

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
export async function POST(req: Request) {
  try {
    const gate = await requireActor(['DEVELOPER'])
    if (!gate.ok) return gate.response
    const { ctx } = gate

    if (!ctx.developerId) {
      return NextResponse.json(
        { error: 'No developer profile linked to this account' },
        { status: 403 }
      )
    }

    // Storage-fill throttle: uploads are 5MB each.
    const rl = rateLimit(`dev-upload:${ctx.userId}`, { limit: 30, windowMs: 60 * 60_000 })
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many uploads. Please wait a moment and try again.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))),
          },
        }
      )
    }

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (!ALLOWED[file.type]) {
      return NextResponse.json(
        { error: 'Only image files are allowed (jpg, png, webp, gif, avif)' },
        { status: 400 }
      )
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Image is too large (max 5MB)' }, { status: 400 })
    }

    const ext = ALLOWED[file.type]
    const buffer = Buffer.from(await file.arrayBuffer())
    // Sniff the leading bytes: the allow-list trusts the client-sent MIME
    // type, so a renamed script must not pass as an image.
    if (!looksLikeImage(buffer, ext)) {
      return NextResponse.json(
        { error: 'File content does not match its image type' },
        { status: 415 }
      )
    }

    const name = `${Date.now()}-${randomBytes(4).toString('hex')}${ext}`
    const { url } = await saveUpload({
      buffer,
      contentType: file.type,
      ext,
      prefix: 'images/uploads',
      filename: name,
    })
    await logAudit({
      userId: ctx.userId,
      action: 'IMAGE_UPLOADED',
      entity: 'Image',
      entityId: url,
      changes: { developerId: ctx.developerId, size: file.size, type: file.type },
    })

    return NextResponse.json({ url })
  } catch (e) {
    console.error('Developer image upload error:', e)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
