import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi, logAudit } from '@/lib/permissions'
import { runLeadSweeper } from '@/lib/jobs/lead-sweeper'
import { notifyUser, notifyRole, brokerUserId } from '@/lib/notify'

export const dynamic = 'force-dynamic'

/**
 * Delete watches whose target no longer exists:
 *  - UNIT/PROJECT → the row is gone (deleted). Unpublished-but-present rows
 *    are kept — the target may become visible again.
 *  - CITY → the slug matches no City row. Well-formed slugs for fresh areas
 *    stay followable on purpose (see POST /api/watch), so only slugs that
 *    match no city AND have no project resolving behind them are purged.
 */
async function purgeOrphanWatches(): Promise<{ orphanWatches: number; orphanWatchesByType: Record<string, number> }> {
  const empty = { orphanWatches: 0, orphanWatchesByType: {} as Record<string, number> }
  try {
    const watches = await db.watch.findMany({
      select: { id: true, targetType: true, targetId: true },
      orderBy: { createdAt: 'asc' },
      take: 5000,
    })
    if (watches.length === 0) return empty

    const unitIds = [...new Set(watches.filter((w) => w.targetType === 'UNIT').map((w) => w.targetId))]
    const projectIds = [...new Set(watches.filter((w) => w.targetType === 'PROJECT').map((w) => w.targetId))]
    const citySlugs = [...new Set(watches.filter((w) => w.targetType === 'CITY').map((w) => w.targetId))]

    const [units, projects, cities] = await Promise.all([
      unitIds.length
        ? db.unit.findMany({ where: { id: { in: unitIds } }, select: { id: true } })
        : Promise.resolve([]),
      projectIds.length
        ? db.project.findMany({ where: { id: { in: projectIds } }, select: { id: true } })
        : Promise.resolve([]),
      citySlugs.length
        ? db.city.findMany({ where: { nameSlug: { in: citySlugs } }, select: { nameSlug: true } })
        : Promise.resolve([]),
    ])
    const liveUnits = new Set(units.map((u) => u.id))
    const liveProjects = new Set(projects.map((p) => p.id))
    const liveCities = new Set(cities.map((c) => c.nameSlug).filter(Boolean) as string[])

    const deadCitySlugs = citySlugs.filter((s) => !liveCities.has(s))
    // A city slug with no City row is only dead when no project resolves
    // behind it either (fresh areas stay followable).
    let backedSlugs = new Set<string>()
    if (deadCitySlugs.length > 0) {
      try {
        const backing = await db.project.findMany({
          where: { city: { nameSlug: { in: deadCitySlugs } } },
          select: { city: { select: { nameSlug: true } } },
          take: 500,
        })
        backedSlugs = new Set(
          backing.map((p) => p.city?.nameSlug).filter((s): s is string => !!s),
        )
      } catch {
        backedSlugs = new Set<string>()
      }
    }

    const orphanIds: string[] = []
    const byType: Record<string, number> = {}
    for (const w of watches) {
      let dead = false
      if (w.targetType === 'UNIT') dead = !liveUnits.has(w.targetId)
      else if (w.targetType === 'PROJECT') dead = !liveProjects.has(w.targetId)
      else if (w.targetType === 'CITY') dead = !liveCities.has(w.targetId) && !backedSlugs.has(w.targetId)
      else dead = false // unknown types are left for a human to inspect
      if (dead) {
        orphanIds.push(w.id)
        byType[w.targetType] = (byType[w.targetType] ?? 0) + 1
      }
    }

    if (orphanIds.length > 0) {
      await db.watch.deleteMany({ where: { id: { in: orphanIds } } })
    }
    return { orphanWatches: orphanIds.length, orphanWatchesByType: byType }
  } catch (e) {
    console.error('[maintenance] orphan-watch purge failed:', e)
    return empty
  }
}

