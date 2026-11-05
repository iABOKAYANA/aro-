/**
 * Shared client-side image uploader (CEO ImageInput + developer portal).
 *
 * Fixes the #1 mobile failure: iPhone photos arrive as HEIC/HEIF, which the
 * server allow-list rejects (jpg/png/webp/gif/avif only). When the browser
 * can decode the file (iOS 17+ decodes HEIC natively), we re-encode it to
 * JPEG client-side and upload that. When it cannot, the owner gets a clear
 * Arabic message with the exact fix, instead of a dead "upload failed".
 *
 * Server limits stay strict: <= 5MB → route cap (aligned nginx 15m).
 */
export const IMAGE_UPLOAD_MAX_BYTES = 14 * 1024 * 1024 // below nginx client_max_body_size 15m

const SERVER_OK_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
])

/** Long-edge cap for re-encoded photos — keeps masterplans sharp, files sane. */
const REENCODE_MAX_EDGE = 2048

function heicish(file: File): boolean {
  const t = (file.type || '').toLowerCase()
  if (t === 'image/heic' || t === 'image/heif') return true
  // iOS sometimes reports an empty MIME for HEIC picks in older WebViews.
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  if (!t) return true // unknown/empty MIME: attempt decode rather than a guaranteed server rejection
  if (ext === 'heic' || ext === 'heif' || ext === 'hif') return true
  return false
}

/** Convert lossy input (HEIC, empty MIME) to a JPEG File via the canvas. */
async function reencodeToJpeg(file: File): Promise<File> {
  const bmp = await createImageBitmap(file)
  try {
    const scale = Math.min(1, REENCODE_MAX_EDGE / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bmp.width * scale))
    canvas.height = Math.max(1, Math.round(bmp.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas-2d-unavailable')
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.9),
    )
    if (!blob) throw new Error('toBlob-null')
    const base = file.name.replace(/\.[A-Za-z0-9]+$/, '') || 'photo'
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' })
  } finally {
    bmp.close()
  }
}

/**
 * Normalize any phone-picked image for the upload routes:
 * - sizes above the transport cap → clear Arabic error (never a silent fail)
 * - HEIC/HEIF or missing MIME → browser re-encode to JPEG, else exact fix steps.
 * Plain jpg/png/webp/gif/avif pass through untouched.
 */
export async function normalizeUploadFile(file: File): Promise<File> {
  if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
    throw new Error(
      'الصورة أكبر من 14MB — صغّرها من الموبايل أو ابعتها لنفسك واتساب كصورة واعملها تنزيل، وبعدها ارفعها.',
    )
  }
  const t = (file.type || '').toLowerCase()
  if (SERVER_OK_MIME.has(t)) return file
  // HEIC/HEIF or unknown MIME: try a client-side JPEG re-encode first.
  const candidate = heicish(file)
  try {
    return await reencodeToJpeg(file)
  } catch {
    if (candidate) {
      throw new Error(
        'صورة iPhone بصيغة HEIC — بعد الرفع مش هتظهر. حوّلها كده: الإعدادات › كاميرا › الصور › «أكثر توافقًا» (هتبقى JPEG)، أو ابعتها لنفسك واتساب كصورة ونزّلها من هناك وأعد الرفع.',
      )
    }
    throw new Error('الملف ده مش صورة مشهورة بالمتصفح — جرّب JPG أو PNG.')
  }
}
