import { db } from '@/lib/db'
import { getAppMode } from '@/lib/app-type'
import { getProtectionConfig } from '@/lib/lead-protection'
import { notifyUser, notifyRole, brokerUserId } from '@/lib/notify'
import { logAudit } from '@/lib/permissions'

// ─── Lead Protection Sweeper ──────────────────────────────
// Server-side automation (Section 24). Runs from instrumentation.ts —
// never depends on a browser being open.
//
// Jobs:
//   1. Backfill missing leadCode / normalized contact / legacy protection fields
//   2. Protection expiring soon → notify the owning broker (once)
//   3. Protection expired → notify + activity + audit (+ optional AUTO_EXPIRE status)
//   4. Inactivity alert → notify the owning broker (once)

export interface SweepSummary {
  ranAt: string
  backfilledCodes: number
  expiringNotified: number
  expiredNotified: number
  autoExpired: number
  inactivityNotified: number
}

interface JobFlags {
  expiringNotified?: string
  expiredNotified?: string
  inactivityNotified?: string
}

function parseFlags(raw: string | null | undefined): JobFlags {
  if (!raw) return {}
  try {
    const p = JSON.parse(raw)
    return p && typeof p === 'object' ? p : {}
  } catch {
    return {}
  }
}

const PRE_DEAL_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'VIEWING', 'INTERESTED', 'VISITED', 'NEGOTIATING']

export async function runLeadSweeper(): Promise<SweepSummary> {
  const config = await getProtectionConfig()
  const now = Date.now()
  const soon = new Date(now + config.expiringSoonDays * 86_400_000)
  const summary: SweepSummary = {
    ranAt: new Date().toISOString(),
    backfilledCodes: 0,
    expiringNotified: 0,
    expiredNotified: 0,
    autoExpired: 0,
    inactivityNotified: 0,
  }

  // ── 1. Backfills (idempotent) ──────────────────────────
  try {
    const legacyLeads = await db.lead.findMany({
      where: {
        OR: [
          { leadCode: null },
          { normalizedPhone: null },
          { AND: [{ brokerId: { not: null } }, { protectionExpiresAt: null }] },
        ],
      },
      select: {
        id: true, leadCode: true, phone: true, email: true, brokerId: true,
        createdAt: true, normalizedPhone: true, normalizedEmail: true,
        protectionExpiresAt: true,
      },
      take: 500,
    })

    for (const lead of legacyLeads) {
      const data: Record<string, unknown> = {}
      if (!lead.leadCode) data.leadCode = await nextCode()
      if (!lead.normalizedPhone && lead.phone) {
        const { normalizePhone } = await import('@/lib/lead-protection')
        data.normalizedPhone = normalizePhone(lead.phone)
      }
      if (!lead.normalizedEmail && lead.email) {
        const { normalizeEmail } = await import('@/lib/lead-protection')
        data.normalizedEmail = normalizeEmail(lead.email)
      }
      if (!lead.protectionExpiresAt && lead.brokerId) {
        const end = new Date(new Date(lead.createdAt).getTime() + config.defaultDays * 86_400_000)
        data.protectionStartsAt = lead.createdAt
        data.protectionExpiresAt = end
        data.protectionDays = config.defaultDays
        data.protectionSource = 'PLATFORM'
      }
      if (Object.keys(data).length > 0) {
        await db.lead.update({ where: { id: lead.id }, data })
        if (data.leadCode) summary.backfilledCodes += 1
      }
    }
  } catch (e) {
    console.error('[sweeper] backfill failed:', e)
  }

  // ── 2. Expiring soon ───────────────────────────────────
  try {
    const expiring = await db.lead.findMany({
      where: {
        protectionExpiresAt: { gt: new Date(now), lte: soon },
        brokerId: { not: null },
        status: { notIn: ['SOLD', 'LOST', 'CANCELLED'] },
      },
      select: { id: true, leadCode: true, name: true, brokerId: true, protectionExpiresAt: true, jobFlags: true },
      take: 300,
    })

    for (const lead of expiring) {
      const flags = parseFlags(lead.jobFlags)
      if (flags.expiringNotified) continue
      const daysLeft = Math.max(1, Math.ceil((new Date(lead.protectionExpiresAt!).getTime() - now) / 86_400_000))
      await notifyUser(await brokerUserId(lead.brokerId), {
        type: 'PROTECTION_EXPIRING',
        title: `Protection expiring — ${lead.leadCode || lead.id.slice(0, 8)}`,
        message: `Attribution for ${lead.name} expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${new Date(lead.protectionExpiresAt!).toISOString().slice(0, 10)}).`,
        link: '/dashboard/leads',
        metadata: { leadId: lead.id },
      })
      await db.lead.update({
        where: { id: lead.id },
        data: { jobFlags: JSON.stringify({ ...flags, expiringNotified: new Date().toISOString() }) },
      })
      summary.expiringNotified += 1
    }
  } catch (e) {
    console.error('[sweeper] expiring-notify failed:', e)
  }

  // ── 3. Expired ─────────────────────────────────────────
  try {
    // Note: no `brokerId` filter here — unassigned leads (e.g. CEO-registered)
    // must still expire: the status change + audit + CEO notification matter
    // regardless of ownership. notifyUser() is a no-op when broker is null.
    const expired = await db.lead.findMany({
      where: {
        protectionExpiresAt: { lte: new Date(now) },
        status: { notIn: ['SOLD', 'LOST', 'CANCELLED'] },
      },
      select: {
        id: true, leadCode: true, name: true, brokerId: true, status: true,
        protectionExpiresAt: true, jobFlags: true, reviewStatus: true,
      },
      take: 300,
    })

    for (const lead of expired) {
      const flags = parseFlags(lead.jobFlags)
      if (flags.expiredNotified) continue

      await notifyUser(await brokerUserId(lead.brokerId), {
        type: 'PROTECTION_EXPIRED',
        title: `Protection expired — ${lead.leadCode || lead.id.slice(0, 8)}`,
        message: `Your attribution window for ${lead.name} ended on ${new Date(lead.protectionExpiresAt!).toISOString().slice(0, 10)}.`,
        link: '/dashboard/leads',
        metadata: { leadId: lead.id },
      })
      await notifyRole(['CEO', 'ADMIN'], {
        type: 'PROTECTION_EXPIRED',
        title: `Protection expired — ${lead.leadCode || ''}`,
        message: `${lead.name}'s lead protection has ended.`,
        link: '/ceo/leads',
        metadata: { leadId: lead.id },
      })
      await db.leadActivity.create({
        data: { leadId: lead.id, type: 'PROTECTION_EXPIRED', content: 'Protection window ended (automated)' },
      })

      // Optional AUTO_EXPIRE of the lead status (pre-deal stages only)
      if (config.expirationBehavior === 'AUTO_EXPIRE' && PRE_DEAL_STATUSES.includes(lead.status)) {
        await db.lead.update({
          where: { id: lead.id },
          data: {
            status: 'EXPIRED',
            lastActivityAt: new Date(now),
            jobFlags: JSON.stringify({ ...flags, expiredNotified: new Date().toISOString() }),
          },
        })
        summary.autoExpired += 1
      } else {
        await db.lead.update({
          where: { id: lead.id },
          data: { jobFlags: JSON.stringify({ ...flags, expiredNotified: new Date().toISOString() }) },
        })
      }
      summary.expiredNotified += 1
    }

    if (summary.expiredNotified > 0) {
      await logAudit({
        action: 'PROTECTION_EXPIRED',
        entity: 'Lead',
        changes: { count: summary.expiredNotified, behavior: config.expirationBehavior },
      })
    }
  } catch (e) {
    console.error('[sweeper] expired failed:', e)
  }

  // ── 4. Inactivity ──────────────────────────────────────
  try {
    const cutoff = new Date(now - config.inactivityDays * 86_400_000)
    const inactive = await db.lead.findMany({
      where: {
        OR: [{ lastActivityAt: { lt: cutoff } }, { AND: [{ lastActivityAt: null }, { createdAt: { lt: cutoff } }] }],
        status: { in: PRE_DEAL_STATUSES },
        brokerId: { not: null },
      },
      select: { id: true, leadCode: true, name: true, brokerId: true, lastActivityAt: true, createdAt: true, jobFlags: true },
      take: 300,
    })

    for (const lead of inactive) {
      const flags = parseFlags(lead.jobFlags)
      if (flags.inactivityNotified) continue
      await notifyUser(await brokerUserId(lead.brokerId), {
        type: 'LEAD_INACTIVE',
        title: `No activity — ${lead.leadCode || lead.id.slice(0, 8)}`,
        message: `${lead.name} has had no activity for ${config.inactivityDays} days. Protection continues regardless of activity.`,
        link: '/dashboard/leads',
        metadata: { leadId: lead.id },
      })
      await db.lead.update({
        where: { id: lead.id },
        data: { jobFlags: JSON.stringify({ ...flags, inactivityNotified: new Date().toISOString() }) },
      })
      summary.inactivityNotified += 1
    }
  } catch (e) {
    console.error('[sweeper] inactivity failed:', e)
  }

  return summary
}

