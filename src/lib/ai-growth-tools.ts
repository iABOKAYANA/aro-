import { db } from '@/lib/db'
import { getProtectionConfig, getProtectionStatus, maskPhone, maskEmail } from '@/lib/lead-protection'
import { resolveCommissionRule, calculateCommission } from '@/lib/commission'

// ─── Read-only AI tools for the growth system ────────────
// Hard rules (Section 23):
//  - READ-ONLY: these tools never create/update/transfer anything
//  - scope enforcement happens here, server-side, per the caller's session
//  - ownership / protection / commission values come from the DB or the
//    commission engine — the model never decides or invents them

export interface AICtx {
  userId?: string | null
  role?: string | null
  brokerId?: string | null
  developerId?: string | null
}

export interface AIError {
  success: false
  error: string
}

function deny(message: string): AIError {
  return { success: false, error: message }
}

// ─── get_lead_details ─────────────────────────────────────
export async function toolGetLeadDetails(args: Record<string, unknown>, ctx: AICtx) {
  const key = typeof args.leadCode === 'string' ? args.leadCode.trim() : ''
  if (!key) return deny('leadCode is required (e.g. EA-10482).')

  const lead = await db.lead.findFirst({
    where: key.toUpperCase().startsWith('EA-') ? { leadCode: key.toUpperCase() } : { id: key },
    include: {
      broker: { select: { id: true, user: { select: { name: true } } } },
      project: { select: { id: true, name: true, developerId: true } },
      unit: { select: { id: true, name: true } },
      developer: { select: { id: true, companyName: true } },
      deals: {
        select: { id: true, status: true, dealValue: true, createdAt: true, commissions: { select: { status: true, totalAmount: true, brokerAmount: true, totalPct: true, brokerPct: true } } },
        take: 1,
        orderBy: { createdAt: 'desc' as const },
      },
    },
  })
  if (!lead) return deny('Lead not found.')

  // Scope: broker → own, developer → own org, CEO/ADMIN → any, others → denied
  const role = ctx.role || 'BUYER'
  if (role === 'BROKER') {
    if (!ctx.brokerId || lead.brokerId !== ctx.brokerId) return deny('You can only view your own leads.')
  } else if (role === 'DEVELOPER') {
    const mine = lead.developerId === ctx.developerId || lead.project?.developerId === ctx.developerId
    if (!mine) return deny('This lead does not belong to your organization.')
  } else if (role !== 'CEO' && role !== 'ADMIN') {
    return deny('Lead data is available to broker, developer and administrator accounts only.')
  }

  const config = await getProtectionConfig()
  const deal = lead.deals[0] || null
  const commission = deal?.commissions?.[0] || null
  const fullAccess = role === 'CEO' || role === 'ADMIN' || (role === 'BROKER' && lead.brokerId === ctx.brokerId)

  return {
    success: true,
    data: {
      leadCode: lead.leadCode,
      name: lead.name,
      phone: fullAccess ? maskPhone(lead.phone) : `${lead.phone.slice(0, 4)}•••••${lead.phone.slice(-3)}`,
      email: lead.email ? (fullAccess ? lead.email : maskEmail(lead.email)) : null,
      status: lead.status,
      reviewStatus: lead.reviewStatus,
      source: lead.source,
      broker: lead.broker?.user?.name || 'Unassigned',
      project: lead.project?.name || null,
      unit: lead.unit?.name || null,
      developer: lead.developer?.companyName || null,
      registeredAt: lead.createdAt,
      protection: {
        startsAt: lead.protectionStartsAt,
        expiresAt: lead.protectionExpiresAt,
        days: lead.protectionDays,
        source: lead.protectionSource,
        status: getProtectionStatus(lead, config),
        rule: `default ${config.defaultDays}d, expiring-soon window ${config.expiringSoonDays}d`,
      },
      deal: deal
        ? {
            status: deal.status,
            dealValue: deal.dealValue,
            commission: commission
              ? {
                  status: commission.status,
                  totalPct: commission.totalPct,
                  totalAmount: commission.totalAmount,
                  brokerPct: commission.brokerPct,
                  brokerAmount: commission.brokerAmount,
                }
              : null,
          }
        : null,
      note: 'All values above are read from the database. Ownership and protection dates are decided by EstateAI rules, not by this assistant.',
    },
  }
}

