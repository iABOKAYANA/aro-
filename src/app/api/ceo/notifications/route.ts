import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

// Pending meeting requests (status REQUESTED) — feeds the CEO header bell
// and the "New Meeting Requests" card on the overview page.
export async function GET() {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const viewings = await db.viewing.findMany({
      where: { status: 'REQUESTED' },
      orderBy: { createdAt: 'desc' },
      take: 15,
      include: {
        user: { select: { name: true, email: true, phone: true } },
        lead: { select: { name: true, phone: true } },
        project: { select: { name: true } },
        unit: {
          select: { name: true, project: { select: { name: true } } },
        },
      },
    })

    const notifications = viewings.map((v) => ({
      id: v.id,
      clientName: v.user?.name || v.lead?.name || v.user?.email || 'Guest',
      clientPhone: v.contactPhone || v.user?.phone || v.lead?.phone || null,
      projectName: v.unit
        ? v.unit.project?.name
          ? `${v.unit.project.name} — ${v.unit.name}`
          : v.unit.name
        : v.project?.name || 'Meeting',
      scheduledAt: v.scheduledAt,
      meetingType: v.meetingType,
      meetingLink: v.meetingLink,
      notes: v.notes,
      createdAt: v.createdAt,
    }))

    return NextResponse.json({ notifications, count: notifications.length })
  } catch (error) {
    console.error('CEO fetch notifications error:', error)
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
  }
}
