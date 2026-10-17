import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireActor } from '@/lib/lead-access'

export const dynamic = 'force-dynamic'

/**
 * The broker portal as JSON.
 *
 * The website renders this data in `src/app/broker/page.tsx` with six direct
 * Prisma queries inside a server component, so unlike the developer portal
 * there was **no HTTP surface at all** for the mobile app to call — the one
 * genuinely missing endpoint in this system. This route mirrors that page
 * query-for-query and returns the same prop shapes `BrokerPortal` receives:
 * one round trip instead of six, and no second implementation of the rules.
 *
 * Scoping mirrors the page exactly: the portal resolves the *signed-in*
 * user's own `BrokerProfile` by `userId` (not `ctx.brokerId`), so CEO/ADMIN —
 * who pass the role gate — land on `profile: null` and the app renders the
 * same "No broker profile yet" state that page does, rather than an error it
 * would have to translate.
 *
 * Broker lead contact details are returned **raw**, matching `/api/leads`,
 * which grants BROKER `'full'` access to leads they own. There is no masking
 * to disagree with.
 */
export async function GET() {
  try {
    const gate = await requireActor(['BROKER'])
    if (!gate.ok) return gate.response
    const { ctx } = gate

    const broker = await db.brokerProfile.findFirst({
      where: { userId: ctx.userId },
      include: { user: { select: { isActive: true, status: true, name: true, email: true, role: true, phone: true } } },
    })

    // Signed in without a broker record attached: the web page renders a
    // "no broker profile yet" screen for exactly this state.
    if (!broker) {
      return NextResponse.json({ profile: null, viewer: { name: null, role: ctx.role } })
    }

    const brokerId = broker.id

    const [
      leadRows,
      leadStatusGroups,
      dealRows,
      commissionRows,
      accessRows,
      viewingRows,
      commissionRules,
    ] = await Promise.all([
      db.lead.findMany({
        where: { brokerId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          leadCode: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          source: true,
          budgetMin: true,
          budgetMax: true,
          notes: true,
          nextFollowUp: true,
          lastActivityAt: true,
          protectionStartsAt: true,
          protectionExpiresAt: true,
          protectionDays: true,
          createdAt: true,
          project: { select: { name: true, slug: true } },
          unit: { select: { name: true } },
          developer: { select: { companyName: true } },
        },
      }),
      db.lead.groupBy({ by: ['status'], where: { brokerId }, _count: { _all: true } }),
      db.deal.findMany({
        where: { brokerId },
        orderBy: { createdAt: 'desc' },
        take: 40,
        select: {
          id: true,
          status: true,
          dealValue: true,
          createdAt: true,
          project: { select: { name: true } },
          developer: { select: { companyName: true } },
          unit: { select: { name: true } },
          commissions: { select: { totalAmount: true, brokerAmount: true, status: true }, take: 1 },
        },
      }),
      db.commission.findMany({
        where: { deal: { brokerId } },
        orderBy: { createdAt: 'desc' },
        take: 40,
        select: {
          id: true,
          status: true,
          totalAmount: true,
          brokerAmount: true,
          dueDate: true,
          paidDate: true,
          createdAt: true,
          deal: { select: { status: true, project: { select: { name: true } } } },
        },
      }),
      db.brokerProjectAccess.findMany({
        where: { brokerId },
        orderBy: { createdAt: 'desc' },
        take: 60,
        select: {
          id: true,
          access: true,
          developerId: true,
          projectId: true,
          expiresAt: true,
          notes: true,
          developer: {
            select: {
              companyName: true,
              projects: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  coverImage: true,
                  startPrice: true,
                  governorate: { select: { name: true } },
                },
              },
            },
          },
          project: {
            select: {
              id: true,
              name: true,
              slug: true,
              coverImage: true,
              startPrice: true,
              governorate: { select: { name: true } },
            },
          },
        },
      }),
      db.viewing.findMany({
        where: { brokerId },
        orderBy: { scheduledAt: 'desc' },
        take: 60,
        select: {
          id: true,
          scheduledAt: true,
          duration: true,
          status: true,
          meetingType: true,
          meetingLink: true,
          contactPhone: true,
          notes: true,
          project: { select: { name: true, slug: true } },
          unit: {
            select: {
              name: true,
              project: { select: { name: true, slug: true } },
            },
          },
          lead: { select: { name: true } },
        },
      }),
      db.commissionRule.findMany({
        where: { isActive: true },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        take: 100,
        select: {
          id: true,
          name: true,
          brokerPct: true,
          totalPct: true,
          estateaiPct: true,
          isDefault: true,
          developerId: true,
          projectId: true,
          developer: { select: { companyName: true } },
          project: { select: { name: true } },
        },
      }),
    ])

    const leads = leadRows.map((l) => ({
      id: l.id,
      leadCode: l.leadCode,
      name: l.name,
      email: l.email,
      phone: l.phone,
      status: l.status,
      source: l.source,
      budgetMin: l.budgetMin,
      budgetMax: l.budgetMax,
      notes: l.notes,
      nextFollowUp: l.nextFollowUp?.toISOString() ?? null,
      lastActivityAt: l.lastActivityAt?.toISOString() ?? null,
      protectionStartsAt: l.protectionStartsAt?.toISOString() ?? null,
      protectionExpiresAt: l.protectionExpiresAt?.toISOString() ?? null,
      protectionDays: l.protectionDays,
      createdAt: l.createdAt.toISOString(),
      projectName: l.project?.name ?? null,
      projectSlug: l.project?.slug ?? null,
      unitName: l.unit?.name ?? null,
      developerName: l.developer?.companyName ?? null,
    }))

    const deals = dealRows.map((d) => ({
      id: d.id,
      status: d.status,
      dealValue: d.dealValue,
      createdAt: d.createdAt.toISOString(),
      projectName: d.project.name,
      developerName: d.developer.companyName,
      unitName: d.unit?.name ?? null,
      commissionAmount: d.commissions[0]?.brokerAmount ?? null,
      commissionStatus: d.commissions[0]?.status ?? null,
    }))

    const commissions = commissionRows.map((c) => ({
      id: c.id,
      status: c.status,
      totalAmount: c.totalAmount,
      brokerAmount: c.brokerAmount,
      dueDate: c.dueDate?.toISOString() ?? null,
      paidDate: c.paidDate?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
      projectName: c.deal.project.name,
      dealStatus: c.deal.status,
    }))

    // Flatten developer-wide access rules into individual projects, exactly
    // as the page does — a single `DEVELOPER` rule can fan out into every
    // project that company owns, so de-duplicate by project id.
    const projects: {
      id: string
      name: string
      slug: string
      coverImage: string | null
      location: string | null
      startPrice: number | null
      developerName: string
      scope: string
      expiresAt: string | null
    }[] = []
    const accessRules: {
      id: string
      scope: string
      access: string
      developerName: string
      projectName: string | null
      projectSlug: string | null
      expiresAt: string | null
      notes: string | null
    }[] = []
    const seen = new Set<string>()
    const myDeveloperIds = new Set<string>()
    const myProjectIds = new Set<string>()
    for (const rule of accessRows) {
      if (rule.access === 'BLOCKED') continue
      if (rule.developerId) myDeveloperIds.add(rule.developerId)
      const targets = rule.project ? [rule.project] : rule.developer?.projects ?? []
      const scope = rule.projectId ? 'PROJECT' : 'DEVELOPER'
      if (rule.projectId) myProjectIds.add(rule.projectId)
      else for (const p of targets) myProjectIds.add(p.id)
      accessRules.push({
        id: rule.id,
        scope,
        access: rule.access,
        developerName: rule.developer?.companyName ?? '',
        projectName: rule.project?.name ?? null,
        projectSlug: rule.project?.slug ?? null,
        expiresAt: rule.expiresAt?.toISOString() ?? null,
        notes: rule.notes,
      })
      for (const p of targets) {
        if (seen.has(p.id)) continue
        seen.add(p.id)
        projects.push({
          id: p.id,
          name: p.name,
          slug: p.slug,
          coverImage: p.coverImage,
          location: p.governorate?.name ?? null,
          startPrice: p.startPrice,
          developerName: rule.developer?.companyName ?? '',
          scope,
          expiresAt: rule.expiresAt?.toISOString() ?? null,
        })
      }
    }

    const applicableRules = commissionRules
      .filter(
        (r) =>
          r.isDefault ||
          (r.developerId != null && myDeveloperIds.has(r.developerId)) ||
          (r.projectId != null && myProjectIds.has(r.projectId))
      )
      .map((r) => ({
        id: r.id,
        name: r.name,
        brokerPct: r.brokerPct,
        totalPct: r.totalPct,
        estateaiPct: r.estateaiPct,
        isDefault: r.isDefault,
        developerName: r.developer?.companyName ?? null,
        projectName: r.project?.name ?? null,
      }))

    const now = new Date()
    const protectedLeads = leadRows.filter(
      (l) => l.protectionExpiresAt && l.protectionExpiresAt.getTime() > now.getTime()
    ).length
    const expiringLeads = leadRows.filter((l) => {
      if (!l.protectionExpiresAt) return false
      const ms = l.protectionExpiresAt.getTime() - now.getTime()
      return ms > 0 && ms <= 7 * 24 * 3600 * 1000
    }).length

    const allViewings = viewingRows.map((v) => ({
      id: v.id,
      scheduledAt: v.scheduledAt.toISOString(),
      duration: v.duration,
      status: v.status,
      meetingType: v.meetingType,
      meetingLink: v.meetingLink,
      contactPhone: v.contactPhone,
      notes: v.notes,
      projectName: v.project?.name ?? v.unit?.project?.name ?? null,
      projectSlug: v.project?.slug ?? v.unit?.project?.slug ?? null,
      unitName: v.unit?.name ?? null,
      leadName: v.lead?.name ?? null,
    }))
    const upcomingViewings = allViewings
      .filter((v) => new Date(v.scheduledAt).getTime() >= now.getTime())
      .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt))
      .slice(0, 20)
    const pastViewings = allViewings
      .filter((v) => new Date(v.scheduledAt).getTime() < now.getTime())
      .sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt))
      .slice(0, 10)

    const statusCounts: Record<string, number> = {}
    for (const g of leadStatusGroups) statusCounts[g.status] = g._count._all

    const closedDeals = deals.filter((d) => d.status === 'SOLD' || d.status === 'CONTRACT')
    const commissionTotal = commissions.reduce((s, c) => s + (c.brokerAmount || 0), 0)
    const commissionPaid = commissions
      .filter((c) => c.status === 'PAID')
      .reduce((s, c) => s + (c.brokerAmount || 0), 0)
    const totalValue = closedDeals.reduce((s, d) => s + (d.dealValue || 0), 0)

    const pipeline = (
      ['NEW', 'CONTACTED', 'QUALIFIED', 'VIEWING', 'NEGOTIATION', 'CONVERTED'] as const
    ).map((s) => ({ status: s, count: statusCounts[s] || 0 }))

    return NextResponse.json({
      profile: {
        id: broker.id,
        agencyName: broker.agencyName,
        agencyNameArabic: broker.agencyNameArabic,
        licenseNumber: broker.licenseNumber,
        bio: broker.bio,
        phone: broker.user.phone,
        isVerified: broker.isVerified,
        rating: broker.rating,
        reviewCount: broker.reviewCount,
        yearsExperience: broker.yearsExperience,
        totalDeals: broker.totalDeals,
        commissionRate: broker.commissionRate,
        accountStatus: broker.user.status,
        isActive: broker.user.isActive,
      },
      viewer: { name: broker.user.name, role: broker.user.role },
      partnership: {
        accessRules,
        commissionRules: applicableRules,
        protectedLeads,
        expiringLeads,
      },
      stats: {
        totalLeads: leads.length,
        statusCounts,
        activeLeads: leads.filter((l) => !['CONVERTED', 'LOST'].includes(l.status)).length,
        deals: deals.length,
        totalValue,
        commissionTotal,
        commissionPaid,
        commissionPending: commissionTotal - commissionPaid,
        projects: projects.length,
      },
      pipeline,
      leads,
      deals,
      commissions,
      projects,
      // Legacy shape kept for existing mobile clients: the next upcoming
      // viewings in the old flat form.
      viewings: upcomingViewings.map((v) => ({
        id: v.id,
        scheduledAt: v.scheduledAt,
        status: v.status,
        meetingType: v.meetingType,
        contactPhone: v.contactPhone,
      })),
      upcomingViewings,
      pastViewings,
    })
  } catch (error) {
    console.error('Broker portal error:', error)
    return NextResponse.json({ error: 'Failed to load the broker portal' }, { status: 500 })
  }
}
