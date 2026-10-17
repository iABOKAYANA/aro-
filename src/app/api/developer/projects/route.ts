import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireActor } from '@/lib/lead-access'
import { logAudit } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

/**
 * POST /api/developer/projects — developer self-publishing submission.
 *
 * Creates a project owned by the SIGNED-IN developer's own profile and forces
 * `approvalStatus: 'PENDING'` — any client-sent approval/publish flags
 * (`approvalStatus`, `isActive`, `isFeatured`, `developerId`) are ignored.
 * Field validation mirrors `POST /api/ceo/projects` (same names, same
 * ranges); the CEO side creates as DRAFT, developers submit straight to
 * PENDING so the row enters the CEO review queue.
 *
 * Accepted body fields: name (required, 1–200 chars), nameArabic, tagline,
 * taglineArabic, description, descriptionArabic, governorateId, cityId,
 * districtId, address, propertyTypes, listingTypes, status, totalUnits,
 * totalArea, startPrice, endPrice, pricePerSqm, downPaymentMin,
 * installmentYears, compoundArea, deliveryDate, deliveryTerms,
 * completionPercent, coverImage, gallery, videoUrl, virtualTourUrl,
 * latitude, longitude, googleMapsUrl, metaTitle, metaDescription, keywords.
 *
 * → 201 { project } with approvalStatus 'PENDING' and developerId = caller.
 */
export async function POST(req: Request) {
  try {
    const gate = await requireActor(['DEVELOPER'])
    if (!gate.ok) return gate.response
    const { ctx } = gate

    if (!ctx.developerId) {
      return NextResponse.json(
        { error: 'No developer profile linked to this account' },
        { status: 403 }
      )
    }
    const developerId = ctx.developerId

    const body = await req.json()
    const {
      name, nameArabic, tagline, taglineArabic,
      description, descriptionArabic,
      governorateId, cityId, districtId, address,
      propertyTypes, listingTypes, status, totalUnits, totalArea,
      startPrice, endPrice, pricePerSqm, downPaymentMin,
      installmentYears, compoundArea,
      deliveryDate, deliveryTerms, completionPercent,
      coverImage, gallery, videoUrl, virtualTourUrl,
      latitude, longitude, googleMapsUrl,
      metaTitle, metaDescription, keywords,
      // Ignored on purpose (forced server-side): approvalStatus, isActive,
      // isFeatured, developerId — listed here so intent is explicit.
    } = body

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    if (typeof name !== 'string' || !name.trim() || name.trim().length > 200) {
      return NextResponse.json({ error: 'Name must be 1–200 characters' }, { status: 400 })
    }

    // Same numeric validation as POST /api/ceo/projects.
    const num = (v: unknown): number | null => {
      if (v === undefined || v === null || v === '') return null
      const n = Number(v)
      return Number.isFinite(n) ? n : NaN
    }
    const startPriceN = num(startPrice)
    const endPriceN = num(endPrice)
    const pricePerSqmN = num(pricePerSqm)
    const totalUnitsN = num(totalUnits)
    const totalAreaN = num(totalArea)
    const downPaymentMinN = num(downPaymentMin)
    const installmentYearsN = num(installmentYears)
    const compoundAreaN = num(compoundArea)
    const completionPercentN = num(completionPercent) ?? 0
    const nums = { startPriceN, endPriceN, pricePerSqmN, totalUnitsN, totalAreaN, downPaymentMinN, installmentYearsN, compoundAreaN }
    for (const [k, v] of Object.entries(nums)) {
      if (v !== null && (!Number.isFinite(v) || v < 0 || v > 1_000_000_000_000)) {
        return NextResponse.json({ error: `Invalid ${k.replace(/N$/, '')}` }, { status: 400 })
      }
    }
    if (!Number.isFinite(completionPercentN) || completionPercentN < 0 || completionPercentN > 100) {
      return NextResponse.json({ error: 'completionPercent must be 0–100' }, { status: 400 })
    }
    if (installmentYearsN !== null && (installmentYearsN < 0 || installmentYearsN > 30)) {
      return NextResponse.json({ error: 'installmentYears must be 0–30' }, { status: 400 })
    }
    if (downPaymentMinN !== null && (downPaymentMinN < 0 || downPaymentMinN > 100)) {
      return NextResponse.json({ error: 'downPaymentMin must be 0–100' }, { status: 400 })
    }

    const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    const { randomBytes } = await import('node:crypto')
    const slug = slugBase || `project-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`
    const existingSlug = await db.project.findUnique({ where: { slug } })
    if (existingSlug) {
      return NextResponse.json({ error: 'A project with this name already exists' }, { status: 409 })
    }

    const project = await db.project.create({
      data: {
        developerId,
        name,
        nameArabic: nameArabic || null,
        slug,
        tagline: tagline || null,
        taglineArabic: taglineArabic || null,
        description: description || null,
        descriptionArabic: descriptionArabic || null,
        governorateId: governorateId || null,
        cityId: cityId || null,
        districtId: districtId || null,
        address: address || null,
        propertyTypes: propertyTypes ? JSON.stringify(propertyTypes) : '[]',
        listingTypes: listingTypes ? JSON.stringify(listingTypes) : '[]',
        status: status || 'COMING_SOON',
        // Forced: developer submissions always enter the review queue.
        approvalStatus: 'PENDING',
        isActive: true,
        isFeatured: false,
        totalUnits: totalUnitsN ?? null,
        totalArea: totalAreaN ?? null,
        startPrice: startPriceN ?? null,
        endPrice: endPriceN ?? null,
        pricePerSqm: pricePerSqmN ?? null,
        downPaymentMin: downPaymentMinN ?? null,
        installmentYears: installmentYearsN ?? null,
        compoundArea: compoundAreaN ?? null,
        deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
        deliveryTerms: deliveryTerms || null,
        completionPercent: Math.round(completionPercentN) || 0,
        coverImage: coverImage || null,
        gallery: gallery ? JSON.stringify(gallery) : '[]',
        videoUrl: videoUrl || null,
        virtualTourUrl: virtualTourUrl || null,
        latitude: latitude || null,
        longitude: longitude || null,
        googleMapsUrl: googleMapsUrl || null,
        metaTitle: metaTitle || null,
        metaDescription: metaDescription || null,
        keywords: keywords ? JSON.stringify(keywords) : '[]',
      },
    })

    await logAudit({
      action: 'PROJECT_SUBMITTED',
      entity: 'Project',
      entityId: project.id,
      userId: ctx.userId,
      changes: { after: { name, developerId, status: project.status, approvalStatus: 'PENDING' } },
    })

    // Notify the review queue (fail-soft — never breaks the 201).
    try {
      const { notifyRole } = await import('@/lib/notify')
      await notifyRole(['CEO', 'ADMIN'], {
        type: 'PROJECT_SUBMISSION',
        title: 'New project awaiting review',
        message: `${name} was submitted for approval.`,
        link: '/ceo/projects?approvalStatus=PENDING',
        metadata: { projectId: project.id, slug: project.slug, developerId },
      })
    } catch (e) {
      console.error('[notify] developer submit hook failed:', e)
    }

    return NextResponse.json({ project }, { status: 201 })
  } catch (error) {
    console.error('Developer create project error:', error)
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
  }
}
