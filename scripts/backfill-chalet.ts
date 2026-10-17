/**
 * Backfill CHALET (and loft→APARTMENT) propertyTypes for Nawy-imported rows.
 *
 * Context: NAWY_TYPE_MAP in src/lib/nawy-import.ts used to drop Chalet /
 * Cabin / Loft, so chalet-only compounds were stored with propertyTypes=[]
 * and mixed compounds missed CHALET. Now that the map covers them, re-fetch
 * each candidate's Nawy page and UNION-merge the fresh evidence into the
 * stored JSON — never removing existing values (CEO manual edits survive).
 *
 * Resume pattern (same as the CEO Nawy import): a progress file records every
 * checked slug, so an interrupted run skips whatever was already processed.
 * Bounded: only empty rows + filled rows in coastal governorates (Matrouh,
 * Suez, Red Sea) where chalets actually occur.
 *
 * Usage: npx tsx scripts/backfill-chalet.ts [--limit N]
 */
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { db } from '@/lib/db'
import { fetchNawyPage } from '@/lib/nawy-import'

const HERE = dirname(fileURLToPath(import.meta.url))
const PROGRESS_FILE = join(HERE, '.backfill-chalet-progress.json')
const COASTAL = ['Matrouh', 'Suez', 'Red Sea']

const limitArg = process.argv.find((a) => a.startsWith('--limit'))
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : Infinity

function loadProgress(): Set<string> {
  try {
    if (existsSync(PROGRESS_FILE)) {
      const raw = JSON.parse(readFileSync(PROGRESS_FILE, 'utf8'))
      if (Array.isArray(raw)) return new Set(raw.map(String))
    }
  } catch { /* start fresh */ }
  return new Set()
}

function saveProgress(done: Set<string>) {
  writeFileSync(PROGRESS_FILE, JSON.stringify([...done].sort(), null, 1))
}

function sourceUrl(keywords: string): string | null {
  try {
    const arr = JSON.parse(keywords)
    if (Array.isArray(arr)) {
      const hit = arr.find((s) => typeof s === 'string' && s.startsWith('source:https://www.nawy.com/compound/'))
      if (hit) return hit.slice('source:'.length)
    }
  } catch { /* ignore */ }
  return null
}

async function main() {
  const done = loadProgress()
  console.log(`[backfill-chalet] resuming: ${done.size} slug(s) already checked`)

  // Candidates: empties (dropped types) + filled coastal rows (may miss CHALET).
  const rows = await db.project.findMany({
    select: { slug: true, name: true, propertyTypes: true, keywords: true, governorate: { select: { name: true } } },
  })
  const parse = (raw: string): string[] => {
    try { const v = JSON.parse(raw); return Array.isArray(v) ? v.map(String) : [] } catch { return [] }
  }
  const candidates = rows.filter((r) => {
    if (done.has(r.slug)) return false
    const stored = parse(r.propertyTypes)
    if (stored.length === 0) return true // empty: types were dropped by the old map
    const gov = r.governorate?.name
    return !!gov && COASTAL.includes(gov) // filled coastal: may list Chalet/Cabin too
  })
  console.log(`[backfill-chalet] candidates: ${candidates.length} (empties + filled coastal)`)

  let checked = 0, updated = 0, gainedChalet = 0, gainedApt = 0, errors = 0
  const chaletSlugs: string[] = []
  const queue = (Number.isFinite(LIMIT) ? candidates.slice(0, LIMIT) : candidates)

  // Concurrency 3, same politeness as previewCompounds/importCompounds.
  const CONC = 3
  for (let i = 0; i < queue.length; i += CONC) {
    const batch = queue.slice(i, i + CONC)
    const results = await Promise.all(batch.map(async (r) => {
      const url = sourceUrl(r.keywords)
      if (!url) return { r, error: 'no nawy source url' }
      try {
        const page = await fetchNawyPage(url)
        return { r, types: page.types.propertyTypes }
      } catch (e) {
        return { r, error: e instanceof Error ? e.message : 'fetch failed' }
      }
    }))
    for (const res of results) {
      checked++
      done.add(res.r.slug)
      if (res.error || !res.types) {
        errors++
        if (res.error && !String(res.error).includes('no nawy')) {
          console.warn(`[backfill-chalet] ${res.r.slug}: ${res.error}`)
        }
        continue
      }
      const stored = parse(res.r.propertyTypes)
      const fresh = res.types.filter((t) => !stored.includes(t))
      if (fresh.length > 0) {
        const merged = [...stored, ...fresh].sort()
        await db.project.update({ where: { slug: res.r.slug }, data: { propertyTypes: JSON.stringify(merged) } })
        updated++
        if (fresh.includes('CHALET')) { gainedChalet++; chaletSlugs.push(res.r.slug) }
        if (fresh.includes('APARTMENT')) gainedApt++
        console.log(`[backfill-chalet] ${res.r.slug}: +${fresh.join(',')} (was [${stored.join(',') || 'empty'}])`)
      }
    }
    if (checked % 30 < CONC) {
      saveProgress(done)
      console.log(`[backfill-chalet] progress: ${checked}/${queue.length} (updated=${updated} chalet+${gainedChalet} errors=${errors})`)
    }
  }
  saveProgress(done)
  console.log(`[backfill-chalet] DONE checked=${checked} updated=${updated} gainedCHALET=${gainedChalet} gainedAPARTMENT(loft)=${gainedApt} errors=${errors}`)
  if (chaletSlugs.length) console.log(`[backfill-chalet] CHALET slugs: ${chaletSlugs.join(', ')}`)
  await db.$disconnect()
}

main().catch((e) => { console.error('[backfill-chalet] fatal:', e); process.exit(1) })
