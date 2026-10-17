import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/permissions'
import { requireOwnProject } from '@/lib/developer-projects'
import { blockWhenRequestOnly } from '@/lib/edit-requests'

export const dynamic = 'force-dynamic'

/**
 * Developer-scoped payment-plan writes on an OWN project (any approval
 * state — visibility follows the project). The project id comes from the
 * path; any client-sent `projectId` is ignored. Foreign projects → 403.
 * Validation mirrors /api/ceo/payment-plans.
 *
 * POST   /api/developer/projects/[id]/plans  {name*, downPaymentPct*,
 *          installmentYears*, phaseId?, nameArabic?, description?,
 *          maintenanceFeePct?, semiAnnualPct?, deliveryPaymentPct?,
 *          cashDiscount?, isDefault?, milestones?[{name*, percentage*,
 *          nameArabic?, monthNumber?, description?}]} → 201 { plan }
 * PATCH  /api/developer/projects/[id]/plans  {id*, ...fields, milestones?}
 *          → 200 { plan } (the plan must belong to the path project)
 * DELETE /api/developer/projects/[id]/plans?id=<planId> → 200 { success }
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const gate = await requireOwnProject(params.id)
    if (!gate.ok) return gate.response

    const body = await req.json()
    const { projectId: _ignored, ...rest } = body
    void _ignored
    const {
      phaseId, name, nameArabic, description,
      downPaymentPct, installmentYears, maintenanceFeePct,
      semiAnnualPct, deliveryPaymentPct, cashDiscount,
      isDefault, milestones,
    } = rest

    if (!name || downPaymentPct === undefined || installmentYears === undefined) {
      return NextResponse.json({ error: 'Missing required fields: name, downPaymentPct, installmentYears' }, { status: 400 })
    }

    if (phaseId) {
      const phase = await db.projectPhase.findUnique({ where: { id: phaseId }, select: { projectId: true } })
      if (!phase || phase.projectId !== params.id) {
        return NextResponse.json({ error: 'phaseId does not belong to this project' }, { status: 400 })
      }
    }

    const plan = await db.paymentPlan.create({
      data: {
        projectId: params.id,
        phaseId: phaseId || null,
        name,
        nameArabic: nameArabic || null,
        description: description || null,
        downPaymentPct,
        installmentYears,
        maintenanceFeePct: maintenanceFeePct ?? null,
        semiAnnualPct: semiAnnualPct ?? null,
        deliveryPaymentPct: deliveryPaymentPct ?? null,
        cashDiscount: cashDiscount ?? null,
        isDefault: isDefault || false,
        milestones: milestones
          ? {
              create: milestones.map((m: { name: string; nameArabic?: string; percentage: number; monthNumber?: number; description?: string }, i: number) => ({
                name: m.name,
                nameArabic: m.nameArabic || null,
                percentage: m.percentage,
                monthNumber: m.monthNumber ?? null,
                description: m.description || null,
                sortOrder: i,
              })),
            }
          : undefined,
      },
      include: { milestones: true },
    })

    await logAudit({
      userId: gate.ctx.userId,
      action: 'CREATE',
      entity: 'PaymentPlan',
      entityId: plan.id,
      changes: { name, projectId: params.id, downPaymentPct, installmentYears },
    })

    return NextResponse.json({ plan }, { status: 201 })
  } catch (error) {
    console.error('Developer create payment plan error:', error)
    return NextResponse.json({ error: 'Failed to create payment plan' }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const gate = await requireOwnProject(params.id)
    if (!gate.ok) return gate.response
    // Permission mode: REQUEST-mode developers edit via edit-requests only.
    const blockedPatch = await blockWhenRequestOnly(gate.developerId)
    if (blockedPatch) return blockedPatch

    const body = await req.json()
    const { id, projectId: _ignored, milestones, ...fields } = body
    void _ignored

    if (!id) return NextResponse.json({ error: 'Payment Plan ID required' }, { status: 400 })

    const existing = await db.paymentPlan.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Payment plan not found' }, { status: 404 })
    if (existing.projectId !== params.id) {
      return NextResponse.json({ error: 'Forbidden: this payment plan belongs to another project' }, { status: 403 })
    }

    const updateData: Record<string, unknown> = {}
    const allowedFields = ['name', 'nameArabic', 'description', 'downPaymentPct', 'installmentYears', 'maintenanceFeePct', 'semiAnnualPct', 'deliveryPaymentPct', 'cashDiscount', 'isDefault', 'isActive', 'sortOrder', 'phaseId']

    if (fields.phaseId) {
      const phase = await db.projectPhase.findUnique({ where: { id: fields.phaseId }, select: { projectId: true } })
      if (!phase || phase.projectId !== params.id) {
        return NextResponse.json({ error: 'phaseId does not belong to this project' }, { status: 400 })
      }
    }

    for (const key of allowedFields) {
      if (fields[key] !== undefined) {
        updateData[key] = fields[key]
      }
    }

    if (milestones && Array.isArray(milestones)) {
      await db.paymentMilestone.deleteMany({ where: { paymentPlanId: id } })
      if (milestones.length > 0) {
        await db.paymentMilestone.createMany({
          data: milestones.map((m: { name: string; nameArabic?: string; percentage: number; monthNumber?: number; description?: string }, i: number) => ({
            paymentPlanId: id,
            name: m.name,
            nameArabic: m.nameArabic || null,
            percentage: m.percentage,
            monthNumber: m.monthNumber ?? null,
            description: m.description || null,
            sortOrder: i,
          })),
        })
      }
    }

    const plan = await db.paymentPlan.update({
      where: { id },
      data: updateData,
      include: { milestones: { orderBy: { sortOrder: 'asc' } } },
    })

    await logAudit({
      userId: gate.ctx.userId,
      action: 'UPDATE',
      entity: 'PaymentPlan',
      entityId: id,
      changes: { ...updateData, milestonesCount: milestones?.length },
    })

    return NextResponse.json({ plan })
  } catch (error) {
    console.error('Developer update payment plan error:', error)
    return NextResponse.json({ error: 'Failed to update payment plan' }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const gate = await requireOwnProject(params.id)
    if (!gate.ok) return gate.response
    // Permission mode: REQUEST-mode developers edit via edit-requests only.
    const blockedDelete = await blockWhenRequestOnly(gate.developerId)
    if (blockedDelete) return blockedDelete

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Payment Plan ID required' }, { status: 400 })

    const existing = await db.paymentPlan.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Payment plan not found' }, { status: 404 })
    if (existing.projectId !== params.id) {
      return NextResponse.json({ error: 'Forbidden: this payment plan belongs to another project' }, { status: 403 })
    }

    await db.paymentPlan.delete({ where: { id } })

    await logAudit({
      userId: gate.ctx.userId,
      action: 'DELETE',
      entity: 'PaymentPlan',
      entityId: id,
      changes: { name: existing.name, projectId: existing.projectId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Developer delete payment plan error:', error)
    return NextResponse.json({ error: 'Failed to delete payment plan' }, { status: 500 })
  }
}
