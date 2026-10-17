import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi, logAudit } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('projectId')

    const where: Record<string, unknown> = {}
    if (projectId) where.projectId = projectId

    const plans = await db.paymentPlan.findMany({
      where,
      include: {
        project: {
          select: { id: true, name: true, slug: true },
        },
        phase: { select: { id: true, name: true } },
        milestones: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ plans })
  } catch (error) {
    console.error('CEO fetch payment plans error:', error)
    return NextResponse.json({ error: 'Failed to fetch payment plans' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error

    const body = await req.json()
    const {
      projectId, phaseId, name, nameArabic, description,
      downPaymentPct, installmentYears, maintenanceFeePct,
      semiAnnualPct, deliveryPaymentPct, cashDiscount,
      isDefault, milestones,
    } = body

    if (!projectId || !name || downPaymentPct === undefined || installmentYears === undefined) {
      return NextResponse.json({ error: 'Missing required fields: projectId, name, downPaymentPct, installmentYears' }, { status: 400 })
    }

    const project = await db.project.findUnique({ where: { id: projectId } })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const plan = await db.paymentPlan.create({
      data: {
        projectId,
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
      userId: (session!.user as any).id,
      action: 'CREATE',
      entity: 'PaymentPlan',
      entityId: plan.id,
      changes: { name, projectId, downPaymentPct, installmentYears },
    })

    return NextResponse.json({ plan }, { status: 201 })
  } catch (error) {
    console.error('CEO create payment plan error:', error)
    return NextResponse.json({ error: 'Failed to create payment plan' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error

    const body = await req.json()
    const { id, milestones, ...fields } = body

    if (!id) return NextResponse.json({ error: 'Payment Plan ID required' }, { status: 400 })

    const existing = await db.paymentPlan.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Payment plan not found' }, { status: 404 })

    const updateData: Record<string, unknown> = {}
    const allowedFields = ['name', 'nameArabic', 'description', 'downPaymentPct', 'installmentYears', 'maintenanceFeePct', 'semiAnnualPct', 'deliveryPaymentPct', 'cashDiscount', 'isDefault', 'isActive', 'sortOrder', 'phaseId']

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
      userId: (session!.user as any).id,
      action: 'UPDATE',
      entity: 'PaymentPlan',
      entityId: id,
      changes: { ...updateData, milestonesCount: milestones?.length },
    })

    return NextResponse.json({ plan })
  } catch (error) {
    console.error('CEO update payment plan error:', error)
    return NextResponse.json({ error: 'Failed to update payment plan' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Payment Plan ID required' }, { status: 400 })

    const existing = await db.paymentPlan.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Payment plan not found' }, { status: 404 })

    await db.paymentPlan.delete({ where: { id } })

    await logAudit({
      userId: (session!.user as any).id,
      action: 'DELETE',
      entity: 'PaymentPlan',
      entityId: id,
      changes: { name: existing.name, projectId: existing.projectId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('CEO delete payment plan error:', error)
    return NextResponse.json({ error: 'Failed to delete payment plan' }, { status: 500 })
  }
}
