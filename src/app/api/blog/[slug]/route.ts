import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params

    const blog = await db.blog.findUnique({
      where: { slug, isPublished: true },
    })

    if (!blog) {
      return NextResponse.json({ error: 'Blog not found' }, { status: 404 })
    }

    // NOTE: view-count increments used to run here. A GET must never write —
    // the increment was removed; the response shape ({ blog }) is unchanged.
    return NextResponse.json({ blog })
  } catch (error) {
    console.error('Fetch blog error:', error)
    return NextResponse.json({ error: 'Failed to fetch blog' }, { status: 500 })
  }
}
