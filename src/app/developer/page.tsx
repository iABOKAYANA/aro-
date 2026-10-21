import { Metadata } from 'next'
import { db } from '@/lib/db'
import { requirePortalUser } from '@/lib/portal'
import DeveloperPortal from '@/components/portal/developer-portal'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Developer Portal',
  description: 'Your projects, leads, partnership status and commissions in one place.',
  robots: { index: false },
}

export default async function DeveloperPortalPage({
  searchParams,
}: {
  /** CEO/ADMIN preview: ?as=<developerProfileId> opens THAT developer's portal. */
  searchParams: { as?: string }
}) {
  const user = await requirePortalUser('DEVELOPER')
  const isOverseer = user.role === 'CEO' || user.role === 'ADMIN'

  let target: { id: string; name: string; email: string } = { id: user.id, name: user.name, email: user.email }
  if (isOverseer) {
    const requested = searchParams?.as
    const dev = requested
      ? await db.developerProfile.findUnique({
          where: { id: requested },
          include: { user: { select: { id: true, name: true, email: true } } },
        })
      : null
    if (dev) {
      target = { id: dev.id, name: dev.user.name, email: dev.user.email }
    } else {
      const rows = await db.developerProfile.findMany({
        select: {
          id: true,
          companyName: true,
          companyNameArabic: true,
          isVerified: true,
          rating: true,
          user: { select: { name: true, email: true } },
          _count: { select: { projects: true } },
        },
        orderBy: { companyName: 'asc' },
        take: 200,
      })
      return (
        <div className="container px-4 py-16">
          <p className="section-kicker">CEO preview</p>
          <h1 className="font-display display-3 mt-3 text-white">اختار المطور اللي عايز تعاين بوابه</h1>
          <p className="mt-3 mb-8 max-w-xl text-sm text-muted-foreground">
            كل كارت يفتح بوابة المطور بكامل بياناته — معاينة و إشراف، مش بياناتك انت.
          </p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {rows.map((d) => (
              <a
                key={d.id}
                href={`/developer?as=${encodeURIComponent(d.id)}`}
                className="block rounded-2xl border border-estate-gold/15 bg-white/[0.03] p-5 transition-colors hover:border-estate-gold/40 dark:border-[#D4A843]/15 dark:bg-[#0A0A0A]"
              >
                <p className="font-display truncate text-lg font-semibold">{d.companyNameArabic || d.companyName}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{d.user.name} · {d.user.email}</p>
                <p className="mt-3 text-xs text-estate-gold">
                  {d._count.projects} مشاريع · {d.rating.toFixed(1)} ★
                  {d.isVerified ? ' · Verified' : ''}
                </p>
              </a>
            ))}
            {rows.length === 0 && <p className="text-sm text-muted-foreground">مفيش مطورين مسجلين بعد.</p>}
          </div>
        </div>
      )
    }
  }

  const developer = await db.developerProfile.findUnique({
    where: isOverseer ? { id: target.id } : { userId: user.id },
    include: { user: { select: { isActive: true, status: true } } },
  })

  if (!developer) {
    return (
      <div className="container px-4 py-24">
        <div className="relative mx-auto max-w-lg overflow-hidden rounded-2xl border border-estate-gold/20 bg-white/[0.04] p-10 text-center dark:border-[#D4A843]/20 dark:bg-[#0A0A0A]">
          <div className="mashrabiya pointer-events-none absolute inset-0 opacity-30" aria-hidden="true" />
          <div className="relative">
          <p className="section-kicker">Developer portal</p>
          <h1 className="font-display display-3 mt-3 text-white">No developer profile yet</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {isOverseer
              ? 'المطور اللي اخترته مالوش بروفايل مرتبط. رجِع تاني واختار واحد تاني.'
              : `الحساب ${user.email} موثّق، بس ملوش بروفايل شركة مرتبط. اطلب من الإدارة يربطوه.`}
          </p>
          </div>
        </div>
      </div>
    )
  }

  const developerId = developer.id

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
        rejectionReason: true,
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
        _count: { select: { units: true, leads: true, deals: true } },
      },
    }),
    db.developerPartnership.findUnique({ where: { developerId } }),
    db.lead.findMany({
      where: { developerId },
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

  const projects = projectRows.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    coverImage: p.coverImage,
    status: p.status,
    approvalStatus: p.approvalStatus,
    rejectionReason: p.rejectionReason ?? null,
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
    phone: l.phone,
    email: l.email,
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
    (p) => p.approvalStatus === 'APPROVED' || p.approvalStatus === 'PUBLISHED'
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

  return (
    <>
      {isOverseer && (
        <div className="container px-4 pt-4">
          <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-400">
            <span aria-hidden>👀</span>
            <span>
              وضع معاينة CEO — بتشوف بوابة <strong>{target.name}</strong> ({target.email}). بيانات القراءة حقيقية، والتعديلات من هنا محظورة.
            </span>
            <a href="/developer" className="ms-auto shrink-0 underline">رجوع للاختيار</a>
          </div>
        </div>
      )}
      <DeveloperPortal
      profile={{
        companyName: developer.companyName,
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
      }}
      viewer={{ name: isOverseer ? target.name : user.name, role: user.role }}
      partnership={
        partnership
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
          : null
      }
      stats={{
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
      }}
      projects={projects}
      leads={leads}
      deals={deals}
      commissions={commissions}
    />
    </>
  )
}

function safeArray(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
