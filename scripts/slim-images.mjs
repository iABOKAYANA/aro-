#!/usr/bin/env node
// One-time batch recompress of giant uploads (>5MB under public/images/uploads/).
// In-place, same-path, same-format re-encode: longest edge → 1920px,
// JPEG q80 / PNG compression 9 (alpha kept) / WebP q80 / AVIF q60.
// GIF/SVG/animated/non-images are skipped. Per-file verify (bytes>0 +
// dimensions readable) — on ANY failure the original is kept and logged.
// Usage: node scripts/slim-images.mjs [--dry-run]
import { readdir, stat, readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR = path.join(ROOT, 'public', 'images', 'uploads')
const MANIFEST = path.join(ROOT, 'scripts', 'slim-images-manifest.json')
const MAX_EDGE = 1920
const MIN_BYTES = 5 * 1024 * 1024
const DRY_RUN = process.argv.includes('--dry-run')

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else if (e.isFile()) yield p
  }
}

function encode(pipe, format) {
  if (format === 'png') return pipe.png({ compressionLevel: 9, adaptiveFiltering: true })
  if (format === 'webp') return pipe.webp({ quality: 80 })
  if (format === 'avif' || format === 'heif') return pipe.avif({ quality: 60 })
  return pipe.jpeg({ quality: 80 })
}

const manifest = { ranAt: new Date().toISOString(), changed: [], skipped: [] }
let processed = 0
let beforeTotal = 0
let afterTotal = 0

const targets = []
for await (const p of walk(DIR)) {
  const st = await stat(p).catch(() => null)
  if (st && st.size > MIN_BYTES) targets.push({ path: p, size: st.size })
}
console.log(`[slim-images] targets >5MB under public/images/uploads/: ${targets.length} (expected ~108)${DRY_RUN ? ' [DRY RUN]' : ''}`)

for (const t of targets) {
  processed++
  const rel = path.relative(ROOT, t.path)
  const skip = (reason) => manifest.skipped.push({ path: rel, bytes: t.size, reason })
  try {
    const buf = await readFile(t.path)
    if (buf.length !== t.size) {
      skip('size changed mid-run')
      continue
    }
    const meta = await sharp(buf).metadata().catch(() => null)
    if (!meta || !meta.width || !meta.height) {
      skip('unreadable dimensions')
      continue
    }
    const format = (meta.format || '').toLowerCase()
    if (['gif', 'svg'].includes(format)) {
      skip(`format ${format}`)
      continue
    }
    if ((meta.pages ?? 1) > 1) {
      skip('animated')
      continue
    }
    if (!['jpeg', 'jpg', 'png', 'webp', 'avif', 'heif'].includes(format)) {
      skip(`format ${format}`)
      continue
    }
    if (Math.max(meta.width, meta.height) <= MAX_EDGE) {
      skip('already within cap')
      continue
    }
    let pipe = sharp(buf).rotate().resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    pipe = encode(pipe, format)
    const out = await pipe.toBuffer()
    if (!out.length) {
      skip('empty encode output')
      continue
    }
    // Verify: output dimensions must be readable before replacing original.
    const check = await sharp(out).metadata().catch(() => null)
    if (!check || !check.width || !check.height) {
      skip('output unverifiable')
      continue
    }
    if (DRY_RUN) {
      manifest.changed.push({ path: rel, before: buf.length, after: out.length, dryRun: true })
      beforeTotal += buf.length
      afterTotal += out.length
    } else {
      const tmp = `${t.path}.slimtmp`
      await writeFile(tmp, out)
      await rename(tmp, t.path)
      manifest.changed.push({
        path: rel,
        before: buf.length,
        after: out.length,
        dimensions: `${meta.width}x${meta.height}→${check.width}x${check.height}`,
      })
      beforeTotal += buf.length
      afterTotal += out.length
    }
  } catch (err) {
    skip(`error: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (processed % 25 === 0 || processed === targets.length) {
    console.log(`[slim-images] ${processed}/${targets.length} — changed: ${manifest.changed.length}, skipped: ${manifest.skipped.length}`)
  }
}

await writeFile(MANIFEST, JSON.stringify(manifest, null, 2))
const pct = beforeTotal ? ((1 - afterTotal / beforeTotal) * 100).toFixed(1) : '0.0'
console.log(`[slim-images] done: processed=${processed} changed=${manifest.changed.length} skipped=${manifest.skipped.length}`)
console.log(`[slim-images] bytes ${beforeTotal} → ${afterTotal} (−${pct}%) · manifest: scripts/slim-images-manifest.json`)
