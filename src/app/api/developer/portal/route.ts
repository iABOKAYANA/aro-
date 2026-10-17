import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireActor } from '@/lib/lead-access'

export const dynamic = 'force-dynamic'

/**
 * The developer portal as JSON.
 *
 * The website renders the same data in `src/app/developer/page.tsx` with five
 * direct Prisma queries inside a server component, so there was no HTTP surface
 * for the mobile app to call. This route mirrors that page query-for-query and
 * returns the exact prop shapes `DeveloperPortal` receives — one round trip
 * instead of five, and no second implementation of the business rules.
 *
 * Scoping mirrors `src/app/developer/page.tsx` exactly: the portal always
 * resolves the *signed-in* user's company. `canOpenPortal()` lets CEO/ADMIN in
 * as a preview, that page then looks up a `DeveloperProfile` by their own
 * userId and misses, and renders "No developer profile yet" — so this route
 * returns the same `profile: null` shape rather than an error the app would
 * have to translate.
 *
 * Lead contact details are masked for DEVELOPER exactly the way `/api/leads`
 * masks them (`leadAccessLevel` is `'masked'` for that role), so the portal and
 * the leads tab never disagree about who may read a raw phone number.
 *
 * `editMode` (`DIRECT`|`REQUEST`, default REQUEST) is the caller's own
 * DeveloperProfile permission mode, so mobile can tell upfront whether
 * PATCH/DELETE will answer 403 `{ requestOnly: true }` instead of
 * discovering it one failed write at a time.
 */
