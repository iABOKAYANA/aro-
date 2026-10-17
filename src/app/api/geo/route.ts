import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/geo → { governorates[], cities[], districts[] }
//   governorates: [{ id, name, nameArabic }]
//   cities: [{ id, name, nameArabic, nameSlug, governorateId }]
//   districts: [{ id, name, nameArabic, cityId }]
// Public (no auth). Single snapshot for form dropdowns; no pagination
// (tens of rows). Plain orderBy name (SQLite default collation —
// not Arabic-aware); select only the contracted fields.
export async function GET() {
  try {
    const [governorates, cities, districts] = await Promise.all([
      db.governorate.findMany({
        select: { id: true, name: true, nameArabic: true },
        orderBy: { name: 'asc' },
      }),
      db.city.findMany({
        select: { id: true, name: true, nameArabic: true, nameSlug: true, governorateId: true },
        orderBy: { name: 'asc' },
      }),
      db.district.findMany({
        select: { id: true, name: true, nameArabic: true, cityId: true },
        orderBy: { name: 'asc' },
      }),
    ])
    return NextResponse.json({ governorates, cities, districts })
  } catch (error) {
    console.error('Fetch geo error:', error)
    return NextResponse.json({ error: 'Failed to fetch geo data' }, { status: 500 })
  }
}
