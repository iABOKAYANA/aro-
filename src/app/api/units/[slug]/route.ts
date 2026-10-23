import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { isPublicProject } from '@/lib/project-visibility'

export const dynamic = 'force-dynamic'

/**
 * One unit as JSON.
 *
 * The website's `/units/[slug]` page queries Prisma directly inside a server
 * component, so unlike every other public entity a unit had no HTTP surface —
 * the mobile app could only reach one by downloading an entire project and
 * scanning `project.units` for it. This is that page's query, opened up.
 *
 * Public data only (units are listed, not private), and it accepts either the
 * unit's slug or its id so callers holding either can use the same route.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params
    const identifier = decodeURIComponent(slug)

    const unit = await db.unit.findFirst({
      where: { OR: [{ slug: identifier }, { id: identifier }] },
      include: {
        phase: { select: { id: true, name: true } },
        project: {
          select: {
            id: true,
            name: true,
            nameArabic: true,
            slug: true,
            tagline: true,
            coverImage: true,
            status: true,
            approvalStatus: true,
            isActive: true,
            parentProjectId: true,
            startPrice: true,
            completionPercent: true,
            deliveryDate: true,
            address: true,
            googleMapsUrl: true,
            developer: {
              select: {
                id: true,
                companyName: true,
                companyNameArabic: true,
                logo: true,
                isVerified: true,
                contactPhone: true,
                contactEmail: true,
                website: true,
                rating: true,
                reviewCount: true,
              },
            },
            governorate: { select: { name: true, nameArabic: true } },
            city: { select: { name: true, nameArabic: true } },
            district: { select: { name: true, nameArabic: true } },
            amenities: {
              select: { amenity: { select: { name: true, icon: true, category: true } } },
              take: 24,
            },
          },
        },
      },
    })

    if (!unit) return NextResponse.json({ error: 'Unit not found' }, { status: 404 })

    const { project, ...rest } = unit

    if (unit.isSample || !['AVAILABLE', 'Vacant'].includes(unit.status)) {
      return NextResponse.json({ error: 'Unit not found' }, { status: 404 })
    }

    // Visibility follows the project (incl. price gate): units of
    // non-approved or priceless projects are invisible here (same 404 as
    // a slug that does not exist). The project select carries no units
    // array, so the viewed unit's own price stands in for the EXISTS check.
    if (!isPublicProject({ ...project, units: [{ price: unit.price }] })) {
      return NextResponse.json({ error: 'Unit not found' }, { status: 404 })
    }

    // Developer direct contact stays behind the inquiry flow for anonymous
    // callers; signed-in users keep the full payload.
    const session = await auth().catch(() => null)
    const developer = (project as unknown as { developer?: Record<string, unknown> | null })?.developer ?? null
    const safeDeveloper = !session?.user && developer
      ? { ...developer, contactPhone: null, contactEmail: null }
      : developer

    return NextResponse.json({
      unit: {
        ...rest,
        // `gallery` and `dataTrust` are JSON columns stored as strings.
        gallery: parseJson<string[]>(rest.gallery, []),
        dataTrust: parseJson<Record<string, unknown>>(rest.dataTrust, {}),
        project: {
          ...project,
          developer: safeDeveloper,
          amenities: project.amenities.map((a) => a.amenity),
        },
      },
    })
  } catch (error) {
    console.error('Fetch unit error:', error)
    return NextResponse.json({ error: 'Failed to fetch unit' }, { status: 500 })
  }
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}
