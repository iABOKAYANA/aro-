import { Metadata } from 'next'
import { db } from '@/lib/db'
import { requirePortalUser } from '@/lib/portal'
import BrokerPortal from '@/components/portal/broker-portal'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Broker Portal',
  description: 'Your leads, deals, commissions and approved projects in one place.',
  robots: { index: false },
}

type LeadRow = {
  id: string
  leadCode: string | null
  name: string
  email: string | null
  phone: string
  status: string
  source: string
  budgetMin: number | null
  budgetMax: number | null
  notes: string | null
  nextFollowUp: string | null
  lastActivityAt: string | null
  protectionStartsAt: string | null
  protectionExpiresAt: string | null
  protectionDays: number | null
  createdAt: string
  projectName: string | null
  projectSlug: string | null
  unitName: string | null
  developerName: string | null
}

type DealRow = {
  id: string
  status: string
  dealValue: number | null
  createdAt: string
  projectName: string
  developerName: string
  unitName: string | null
  commissionAmount: number | null
  commissionStatus: string | null
}

type ProjectRow = {
  id: string
  name: string
  slug: string
  coverImage: string | null
  location: string | null
  startPrice: number | null
  developerName: string
  scope: string
  expiresAt: string | null
}

type ViewingRow = {
  id: string
  scheduledAt: string
  duration: number
  status: string
  meetingType: string
  meetingLink: string | null
  contactPhone: string | null
  notes: string | null
  projectName: string | null
  projectSlug: string | null
  unitName: string | null
  leadName: string | null
}

type AccessRuleRow = {
  id: string
  scope: string
  access: string
  developerName: string
  projectName: string | null
  projectSlug: string | null
  expiresAt: string | null
  notes: string | null
}

type CommissionRuleRow = {
  id: string
  name: string
  brokerPct: number
  totalPct: number
  estateaiPct: number
  isDefault: boolean
  developerName: string | null
  projectName: string | null
}

export default async function BrokerPortalPage() {
  const user = await requirePortalUser('BROKER')

  const broker = await db.brokerProfile.findUnique({
    where: { userId: user.id },
    include: { user: { select: { isActive: true, status: true, phone: true } } },
  })

  if (!broker) {
    return (
      <div className="container px-4 py-24">
        <div className="relative mx-auto max-w-lg overflow-hidden rounded-2xl border border-estate-gold/20 bg-white/[0.04] p-10 text-center dark:border-[#D4A843]/20 dark:bg-[#0A0A0A]">
          <div className="mashrabiya pointer-events-none absolute inset-0 opacity-30" aria-hidden="true" />
          <div className="relative">
          <p className="section-kicker">Broker portal</p>
          <h1 className="font-display display-3 mt-3 text-white">No broker profile yet</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Your account is signed in as <span className="text-estate-gold">{user.email}</span>, but
            it doesn&apos;t have a broker profile attached. Ask an administrator to link one, or
            request access again.
          </p>
          </div>
        </div>
      </div>
    )
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

  const leads: LeadRow[] = leadRows.map((l) => ({
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

  const deals: DealRow[] = dealRows.map((d) => ({
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

  // Flatten developer-wide access rules into individual projects.
  const projects: ProjectRow[] = []
  const accessRules: AccessRuleRow[] = []
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

  // Commission rules that can apply to this broker: the platform default plus
  // rules scoped to developers / projects they have access to.
  const applicableRules: CommissionRuleRow[] = commissionRules
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

  const allViewings: ViewingRow[] = viewingRows.map((v) => ({
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

  const pipeline = (['NEW', 'CONTACTED', 'QUALIFIED', 'VIEWING', 'NEGOTIATION', 'CONVERTED'] as const).map(
    (s) => ({ status: s, count: statusCounts[s] || 0 })
  )

  return (
    <BrokerPortal
      profile={{
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
      }}
      viewer={{ name: user.name, role: user.role }}
      partnership={{
        accessRules,
        commissionRules: applicableRules,
        protectedLeads,
        expiringLeads,
      }}
      stats={{
        totalLeads: leads.length,
        statusCounts,
        activeLeads:
          leads.filter((l) => !['CONVERTED', 'LOST'].includes(l.status)).length,
        deals: deals.length,
        totalValue,
        commissionTotal,
        commissionPaid,
        commissionPending: commissionTotal - commissionPaid,
        projects: projects.length,
      }}
      pipeline={pipeline}
      leads={leads}
      deals={deals}
      commissions={commissions}
      projects={projects}
      upcomingViewings={upcomingViewings}
      pastViewings={pastViewings}
    />
  )
}
