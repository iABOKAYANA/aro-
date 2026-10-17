import { randomBytes } from 'node:crypto'
import { saveUpload } from '@/lib/blob-store'

// ────────────────────────────────────────────────────────────────
// Localize hot-linked media: download → shared blob-store (Blob URL when
// configured, else public/images/uploads) → store the resulting URL.
// Falls back to the original hotlink on ANY failure (never breaks an
// import / backfill row).
// Naming mirrors src/app/api/ceo/upload/route.ts:
// `<ts>-<rand>.<ext>` under the images/uploads prefix.
// ────────────────────────────────────────────────────────────────

const MAX_BYTES = 15 * 1024 * 1024 // 15MB
const TIMEOUT_MS = 15_000

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
  'image/svg+xml': '.svg',
  'application/pdf': '.pdf',
}

function sniffExt(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg'
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
  )
    return '.png'
  if (buf.length >= 6 && buf.toString('ascii', 0, 6).startsWith('GIF8')) return '.gif'
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP')
    return '.webp'
  if (buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-') return '.pdf'
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 4, 8) === 'ftyp' &&
    ['avif', 'avis'].includes(buf.toString('ascii', 8, 12).toLowerCase())
  )
    return '.avif'
  return null
}

function acceptableType(ct: string): boolean {
  return (
    ct.startsWith('image/') ||
    ct === 'application/pdf' ||
    ct === 'application/octet-stream' ||
    ct === 'binary/octet-stream' // e.g. S3 serves images this way; sniffed below
  )
}

function extFor(contentType: string, url: string): string | null {
  const hit = EXT_BY_TYPE[contentType]
  if (hit) return hit
  if (contentType.startsWith('image/')) {
    // unknown image/* subtype: reuse a sane extension from the URL, else .jpg
    try {
      const m = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase()
      if (m && ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'].includes(m)) {
        return m === 'jpeg' ? '.jpg' : `.${m}`
      }
    } catch {
      /* fall through */
    }
    return '.jpg'
  }
  return null
}

/** Download `url` into the shared blob-store; returns the stored URL
 *  (Blob https URL when configured, else the local `/images/uploads/<file>`
 *  path) or the ORIGINAL url on any failure. */
export async function localizeUrl(
  url: string | null | undefined,
  kind = 'media'
): Promise<string | null> {
  if (url == null) return null
  if (typeof url !== 'string') return url
  const src = url.trim()
  if (!src) return url
  if (!/^https?:\/\//i.test(src)) return url // already local / non-http

  try {
    const res = await fetch(src, {
      headers: { 'user-agent': UA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (!acceptableType(ct)) {
      throw new Error(`rejected content-type ${ct || '(none)'}`)
    }
    const lenHeader = res.headers.get('content-length')
    if (lenHeader && Number(lenHeader) > MAX_BYTES) throw new Error('file too large')
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length) throw new Error('empty body')
    if (buf.length > MAX_BYTES) throw new Error('file too large')
    const ext = sniffExt(buf) ?? extFor(ct, src)
    if (!ext) throw new Error(`unrecognized bytes for ${ct}`)

    const name = `${Date.now()}-${randomBytes(4).toString('hex')}${ext}`
    const { url: stored } = await saveUpload({
      buffer: buf,
      contentType: ct || 'application/octet-stream',
      ext,
      prefix: 'images/uploads',
      filename: name,
    })
    return stored
  } catch (err) {
    console.warn(`[localize-media] kept hotlink (${kind}): ${src} — ${err instanceof Error ? err.message : err}`)
    return url
  }
}

/** Concurrency-limited localize over many URLs (default 5). Order is
 *  preserved; each entry falls back to its hotlink on failure. */
export async function localizeMany(
  urls: (string | null | undefined)[],
  kind = 'media',
  limit = 5
): Promise<string[]> {
  const out: string[] = new Array(urls.length)
  let i = 0
  const n = Math.max(1, Math.min(limit, urls.length))
  const workers = Array.from({ length: n }, async () => {
    while (i < urls.length) {
      const k = i++
      try {
        const local = await localizeUrl(urls[k], kind)
        out[k] = local ?? urls[k] ?? ''
      } catch {
        out[k] = urls[k] ?? ''
      }
    }
  })
  await Promise.all(workers)
  return out
}
