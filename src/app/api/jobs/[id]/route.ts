import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const job = await db.job.findUnique({
      where: { id },
    })

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Drafts stay behind the CEO/ADMIN management view (?all=true pattern
    // on the collection route). Public callers only see published posts.
    if (!job.isPublished) {
      const session = await auth()
      const role = (session?.user as { role?: string } | undefined)?.role
      if (role !== 'CEO' && role !== 'ADMIN') {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      }
    }

    return NextResponse.json({ job })
  } catch (error) {
    console.error('Fetch job error:', error)
    return NextResponse.json({ error: 'Failed to fetch job' }, { status: 500 })
  }
}
