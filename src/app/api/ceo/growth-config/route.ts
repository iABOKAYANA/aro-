import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi, logAudit } from '@/lib/permissions'
import { commissionRuleSchema } from '@/lib/validations'
import {
  getProtectionConfig,
  validateProtectionConfig,
} from '@/lib/lead-protection'
import {
  getCommissionDefaults,
  validateSplit,
  DEFAULT_COMMISSION_SPLIT,
  type CommissionSplit,
} from '@/lib/commission'

export const dynamic = 'force-dynamic'

// ─── GET /api/ceo/growth-config — CEO settings (read) ─────
export async function GET() {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const [protection, commissionDefaults, rules] = await Promise.all([
      getProtectionConfig(),
      getCommissionDefaults(),
      db.commissionRule.findMany({
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        include: {
          developer: { select: { id: true, companyName: true } },
          project: { select: { id: true, name: true } },
        },
      }),
    ])

    return NextResponse.json({ protection, commissionDefaults, rules })
  } catch (error) {
    console.error('Growth config GET error:', error)
    return NextResponse.json({ error: 'Failed to load config' }, { status: 500 })
  }
}

// ─── POST /api/ceo/growth-config — settings (write) ───────
// body.type: 'PROTECTION' | 'COMMISSION_DEFAULTS' | 'RULE_CREATE' | 'RULE_UPDATE' | 'RULE_DELETE'
export async function POST(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error
    const actorId = (session!.user as any)?.id as string

    const body = await req.json()
    const type = body.type as string

    if (type === 'PROTECTION') {
      const validated = validateProtectionConfig(body.config)
      if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })
      await db.systemSetting.upsert({
        where: { key: 'lead_protection' },
        update: { value: JSON.stringify(validated.config), category: 'growth' },
        create: { key: 'lead_protection', value: JSON.stringify(validated.config), category: 'growth' },
      })
      await logAudit({
        userId: actorId,
        action: 'PROTECTION_CONFIG_UPDATED',
        entity: 'SystemSetting',
        entityId: 'lead_protection',
        changes: { config: validated.config, previous: await getProtectionConfig() },
      })
      return NextResponse.json({ protection: validated.config })
    }

    if (type === 'COMMISSION_DEFAULTS') {
      const raw = body.config || {}
      const split: CommissionSplit = {
        totalPct: Number(raw.totalPct ?? raw.total ?? DEFAULT_COMMISSION_SPLIT.totalPct),
        estateaiPct: Number(raw.estateaiPct ?? raw.estateai ?? DEFAULT_COMMISSION_SPLIT.estateaiPct),
        brokerPct: Number(raw.brokerPct ?? raw.broker ?? DEFAULT_COMMISSION_SPLIT.brokerPct),
        otherPct: Number(raw.otherPct ?? raw.other ?? DEFAULT_COMMISSION_SPLIT.otherPct),
        otherLabel: typeof raw.otherLabel === 'string' ? raw.otherLabel : null,
      }
      const valid = validateSplit(split)
      if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 })
      await db.systemSetting.upsert({
        where: { key: 'commission_defaults' },
        update: { value: JSON.stringify(split), category: 'growth' },
        create: { key: 'commission_defaults', value: JSON.stringify(split), category: 'growth' },
      })
      await logAudit({
        userId: actorId,
        action: 'COMMISSION_DEFAULTS_UPDATED',
        entity: 'SystemSetting',
        entityId: 'commission_defaults',
        changes: { next: split, previous: await getCommissionDefaults() },
      })
      return NextResponse.json({ commissionDefaults: split })
    }

    if (type === 'RULE_CREATE' || type === 'RULE_UPDATE') {
      const parsed = commissionRuleSchema.safeParse(body.rule)
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid rule' }, { status: 400 })
      }
      const r = parsed.data
      const valid = validateSplit({
        totalPct: r.totalPct,
        estateaiPct: r.estateaiPct,
        brokerPct: r.brokerPct,
        otherPct: r.otherPct,
        otherLabel: r.otherLabel ?? null,
      })
      if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 })

      const data = {
        name: r.name,
        developerId: r.developerId || null,
        projectId: r.projectId || null,
        totalPct: r.totalPct,
        estateaiPct: r.estateaiPct,
        brokerPct: r.brokerPct,
        otherPct: r.otherPct,
        otherLabel: r.otherLabel || null,
        minDealValue: r.minDealValue ?? null,
        maxDealValue: r.maxDealValue ?? null,
        isActive: r.isActive,
        isDefault: r.isDefault,
        priority: r.priority,
      }

      if (type === 'RULE_CREATE') {
        if (r.isDefault) {
          await db.commissionRule.updateMany({ where: { isDefault: true }, data: { isDefault: false } })
        }
        const rule = await db.commissionRule.create({ data: { ...data, createdById: actorId } })
        await logAudit({ userId: actorId, action: 'COMMISSION_RULE_CREATED', entity: 'CommissionRule', entityId: rule.id, changes: data })
        return NextResponse.json({ rule }, { status: 201 })
      }

      if (!body.ruleId) return NextResponse.json({ error: 'ruleId required' }, { status: 400 })
      if (r.isDefault) {
        await db.commissionRule.updateMany({ where: { isDefault: true, id: { not: body.ruleId } }, data: { isDefault: false } })
      }
      const rule = await db.commissionRule.update({ where: { id: body.ruleId }, data })
      await logAudit({ userId: actorId, action: 'COMMISSION_RULE_UPDATED', entity: 'CommissionRule', entityId: rule.id, changes: data })
      return NextResponse.json({ rule })
    }

    if (type === 'RULE_DELETE') {
      if (!body.ruleId) return NextResponse.json({ error: 'ruleId required' }, { status: 400 })
      // Never break historical commission rows: detach instead of cascade-fail
      const used = await db.commission.count({ where: { ruleId: body.ruleId } })
      if (used > 0) {
        await db.commissionRule.update({ where: { id: body.ruleId }, data: { isActive: false, isDefault: false } })
        await logAudit({ userId: actorId, action: 'COMMISSION_RULE_DEACTIVATED', entity: 'CommissionRule', entityId: body.ruleId, changes: { usedBy: used } })
        return NextResponse.json({ deactivated: true, usedBy: used })
      }
      await db.commissionRule.delete({ where: { id: body.ruleId } })
      await logAudit({ userId: actorId, action: 'COMMISSION_RULE_DELETED', entity: 'CommissionRule', entityId: body.ruleId })
      return NextResponse.json({ deleted: true })
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
  } catch (err) {
    console.error('Growth config POST error:', err)
    return NextResponse.json({ error: 'Failed to save config' }, { status: 500 })
  }
}
