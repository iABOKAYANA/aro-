import { NextResponse } from 'next/server'

// Minimal public health endpoint for the server watchdog / uptime monitors.
// Intentionally returns NO database data, env vars, or secrets — only a
// liveness flag and a timestamp.
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(
    { ok: true, ts: Date.now() },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
