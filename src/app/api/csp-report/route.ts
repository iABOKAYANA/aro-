import { NextResponse } from 'next/server'
import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { getClientIp, rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/** Browsers can burst (one POST per violation) — cap raw body at ~10KB. */
const MAX_BODY_BYTES = 10 * 1024

/**
 * POST /api/csp-report — CSP `report-uri` collection endpoint (report-only).
 *
 * No auth: browsers POST violation reports directly, with no session header
 * and no X-Requested-With (see the CSRF exemption in src/middleware.ts).
 * Reports are high-volume noise — appended as JSONL to
 * `log/csp-reports.jsonl`, never to the DB.
 *
 * Accepts the legacy `{"csp-report": {...}}` shape browsers send to
 * `report-uri`, plus the Reporting-API `{"type":"csp-violation",...}` shape.
 */
export async function POST(request: Request) {
  // Anonymous intake — throttle per IP so a bot loop cannot fill the disk.
  const rl = rateLimit(`csp-report:${getClientIp(request.headers)}`, {
    limit: 60,
    windowMs: 60_000,
  })
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many reports. Please wait a moment and try again.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))),
        },
      }
    )
  }

  let raw: string
  try {
    // `text()` — browsers send `application/csp-report`, not JSON.
    raw = await request.text()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (!raw || raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (!isCspReport(body)) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    const dir = path.join(process.cwd(), 'log')
    await mkdir(dir, { recursive: true })
    const line = JSON.stringify({ at: new Date().toISOString(), report: body }) + '\n'
    await appendFile(path.join(dir, 'csp-reports.jsonl'), line)
  } catch (e) {
    console.error('[csp-report] failed to append:', e instanceof Error ? e.message : String(e))
    return NextResponse.json({ error: 'Could not store the report' }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}

/** True for the shapes browsers actually POST to `report-uri` / `report-to`. */
function isCspReport(body: unknown): boolean {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return false
  const obj = body as Record<string, unknown>
  // Legacy `report-uri` shape: {"csp-report": {"document-uri": ..., ...}}
  if (typeof obj['csp-report'] === 'object' && obj['csp-report'] !== null) return true
  // Reporting API shape: {"type": "csp-violation", "body": {...}} (possibly batched as an array wrapper — reject arrays above, accept single)
  if (obj.type === 'csp-violation' && typeof obj.body === 'object' && obj.body !== null) return true
  // Bare report body without envelope (some UA/polyfill variants).
  if (typeof obj['violated-directive'] === 'string' || typeof obj['document-uri'] === 'string') return true
  return false
}
