import { db } from '@/lib/db'

// ─── Commission Engine ───────────────────────────────────
// Fully configurable — no hardcoded percentages. Rules are resolved
// server-side in this order (most specific wins):
//   1. explicit ruleId passed by an authorized CEO/Admin (tier bounds are
//      NOT evaluated — an explicit CEO choice always wins, even if the deal
//      value falls outside the rule's [minDealValue, maxDealValue) band).
//      Gated by `allowExplicitRule`: callers must pass true only for
//      CEO/Admin-authorized use. Non-privileged callers can never dictate
//      commission math via ruleId — their explicitRuleId is ignored.
//   2. project TIERED rule (projectId match + dealValue in [minDealValue,
//      maxDealValue); a null bound is open-ended; highest priority first).
//   3. project untiered rule (projectId match, both bounds null; highest
//      priority first — this is the pre-tiers query plus a bounds-null
//      filter, so it returns byte-identical results while no tiered rules
//      exist at this scope).
//   4. developer TIERED rule (developerId match, projectId IS NULL + tier
//      match; highest priority first).
//   5. developer untiered rule (developerId match, projectId IS NULL, both
//      bounds null — same back-compat note as (3)).
//   6. platform default rule (isDefault — deliberately UNCHANGED: no tier
//      evaluation, no bounds filter. RULE_CREATE/UPDATE enforces a single
//      isDefault row, so value tiers cannot be expressed at the default
//      scope without breaking that invariant; tiers are a
//      project/developer-scoping feature).
//   7. SystemSetting "commission_defaults" fallback
// Tier semantics: a rule with minDealValue and/or maxDealValue set matches
// only when a finite dealValue is known and min <= dealValue < max
// (half-open interval; null bound = open). Tiered rules always beat
// untiered rules WITHIN the same scope specificity; scope specificity
// (project > developer > default) always beats tiering. When no finite
// dealValue is passed, tiered rules cannot be evaluated and are skipped,
// so callers that omit dealValue get exactly the pre-tiers behavior
// (modulo the bounds-null filter, which is a no-op while no tiered rules
// exist — the current production state).
// All amounts are computed here, on the server, and validated.

export interface CommissionSplit {
  totalPct: number
  estateaiPct: number
  brokerPct: number
  otherPct: number
  otherLabel: string | null
}

export const DEFAULT_COMMISSION_SPLIT: CommissionSplit = {
  totalPct: 4,
  estateaiPct: 1,
  brokerPct: 3,
  otherPct: 0,
  otherLabel: null,
}

export async function getCommissionDefaults(): Promise<CommissionSplit> {
  try {
    const row = await db.systemSetting.findUnique({ where: { key: 'commission_defaults' } })
    if (!row) return { ...DEFAULT_COMMISSION_SPLIT }
    const parsed = JSON.parse(row.value)
    return { ...DEFAULT_COMMISSION_SPLIT, ...parsed }
  } catch {
    return { ...DEFAULT_COMMISSION_SPLIT }
  }
}

/** Splits must be non-negative numbers and add up to the total (±0.01 rounding). */
export function validateSplit(split: CommissionSplit): { ok: true } | { ok: false; error: string } {
  const parts = [split.totalPct, split.estateaiPct, split.brokerPct, split.otherPct]
  for (const p of parts) {
    if (!Number.isFinite(p) || p < 0 || p > 100) {
      return { ok: false, error: 'Percentages must be between 0 and 100' }
    }
  }
  const sum = split.estateaiPct + split.brokerPct + split.otherPct
  if (Math.abs(sum - split.totalPct) > 0.01) {
    return { ok: false, error: `EstateAI + Broker + Other (${sum}%) must equal total (${split.totalPct}%)` }
  }
  return { ok: true }
}

export interface CommissionAmounts {
  totalAmount: number
  estateaiAmount: number
  brokerAmount: number
  otherAmount: number
}

/** Deterministic server-side calculation: amount = dealValue * pct / 100. */
export function calculateCommission(dealValue: number, split: CommissionSplit): CommissionAmounts {
  const r2 = (n: number) => Math.round(n * 100) / 100
  return {
    totalAmount: r2(dealValue * (split.totalPct / 100)),
    estateaiAmount: r2(dealValue * (split.estateaiPct / 100)),
    brokerAmount: r2(dealValue * (split.brokerPct / 100)),
    otherAmount: r2(dealValue * (split.otherPct / 100)),
  }
}

function ruleToSplit(rule: {
  totalPct: number
  estateaiPct: number
  brokerPct: number
  otherPct: number
  otherLabel: string | null
}): CommissionSplit {
  return {
    totalPct: rule.totalPct,
    estateaiPct: rule.estateaiPct,
    brokerPct: rule.brokerPct,
    otherPct: rule.otherPct,
    otherLabel: rule.otherLabel,
  }
}

export interface ResolvedRule {
  ruleId: string | null
  split: CommissionSplit
  source: 'EXPLICIT' | 'PROJECT' | 'DEVELOPER' | 'DEFAULT_RULE' | 'FALLBACK'
}

type TierBounds = {
  minDealValue: number | null
  maxDealValue: number | null
}

/** True when the rule carries a value tier (either bound set). */
export function isTieredRule(rule: TierBounds): boolean {
  return rule.minDealValue != null || rule.maxDealValue != null
}

/**
 * Half-open tier match: dealValue in [minDealValue, maxDealValue).
 * A null bound is open-ended. Untiered rules always match; tiered rules
 * match only when a finite dealValue is supplied and falls in the band.
 */
