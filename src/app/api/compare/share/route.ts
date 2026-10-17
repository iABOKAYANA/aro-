import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { getClientIp, rateLimit } from '@/lib/rate-limit'
import { PUBLIC_PROJECT_WHERE } from '@/lib/project-visibility'

export const dynamic = 'force-dynamic'

function ipOf(req: NextRequest): string {
  return getClientIp(req.headers)
}

const MAX_IDS = 4
/** cuid-shaped tokens only — rejects path tricks and empty strings. */
const TOKEN_RE = /^[A-Za-z0-9_-]{7,128}$/

/**
 * `cuid()` without a new dependency: `c` + timestamp + counter + randomness.
 * Prisma's own default is cuid, so minted tokens match the column shape.
 * Randomness comes from `crypto.randomBytes` (invitation-token minting
 * pattern) — never `Math.random()`.
 */
let counter = randomBytes(2).readUInt16BE(0) % 1296
function newToken(): string {
  const ts = Date.now().toString(36)
  counter = (counter + 1) % 1296
  const cnt = counter.toString(36).padStart(2, '0')
  const rand = () =>
    randomBytes(3).toString('hex').slice(0, 4).padStart(4, '0')
  return `c${ts}${cnt}${rand()}${rand()}`
}

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function parseJsonStrings(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/**
 * Same comparison-shaped payload as GET /api/compare — field-for-field, so the
 * shared page and the app render with the exact same components. Kept local
 * (not imported from the sibling route) so neither route file owns the other.
 */
async function resolveItems(ids: string[]) {
  if (ids.length === 0) return []
  const projects = await db.project.findMany({
    where: {
      AND: [
        { ...PUBLIC_PROJECT_WHERE },
        { OR: [{ id: { in: ids } }, { slug: { in: ids } }] },
      ],
    },
    select: {
      id: true,
      slug: true,
      name: true,
      nameArabic: true,
      tagline: true,
      coverImage: true,
      status: true,
      startPrice: true,
      endPrice: true,
      pricePerSqm: true,
      downPaymentMin: true,
      installmentYears: true,
      totalUnits: true,
      totalArea: true,
      compoundArea: true,
      completionPercent: true,
      deliveryDate: true,
      propertyTypes: true,
      listingTypes: true,
      isFeatured: true,
      isVerified: true,
      viewCount: true,
      favoriteCount: true,
      developer: {
        select: { id: true, companyName: true, logo: true, isVerified: true, rating: true, reviewCount: true },
      },
      governorate: { select: { name: true, nameArabic: true } },
      city: { select: { name: true, nameArabic: true } },
      district: { select: { name: true, nameArabic: true } },
      amenities: {
        select: {
          isPremium: true,
          amenity: { select: { name: true, nameArabic: true, icon: true, category: true } },
        },
      },
      paymentPlans: {
        where: { isActive: true },
        orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
        select: {
          id: true,
          name: true,
          downPaymentPct: true,
          installmentYears: true,
          cashDiscount: true,
          isDefault: true,
        },
      },
    },
  })

  const byKey = new Map<string, (typeof projects)[number]>()
  for (const p of projects) {
    byKey.set(p.id, p)
    byKey.set(p.slug, p)
  }

  return ids
    .map((id) => byKey.get(id))
    .filter((p): p is (typeof projects)[number] => Boolean(p))
    .map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      nameArabic: p.nameArabic,
      tagline: p.tagline,
      coverImage: p.coverImage,
      status: p.status,
      startPrice: p.startPrice,
      endPrice: p.endPrice,
      pricePerSqm: p.pricePerSqm,
      downPaymentMin: p.downPaymentMin,
      installmentYears: p.installmentYears,
      totalUnits: p.totalUnits,
      totalArea: p.totalArea,
      compoundArea: p.compoundArea,
      completionPercent: p.completionPercent,
      deliveryDate: p.deliveryDate,
      propertyTypes: parseJsonArray(p.propertyTypes),
      listingTypes: parseJsonArray(p.listingTypes),
      isFeatured: p.isFeatured,
      isVerified: p.isVerified,
      viewCount: p.viewCount,
      favoriteCount: p.favoriteCount,
      developer: p.developer,
      location:
        [p.governorate?.name, p.city?.name, p.district?.name].filter(Boolean).join(', ') || null,
      amenities: p.amenities.map((a) => ({
        name: a.amenity.name,
        icon: a.amenity.icon,
        category: a.amenity.category,
        isPremium: a.isPremium,
      })),
      paymentPlans: p.paymentPlans,
    }))
}

