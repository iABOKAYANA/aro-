import { db } from '@/lib/db'

// ─── Lead Lifecycle ──────────────────────────────────────
// Deterministic state machine. AI never decides these transitions —
// the rules below are the single source of truth.

export const LEAD_STATUSES = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'VIEWING',
  'INTERESTED',
  'RESERVATION',
  'CONTRACT',
  'SOLD',
  'LOST',
  'CANCELLED',
  'EXPIRED',
  // Legacy statuses kept for pre-existing rows
  'VISITED',
  'NEGOTIATING',
  'CONVERTED',
] as const

export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const LEAD_STATUS_LABELS: Record<string, { en: string; ar: string }> = {
  NEW: { en: 'New', ar: 'جديد' },
  CONTACTED: { en: 'Contacted', ar: 'تم التواصل' },
  QUALIFIED: { en: 'Qualified', ar: 'مؤهل' },
  VIEWING: { en: 'Viewing', ar: 'معاينة' },
  INTERESTED: { en: 'Interested', ar: 'مهتم' },
  RESERVATION: { en: 'Reservation', ar: 'حجز' },
  CONTRACT: { en: 'Contract', ar: 'عقد' },
  SOLD: { en: 'Sold', ar: 'تم البيع' },
  LOST: { en: 'Lost', ar: 'مفقود' },
  CANCELLED: { en: 'Cancelled', ar: 'ملغي' },
  EXPIRED: { en: 'Expired', ar: 'منتهي' },
  VISITED: { en: 'Visited', ar: 'زار' },
  NEGOTIATING: { en: 'Negotiating', ar: 'تفاوض' },
  CONVERTED: { en: 'Converted', ar: 'تم التحويل' },
}

const TERMINAL: string[] = ['SOLD', 'LOST', 'CANCELLED']

/** Allowed forward/backward transitions. Anything not listed is rejected. */
const TRANSITIONS: Record<string, string[]> = {
  NEW: ['CONTACTED', 'QUALIFIED', 'LOST', 'CANCELLED', 'EXPIRED'],
  CONTACTED: ['QUALIFIED', 'VIEWING', 'INTERESTED', 'LOST', 'CANCELLED', 'EXPIRED'],
  QUALIFIED: ['VIEWING', 'INTERESTED', 'CONTACTED', 'LOST', 'CANCELLED', 'EXPIRED'],
  VIEWING: ['INTERESTED', 'QUALIFIED', 'RESERVATION', 'LOST', 'CANCELLED', 'EXPIRED'],
  INTERESTED: ['VIEWING', 'RESERVATION', 'QUALIFIED', 'LOST', 'CANCELLED', 'EXPIRED'],
  RESERVATION: ['CONTRACT', 'SOLD', 'CANCELLED', 'LOST'],
  CONTRACT: ['SOLD', 'CANCELLED'],
  SOLD: [],
  LOST: ['CONTACTED'], // reopen possible
  CANCELLED: ['CONTACTED'],
  EXPIRED: ['CONTACTED', 'QUALIFIED'], // renewal/reactivation
  // legacy
  VISITED: ['INTERESTED', 'NEGOTIATING', 'QUALIFIED', 'LOST', 'CANCELLED'],
  NEGOTIATING: ['RESERVATION', 'INTERESTED', 'LOST', 'CANCELLED'],
  CONVERTED: ['SOLD'],
}

export function canTransition(from: string, to: string): boolean {
  if (from === to) return false
  const allowed = TRANSITIONS[from]
  if (!allowed) return true // unknown legacy status: be permissive
  return allowed.includes(to)
}

export function isTerminal(status: string): boolean {
  return TERMINAL.includes(status)
}

export function isDealStage(status: string): boolean {
  return status === 'RESERVATION' || status === 'CONTRACT' || status === 'SOLD'
}

/** Fields the system stamps automatically on specific transitions. */
export function transitionStamps(status: string): Record<string, Date> {
  const now = new Date()
  switch (status) {
    case 'CONTACTED':
      return { contactedAt: now, lastContactAt: now }
    case 'SOLD':
      return { convertedAt: now }
    default:
      return {}
  }
}

export interface TransitionResult {
  ok: boolean
  error?: string
  dealCreated?: boolean
}

/**
 * Applies a status transition with full bookkeeping:
 * - validates against the state machine
 * - stamps lifecycle timestamps
 * - writes a LeadActivity entry
 * - auto-creates a linked Deal when reaching RESERVATION/CONTRACT/SOLD
 */
export async function applyStatusTransition(params: {
  leadId: string
  to: string
  actorId?: string | null
  actorRole?: string | null
  dealValue?: number | null
  notes?: string | null
}): Promise<TransitionResult> {
  const lead = await db.lead.findUnique({
    where: { id: params.leadId },
    include: {
      project: { select: { id: true, developerId: true } },
      unit: { select: { id: true, price: true } },
    },
  })
  if (!lead) return { ok: false, error: 'Lead not found' }

  if (!LEAD_STATUSES.includes(params.to as LeadStatus)) {
    return { ok: false, error: `Unknown status: ${params.to}` }
  }
  if (!canTransition(lead.status, params.to)) {
    return { ok: false, error: `Cannot move lead from ${lead.status} to ${params.to}` }
  }

  const stamps = transitionStamps(params.to)
  const updateData: Record<string, unknown> = {
    status: params.to,
    lastActivityAt: new Date(),
    updatedBy: params.actorId || null,
    ...stamps,
  }
  if (params.to === 'LOST' && params.notes) updateData.lostReason = params.notes

  await db.lead.update({ where: { id: lead.id }, data: updateData })

  await db.leadActivity.create({
    data: {
      leadId: lead.id,
      type: 'STATUS_CHANGED',
      content: `${lead.status} → ${params.to}${params.notes ? ` — ${params.notes}` : ''}`,
    },
  })

  // Auto-link a Deal when the lead reaches a deal stage. Never disconnected:
  // the deal always references this lead, its broker, project and unit.
  let dealCreated = false
  const dealStage = params.to === 'RESERVATION' || params.to === 'CONTRACT' || params.to === 'SOLD'
  if (dealStage) {
    try {
      const existing = await db.deal.findFirst({ where: { leadId: lead.id } })
      if (!existing && lead.project) {
        const dealValue = params.dealValue ?? lead.unit?.price ?? null
        const dealStatus = params.to === 'SOLD' ? 'SOLD' : params.to
        const deal = await db.deal.create({
          data: {
            leadId: lead.id,
            brokerId: lead.brokerId,
            developerId: lead.project.developerId,
            projectId: lead.project.id,
            unitId: lead.unitId,
            status: dealStatus,
            dealValue,
            reservationDate: params.to === 'RESERVATION' ? new Date() : null,
            contractDate: params.to === 'CONTRACT' ? new Date() : null,
            saleDate: params.to === 'SOLD' ? new Date() : null,
            source: 'PLATFORM',
          },
        })
        dealCreated = true
        if (dealValue && dealValue > 0) {
          const { syncDealCommission } = await import('@/lib/commission')
          await syncDealCommission({
            dealId: deal.id,
            dealValue,
            projectId: lead.project.id,
            developerId: lead.project.developerId,
          })
        }
      }
    } catch (e) {
      console.error('[lifecycle] deal auto-create failed:', e)
    }
  }

  return { ok: true, dealCreated }
}
