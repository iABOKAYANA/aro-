import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomBytes } from 'node:crypto'

/**
 * Gated 3D file storage — deliberately NOT the shared blob-store:
 * uploaded GLB/GLTF architectures are private assets until the CEO master
 * switch goes ON, and public-access blob storage cannot be gated by auth or
 * settings afterwards. Models live under `data/models3d/` (outside public/)
 * and are ONLY streamed through the gated routes:
 *   • /api/3d/file/<id>        — public, only when publish ON + row PUBLISHED
 *   • /api/ceo/models3d/<id>/file — CEO, works while still DRAFT
 *
 * Single-VPS filesystem storage matches the current deploy shape (SQLite +
 * pm2 single host); keys never leave the server so unknowable URLs help
 * nothing on their own.
 */

const ROOT = path.join(process.cwd(), 'data', 'models3d')
export const MODEL3D_MAX_BYTES = 80 * 1024 * 1024 // 80MB

export function model3dExtensionAllowed(filename: string): '.glb' | '.gltf' | null {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.glb')) return '.glb'
  if (lower.endsWith('.gltf')) return '.gltf'
  return null
}

/** GLB files start with the ASCII magic "glTF" + version 2. */
function looksLikeGlb(buf: Buffer): boolean {
  if (buf.length < 12) return false
  const magic = buf.toString('ascii', 0, 4)
  if (magic !== 'glTF') return false
  const version = buf.readUInt32LE(4)
  return version === 2
}

/** .gltf is JSON — verify it parses and has the core markers. */
function looksLikeGltfJson(buf: Buffer): boolean {
  try {
    const parsed = JSON.parse(buf.toString('utf8')) as Record<string, unknown>
    return !!(parsed && typeof parsed === 'object' && 'asset' in parsed)
  } catch {
    return false
  }
}

export function validateModel3DBytes(buf: Buffer, ext: '.glb' | '.gltf'): boolean {
  if (!buf.length || buf.length > MODEL3D_MAX_BYTES) return false
  if (ext === '.glb') return looksLikeGlb(buf)
  return looksLikeGltfJson(buf)
}

/**
 * Store an uploaded model file; returns the opaque storage key (the bare
 * filename). Files get a timestamped + random name — original names are
 * remembered separately in the row.
 */
export async function saveModel3DFile(buf: Buffer, ext: '.glb' | '.gltf'): Promise<string> {
  await mkdir(ROOT, { recursive: true })
  const key = `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`
  await writeFile(path.join(ROOT, key), buf)
  return key
}

/** Read a stored model file. Only bare names (no path separators) allowed. */
export async function readModel3DFile(key: string): Promise<Buffer | null> {
  if (!/^[A-Za-z0-9._-]+\.(glb|gltf)$/.test(key) || key.includes('..')) return null
  try {
    const full = path.join(ROOT, key)
    const st = await stat(full)
    if (!st.isFile()) return null
    return await readFile(full)
  } catch {
    return null
  }
}

export async function deleteModel3DFile(key: string | null): Promise<void> {
  if (!key) return
  if (!/^[A-Za-z0-9._-]+\.(glb|gltf)$/.test(key) || key.includes('..')) return
  try {
    await unlink(path.join(ROOT, key))
  } catch {
    // already gone — deletion is idempotent
  }
}
