import { db } from '@/lib/db'

// ─── SystemSetting read helper ─────────────────────────────
// Settings rows store JSON strings. Reads are fail-soft with a fallback.

export async function readSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const row = await db.systemSetting.findUnique({ where: { key } })
    if (!row) return fallback
    try {
      const parsed = JSON.parse(row.value) as T
      return parsed === null || parsed === undefined ? fallback : parsed
    } catch {
      return (row.value as unknown) as T
    }
  } catch (e) {
    console.error('[settings] read failed:', key, e)
    return fallback
  }
}

/** Boolean toggle helper — tolerates stored true/false/"true"/"false". */
export async function readBoolSetting(key: string, fallback: boolean): Promise<boolean> {
  const v = await readSetting<unknown>(key, fallback)
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') return v.toLowerCase() === 'true'
  return fallback
}

export async function readNumberSetting(key: string, fallback: number): Promise<number> {
  const v = await readSetting<unknown>(key, fallback)
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return fallback
}
