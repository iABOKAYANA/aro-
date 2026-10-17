import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Same gate as `?all=true` in src/app/api/press/route.ts: only a CEO/ADMIN
 * session may read a draft by slug. Everyone else — including the mobile app —
 * is served published releases only.
 */
async function wantsUnpublished(req: NextRequest): Promise<boolean> {
  if (req.nextUrl.searchParams.get('all') !== 'true') return false
  const session = await auth()
  const role = (session?.user as { role?: string } | undefined)?.role
  return role === 'CEO' || role === 'ADMIN'
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params

    const release = (await wantsUnpublished(req))
      ? await db.pressRelease.findUnique({ where: { slug } })
      : await db.pressRelease.findUnique({ where: { slug, isPublished: true } })

    if (!release) {
      return NextResponse.json({ error: 'Press release not found' }, { status: 404 })
    }

    return NextResponse.json({ pressRelease: release })
  } catch (error) {
    console.error('Fetch press release error:', error)
    return NextResponse.json({ error: 'Failed to fetch press release' }, { status: 500 })
  }
}
