import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')
    if (!q || q.trim().length === 0) {
      return NextResponse.json({ results: { users: [], projects: [], units: [], leads: [], inquiries: [] } })
    }

    const searchTerm = q.trim()

    const [users, projects, units, leads, inquiries] = await Promise.all([
      db.user.findMany({
        where: {
          OR: [
            { name: { contains: searchTerm } },
            { email: { contains: searchTerm } },
            { phone: { contains: searchTerm } },
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          avatar: true,
          role: true,
          status: true,
        },
        take: 20,
      }),
      db.project.findMany({
        where: {
          OR: [
            { name: { contains: searchTerm } },
            { nameArabic: { contains: searchTerm } },
            { slug: { contains: searchTerm } },
          ],
        },
        select: {
          id: true,
          name: true,
          nameArabic: true,
          slug: true,
          status: true,
          startPrice: true,
          coverImage: true,
        },
        take: 20,
      }),
      db.unit.findMany({
        // CEO console search keeps ALL rows (samples included) — the units
        // table badges them via `isSample`.
        where: {
          OR: [
            { name: { contains: searchTerm } },
            { unitNumber: { contains: searchTerm } },
            { nameArabic: { contains: searchTerm } },
          ],
        },
        select: {
          id: true,
          name: true,
          unitNumber: true,
          unitType: true,
          price: true,
          status: true,
          area: true,
          isSample: true,
          project: { select: { id: true, name: true } },
        },
        take: 20,
      }),
      db.lead.findMany({
        where: {
          OR: [
            { name: { contains: searchTerm } },
            { email: { contains: searchTerm } },
            { phone: { contains: searchTerm } },
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          score: true,
        },
        take: 20,
      }),
      db.inquiry.findMany({
        where: {
          OR: [
            { name: { contains: searchTerm } },
            { email: { contains: searchTerm } },
            { phone: { contains: searchTerm } },
            { message: { contains: searchTerm } },
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          type: true,
          unit: { select: { id: true, name: true } },
        },
        take: 20,
      }),
    ])

    return NextResponse.json({
      query: searchTerm,
      results: { users, projects, units, leads, inquiries },
      counts: {
        users: users.length,
        projects: projects.length,
        units: units.length,
        leads: leads.length,
        inquiries: inquiries.length,
      },
    })
  } catch (error) {
    console.error('CEO search error:', error)
    return NextResponse.json({ error: 'Failed to search' }, { status: 500 })
  }
}