/**
 * POST /api/compare/share  { projectIds: string[] } → { token, url, projectIds }
 *
 * Anonymous creation is allowed on purpose — shares travel over WhatsApp to
 * people who may never sign up. The signed-in user id is attached when there
 * is a session, purely for attribution.
 */
export async function POST(request: NextRequest) {
  try {
    // Anonymous creation is allowed on purpose — throttle per IP so the
    // share table cannot be filled by a bot loop.
    const rl = rateLimit(`compare-share:${ipOf(request)}`, { limit: 20, windowMs: 60 * 60_000 })
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many share links. Please wait a moment and try again.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))),
          },
        }
      )
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    const rawIds = (body as { projectIds?: unknown })?.projectIds
    if (!Array.isArray(rawIds)) {
      return NextResponse.json({ error: 'projectIds must be an array' }, { status: 400 })
    }
    const cleaned = rawIds.filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean)
    const ids = [...new Set(cleaned)]
    if (ids.length === 0) {
      return NextResponse.json({ error: 'Pick at least one project to share' }, { status: 400 })
    }
    if (ids.length > MAX_IDS) {
      return NextResponse.json({ error: `You can share up to ${MAX_IDS} projects` }, { status: 400 })
    }

    const items = await resolveItems(ids)
    if (items.length !== ids.length) {
      const found = new Set<string>()
      for (const item of items) {
        found.add(item.id)
        found.add(item.slug)
      }
      const missing = ids.filter((id) => !found.has(id))
      return NextResponse.json({ error: 'Some projects were not found', missing }, { status: 400 })
    }
    // Canonical ids in the caller's order — slugs never leak into storage.
    const projectIds = items.map((item) => item.id)

    let userId: string | null = null
    try {
      const session = await auth()
      const candidate = (session?.user as { id?: string } | undefined)?.id ?? null
      if (candidate) {
        const exists = await db.user.findUnique({ where: { id: candidate }, select: { id: true } })
        userId = exists?.id ?? null
      }
    } catch {
      userId = null
    }

    let token = ''
    let created: { token: string } | null = null
    for (let attempt = 0; attempt < 3 && !created; attempt++) {
      token = newToken()
      try {
        created = await db.sharedComparison.create({
          data: { token, projectIds: JSON.stringify(projectIds), userId },
          select: { token: true },
        })
      } catch (e) {
        // Token collision (P2002) — astronomically rare, just mint another.
        if ((e as { code?: string })?.code !== 'P2002') throw e
        created = null
      }
    }
    if (!created) {
      return NextResponse.json({ error: 'Could not create the share link' }, { status: 500 })
    }

    const origin = new URL(request.url).origin
    return NextResponse.json(
      { token: created.token, url: `${origin}/compare/shared/${created.token}`, projectIds },
      { status: 201 }
    )
  } catch (error) {
    console.error('Compare share error:', error)
    return NextResponse.json({ error: 'Could not create the share link' }, { status: 500 })
  }
}

/**
 * GET /api/compare/share?token=… → { token, projectIds, items, total }
 * Unknown or malformed tokens are a 404 with a plain message — both clients
 * turn that into a friendly empty state, never a raw error dump.
 */
export async function GET(request: NextRequest) {
  try {
    const token = (new URL(request.url).searchParams.get('token') || '').trim()
    if (!TOKEN_RE.test(token)) {
      return NextResponse.json({ error: 'Share link not found' }, { status: 404 })
    }
    const row = await db.sharedComparison.findUnique({ where: { token } })
    if (!row) {
      return NextResponse.json({ error: 'Share link not found' }, { status: 404 })
    }
    const storedIds = parseJsonStrings(row.projectIds).slice(0, MAX_IDS)
    const items = await resolveItems(storedIds)
    return NextResponse.json(
      { token: row.token, projectIds: storedIds, items, total: items.length },
      { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } }
    )
  } catch (error) {
    console.error('Compare share lookup error:', error)
    return NextResponse.json({ error: 'Could not load the shared comparison' }, { status: 500 })
  }
}
