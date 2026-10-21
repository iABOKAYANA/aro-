import { NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const dynamic = 'force-dynamic'

/**
 * GET /api/files/whatsapp/<filename>
 * GET /api/files/images/<filename>
 *
 * Runtime-saved uploads (WhatsApp ingest, etc.) land under `public/<prefix>`
 * AFTER the server booted, and Next only serves `public/` from startup — so
 * without this route every freshly-ingested attachment 404s until the next
 * pm2 restart. Same trust boundary as the ingest route: allowlisted prefix,
 * strict filename charset, no directory traversal, no redirects.
 */
const MOUNTS: Record<string, string> = {
  // URL mount → disk prefix (under public/)
  whatsapp: 'files/whatsapp',
  images: 'images/whatsapp',
}

const CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.csv': 'text/csv',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.vcf': 'text/vcard',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
}

export async function GET(
  _req: Request,
  { params }: { params: { path: string[] } }
) {
  const segments = Array.isArray(params?.path) ? params.path : []
  const [mount, filename] = segments
  const diskPrefix = mount ? MOUNTS[mount] : undefined

  if (!diskPrefix || segments.length !== 2 || !filename) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (!/^[A-Za-z0-9._-]{1,160}$/.test(filename) || filename.includes('..')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const base = path.join(process.cwd(), 'public', diskPrefix)
  const abs = path.join(base, filename)
  if (!abs.startsWith(base + path.sep)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const buf = await readFile(abs)
    const ext = path.extname(filename).toLowerCase()
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'private, max-age=86400',
        'Content-Disposition': `inline; filename="${filename}"`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
