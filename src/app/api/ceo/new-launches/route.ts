import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi, logAudit } from '@/lib/permissions'
import {
  getNewLaunchesConfig,
  saveNewLaunchesConfig,
  computeNewLaunches,
  computeIsNewLaunch,
} from '@/lib/new-launches'

export const dynamic = 'force-dynamic'

const CANDIDATE_SELECT = {
  id: true,
  name: true,
  nameArabic: true,
  slug: true,
  coverImage: true,
  startPrice: true,
  status: true,
  createdAt: true,
  isActive: true,
} as const

// ─── GET /api/ceo/new-launches — config + live list + candidates ──
export async function GET(req: Request) {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const config = await getNewLaunchesConfig()
    const { items: live } = await computeNewLaunches(config)

    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')?.trim()

    const where: Record<string, unknown> = { isActive: true }
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { nameArabic: { contains: search } },
        { slug: { contains: search } },
      ]
    }

    const [recent, referenced] = await Promise.all([
      db.project.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 60,
        select: CANDIDATE_SELECT,
      }),
      // always surface pinned/hidden projects even if inactive or outside search
      (async () => {
        const ids = [...new Set([...config.pinnedIds, ...config.hiddenIds])]
        if (!ids.length) return []
        return db.project.findMany({ where: { id: { in: ids } }, select: CANDIDATE_SELECT })
      })(),
    ])

    const seen = new Set<string>()
    const merged = [...recent, ...referenced].filter((p) => {
      if (seen.has(p.id)) return false
      seen.add(p.id)
      return true
    })

    const candidates = merged.map((p) => ({
      ...p,
      isNewLaunch: computeIsNewLaunch(config, p),
      launchState: config.hiddenIds.includes(p.id)
        ? 'HIDDEN'
        : config.pinnedIds.includes(p.id)
          ? 'PINNED'
          : computeIsNewLaunch(config, p)
            ? 'AUTO'
            : 'OUTDATED',
    }))

    return NextResponse.json({ config, live, candidates })
  } catch (err) {
    console.error('New launches control GET error:', err)
    return NextResponse.json({ error: 'Failed to load New Launches control' }, { status: 500 })
  }
}

// ─── POST /api/ceo/new-launches — full control ─────────────
// body.type:
//   'SETTINGS' → save whole config (validated by zod)
//   'PIN'      → force-include a project { projectId }
//   'UNPIN'    → remove force-include { projectId }
//   'HIDE'     → force-exclude a project { projectId }
//   'SHOW'     → remove force-exclude { projectId }
export async function POST(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error
    const actorId = (session!.user as any)?.id as string

    const body = await req.json()
    const type = body.type as string

    if (type === 'SETTINGS') {
      const previous = await getNewLaunchesConfig()
      const saved = await saveNewLaunchesConfig(body.config)
      if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 400 })
      await logAudit({
        userId: actorId,
        action: 'NEW_LAUNCHES_SETTINGS_UPDATED',
        entity: 'SystemSetting',
        entityId: 'new_launches',
        changes: { next: saved.config, previous },
      })
      const { items } = await computeNewLaunches(saved.config)
      return NextResponse.json({ config: saved.config, live: items })
    }

    if (type === 'PIN' || type === 'UNPIN' || type === 'HIDE' || type === 'SHOW') {
      const projectId = body.projectId as string
      if (!projectId || typeof projectId !== 'string') {
        return NextResponse.json({ error: 'projectId required' }, { status: 400 })
      }
      const project = await db.project.findUnique({
        where: { id: projectId },
        select: { id: true, name: true },
      })
      if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

      const previous = await getNewLaunchesConfig()
      const next = {
        ...previous,
        pinnedIds: [...previous.pinnedIds],
        hiddenIds: [...previous.hiddenIds],
      }

      if (type === 'PIN') {
        if (!next.pinnedIds.includes(projectId)) next.pinnedIds.push(projectId)
        next.hiddenIds = next.hiddenIds.filter((id) => id !== projectId)
      } else if (type === 'UNPIN') {
        next.pinnedIds = next.pinnedIds.filter((id) => id !== projectId)
      } else if (type === 'HIDE') {
        if (!next.hiddenIds.includes(projectId)) next.hiddenIds.push(projectId)
        next.pinnedIds = next.pinnedIds.filter((id) => id !== projectId)
      } else {
        // SHOW
        next.hiddenIds = next.hiddenIds.filter((id) => id !== projectId)
      }

      const saved = await saveNewLaunchesConfig(next)
      if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 400 })

      await logAudit({
        userId: actorId,
        action: `NEW_LAUNCHES_${type}`,
        entity: 'Project',
        entityId: projectId,
        changes: {
          project: project.name,
          pinned: saved.config.pinnedIds,
          hidden: saved.config.hiddenIds,
        },
      })

      const { items } = await computeNewLaunches(saved.config)
      return NextResponse.json({ config: saved.config, live: items, action: type, projectId })
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
  } catch (err) {
    console.error('New launches control POST error:', err)
    return NextResponse.json({ error: 'Failed to update New Launches' }, { status: 500 })
  }
}
