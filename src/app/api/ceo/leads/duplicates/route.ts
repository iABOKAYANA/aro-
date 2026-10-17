import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi } from '@/lib/permissions'
import { normalizePhone, normalizeEmail } from '@/lib/lead-protection'

export const dynamic = 'force-dynamic'

// ─── GET /api/ceo/leads/duplicates ───────────────────────
// Suspected-duplicate queue. Reuses the SAME matching rule the lead-create
// path uses for DUPLICATE_REVIEW (see findDuplicateLead in
// src/lib/lead-protection.ts):
//   key   = normalizePhone(phone) (digits-only, EG prefix handling, min 7
//           digits) OR normalizeEmail(email) (trim + lowercase, must contain @)
//   scope = reviewStatus IN (ACTIVE, DUPLICATE_REVIEW, TRANSFERRED) AND
//           status NOT IN (LOST, CANCELLED, EXPIRED)
// Grouping here applies that rule pairwise: any two live leads sharing a
// normalized phone or a normalized email belong to the same group. Stored
// normalizedPhone/normalizedEmail are preferred; when a legacy row has NULL
// there, the same normalize*() functions run over the raw phone/email.
// Shape: { groups: [{ key, leads: [{ id, name, phone, email, broker,
//           status, createdAt }] }] } — only groups with 2+ members.
const LIVE_REVIEW_STATUSES = ['ACTIVE', 'DUPLICATE_REVIEW', 'TRANSFERRED']
const DEAD_LEAD_STATUSES = ['LOST', 'CANCELLED', 'EXPIRED']

interface QueueLead {
  id: string
  name: string
  phone: string
  email: string | null
  broker: string | null
  status: string
  createdAt: Date
}

export async function GET(req: Request) {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const rawLimit = Number(searchParams.get('limit'))
    const take = Number.isFinite(rawLimit) ? Math.min(10000, Math.max(100, Math.floor(rawLimit))) : 5000

    const leads = await db.lead.findMany({
      where: {
        reviewStatus: { in: LIVE_REVIEW_STATUSES },
        status: { notIn: DEAD_LEAD_STATUSES },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        brokerId: true,
        status: true,
        createdAt: true,
        normalizedPhone: true,
        normalizedEmail: true,
      },
      orderBy: { createdAt: 'asc' },
      take,
    })

    const buckets = new Map<string, QueueLead[]>()
    for (const lead of leads) {
      const np = lead.normalizedPhone || normalizePhone(lead.phone)
      const ne = lead.normalizedEmail || normalizeEmail(lead.email)
      const entry: QueueLead = {
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        broker: lead.brokerId,
        status: lead.status,
        createdAt: lead.createdAt,
      }
      if (np) {
        const list = buckets.get(np) || []
        list.push(entry)
        buckets.set(np, list)
      }
      if (ne) {
        const list = buckets.get(ne) || []
        list.push(entry)
        buckets.set(ne, list)
      }
    }

    const groups = [...buckets.entries()]
      .filter(([, members]) => members.length >= 2)
      .map(([key, members]) => ({ key, leads: members }))
      .sort((a, b) => b.leads.length - a.leads.length || (a.key < b.key ? -1 : 1))

    return NextResponse.json({ groups })
  } catch (err) {
    console.error('CEO duplicate queue error:', err)
    return NextResponse.json({ error: 'Failed to fetch duplicate groups' }, { status: 500 })
  }
}