// ─── get_pipeline_summary ─────────────────────────────────
export async function toolGetPipelineSummary(_args: Record<string, unknown>, ctx: AICtx) {
  const role = ctx.role || 'BUYER'
  if (role !== 'BROKER' && role !== 'DEVELOPER' && role !== 'CEO' && role !== 'ADMIN') {
    return deny('Pipeline data is available to broker, developer and administrator accounts only.')
  }

  const scopeBrokerId = ctx.brokerId || null
  const scopeDeveloperId = ctx.developerId || null
  let scope: Record<string, unknown> = {}
  if (role === 'BROKER') {
    if (!scopeBrokerId) return deny('No broker profile linked to this account.')
    scope = { brokerId: scopeBrokerId }
  } else if (role === 'DEVELOPER') {
    if (!scopeDeveloperId) return deny('No developer profile linked to this account.')
    scope = { OR: [{ developerId: scopeDeveloperId }, { project: { developerId: scopeDeveloperId } }] }
  }

  const config = await getProtectionConfig()
  const now = new Date()
  const soon = new Date(now.getTime() + config.expiringSoonDays * 86_400_000)
  const and = (extra: Record<string, unknown> = {}) => ({ AND: [scope, extra].filter((c) => Object.keys(c).length) })

  const dealScope: Record<string, unknown> =
    role === 'CEO' || role === 'ADMIN'
      ? {}
      : role === 'BROKER'
        ? { brokerId: scopeBrokerId }
        : { developerId: scopeDeveloperId }

  const commissionScope: Record<string, unknown> =
    role === 'CEO' || role === 'ADMIN'
      ? {}
      : role === 'BROKER'
        ? { deal: { brokerId: scopeBrokerId } }
        : { deal: { developerId: scopeDeveloperId } }

  const [total, byStatus, protectedCount, expiring, expired, dealGroupRaw, commissionRows] = await Promise.all([
    db.lead.count({ where: and() }),
    db.lead.groupBy({ by: ['status'], _count: { _all: true }, where: scope }),
    db.lead.count({ where: and({ protectionExpiresAt: { gte: soon } }) }),
    db.lead.count({ where: and({ protectionExpiresAt: { gt: now, lte: soon } }) }),
    db.lead.count({ where: and({ protectionExpiresAt: { lte: now } }) }),
    db.deal.groupBy({
      by: ['status'],
      _count: { _all: true },
      _sum: { dealValue: true },
      where: dealScope,
    }),
    db.commission.findMany({
      where: commissionScope,
      select: { status: true, totalAmount: true, brokerAmount: true },
    }),
  ])

  const statusMap: Record<string, number> = {}
  for (const row of byStatus as Array<{ status: string; _count: { _all: number } }>) {
    statusMap[row.status] = row._count._all
  }

  const dealMap: Record<string, { count: number; value: number }> = {}
  for (const row of dealGroupRaw as unknown as Array<{ status: string; _count: { _all: number }; _sum: { dealValue: number | null } }>) {
    dealMap[row.status] = { count: row._count?._all ?? 0, value: row._sum?.dealValue || 0 }
  }

  const commissionTotals: Record<string, number> = {}
  let commissionAmount = 0
  let brokerAmount = 0
  for (const c of commissionRows) {
    commissionTotals[c.status] = (commissionTotals[c.status] || 0) + c.totalAmount
    commissionAmount += c.totalAmount
    brokerAmount += c.brokerAmount
  }

  return {
    success: true,
    data: {
      scope: role === 'CEO' || role === 'ADMIN' ? 'platform' : role.toLowerCase(),
      leads: { total, byStatus: statusMap },
      protection: {
        activeProtected: protectedCount,
        expiringSoon: expiring,
        expired,
        rule: `default ${config.defaultDays} days`,
      },
      deals: dealMap,
      commissions: { byStatus: commissionTotals, totalAmount: commissionAmount, brokerAmount },
      note: 'Read-only aggregate computed from the database with your account scope.',
    },
  }
}

// ─── calculate_commission ─────────────────────────────────
// Deterministic math using the resolved rule — never invented numbers.
export async function toolCalculateCommission(args: Record<string, unknown>, ctx: AICtx) {
  const dealValue = Number(args.dealValue)
  if (!Number.isFinite(dealValue) || dealValue <= 0) {
    return deny('dealValue must be a positive number.')
  }

  const projectId = typeof args.projectId === 'string' ? args.projectId : null
  const developerId = typeof args.developerId === 'string' ? args.developerId : null
  const ruleId = typeof args.ruleId === 'string' ? args.ruleId : null

  if (projectId || developerId) {
    const role = ctx.role || 'BUYER'
    if (role === 'DEVELOPER') {
      const allowed = developerId === ctx.developerId
      const projectOk = projectId
        ? !!(await db.project.findFirst({ where: { id: projectId, developerId: ctx.developerId! } }))
        : false
      if (!allowed && !projectOk) return deny('You can only calculate commissions for your own organization.')
    } else if (role === 'BROKER') {
      if (!ctx.brokerId) return deny('No broker profile linked to this account.')
    } else if (role !== 'CEO' && role !== 'ADMIN') {
      return deny('Commission data is available to broker, developer and administrator accounts only.')
    }
  }

  const resolved = await resolveCommissionRule({ projectId, developerId, explicitRuleId: ruleId })
  const amounts = calculateCommission(dealValue, resolved.split)

  return {
    success: true,
    data: {
      dealValue,
      currency: 'EGP',
      ruleSource: resolved.source,
      ruleId: resolved.ruleId,
      split: resolved.split,
      amounts,
      example: `Total ${resolved.split.totalPct}% = ${amounts.totalAmount.toLocaleString()} EGP | EstateAI ${resolved.split.estateaiPct}% = ${amounts.estateaiAmount.toLocaleString()} EGP | Broker ${resolved.split.brokerPct}% = ${amounts.brokerAmount.toLocaleString()} EGP`,
      note: 'Computed server-side from the configured rule. Actual stored commissions are managed by EstateAI — approval/payment status cannot be changed through the assistant.',
    },
  }
}
