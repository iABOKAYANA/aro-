import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi } from '@/lib/permissions'
import { getClientDna, recomputeDna } from '@/lib/client-dna'
import { parseJsonSafe } from '@/lib/utils'

export const dynamic = 'force-dynamic'

// ─── CEO visibility of Client DNA (Feature 1) ──────────────
// CEO/ADMIN only. Buyers see only their own DNA via /api/client-dna.

export async function GET(req: Request) {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const search = searchParams.get('search')
    const minConfidence = Number(searchParams.get('minConfidence') || 0)
    const page = Math.max(1, Number(searchParams.get('page') || 1))
    const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || 20)))

    // Detail view for one user
    if (id) {
      const user = await db.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, role: true, status: true } })
      if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
      const force = searchParams.get('force') === 'true'
      const snapshot = force ? await recomputeDna(id) : await getClientDna(id, { force: false })
      return NextResponse.json({ user, ...snapshot })
    }

    // List view
    const where: Record<string, unknown> = { role: 'BUYER' }
    if (search) {
      where.OR = [{ name: { contains: search } }, { email: { contains: search } }]
    }

    const users = await db.user.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: { id: true, name: true, email: true, status: true, createdAt: true, profile: { select: { dnaConfidence: true, dnaUpdatedAt: true, dnaData: true } } },
    })

    let rows = users.map((u) => {
      const dna = parseJsonSafe<Record<string, unknown>>(u.profile?.dnaData, {})
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        status: u.status,
        confidence: u.profile?.dnaConfidence ?? 0,
        updatedAt: u.profile?.dnaUpdatedAt ? new Date(u.profile.dnaUpdatedAt).toISOString() : null,
        fields: (dna.fields as number) || 0,
        budget: dna.budget || null,
        locations: (dna.locations as string[]) || [],
        propertyTypes: (dna.propertyTypes as string[]) || [],
        intent: dna.intent || null,
        urgency: dna.urgency || null,
      }
    })
    if (minConfidence > 0) rows = rows.filter((r) => r.confidence >= minConfidence)

    const total = await db.user.count({ where })
    return NextResponse.json({ users: rows, total, page, limit })
  } catch (e) {
    console.error('CEO client DNA error:', e)
    return NextResponse.json({ error: 'Failed to load client DNA' }, { status: 500 })
  }
}
