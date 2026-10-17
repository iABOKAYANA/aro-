import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { requireActor, leadScopeWhere } from '@/lib/lead-access'
import DashboardOverviewView, { type OverviewStatKey } from './overview-view'

export const dynamic = 'force-dynamic'

export default async function DashboardOverviewPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')

  const userRole = (session.user as any).role

  // Developers live in their own portal — the generic dashboard overview
  // is not theirs to see (their sidebar link is hidden too).
  if (userRole === 'DEVELOPER') redirect('/developer')

  // CRM roles see their own scoped lead count — never platform-wide numbers.
  const actor = await requireActor(['BROKER', 'DEVELOPER', 'CEO', 'ADMIN'])
  const crmScope = actor.ok ? leadScopeWhere(actor.ctx) : null

  const [totalProjects, totalUnits, totalInquiries, scopedLeads] = await Promise.all([
    db.project.count({ where: { isActive: true } }),
    db.unit.count({ where: { status: 'AVAILABLE', isSample: false } }),
    db.inquiry.count(),
    crmScope ? db.lead.count({ where: crmScope as any }) : Promise.resolve(0),
  ])

  const stats: Array<{ key: OverviewStatKey; value: number }> = [
    { key: 'projects', value: totalProjects },
    { key: 'units', value: totalUnits },
    { key: 'inquiries', value: totalInquiries },
    ...(crmScope ? [{ key: 'leads' as const, value: scopedLeads }] : []),
  ]

  return (
    <DashboardOverviewView
      stats={stats}
      isBroker={userRole === 'BROKER'}
      showLeads={!!crmScope}
    />
  )
}
