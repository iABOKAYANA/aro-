import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/permissions'
import { requireOwnProject } from '@/lib/developer-projects'

export const dynamic = 'force-dynamic'

/**
 * POST /api/developer/projects/[id]/duplicate — deep-clone an OWN project as
 * DRAFT. Copies the project row (new slug), its phases (id map rebuilt so
 * cloned units/plans keep their phase links), units (new slugs, media URLs
 * copied BY REFERENCE — coverImage/gallery/floorPlan/brochureUrl strings are
 * reused, no file copying), payment plans with their milestones, project
 * milestones, amenity links, nearby places, master-plan images and brochures.
 * Counters reset (viewCount/favoriteCount/inquiryCount → 0), publishedAt and
 * rejectionReason cleared. Cloned units get an 'Initial price' history row,
 * mirroring the single-unit POST.
 *
 * → 201 { project }
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const gate = await requireOwnProject(params.id)
    if (!gate.ok) return gate.response

    const source = await db.project.findUnique({
      where: { id: params.id },
      include: {
        phases: true,
        units: true,
        paymentPlans: { include: { milestones: { orderBy: { sortOrder: 'asc' } } } },
        milestones: { orderBy: { sortOrder: 'asc' } },
        amenities: true,
        nearbyPlaces: true,
        masterPlanImages: { orderBy: { sortOrder: 'asc' } },
        brochures: true,
      },
    })
    if (!source) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const { randomBytes } = await import('node:crypto')
    const rand = () => randomBytes(4).toString('hex')

    // New slug: source slug + copy marker + randomness; retry on collision.
    let slug = `${source.slug}-copy-${rand()}`
    for (let i = 0; i < 5; i++) {
      const clash = await db.project.findUnique({ where: { slug }, select: { id: true } })
      if (!clash) break
      slug = `${source.slug}-copy-${Date.now().toString(36)}-${rand()}`
    }

    const {
      id: _id,
      slug: _slug,
      approvalStatus: _approval,
      rejectionReason: _rejection,
      publishedAt: _published,
      viewCount: _views,
      favoriteCount: _favs,
      inquiryCount: _inquiries,
      createdAt: _created,
      updatedAt: _updated,
      phases: _phases,
      units: _units,
      paymentPlans: _plans,
      milestones: _milestones,
      amenities: _amenities,
      nearbyPlaces: _nearby,
      masterPlanImages: _master,
      brochures: _brochures,
      ...scalars
    } = source
    void _id
    void _slug
    void _approval
    void _rejection
    void _published
    void _views
    void _favs
    void _inquiries
    void _created
    void _updated
    void _phases
    void _units
    void _plans
    void _milestones
    void _amenities
    void _nearby
    void _master
    void _brochures

    const project = await db.project.create({
      data: {
        ...scalars,
        slug,
        // Forced: clones always re-enter the workflow as DRAFT.
        approvalStatus: 'DRAFT',
        viewCount: 0,
        favoriteCount: 0,
        inquiryCount: 0,
      },
    })

    // Phases first — cloned units/plans remap onto the new phase ids.
    const phaseMap = new Map<string, string>()
    for (const ph of source.phases) {
      const { id: _phId, projectId: _phProject, createdAt: _phC, updatedAt: _phU, ...phScalars } = ph
      void _phId
      void _phProject
      void _phC
      void _phU
      const created = await db.projectPhase.create({
        data: { ...phScalars, projectId: project.id },
      })
      phaseMap.set(ph.id, created.id)
    }

    // Units (new slugs; media URLs by reference).
    const priceRows: Array<{ unitId: string; price: number; reason: string }> = []
    for (const [i, u] of source.units.entries()) {
      const {
        id: _uId,
        projectId: _uProject,
        phaseId: _uPhase,
        createdAt: _uC,
        updatedAt: _uU,
        slug: _uSlug,
        ...uScalars
      } = u
      void _uId
      void _uProject
      void _uPhase
      void _uC
      void _uU
      void _uSlug
      const unitSlugBase =
        u.slug || `${u.name.toLowerCase().replace(/\s+/g, '-')}`
      const created = await db.unit.create({
        data: {
          ...uScalars,
          projectId: project.id,
          phaseId: u.phaseId ? (phaseMap.get(u.phaseId) ?? null) : null,
          slug: `${unitSlugBase}-copy-${Date.now().toString(36)}-${i}-${rand()}`,
        },
      })
      priceRows.push({ unitId: created.id, price: u.price, reason: 'Initial price' })
    }
    if (priceRows.length > 0) {
      await db.priceHistory.createMany({ data: priceRows })
    }

    // Payment plans + nested milestones (phase remapped).
    for (const plan of source.paymentPlans) {
      const {
        id: _pId,
        projectId: _pProject,
        phaseId: _pPhase,
        createdAt: _pC,
        updatedAt: _pU,
        milestones: planMilestones,
        ...pScalars
      } = plan
      void _pId
      void _pProject
      void _pPhase
      void _pC
      void _pU
      await db.paymentPlan.create({
        data: {
          ...pScalars,
          projectId: project.id,
          phaseId: plan.phaseId ? (phaseMap.get(plan.phaseId) ?? null) : null,
          milestones: {
            create: planMilestones.map((m, i) => {
              const { id: _mId, paymentPlanId: _mPlan, ...mScalars } = m
              void _mId
              void _mPlan
              return { ...mScalars, sortOrder: m.sortOrder ?? i }
            }),
          },
        },
      })
    }

    // Project timeline milestones (image URLs by reference).
    for (const ms of source.milestones) {
      const { id: _msId, projectId: _msProject, createdAt: _msC, updatedAt: _msU, ...msScalars } = ms
      void _msId
      void _msProject
      void _msC
      void _msU
      await db.projectMilestone.create({ data: { ...msScalars, projectId: project.id } })
    }

    // Amenity links, nearby places, master-plan images, brochures (URLs by reference).
    for (const a of source.amenities) {
      await db.projectAmenity.create({
        data: { projectId: project.id, amenityId: a.amenityId, isPremium: a.isPremium, notes: a.notes },
      })
    }
    for (const n of source.nearbyPlaces) {
      const { id: _nId, projectId: _nProject, ...nScalars } = n
      void _nId
      void _nProject
      await db.nearbyPlace.create({ data: { ...nScalars, projectId: project.id } })
    }
    for (const m of source.masterPlanImages) {
      const { id: _mpId, projectId: _mpProject, ...mpScalars } = m
      void _mpId
      void _mpProject
      await db.masterPlanImage.create({ data: { ...mpScalars, projectId: project.id } })
    }
    for (const b of source.brochures) {
      const { id: _bId, projectId: _bProject, ...bScalars } = b
      void _bId
      void _bProject
      await db.projectBrochure.create({ data: { ...bScalars, projectId: project.id } })
    }

    await logAudit({
      userId: gate.ctx.userId,
      action: 'PROJECT_DUPLICATED',
      entity: 'Project',
      entityId: project.id,
      changes: { sourceProjectId: source.id, sourceSlug: source.slug, newSlug: slug },
    })

    return NextResponse.json({ project }, { status: 201 })
  } catch (error) {
    console.error('Developer duplicate project error:', error)
    return NextResponse.json({ error: 'Failed to duplicate project' }, { status: 500 })
  }
}
