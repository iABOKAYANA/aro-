import { NextRequest, NextResponse } from 'next/server'
import { requireCEOApi } from '@/lib/permissions'
import { listAnomalies, scanAndFlag, resolveAnomaly, getAnomalyThreshold, anomalyDetectionEnabled } from '@/lib/price-anomaly'

export const dynamic = 'force-dynamic'

// ─── PRICE ANOMALIES (Feature 3) — CEO/ADMIN review queue ───

export async function GET(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')

    const [anomalies, threshold, enabled] = await Promise.all([
      listAnomalies(status ? { status } : undefined),
      getAnomalyThreshold(),
      anomalyDetectionEnabled(),
    ])
    const summary = {
      pending: anomalies.filter((a) => a.status === 'PENDING').length,
      confirmedErrors: anomalies.filter((a) => a.reviewOutcome === 'CONFIRMED_ERROR').length,
      justified: anomalies.filter((a) => a.reviewOutcome === 'JUSTIFIED').length,
    }
    void session
    return NextResponse.json({ anomalies, summary, thresholdPct: Math.round(threshold * 100), enabled })
  } catch (e) {
    console.error('Anomalies fetch error:', e)
    return NextResponse.json({ error: 'Failed to load anomalies' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error

    const body = await req.json()
    const { action } = body
    if (action !== 'scan') return NextResponse.json({ error: 'action must be "scan"' }, { status: 400 })

    const result = await scanAndFlag((session!.user as any).id)
    return NextResponse.json(result)
  } catch (e) {
    console.error('Anomaly scan error:', e)
    return NextResponse.json({ error: 'Scan failed' }, { status: 500 })
  }
}

/** Manual review: confirm a real pricing error or mark the difference justified. */
export async function PATCH(req: NextRequest) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error

    const body = await req.json()
    const { id, outcome, note } = body
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    if (!['CONFIRMED_ERROR', 'JUSTIFIED'].includes(outcome)) {
      return NextResponse.json({ error: 'outcome must be CONFIRMED_ERROR or JUSTIFIED' }, { status: 400 })
    }
    if (outcome === 'JUSTIFIED' && !note) {
      return NextResponse.json({ error: 'A note is required when marking a difference as justified' }, { status: 400 })
    }

    const result = await resolveAnomaly(id, outcome, note || null, (session!.user as any).id)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 })
    return NextResponse.json({ success: true, outcome })
  } catch (e) {
    console.error('Anomaly resolve error:', e)
    return NextResponse.json({ error: 'Failed to resolve anomaly' }, { status: 500 })
  }
}
