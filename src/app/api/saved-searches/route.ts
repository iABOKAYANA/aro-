import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { countMatches, type SavedFilters } from '@/lib/saved-searches'

export const dynamic = 'force-dynamic'

const MAX_PER_USER = 20
const NAME_MAX = 80

const FILTER_KEYS = [
  'q', 'governorate', 'city', 'district', 'propertyType', 'listingType',
] as const
const NUMBER_KEYS = [
  'minPrice', 'maxPrice', 'bedrooms', 'bathrooms', 'minArea', 'maxArea',
] as const

async function requireUser(): Promise<{ userId: string } | { error: NextResponse }> {
  const session = await auth()
  const userId = (session?.user as any)?.id
  if (!userId) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  return { userId }
}

/** Keep only the fields the search page actually understands. */
function sanitise(raw: unknown): SavedFilters {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out: SavedFilters = {}

  for (const key of FILTER_KEYS) {
    const value = input[key]
    if (typeof value === 'string' && value.trim()) out[key] = value.trim().slice(0, 120)
  }
  for (const key of NUMBER_KEYS) {
    const value = Number(input[key])
    if (Number.isFinite(value) && value >= 0) out[key] = value
  }
  return out
}

function isEmptyFilters(f: SavedFilters): boolean {
  return Object.keys(f).length === 0
}

// ─── GET — list mine (with a live match count per search) ─
export async function GET() {
  try {
    const authResult = await requireUser()
    if ('error' in authResult) return authResult.error
    const { userId } = authResult

    const searches = await db.savedSearch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })

    const items = await Promise.all(
      searches.map(async (s) => {
        let filters: SavedFilters = {}
        try {
          filters = JSON.parse(s.filters)
        } catch {
          filters = {}
        }
        return {
          id: s.id,
          name: s.name,
          filters,
          notifyNew: s.notifyNew,
          createdAt: s.createdAt,
          matchCount: await countMatches(filters),
        }
      })
    )

    return NextResponse.json({ items })
  } catch (error) {
    console.error('List saved searches error:', error)
    return NextResponse.json({ error: 'Failed to load saved searches' }, { status: 500 })
  }
}

// ─── POST — create one ─
export async function POST(req: NextRequest) {
  try {
    const authResult = await requireUser()
    if ('error' in authResult) return authResult.error
    const { userId } = authResult

    const body = await req.json().catch(() => ({}))
    const filters = sanitise(body.filters)

    if (isEmptyFilters(filters)) {
      return NextResponse.json(
        { error: 'This search has no filters — nothing to save.' },
        { status: 400 }
      )
    }

    const name = String(body.name || '').trim().slice(0, NAME_MAX) || defaultName(filters)

    const existing = await db.savedSearch.count({ where: { userId } })
    if (existing >= MAX_PER_USER) {
      return NextResponse.json(
        { error: `You can save up to ${MAX_PER_USER} searches.` },
        { status: 409 }
      )
    }

    const created = await db.savedSearch.create({
      data: {
        userId,
        name,
        filters: JSON.stringify(filters),
        notifyNew: body.notifyNew !== false,
      },
    })

    return NextResponse.json(
      { item: { ...created, matchCount: await countMatches(filters) } },
      { status: 201 }
    )
  } catch (error) {
    console.error('Create saved search error:', error)
    return NextResponse.json({ error: 'Failed to save search' }, { status: 500 })
  }
}

// ─── DELETE — ?id=mine (scoped by userId) ─
export async function DELETE(req: NextRequest) {
  try {
    const authResult = await requireUser()
    if ('error' in authResult) return authResult.error
    const { userId } = authResult

    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    // Scoped delete: a guessed id from someone else matches nothing.
    const result = await db.savedSearch.deleteMany({ where: { id, userId } })
    if (result.count === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ deleted: result.count })
  } catch (error) {
    console.error('Delete saved search error:', error)
    return NextResponse.json({ error: 'Failed to delete saved search' }, { status: 500 })
  }
}

// ─── PATCH — toggle alerts ─
export async function PATCH(req: NextRequest) {
  try {
    const authResult = await requireUser()
    if ('error' in authResult) return authResult.error
    const { userId } = authResult

    const body = await req.json().catch(() => ({}))
    const id = String(body.id || '')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const result = await db.savedSearch.updateMany({
      where: { id, userId },
      data: { notifyNew: body.notifyNew !== false },
    })
    if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ updated: result.count })
  } catch (error) {
    console.error('Update saved search error:', error)
    return NextResponse.json({ error: 'Failed to update saved search' }, { status: 500 })
  }
}

function defaultName(f: SavedFilters): string {
  const parts: string[] = []
  if (f.q) parts.push(`“${f.q}”`)
  if (f.propertyType) parts.push(f.propertyType.replace(/_/g, ' ').toLowerCase())
  if (f.city || f.district || f.governorate) parts.push(f.district || f.city || f.governorate!)
  if (f.minPrice || f.maxPrice) {
    const fmt = (n: number) => `${Math.round(n / 1_000_000)}M`
    if (f.minPrice && f.maxPrice) parts.push(`${fmt(f.minPrice)}–${fmt(f.maxPrice)} EGP`)
    else if (f.minPrice) parts.push(`from ${fmt(f.minPrice)} EGP`)
    else parts.push(`up to ${fmt(f.maxPrice!)} EGP`)
  }
  if (f.bedrooms) parts.push(`${f.bedrooms}+ beds`)
  return parts.slice(0, 3).join(' · ') || 'Saved search'
}
