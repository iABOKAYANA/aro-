/**
 * CSV helpers.
 *
 * Kept deliberately dependency-free. The output is UTF-8 **with a BOM** so
 * Excel opens Arabic columns correctly instead of rendering them as mojibake.
 */

export type CsvRow = Record<string, unknown>

const BOM = '\uFEFF'

function cell(value: unknown): string {
  if (value === null || value === undefined) return ''

  if (value instanceof Date) return value.toISOString().slice(0, 10)

  if (typeof value === 'object') {
    if (Array.isArray(value)) return value.map((v) => cell(v)).filter(Boolean).join(' | ')
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  const raw = String(value)
  // Guard against spreadsheet formula injection (=, +, -, @, tab, CR).
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw

  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`
  }
  return safe
}

/**
 * Turn rows into CSV.
 *
 * `columns` fixes the header order; without it the union of all row keys is
 * used, in first-seen order.
 */
export function toCsv(rows: CsvRow[], columns?: string[]): string {
  if (rows.length === 0) return ''

  const keys = columns ?? [...rows.reduce<Set<string>>((set, row) => {
    for (const key of Object.keys(row)) set.add(key)
    return set
  }, new Set())]

  const header = keys.map((k) => cell(k)).join(',')
  const body = rows.map((row) => keys.map((k) => cell(row[k])).join(','))
  return [header, ...body].join('\r\n')
}

/** Trigger a browser download of `rows` as `<filename>.csv`. */
export function downloadCsv(
  filename: string,
  rows: CsvRow[],
  columns?: string[]
): boolean {
  if (typeof document === 'undefined') return false
  const csv = toCsv(rows, columns)
  if (!csv) return false

  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${filename.replace(/[^\w.-]+/g, '-')}-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  return true
}

/** Build a download filename from a table name + optional filter. */
export function csvName(table: string, suffix?: string): string {
  const parts = [table, suffix].filter(Boolean)
  return parts.join('-').toLowerCase()
}