export function matchesTier(rule: TierBounds, dealValue: number | null | undefined): boolean {
  if (!isTieredRule(rule)) return true
  if (typeof dealValue !== 'number' || !Number.isFinite(dealValue)) return false
  if (rule.minDealValue != null && dealValue < rule.minDealValue) return false
  if (rule.maxDealValue != null && dealValue >= rule.maxDealValue) return false
  return true
}

export async function resolveCommissionRule(params: {
  projectId?: string | null
  developerId?: string | null
  explicitRuleId?: string | null
  dealValue?: number | null
  /** Must be true for the explicit-rule path to apply. Route handlers pass
   *  this only for CEO/Admin-authorized callers; defaults to false so a
   *  non-privileged caller can never dictate commission math via ruleId. */
  allowExplicitRule?: boolean
}): Promise<ResolvedRule> {
  // Explicit ruleId is CEO/Admin-only. Without `allowExplicitRule` the id is
  // ignored entirely (falls through to normal scope resolution below).
  if (params.explicitRuleId && params.allowExplicitRule) {
    const rule = await db.commissionRule.findUnique({ where: { id: params.explicitRuleId } })
    if (rule && rule.isActive) {
      return { ruleId: rule.id, split: ruleToSplit(rule), source: 'EXPLICIT' }
    }
  }

  const dealValue =
    typeof params.dealValue === 'number' && Number.isFinite(params.dealValue)
      ? params.dealValue
      : null

  if (params.projectId) {
    // (2) Project tiered rules beat project untiered rules. Bounds are
    // evaluated in JS for exact half-open semantics; priority breaks ties.
    if (dealValue !== null) {
      const tiered = await db.commissionRule.findMany({
        where: {
          projectId: params.projectId,
          isActive: true,
          OR: [{ minDealValue: { not: null } }, { maxDealValue: { not: null } }],
        },
        orderBy: { priority: 'desc' },
      })
      const hit = tiered.find((r) => matchesTier(r, dealValue))
      if (hit) return { ruleId: hit.id, split: ruleToSplit(hit), source: 'PROJECT' }
    }
    // (3) Pre-tiers project query + bounds-null filter (no-op while no
    // tiered rules exist at this scope → byte-identical back-compat).
    const rule = await db.commissionRule.findFirst({
      where: { projectId: params.projectId, isActive: true, minDealValue: null, maxDealValue: null },
      orderBy: { priority: 'desc' },
    })
    if (rule) return { ruleId: rule.id, split: ruleToSplit(rule), source: 'PROJECT' }
  }

  if (params.developerId) {
    // (4) Developer tiered rules beat developer untiered rules.
    if (dealValue !== null) {
      const tiered = await db.commissionRule.findMany({
        where: {
          developerId: params.developerId,
          projectId: null,
          isActive: true,
          OR: [{ minDealValue: { not: null } }, { maxDealValue: { not: null } }],
        },
        orderBy: { priority: 'desc' },
      })
      const hit = tiered.find((r) => matchesTier(r, dealValue))
      if (hit) return { ruleId: hit.id, split: ruleToSplit(hit), source: 'DEVELOPER' }
    }
    // (5) Pre-tiers developer query + bounds-null filter (same back-compat
    // note as (3)).
    const rule = await db.commissionRule.findFirst({
      where: { developerId: params.developerId, projectId: null, isActive: true, minDealValue: null, maxDealValue: null },
      orderBy: { priority: 'desc' },
    })
    if (rule) return { ruleId: rule.id, split: ruleToSplit(rule), source: 'DEVELOPER' }
  }

  // (6) Platform default — intentionally untouched by tiering (see header).
  const defaultRule = await db.commissionRule.findFirst({
    where: { isDefault: true, isActive: true, developerId: null, projectId: null },
  })
  if (defaultRule) return { ruleId: defaultRule.id, split: ruleToSplit(defaultRule), source: 'DEFAULT_RULE' }

  return { ruleId: null, split: await getCommissionDefaults(), source: 'FALLBACK' }
}

/**
 * Creates (or refreshes) the Commission row for a deal. Called whenever a
 * deal gets a value. Never trusts client-provided amounts.
 */
export async function syncDealCommission(params: {
  dealId: string
  dealValue: number
  projectId: string
  developerId: string
  explicitRuleId?: string | null
  /** Forwarded to resolveCommissionRule: only true for CEO/Admin-authorized
   *  callers. Defaults to false (explicit ruleId ignored). */
  allowExplicitRule?: boolean
}): Promise<{ id: string } | null> {
  if (!Number.isFinite(params.dealValue) || params.dealValue <= 0) return null

  const resolved = await resolveCommissionRule({
    projectId: params.projectId,
    developerId: params.developerId,
    explicitRuleId: params.explicitRuleId || null,
    dealValue: params.dealValue,
    allowExplicitRule: params.allowExplicitRule ?? false,
  })
  const amounts = calculateCommission(params.dealValue, resolved.split)

  const data = {
    ruleId: resolved.ruleId,
    dealValue: params.dealValue,
    totalPct: resolved.split.totalPct,
    estateaiPct: resolved.split.estateaiPct,
    brokerPct: resolved.split.brokerPct,
    otherPct: resolved.split.otherPct,
    otherLabel: resolved.split.otherLabel,
    ...amounts,
  }

  const existing = await db.commission.findFirst({ where: { dealId: params.dealId } })
  if (existing) {
    // Never silently recompute a commission that left PENDING (approved/paid/disputed)
    if (existing.status !== 'PENDING') return { id: existing.id }
    const updated = await db.commission.update({ where: { id: existing.id }, data })
    return { id: updated.id }
  }

  const created = await db.commission.create({ data: { dealId: params.dealId, ...data } })
  return { id: created.id }
}
