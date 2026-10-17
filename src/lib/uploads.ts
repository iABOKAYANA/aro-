import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { saveUpload as saveToStore } from '@/lib/blob-store'

export type UploadedFile = {
  /** Local `/uploads/resumes/<file>` path, or the absolute Blob https URL
   *  when `BLOB_READ_WRITE_TOKEN` is set. */
  url: string
  filename: string
  size: number
  mime: string
}

export type UploadKind = 'resume'

const RULES: Record<UploadKind, { exts: string[]; mimes: string[]; maxBytes: number }> = {
  resume: {
    exts: ['.pdf', '.doc', '.docx'],
    mimes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    maxBytes: 5 * 1024 * 1024, // 5 MB
  },
}

const DIRS: Record<UploadKind, string> = {
  resume: 'resumes',
}

export class UploadError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

function safeExt(filename: string): string {
  return path.extname(filename || '').toLowerCase()
}

/**
 * Validate + persist an uploaded file (shared blob-store: Blob URL when
 * configured, else under `public/uploads/<kind>/`).
 *
 * The filename is replaced by a random id — never trust a client-supplied name
 * for the on-disk path (path traversal / overwrite / collisions).
 */
export async function saveUpload(file: File, kind: UploadKind): Promise<UploadedFile> {
  const rule = RULES[kind]
  if (!file || typeof file === 'string' || file.size === undefined) {
    throw new UploadError('No file received.', 400)
  }

  if (file.size === 0) throw new UploadError('The file is empty.', 400)
  if (file.size > rule.maxBytes) {
    const mb = Math.round(rule.maxBytes / 1024 / 1024)
    throw new UploadError(`File is too large — maximum ${mb} MB.`, 413)
  }

  const ext = safeExt(file.name)
  if (!rule.exts.includes(ext)) {
    throw new UploadError(`Unsupported file type. Allowed: ${rule.exts.join(', ')}.`, 415)
  }

  // Sniff the leading bytes: a renamed .exe must not pass as a PDF.
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer())
  const magic = Array.from(head.slice(0, 4))
    .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  const isPdf = magic.startsWith('25504446') // %PDF
  const isZip = magic.startsWith('504b0304') // .docx (OOXML = zip)
  const isOle = magic.startsWith('d0cf11e0') // .doc (CFB)
  if (kind === 'resume' && !isPdf && !isZip && !isOle) {
    throw new UploadError('File content does not match its extension.', 415)
  }

  const filename = `${randomUUID()}${ext}`
  const { url } = await saveToStore({
    buffer: Buffer.from(await file.arrayBuffer()),
    contentType: file.type || 'application/octet-stream',
    ext,
    prefix: `uploads/${DIRS[kind]}`,
    filename,
  })

  return {
    url,
    filename: file.name,
    size: file.size,
    mime: file.type || 'application/octet-stream',
  }
}
