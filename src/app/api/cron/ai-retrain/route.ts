import { NextRequest, NextResponse } from 'next/server'
import { ingestAllDeveloperSites } from '@/lib/ai-ingest'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Token-gated weekly retrain — called by cron via curl. */
function authorised(req: NextRequest): boolean {
  const envToken = process.env.CRON_TOKEN
  if (!envToken) return false // never open when unset
  const header = req.headers.get('x-cron-token')
  const param = req.nextUrl.searchParams.get('token')
  return header === envToken || param === envToken
}

export async function POST(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const res = await ingestAllDeveloperSites()
  return NextResponse.json({ ok: true, at: new Date().toISOString(), ...res })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
