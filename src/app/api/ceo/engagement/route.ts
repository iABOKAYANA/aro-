import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

// ─── CEO ENGAGEMENT VIEW (honest, measured-only) ────────────
// Every number traces to an existing table/column (see `sources`
// in the response). Empty tables return honest zeros — never
// placeholders. Read-only: zero writes in this route.

const VIEW_TYPES = ['PROJECT_VIEW', 'UNIT_VIEW']

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function pct(n: number, d: number): number | null {
  if (!d || d <= 0) return null
  return Math.round((n / d) * 1000) / 10
}

export async function GET(req: Request) {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const days = Math.min(365, Math.max(1, Number(searchParams.get('days') || 30)))
    const to = new Date()
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000)
    const range = { gte: from, lte: to }

    const [
      events,
      favorites,
      watches,
      inquiries,
      leads,
      viewings,
      deals,
      aiChats,
      notifTotal,
      notifRead,
      projSums,
      unitSums,
    ] = await Promise.all([
      db.userEvent.findMany({
        where: { createdAt: range },
        select: { type: true, entityType: true, entityId: true, userId: true, anonId: true, createdAt: true },
      }),
      db.favorite.findMany({
        where: { createdAt: range },
        select: { unitId: true, createdAt: true },
      }),
      db.watch.findMany({
        where: { createdAt: range },
        select: { targetType: true, targetId: true, createdAt: true },
      }),
      db.inquiry.findMany({
        where: { createdAt: range },
        select: { id: true, unitId: true, status: true, createdAt: true },
      }),
      db.lead.findMany({
        where: { createdAt: range },
        select: { id: true, projectId: true, unitId: true, status: true, createdAt: true },
      }),
      db.viewing.findMany({
        where: { createdAt: range },
        select: { id: true, projectId: true, unitId: true, status: true, createdAt: true },
      }),
      db.deal.findMany({
        where: { createdAt: range },
        select: { id: true, projectId: true, status: true, createdAt: true },
      }),
      db.aIConversation.count({ where: { createdAt: range } }),
      db.notification.count(),
      db.notification.count({ where: { isRead: true } }),
      db.project.aggregate({ _sum: { viewCount: true, favoriteCount: true, inquiryCount: true } }),
      db.unit.aggregate({ _sum: { viewCount: true, favoriteCount: true } }),
    ])

    // ─── Funnel counts (range-scoped, real rows only) ───
    const viewEvents = events.filter((e) => VIEW_TYPES.includes(e.type))
    const viewerIds = new Set<string>()
    for (const e of viewEvents) {
      const key = e.userId || e.anonId
      if (key) viewerIds.add(key)
    }
    const saves = favorites.length + watches.length
    const inquiryTotal = inquiries.length + leads.length
    const reservations = deals.filter((d) => ['RESERVATION', 'CONTRACT', 'SOLD'].includes(d.status)).length
    const contracts = deals.filter((d) => ['CONTRACT', 'SOLD'].includes(d.status)).length
    const sold = deals.filter((d) => d.status === 'SOLD').length

    const funnel = [
      {
        key: 'VIEWS',
        label: 'Property views',
        labelAr: 'مشاهدات العقارات',
        count: viewEvents.length,
        conversionFromPrev: null as number | null,
        source: 'UserEvent.type + UserEvent.createdAt (PROJECT_VIEW, UNIT_VIEW)',
      },
      {
        key: 'SAVES',
        label: 'Saves',
        labelAr: 'الحفظ والمتابعة',
        count: saves,
        conversionFromPrev: pct(saves, viewEvents.length),
        source: 'Favorite.createdAt + Watch.createdAt (Watch.targetType)',
      },
      {
        key: 'INQUIRIES',
        label: 'Inquiries + Leads',
        labelAr: 'استفسارات وليدز',
        count: inquiryTotal,
        conversionFromPrev: pct(inquiryTotal, saves),
        source: 'Inquiry.createdAt + Lead.createdAt',
      },
      {
        key: 'VIEWINGS',
        label: 'Viewings booked',
        labelAr: 'معاينات محجوزة',
        count: viewings.length,
        conversionFromPrev: pct(viewings.length, inquiryTotal),
        source: 'Viewing.createdAt (Viewing.status)',
      },
      {
        key: 'RESERVATIONS',
        label: 'Reservations',
        labelAr: 'حجوزات',
        count: reservations,
        conversionFromPrev: pct(reservations, viewings.length),
        source: 'Deal.createdAt + Deal.status (RESERVATION, CONTRACT, SOLD)',
      },
      {
        key: 'CONTRACTS',
        label: 'Contracts',
        labelAr: 'تعاقدات',
        count: contracts,
        conversionFromPrev: pct(contracts, reservations),
        source: 'Deal.createdAt + Deal.status (CONTRACT, SOLD)',
      },
      {
        key: 'SOLD',
        label: 'Sold',
        labelAr: 'مبيعات',
        count: sold,
        conversionFromPrev: pct(sold, contracts),
        source: 'Deal.createdAt + Deal.status (SOLD)',
      },
    ]

    // ─── Breakdowns ───
    const byType: Record<string, number> = {}
    for (const e of events) byType[e.type] = (byType[e.type] || 0) + 1
    const watchesByTarget: Record<string, number> = {}
    for (const w of watches) watchesByTarget[w.targetType] = (watchesByTarget[w.targetType] || 0) + 1
    const viewingsByStatus: Record<string, number> = {}
    for (const v of viewings) viewingsByStatus[v.status] = (viewingsByStatus[v.status] || 0) + 1
    const dealsByStatus: Record<string, number> = {}
    for (const d of deals) dealsByStatus[d.status] = (dealsByStatus[d.status] || 0) + 1
    const inquiriesByStatus: Record<string, number> = {}
    for (const i of inquiries) inquiriesByStatus[i.status] = (inquiriesByStatus[i.status] || 0) + 1
    const leadsByStatus: Record<string, number> = {}
    for (const l of leads) leadsByStatus[l.status] = (leadsByStatus[l.status] || 0) + 1

    // ─── Per-project top list (from real rows only) ───
    const viewsByProject = new Map<string, number>()
    const directProjectIds = new Set<string>()
    const unitEntityIds = new Set<string>()
    for (const e of viewEvents) {
      if (!e.entityId) continue
      if (e.entityType === 'UNIT') unitEntityIds.add(e.entityId)
      else if (e.entityType === 'PROJECT' || !e.entityType) {
        directProjectIds.add(e.entityId)
        viewsByProject.set(e.entityId, (viewsByProject.get(e.entityId) || 0) + 1)
      }
    }
    // UNIT_VIEW events attribute to the parent project via Unit.projectId
    if (unitEntityIds.size) {
      const units = await db.unit.findMany({
        where: { id: { in: [...unitEntityIds] } },
        select: { id: true, projectId: true },
      })
      const unitToProject = new Map(units.map((u) => [u.id, u.projectId]))
      for (const e of viewEvents) {
        if (e.entityType === 'UNIT' && e.entityId) {
          const pid = unitToProject.get(e.entityId)
          if (pid) viewsByProject.set(pid, (viewsByProject.get(pid) || 0) + 1)
        }
      }
      for (const u of units) directProjectIds.add(u.projectId)
    }
    const viewingsByProject = new Map<string, number>()
    for (const v of viewings) {
      if (v.projectId) viewingsByProject.set(v.projectId, (viewingsByProject.get(v.projectId) || 0) + 1)
    }
    const leadsByProject = new Map<string, number>()
    for (const l of leads) {
      if (l.projectId) leadsByProject.set(l.projectId, (leadsByProject.get(l.projectId) || 0) + 1)
    }
    const dealsByProject = new Map<string, number>()
    for (const d of deals) dealsByProject.set(d.projectId, (dealsByProject.get(d.projectId) || 0) + 1)
    // Favorites/Inquiries carry Unit.unitId only — attribute via Unit.projectId
    const favUnitIds = [...new Set(favorites.map((f) => f.unitId).filter((x): x is string => !!x))]
    const inqUnitIds = [...new Set(inquiries.map((i) => i.unitId).filter((x): x is string => !!x))]
    const attrUnitIds = [...new Set([...favUnitIds, ...inqUnitIds])]
    const attrUnits = attrUnitIds.length
      ? await db.unit.findMany({ where: { id: { in: attrUnitIds } }, select: { id: true, projectId: true } })
      : []
    const unitToProject = new Map(attrUnits.map((u) => [u.id, u.projectId]))
    const savesByProject = new Map<string, number>()
    for (const f of favorites) {
      if (!f.unitId) continue
      const pid = unitToProject.get(f.unitId)
      if (pid) savesByProject.set(pid, (savesByProject.get(pid) || 0) + 1)
    }
    for (const w of watches) {
      // Watch.targetId is a project id only when Watch.targetType = 'PROJECT'
      if (w.targetType === 'PROJECT' && w.targetId) {
        savesByProject.set(w.targetId, (savesByProject.get(w.targetId) || 0) + 1)
        directProjectIds.add(w.targetId)
      }
    }
    const inqByProject = new Map<string, number>()
    for (const i of inquiries) {
      if (!i.unitId) continue
      const pid = unitToProject.get(i.unitId)
      if (pid) inqByProject.set(pid, (inqByProject.get(pid) || 0) + 1)
    }

    const allTopIds = new Set<string>([
      ...viewsByProject.keys(),
      ...viewingsByProject.keys(),
      ...leadsByProject.keys(),
      ...dealsByProject.keys(),
      ...savesByProject.keys(),
      ...inqByProject.keys(),
    ])
    const topProjects =
      allTopIds.size === 0
        ? []
        : (
            await db.project.findMany({
              where: { id: { in: [...allTopIds] } },
              select: { id: true, name: true, viewCount: true, favoriteCount: true, inquiryCount: true },
            })
          )
            .map((p) => ({
              id: p.id,
              name: p.name,
              eventViews: viewsByProject.get(p.id) || 0,
              saves: savesByProject.get(p.id) || 0,
              inquiries: inqByProject.get(p.id) || 0,
              viewings: viewingsByProject.get(p.id) || 0,
              leads: leadsByProject.get(p.id) || 0,
              deals: dealsByProject.get(p.id) || 0,
              // Denormalized display counters (no writer in the codebase — expect 0)
              counterViews: p.viewCount,
              counterFavorites: p.favoriteCount,
              counterInquiries: p.inquiryCount,
            }))
            .sort((a, b) => b.eventViews - a.eventViews)
            .slice(0, 10)

    // ─── Daily trend (zero-filled, from real timestamps) ───
    const trend: { date: string; views: number; saves: number; inquiries: number; viewings: number; deals: number }[] = []
    const bucket = new Map<string, { views: number; saves: number; inquiries: number; viewings: number; deals: number }>()
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(to.getTime() - i * 24 * 60 * 60 * 1000)
      const key = dayKey(d)
      bucket.set(key, { views: 0, saves: 0, inquiries: 0, viewings: 0, deals: 0 })
      trend.push({ date: key, views: 0, saves: 0, inquiries: 0, viewings: 0, deals: 0 })
    }
    const bump = (d: Date, field: 'views' | 'saves' | 'inquiries' | 'viewings' | 'deals') => {
      const b = bucket.get(dayKey(d))
      if (b) b[field] += 1
    }
    for (const e of viewEvents) bump(e.createdAt, 'views')
    for (const f of favorites) bump(f.createdAt, 'saves')
    for (const w of watches) bump(w.createdAt, 'saves')
    for (const i of inquiries) bump(i.createdAt, 'inquiries')
    for (const l of leads) bump(l.createdAt, 'inquiries')
    for (const v of viewings) bump(v.createdAt, 'viewings')
    for (const d of deals) bump(d.createdAt, 'deals')
    for (const t of trend) Object.assign(t, bucket.get(t.date))

    const sources = [
      { metric: 'views', trace: 'UserEvent.type + UserEvent.createdAt (PROJECT_VIEW, UNIT_VIEW)', rows: viewEvents.length },
      { metric: 'uniqueViewers', trace: 'UserEvent.userId + UserEvent.anonId (distinct, PROJECT_VIEW/UNIT_VIEW)', rows: viewerIds.size },
      { metric: 'saves', trace: 'Favorite.createdAt (Favorite.unitId) + Watch.createdAt (Watch.targetType, Watch.targetId)', rows: saves },
      { metric: 'inquiries', trace: 'Inquiry.createdAt (Inquiry.unitId, Inquiry.status)', rows: inquiries.length },
      { metric: 'leads', trace: 'Lead.createdAt (Lead.projectId, Lead.unitId, Lead.status)', rows: leads.length },
      { metric: 'viewings', trace: 'Viewing.createdAt (Viewing.projectId, Viewing.unitId, Viewing.status)', rows: viewings.length },
      { metric: 'deals', trace: 'Deal.createdAt (Deal.projectId, Deal.status)', rows: deals.length },
      { metric: 'aiChats', trace: 'AIConversation.createdAt', rows: aiChats },
      { metric: 'notifications', trace: 'Notification.isRead (Notification.createdAt, all-time)', rows: notifTotal },
      {
        metric: 'projectCounters',
        trace: 'Project.viewCount + Project.favoriteCount + Project.inquiryCount (display counters, no timestamp)',
        rows: (projSums._sum.viewCount || 0) + (projSums._sum.favoriteCount || 0) + (projSums._sum.inquiryCount || 0),
      },
      {
        metric: 'unitCounters',
        trace: 'Unit.viewCount + Unit.favoriteCount (display counters, no timestamp)',
        rows: (unitSums._sum.viewCount || 0) + (unitSums._sum.favoriteCount || 0),
      },
    ]

    const empty = sources.filter((s) => s.rows === 0).map((s) => s.metric)

    return NextResponse.json({
      range: { from: from.toISOString(), to: to.toISOString(), days },
      funnel,
      totals: {
        views: viewEvents.length,
        uniqueViewers: viewerIds.size,
        saves,
        favorites: favorites.length,
        watches: watches.length,
        inquiries: inquiries.length,
        leads: leads.length,
        viewings: viewings.length,
        reservations,
        contracts,
        sold,
        aiChats,
        notificationsTotal: notifTotal,
        notificationsRead: notifRead,
        projectCounterSums: {
          viewCount: projSums._sum.viewCount || 0,
          favoriteCount: projSums._sum.favoriteCount || 0,
          inquiryCount: projSums._sum.inquiryCount || 0,
        },
        unitCounterSums: {
          viewCount: unitSums._sum.viewCount || 0,
          favoriteCount: unitSums._sum.favoriteCount || 0,
        },
      },
      breakdown: {
        eventsByType: byType,
        watchesByTarget,
        inquiriesByStatus,
        leadsByStatus,
        viewingsByStatus,
        dealsByStatus,
      },
      topProjects,
      trend,
      sources,
      empty,
    })
  } catch (e) {
    console.error('CEO engagement error:', e)
    return NextResponse.json({ error: 'Failed to load engagement' }, { status: 500 })
  }
}