function parseJobFlags(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    const p = JSON.parse(raw)
    return p && typeof p === 'object' ? (p as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

// ─── Sweep A: auto-suspend brokers with zero activity ───────
// RULE (defined from available fields only): a broker is suspended when ALL
// of these hold — (1) account older than INACTIVITY_SUSPEND_DAYS (never
// suspend brand-new accounts), (2) User.lastLoginAt is null or older than
// the cutoff (no logins), (3) none of their leads show activity in the
// window (Lead.lastActivityAt, falling back to updatedAt), (4) no deals
// created in the window. Uses the EXISTING suspend path — the same
// User.status='SUSPENDED' + isActive=false write as DELETE
// /api/ceo/brokers/[id] soft-ban — never a new mechanism. Each suspension
// is audited (BROKER_AUTO_SUSPENDED). The CEO (not the broker) is notified
// once with the list — a suspended account cannot act on a notice, and the
// CEO must review/reactivate. Every broker is attempted independently
// (fail-soft) and the run is capped.
const INACTIVITY_SUSPEND_DAYS = 30

async function autoSuspendInactiveBrokers(): Promise<{ autoSuspended: number; autoSuspendedIds: string[] }> {
  const out = { autoSuspended: 0, autoSuspendedIds: [] as string[] }
  try {
    const cutoff = new Date(Date.now() - INACTIVITY_SUSPEND_DAYS * 86_400_000)
    const candidates = await db.user.findMany({
      where: { role: 'BROKER', status: 'ACTIVE', isActive: true, createdAt: { lt: cutoff } },
      select: { id: true, email: true, lastLoginAt: true },
      take: 200,
    })
    const stale = candidates.filter((u) => !u.lastLoginAt || u.lastLoginAt < cutoff)
    if (stale.length === 0) return out

    const profiles = await db.brokerProfile.findMany({
      where: { userId: { in: stale.map((u) => u.id) } },
      select: { id: true, userId: true },
    })
    const profileByUser = new Map(profiles.map((p) => [p.userId, p.id]))
    const profileIds = [...profileByUser.values()]

    const activeProfiles = new Set<string>()
    if (profileIds.length > 0) {
      const [recentLeads, recentDeals] = await Promise.all([
        db.lead.findMany({
          where: {
            brokerId: { in: profileIds },
            OR: [
              { lastActivityAt: { gte: cutoff } },
              { AND: [{ lastActivityAt: null }, { updatedAt: { gte: cutoff } }] },
            ],
          },
          select: { brokerId: true },
          take: 2000,
        }),
        db.deal.findMany({
          where: { brokerId: { in: profileIds }, createdAt: { gte: cutoff } },
          select: { brokerId: true },
          take: 2000,
        }),
      ])
      for (const r of [...recentLeads, ...recentDeals]) {
        if (r.brokerId) activeProfiles.add(r.brokerId)
      }
    }

    for (const u of stale) {
      try {
        const pid = profileByUser.get(u.id)
        if (pid && activeProfiles.has(pid)) continue
        // EXISTING suspend path (mirrors the broker soft-ban exactly).
        await db.user.update({
          where: { id: u.id },
          data: { status: 'SUSPENDED', isActive: false },
        })
        await logAudit({
          action: 'BROKER_AUTO_SUSPENDED',
          entity: 'BrokerProfile',
          entityId: pid,
          changes: {
            email: u.email,
            reason: `No login, lead, or deal activity for ${INACTIVITY_SUSPEND_DAYS} days`,
          },
        })
        out.autoSuspended += 1
        out.autoSuspendedIds.push(u.id)
      } catch (e) {
        console.error('[maintenance] auto-suspend failed for', u.id, e)
      }
    }

    if (out.autoSuspended > 0) {
      await notifyRole(['CEO', 'ADMIN'], {
        type: 'BROKER_AUTO_SUSPENDED',
        title: `${out.autoSuspended} inactive broker${out.autoSuspended === 1 ? '' : 's'} auto-suspended`,
        message: `Accounts with no activity for ${INACTIVITY_SUSPEND_DAYS} days were suspended. Review and reactivate if needed.`,
        link: '/ceo/brokers',
        metadata: { userIds: out.autoSuspendedIds },
      })
    }
  } catch (e) {
    console.error('[maintenance] auto-suspend sweep failed:', e)
  }
  return out
}

// ─── Sweep B: overdue follow-up reminders ──────────────────
// RULE: leads with Lead.nextFollowUp in the past, an owning broker, and an
// open status are reminded to the owning broker. Dedupe mirrors the
// price-alert pattern (Watch.snapshot: only notify on real change) — the
// notified nextFollowUp value is stored in Lead.jobFlags
// (followUpNotifiedFor); a lead is skipped when its current nextFollowUp
// matches the stored stamp, and becomes eligible again when the broker sets
// a new follow-up date that later goes overdue. Fail-soft per lead.
async function sendFollowUpReminders(): Promise<{ followUpReminded: number }> {
  let followUpReminded = 0
  try {
    const now = new Date()
    const due = await db.lead.findMany({
      where: {
        nextFollowUp: { lte: now },
        brokerId: { not: null },
        status: { notIn: ['SOLD', 'CONVERTED', 'LOST', 'CANCELLED', 'EXPIRED'] },
      },
      select: {
        id: true, leadCode: true, name: true, brokerId: true,
        nextFollowUp: true, jobFlags: true,
      },
      take: 300,
    })

    for (const lead of due) {
      try {
        if (!lead.nextFollowUp) continue
        const flags = parseJobFlags(lead.jobFlags)
        const stamp = lead.nextFollowUp.toISOString()
        if (flags.followUpNotifiedFor === stamp) continue
        await notifyUser(await brokerUserId(lead.brokerId), {
          type: 'FOLLOW_UP_DUE',
          title: `Follow-up overdue — ${lead.leadCode || lead.id.slice(0, 8)}`,
          message: `Follow-up with ${lead.name} was due ${stamp.slice(0, 10)}. Reach out to keep the deal moving.`,
          link: '/dashboard/leads',
          metadata: { leadId: lead.id },
        })
        await db.lead.update({
          where: { id: lead.id },
          data: { jobFlags: JSON.stringify({ ...flags, followUpNotifiedFor: stamp }) },
        })
        followUpReminded += 1
      } catch (e) {
        console.error('[maintenance] follow-up reminder failed for', lead.id, e)
      }
    }
  } catch (e) {
    console.error('[maintenance] follow-up sweep failed:', e)
  }
  return { followUpReminded }
}

// ─── POST /api/ceo/maintenance — run the lead sweeper now ──
// Server-side automation trigger for administrators (also used by the
// CEO Protection tab's "Run maintenance now" button).
export async function POST() {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error

    const summary = await runLeadSweeper()
    // Orphan-Watch purge: a watch whose target row is gone (deleted unit /
    // project, or a city slug with no City row and no project behind it) is
    // deleted so the table never accumulates dead rows. Reported in the
    // summary counts alongside the sweeper numbers.
    const orphan = await purgeOrphanWatches()
    // CEO power sweeps (fail-soft, counts merged into the same summary):
    // inactive-broker auto-suspend + overdue follow-up reminders.
    const auto = await autoSuspendInactiveBrokers()
    const followUps = await sendFollowUpReminders()
    await logAudit({
      userId: (session!.user as any)?.id,
      action: 'MAINTENANCE_RUN',
      entity: 'Lead',
      changes: { ...summary, ...orphan, ...auto, ...followUps } as unknown as Record<string, unknown>,
    })

    return NextResponse.json({ summary: { ...summary, ...orphan, ...auto, ...followUps } })
  } catch (err) {
    console.error('Maintenance run error:', err)
    return NextResponse.json({ error: 'Maintenance run failed' }, { status: 500 })
  }
}
