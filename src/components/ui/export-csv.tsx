'use client'

import { useState } from 'react'
import { Download, Check, Loader2 } from 'lucide-react'
import { downloadCsv, type CsvRow } from '@/lib/csv'
import { cn } from '@/lib/utils'

type Props = {
  /** Data exactly as displayed (already filtered/sorted by the page). */
  rows: CsvRow[]
  /** Header labels in order. Falls back to the union of row keys. */
  columns?: { key: string; label: string }[]
  /** Base filename, e.g. `brokers` → `brokers-2026-10-02.csv`. */
  filename: string
  label?: string
  className?: string
  disabled?: boolean
}

/**
 * "Export CSV" button used across the CEO tables.
 *
 * Exports **what you currently see** — the page passes its filtered rows, so a
 * filtered list exports only those rows.
 */
export default function ExportCsvBtn({
  rows,
  columns,
  filename,
  label = 'Export CSV',
  className,
  disabled,
}: Props) {
  const [state, setState] = useState<'idle' | 'working' | 'done'>('idle')

  const isEmpty = rows.length === 0

  function run() {
    if (isEmpty || disabled || state === 'working') return
    setState('working')

    // Let the spinner paint before the (synchronous) serialisation blocks.
    window.setTimeout(() => {
      // Human-readable headers when the page supplies them; otherwise the
      // raw row keys are used as-is.
      const finalRows = columns
        ? rows.map((row) => {
            const out: CsvRow = {}
            for (const c of columns) out[c.label] = row[c.key]
            return out
          })
        : rows

      const ok = downloadCsv(filename, finalRows)
      setState(ok ? 'done' : 'idle')
      window.setTimeout(() => setState('idle'), 2200)
    }, 10)
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={disabled || isEmpty}
      title={isEmpty ? 'Nothing to export' : `Export ${rows.length} row(s) as CSV`}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-estate-gold/50 hover:text-estate-gold disabled:cursor-not-allowed disabled:opacity-40',
        state === 'done' && 'border-emerald-500/50 text-emerald-400',
        className
      )}
    >
      {state === 'working' ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : state === 'done' ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Download className="h-3.5 w-3.5" />
      )}
      {state === 'done' ? 'Downloaded' : label}
      {!isEmpty && (
        <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-gray-400">
          {rows.length}
        </span>
      )}
    </button>
  )
}