async function nextCode(): Promise<string> {
  const { nextLeadCode } = await import('@/lib/lead-protection')
  return nextLeadCode()
}

// ─── Interval registration (instrumentation.ts) ───────────
const SIX_HOURS = 6 * 60 * 60 * 1000

export function startLeadJobs() {
  const g = globalThis as unknown as { __leadJobsStarted?: boolean }
  if (g.__leadJobsStarted) return
  g.__leadJobsStarted = true

  // Single-owner gating (defense in depth alongside instrumentation.ts):
  // APP_MODE=public never schedules the interval, so the two deployments
  // cannot double-fire notifications. Manual CEO runs via
  // POST /api/ceo/maintenance call runLeadSweeper() directly and are
  // unaffected — they are explicit, authenticated, and one-off.
  if (getAppMode() === 'public') {
    console.log('[lead-sweeper] skipped: APP_MODE=public (console deployment owns periodic jobs)')
    return
  }

  const run = async () => {
    try {
      const summary = await runLeadSweeper()
      const touched =
        summary.backfilledCodes + summary.expiringNotified + summary.expiredNotified + summary.inactivityNotified
      if (touched > 0) console.log('[lead-sweeper]', JSON.stringify(summary))
    } catch (e) {
      console.error('[lead-sweeper] run failed:', e)
    }
  }

  // First pass shortly after boot, then every 6 hours
  setTimeout(run, 45_000)
  const timer = setInterval(run, SIX_HOURS)
  timer.unref?.()
  console.log('[lead-sweeper] scheduled: every 6h (first run in 45s)')
}
