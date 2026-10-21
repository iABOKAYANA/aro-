import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { put } from '@vercel/blob'

// ────────────────────────────────────────────────────────────────
// Shared upload sink: Vercel Blob when configured, local disk otherwise.
//
// Serverless deployments (public + console) each have their OWN ephemeral
// filesystem, so a file written to `public/...` on one deployment is
// invisible on the other and vanishes on redeploy. When
// `BLOB_READ_WRITE_TOKEN` is set, uploads go to the shared Blob store
// (public access → absolute https URL); otherwise we write to the local
// `public/<prefix>/` dir EXACTLY as before (same paths, same URLs), so
// dev/localhost behavior is identical with no token configured.
//
// Contract: saveUpload({ buffer, contentType, ext, prefix, filename? })
//   → { url }. `prefix` doubles as the Blob pathname dir AND the local
//   public dir (e.g. 'images/uploads' → `public/images/uploads/` +
//   `/images/uploads/<file>`). `filename` keeps each caller's naming
//   scheme; when omitted we mint `<ts>-<rand><ext>` like the upload routes.
// ────────────────────────────────────────────────────────────────

export type SaveUploadInput = {
  buffer: Buffer
  /** MIME type stored alongside the object (Blob) — informational locally. */
  contentType: string
  /** Extension incl. dot (e.g. '.jpg') — used for generated names only. */
  ext: string
  /** Storage dir, e.g. 'images/uploads' | 'images/whatsapp' |
   *  'audio/voice-notes' | 'uploads/resumes'. */
  prefix: string
  /** Full filename incl. ext. Defaults to `<ts>-<rand><ext>`. */
  filename?: string
}

export function blobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN
}

// ────────────────────────────────────────────────────────────────
// Upload-time image cap: downscale photos to max 1920px longest edge
// BEFORE writing (Blob branch and local branch alike — both flow through
// saveUpload, so one gate covers every uploader: CEO/developer/WhatsApp,
// localize-media; audio + PDF resumes are never images and pass through).
//
// Rules (same-format re-encode, extension + contentType preserved):
//   JPEG → JPEG quality 80 (+ auto-rotate, metadata stripped)
//   PNG  → PNG compression 9 (alpha preserved — graphics stay PNG)
//   WebP → WebP quality 80 · AVIF → AVIF quality 60
//   GIF/SVG/animated (pages>1)/non-images → untouched (never touch PDF etc.)
// Only images whose longest edge EXCEEDS the cap are rewritten; anything
// already ≤ cap passes through byte-identical. Sharp loads lazily and ANY
// failure falls back to the original buffer (uploads never break).
// ────────────────────────────────────────────────────────────────

const MAX_IMAGE_EDGE = 1920

const CAPPABLE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif'])

let sharpMod: SharpFactory | null | undefined

type SharpMeta = {
  width?: number
  height?: number
  format?: string
  pages?: number
  hasAlpha?: boolean
}

type SharpInstance = {
  metadata(): Promise<SharpMeta>
  rotate(): SharpInstance
  resize(opts: Record<string, unknown>): SharpInstance
  png(opts?: Record<string, unknown>): SharpInstance
  webp(opts?: Record<string, unknown>): SharpInstance
  avif(opts?: Record<string, unknown>): SharpInstance
  jpeg(opts?: Record<string, unknown>): SharpInstance
  toBuffer(): Promise<Buffer>
}

type SharpFactory = (input: Buffer) => SharpInstance

async function loadSharp(): Promise<SharpFactory | null> {
  if (sharpMod !== undefined) return sharpMod
  try {
    const mod = (await import('sharp')) as unknown as { default: SharpFactory }
    sharpMod = typeof mod.default === 'function' ? mod.default : null
  } catch {
    sharpMod = null
  }
  return sharpMod
}

export async function maybeCapImage(
  buffer: Buffer,
  contentType: string,
  ext: string
): Promise<Buffer> {
  if (!contentType.toLowerCase().startsWith('image/')) return buffer
  if (!CAPPABLE_EXTS.has(ext.toLowerCase())) return buffer
  const sharp = await loadSharp()
  if (!sharp) return buffer
  try {
    const meta = await sharp(buffer).metadata()
    const w = meta.width ?? 0
    const h = meta.height ?? 0
    if (w <= 0 || h <= 0) return buffer
    if (Math.max(w, h) <= MAX_IMAGE_EDGE) return buffer
    if ((meta.pages ?? 1) > 1) return buffer // animated — never flatten
    const format = (meta.format || '').toLowerCase()
    if (format === 'gif' || format === 'svg') return buffer
    let pipeline = sharp(buffer).rotate() // EXIF-orient before strip
    pipeline = pipeline.resize({
      width: MAX_IMAGE_EDGE,
      height: MAX_IMAGE_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    if (format === 'png') {
      pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: true })
    } else if (format === 'webp') {
      pipeline = pipeline.webp({ quality: 80 })
    } else if (format === 'avif' || format === 'heif') {
      pipeline = pipeline.avif({ quality: 60 })
    } else {
      pipeline = pipeline.jpeg({ quality: 80 })
    }
    const out = await pipeline.toBuffer()
    return out.length > 0 ? Buffer.from(out) : buffer
  } catch {
    return buffer
  }
}

export async function saveUpload(input: SaveUploadInput): Promise<{ url: string }> {
  const { buffer, contentType, ext, prefix } = input
  const cleanPrefix = prefix.replace(/^\/+|\/+$/g, '')

  // WebP conversion: photographic JPEGs and alpha-free PNGs re-encode to WebP
  // q82 — 40-60% smaller on the wire. Cap (1920px) still applies first.
  const capped = await maybeCapImage(buffer, contentType, ext)
  const converted = await maybeConvertWebp(capped, contentType, ext)
  const finalBuffer = converted?.buffer ?? capped
  const finalExt = converted?.ext ?? ext
  const finalType = converted?.contentType ?? contentType
  const filename = (input.filename ?? `${Date.now()}-${randomBytes(4).toString('hex')}`)
    .replace(/\.[a-z0-9]+$/i, '') + finalExt

  if (blobConfigured()) {
    const blob = await put(`${cleanPrefix}/${filename}`, finalBuffer, {
      access: 'public',
      contentType: finalType,
    })
    return { url: blob.url }
  }

  const dir = path.join(process.cwd(), 'public', cleanPrefix)
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, filename), finalBuffer)
  return { url: `/${cleanPrefix}/${filename}` }
}

/** Photographic formats → WebP. Skips: alpha PNGs, GIF/SVG, names from callers. */
async function maybeConvertWebp(
  buffer: Buffer,
  contentType: string,
  ext: string
): Promise<{ buffer: Buffer; contentType: string; ext: string } | null> {
  if (!contentType.toLowerCase().startsWith('image/')) return null
  const lowerExt = ext.toLowerCase()
  if (lowerExt !== '.jpg' && lowerExt !== '.jpeg' && lowerExt !== '.png') return null
  const sharp = await loadSharp()
  if (!sharp) return null
  try {
    const meta = await sharp(buffer).metadata()
    if ((meta.pages ?? 1) > 1) return null // animated — never flatten
    const format = (meta.format || '').toLowerCase()
    if (format === 'webp' || format === 'avif' || format === 'gif' || format === 'svg') return null
    if (format === 'png' && meta.hasAlpha) return null // graphics with transparency stay PNG
    const out = await sharp(buffer).rotate().webp({ quality: 82 }).toBuffer()
    if (!out.length || out.length >= buffer.length) return null // never enlarge
    return { buffer: Buffer.from(out), contentType: 'image/webp', ext: '.webp' }
  } catch {
    return null
  }
}
