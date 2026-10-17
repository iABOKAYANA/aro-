import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { saveUpload } from '@/lib/blob-store'
import { requireCEOApi } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

const MAX_SIZE = 5 * 1024 * 1024 // 5MB

const ALLOWED: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
}

// CEO-only image upload: stores via the shared blob-store (Blob URL when
// BLOB_READ_WRITE_TOKEN is set, else public/images/uploads) and returns the URL.

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
    const { error } = await requireCEOApi()
    if (error) return error

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

    // Sniff the leading bytes: the allow-list above trusts the client-sent
    // MIME type, so a renamed script must not pass as an image.
    const ext = ALLOWED[file.type]
    const buffer = Buffer.from(await file.arrayBuffer())
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

    return NextResponse.json({ url })
  } catch (e) {
    console.error('Image upload error:', e)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
