import { db } from '@/lib/db'

// ─── Lead Protection ─────────────────────────────────────
// EstateAI lead protection: the registering broker keeps attribution
// for a configurable window. All configuration lives in SystemSetting
// (key: lead_protection, category: growth) — nothing is hardcoded.

export interface ProtectionConfig {
  defaultDays: number
  expiringSoonDays: number
  allowRenewal: boolean
  maxRenewals: number
  renewalDays: number
  expirationBehavior: 'AUTO_EXPIRE' | 'ALERT_ONLY'
  inactivityDays: number
  developerOverrides: Record<string, number>
  projectOverrides: Record<string, number>
}

export const DEFAULT_PROTECTION_CONFIG: ProtectionConfig = {
  defaultDays: 90,
  expiringSoonDays: 14,
  allowRenewal: true,
  maxRenewals: 2,
  renewalDays: 90,
  expirationBehavior: 'AUTO_EXPIRE',
  inactivityDays: 14,
  developerOverrides: {},
  projectOverrides: {},
}

export type ProtectionStatus = 'NONE' | 'PROTECTED' | 'EXPIRING_SOON' | 'EXPIRED'

export async function getProtectionConfig(): Promise<ProtectionConfig> {
  try {
    const row = await db.systemSetting.findUnique({ where: { key: 'lead_protection' } })
    if (!row) return { ...DEFAULT_PROTECTION_CONFIG }
    const parsed = JSON.parse(row.value)
    return {
      ...DEFAULT_PROTECTION_CONFIG,
      ...parsed,
      developerOverrides: parsed.developerOverrides || {},
      projectOverrides: parsed.projectOverrides || {},
    }
  } catch {
    return { ...DEFAULT_PROTECTION_CONFIG }
  }
}

export function validateProtectionConfig(input: unknown): { ok: true; config: ProtectionConfig } | { ok: false; error: string } {
  const raw = (input || {}) as Record<string, unknown>
  const num = (v: unknown, fallback: number, min: number, max: number): number => {
    const n = typeof v === 'number' ? v : Number(v)
    if (!Number.isFinite(n)) return fallback
    return Math.min(max, Math.max(min, Math.round(n)))
  }
  const behavior = raw.expirationBehavior === 'ALERT_ONLY' ? 'ALERT_ONLY' : 'AUTO_EXPIRE'
  const overrides = (v: unknown): Record<string, number> => {
    if (!v || typeof v !== 'object') return {}
    const out: Record<string, number> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const n = Number(val)
      if (Number.isFinite(n) && n > 0 && n <= 730) out[k] = Math.round(n)
    }
    return out
  }
  const config: ProtectionConfig = {
    defaultDays: num(raw.defaultDays, DEFAULT_PROTECTION_CONFIG.defaultDays, 1, 730),
    expiringSoonDays: num(raw.expiringSoonDays, DEFAULT_PROTECTION_CONFIG.expiringSoonDays, 0, 180),
    allowRenewal: raw.allowRenewal !== false,
    maxRenewals: num(raw.maxRenewals, DEFAULT_PROTECTION_CONFIG.maxRenewals, 0, 99),
    renewalDays: num(raw.renewalDays, DEFAULT_PROTECTION_CONFIG.renewalDays, 1, 730),
    expirationBehavior: behavior,
    inactivityDays: num(raw.inactivityDays, DEFAULT_PROTECTION_CONFIG.inactivityDays, 1, 365),
    developerOverrides: overrides(raw.developerOverrides),
    projectOverrides: overrides(raw.projectOverrides),
  }
  return { ok: true, config }
}

/**
 * Resolution order (most specific wins):
 * 1. project-specific override (config.projectOverrides[projectId])
 * 2. developer partnership period (DeveloperPartnership.leadProtectionDays)
 * 3. developer override (config.developerOverrides[developerId])
 * 4. platform default
 */
export async function resolveProtectionWindow(params: {
  projectId?: string | null
  developerId?: string | null
  config?: ProtectionConfig
}): Promise<{ days: number; source: 'PROJECT' | 'DEVELOPER' | 'PLATFORM' }> {
  const config = params.config || (await getProtectionConfig())
  if (params.projectId && config.projectOverrides[params.projectId]) {
    return { days: config.projectOverrides[params.projectId], source: 'PROJECT' }
  }
  if (params.developerId) {
    const partnership = await db.developerPartnership.findUnique({
      where: { developerId: params.developerId },
      select: { leadProtectionDays: true },
    })
    if (partnership?.leadProtectionDays && partnership.leadProtectionDays > 0) {
      return { days: partnership.leadProtectionDays, source: 'DEVELOPER' }
    }
    if (config.developerOverrides[params.developerId]) {
      return { days: config.developerOverrides[params.developerId], source: 'DEVELOPER' }
    }
  }
  return { days: config.defaultDays, source: 'PLATFORM' }
}

