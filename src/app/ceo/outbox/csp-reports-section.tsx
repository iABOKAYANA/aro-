import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ShieldAlert } from 'lucide-react'

/* ─── CSP reports (last 20) ──────────────────────────────
   File-backed browser telemetry from POST /api/csp-report
   (`log/csp-reports.jsonl`, report-only — enforcement stays OFF).
   Read straight from disk: no new API, no auth surface (this page already
   sits behind the CEO layout gate). List + counts only, no delete. */

type CspEntry = {
  at: string | null
  directive: string | null
  blocked: string | null
  document: string | null
}

function summarize(parsed: { at?: unknown; report?: unknown }): CspEntry {
  const at = typeof parsed.at === 'string' ? parsed.at : null
  const report = parsed.report as Record<string, unknown> | null | undefined
  const inner =
    (report && typeof report['csp-report'] === 'object'
      ? (report['csp-report'] as Record<string, unknown>)
      : null) ??
    (report && typeof report.body === 'object' ? (report.body as Record<string, unknown>) : null) ??
    (report && typeof report === 'object' ? report : null)
  const str = (v: unknown) => (typeof v === 'string' ? v : null)
  return {
    at,
    directive:
      str(inner?.['violated-directive']) ?? str(inner?.['effective-directive']) ?? null,
    blocked: str(inner?.['blocked-uri']) ?? str(inner?.['blockedURL']) ?? null,
    document:
      str(inner?.['document-uri']) ?? str(inner?.['documentURL']) ?? str(inner?.url) ?? null,
  }
}

async function loadReports(): Promise<{ total: number; items: CspEntry[] }> {
  let text: string
  try {
    text = await readFile(path.join(process.cwd(), 'log', 'csp-reports.jsonl'), 'utf8')
  } catch {
    return { total: 0, items: [] }
  }
  const lines = text.split('\n').filter((l) => l.trim())
  const items: CspEntry[] = []
  for (const line of lines.slice(-20).reverse()) {
    try {
      items.push(summarize(JSON.parse(line) as { at?: unknown; report?: unknown }))
    } catch {
      items.push({ at: null, directive: null, blocked: null, document: null })
    }
  }
  return { total: lines.length, items }
}

export default async function CspReportsSection() {
  const { total, items } = await loadReports()

  return (
    <Card className="border-border bg-card dark:border-[#262626] dark:bg-[#0A0A0A]">
      <CardHeader className="flex flex-row items-center gap-2">
        <ShieldAlert className="h-5 w-5 text-estate-gold" />
        <CardTitle className="text-sm text-foreground">
          CSP reports · {total} total{total > 0 ? ` (last ${items.length})` : ''}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-500">
            No CSP violations reported yet — the report-only policy posts here via
            <span className="font-mono"> /api/csp-report</span>.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border dark:border-[#262626]">
                  <th className="px-4 py-2 font-medium text-gray-400">Time</th>
                  <th className="px-4 py-2 font-medium text-gray-400">Directive</th>
                  <th className="px-4 py-2 font-medium text-gray-400">Blocked</th>
                  <th className="hidden px-4 py-2 font-medium text-gray-400 lg:table-cell">Document</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-[#262626]">
                {items.map((e, i) => (
                  <tr key={i} className="transition-colors hover:bg-white/[0.03]">
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-gray-400">
                      {e.at ? new Date(e.at).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-2">
                      <span className="inline-flex rounded-full border border-estate-gold/30 bg-estate-gold/10 px-2.5 py-0.5 font-mono text-[11px] text-estate-gold">
                        {e.directive ?? '—'}
                      </span>
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-2 font-mono text-[11px] text-gray-500" dir="ltr">
                      {e.blocked ?? '—'}
                    </td>
                    <td className="hidden max-w-[260px] truncate px-4 py-2 font-mono text-[11px] text-gray-500 lg:table-cell" dir="ltr">
                      {e.document ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