export async function GET() {
  try {
    const gate = await requireActor(['DEVELOPER'])
    if (!gate.ok) return gate.response
    const { ctx } = gate

    const developerId = ctx.developerId

    if (!developerId) {
      // Signed in as someone with no company record linked: the web page
      // renders a "no developer profile yet" screen for exactly this state.
      return NextResponse.json({ profile: null, viewer: viewerOf(ctx) })
    }

    const developer = await db.developerProfile.findUnique({
      where: { id: developerId },
      include: { user: { select: { isActive: true, status: true, name: true, email: true, role: true } } },
    })

    // `developerId` is the caller's own, resolved from their userId a moment
    // ago, so there is no other row this can be — but a deleted profile is
    // still a 404 rather than a half-populated portal.
    if (!developer) return NextResponse.json({ error: 'Developer not found' }, { status: 404 })

    const [projectRows, partnership, leadRows, dealRows, commissionRows] = await Promise.all([
      db.project.findMany({
        where: { developerId },
        orderBy: { createdAt: 'desc' },
        take: 60,
        select: {
          id: true,
          name: true,
          slug: true,
          coverImage: true,
          status: true,
          approvalStatus: true,
          startPrice: true,
          totalUnits: true,
          completionPercent: true,
          deliveryDate: true,
          isActive: true,
          isFeatured: true,
          viewCount: true,
          favoriteCount: true,
          inquiryCount: true,
          createdAt: true,
          governorate: { select: { name: true } },
          // Buyable inventory only — showcase samples excluded from the count.
          _count: { select: { units: { where: { isSample: false } }, leads: true, deals: true } },
        },
      }),
      db.developerPartnership.findUnique({ where: { developerId } }),
      db.lead.findMany({
        where: { OR: [{ developerId }, { project: { developerId } }] },
        orderBy: { createdAt: 'desc' },
        take: 40,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          status: true,
          source: true,
          createdAt: true,
          protectionExpiresAt: true,
          broker: { select: { agencyName: true, user: { select: { name: true } } } },
          project: { select: { name: true, slug: true } },
        },
      }),
      db.deal.findMany({
        where: { developerId },
        orderBy: { createdAt: 'desc' },
        take: 40,
        select: {
          id: true,
          status: true,
          dealValue: true,
          createdAt: true,
          project: { select: { name: true } },
          unit: { select: { name: true } },
          broker: { select: { agencyName: true, user: { select: { name: true } } } },
          commissions: { select: { estateaiAmount: true, status: true }, take: 1 },
        },
      }),
      db.commission.findMany({
        where: { deal: { developerId } },
        orderBy: { createdAt: 'desc' },
        take: 40,
        select: {
          id: true,
          status: true,
          totalAmount: true,
          estateaiAmount: true,
          dueDate: true,
          createdAt: true,
          deal: { select: { project: { select: { name: true } } } },
        },
      }),
    ])

    const canSeeRawContacts = ctx.isCEO

    const projects = projectRows.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      coverImage: p.coverImage,
      status: p.status,
      approvalStatus: p.approvalStatus,
      startPrice: p.startPrice,
      totalUnits: p.totalUnits,
      completionPercent: p.completionPercent,
      deliveryDate: p.deliveryDate?.toISOString() ?? null,
      isActive: p.isActive,
      isFeatured: p.isFeatured,
      viewCount: p.viewCount,
      favoriteCount: p.favoriteCount,
      inquiryCount: p.inquiryCount,
      location: p.governorate?.name ?? null,
      units: p._count.units,
      leads: p._count.leads,
      deals: p._count.deals,
    }))

    const leads = leadRows.map((l) => ({
      id: l.id,
      name: l.name,
      phone: canSeeRawContacts ? l.phone : maskPhone(l.phone),
      email: canSeeRawContacts ? l.email : maskEmail(l.email),
      status: l.status,
      source: l.source,
      createdAt: l.createdAt.toISOString(),
      protectionExpiresAt: l.protectionExpiresAt?.toISOString() ?? null,
      brokerName: l.broker?.user?.name ?? l.broker?.agencyName ?? 'Unassigned',
      projectName: l.project?.name ?? null,
      projectSlug: l.project?.slug ?? null,
    }))

    const deals = dealRows.map((d) => ({
      id: d.id,
      status: d.status,
      dealValue: d.dealValue,
      createdAt: d.createdAt.toISOString(),
      projectName: d.project.name,
      unitName: d.unit?.name ?? null,
      brokerName: d.broker?.user?.name ?? d.broker?.agencyName ?? '—',
      commissionStatus: d.commissions[0]?.status ?? null,
    }))

    const commissions = commissionRows.map((c) => ({
      id: c.id,
      status: c.status,
      totalAmount: c.totalAmount,
      estateaiAmount: c.estateaiAmount,
      dueDate: c.dueDate?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
      projectName: c.deal.project.name,
    }))

    const published = projects.filter(
      (p) => p.approvalStatus === 'APPROVED' || p.approvalStatus === 'PUBLISHED',
    )
    const totalValue = deals
      .filter((d) => d.status === 'SOLD' || d.status === 'CONTRACT')
      .reduce((s, d) => s + (d.dealValue || 0), 0)
    const commissionTotal = commissions.reduce((s, c) => s + c.totalAmount, 0)
    const commissionPaid = commissions
      .filter((c) => c.status === 'PAID')
      .reduce((s, c) => s + c.totalAmount, 0)

    const statusCounts: Record<string, number> = {}
    for (const l of leads) statusCounts[l.status] = (statusCounts[l.status] || 0) + 1

    return NextResponse.json({
      profile: {
        companyName: developer.companyName,
        companyNameArabic: developer.companyNameArabic,
        logo: developer.logo,
        isVerified: developer.isVerified,
        rating: developer.rating,
        reviewCount: developer.reviewCount,
        foundedYear: developer.foundedYear,
        headquarters: developer.headquarters,
        website: developer.website,
        totalProjects: developer.totalProjects,
        accountStatus: developer.user.status,
        isActive: developer.user.isActive,
      },
      viewer: { name: developer.user.name, role: developer.user.role },
      editMode: developer.editMode === 'DIRECT' ? 'DIRECT' : 'REQUEST',
      partnership: partnership
        ? {
            status: partnership.status,
            allProjectsApproved: partnership.allProjectsApproved,
            approvedCount: safeArray(partnership.approvedProjectIds).length,
            leadProtectionDays: partnership.leadProtectionDays,
            startDate: partnership.startDate?.toISOString() ?? null,
            endDate: partnership.endDate?.toISOString() ?? null,
            terms: partnership.terms,
            reviewNote: partnership.reviewNote,
            isActive: partnership.isActive,
            updatedAt: partnership.updatedAt.toISOString(),
          }
        : null,
      stats: {
        projects: projects.length,
        published: published.length,
        leads: leads.length,
        statusCounts,
        deals: deals.length,
        totalValue,
        commissionTotal,
        commissionPaid,
        commissionPending: commissionTotal - commissionPaid,
        views: projects.reduce((s, p) => s + p.viewCount, 0),
        inquiries: projects.reduce((s, p) => s + p.inquiryCount, 0),
      },
      projects,
      leads,
      deals,
      commissions,
    })
  } catch (error) {
    console.error('Developer portal error:', error)
    return NextResponse.json({ error: 'Failed to load the developer portal' }, { status: 500 })
  }
}

function viewerOf(ctx: { userId: string; role: string }) {
  return { name: null as string | null, role: ctx.role }
}

/** Same digits-only masking `/api/leads` applies to DEVELOPER rows. */
function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return phone ?? null
  const digits = phone
  if (digits.length <= 7) return '••••'
  return `${digits.slice(0, 4)}•••••${digits.slice(-3)}`
}

function maskEmail(email: string | null | undefined): string | null {
  if (!email) return email ?? null
  const at = email.indexOf('@')
  if (at < 1) return '•••'
  return `${email.slice(0, 2)}•••@${email.slice(at + 1)}`
}

function safeArray(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