/** Derived, never stored: PROTECTED | EXPIRING_SOON | EXPIRED | NONE */
export function getProtectionStatus(
  lead: { protectionExpiresAt?: Date | string | null },
  config?: ProtectionConfig
): ProtectionStatus {
  if (!lead.protectionExpiresAt) return 'NONE'
  const expires = new Date(lead.protectionExpiresAt).getTime()
  if (!Number.isFinite(expires)) return 'NONE'
  const now = Date.now()
  if (expires < now) return 'EXPIRED'
  const soonDays = (config || DEFAULT_PROTECTION_CONFIG).expiringSoonDays
  if (expires - now <= soonDays * 86_400_000) return 'EXPIRING_SOON'
  return 'PROTECTED'
}

// ─── Normalization for duplicate matching ────────────────

export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  let d = phone.replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('0020')) d = d.slice(4)
  else if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('20') && d.length >= 12) d = d.slice(2)
  if (d.length === 10 && d.startsWith('1')) d = '0' + d
  if (d.length < 7) return null
  return d
}

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null
  const e = email.trim().toLowerCase()
  return e.includes('@') ? e : null
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const d = phone.replace(/\D/g, '')
  if (d.length < 5) return phone
  return `${d.slice(0, 4)}•••••${d.slice(-3)}`
}

export function maskEmail(email: string | null | undefined): string {
  if (!email) return ''
  const [user, domain] = email.split('@')
  if (!domain) return email
  const head = user.slice(0, Math.min(2, user.length))
  return `${head}•••@${domain}`
}

// ─── Lead public id (EA-10482) ───────────────────────────

const LEAD_SEQ_KEY = 'lead_code_seq'

export async function nextLeadCode(): Promise<string> {
  // SQLite serializes writes inside a transaction, so read-modify-write is safe here.
  const code = await db.$transaction(async (tx) => {
    const row = await tx.systemSetting.findUnique({ where: { key: LEAD_SEQ_KEY } })
    let seq = 10481
    if (row) {
      const parsed = parseInt(row.value, 10)
      if (Number.isFinite(parsed)) seq = parsed
    }
    seq += 1
    await tx.systemSetting.upsert({
      where: { key: LEAD_SEQ_KEY },
      update: { value: String(seq), category: 'growth' },
      create: { key: LEAD_SEQ_KEY, value: String(seq), category: 'growth' },
    })
    return `EA-${seq}`
  })
  return code
}

// ─── Duplicate detection ─────────────────────────────────

const LIVE_REVIEW_STATUSES = ['ACTIVE', 'DUPLICATE_REVIEW', 'TRANSFERRED']
const DEAD_LEAD_STATUSES = ['LOST', 'CANCELLED', 'EXPIRED']

export interface DuplicateMatch {
  id: string
  leadCode: string | null
  brokerId: string | null
  name: string
  createdAt: Date
}

/**
 * Finds a possible duplicate by normalized phone/email among live leads.
 * Returns only the minimal identity needed for ownership logic — callers
 * must never expose the other broker's client details to the requester.
 */
export async function findDuplicateLead(params: {
  phone?: string | null
  email?: string | null
  excludeLeadId?: string
}): Promise<DuplicateMatch | null> {
  const np = normalizePhone(params.phone)
  const ne = normalizeEmail(params.email)
  if (!np && !ne) return null

  const or: Record<string, unknown>[] = []
  if (np) or.push({ normalizedPhone: np })
  if (ne) or.push({ normalizedEmail: ne })
  if (or.length === 0) return null

  const match = await db.lead.findFirst({
    where: {
      AND: [
        { OR: or },
        ...(params.excludeLeadId ? [{ id: { not: params.excludeLeadId } }] : []),
        { reviewStatus: { in: LIVE_REVIEW_STATUSES } },
        { status: { notIn: DEAD_LEAD_STATUSES } },
      ],
    },
    select: { id: true, leadCode: true, brokerId: true, name: true, createdAt: true },
    orderBy: { createdAt: 'asc' }, // the earliest registration wins by default
  })
  return match
}
