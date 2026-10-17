import { NextResponse } from 'next/server'
import { mintPreviewToken } from '@/lib/developer-preview'
import { requireOwnProject } from '@/lib/developer-projects'

export const dynamic = 'force-dynamic'

/**
 * GET /api/developer/projects/[id]/preview-link
 * Mints a signed owner-preview URL for an OWN project. The token is
 * HMAC-SHA256 over `<projectId>.<expiry>` with the existing server secret
 * (AUTH_SECRET || NEXTAUTH_SECRET — see src/lib/developer-preview.ts), no
 * table, 7-day expiry. Verified by GET /api/developer/preview/[token]
 * (no session needed — the token bearer is the auth).
 * → 200 { url }
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const gate = await requireOwnProject(params.id)
    if (!gate.ok) return gate.response

    const minted = mintPreviewToken(params.id)
    if ('error' in minted) {
      return NextResponse.json(
        { error: 'Preview signing is not configured (missing server secret)' },
        { status: 500 }
      )
    }

    const origin = new URL(req.url).origin
    return NextResponse.json({
      url: `${origin}/api/developer/preview/${minted.token}`,
    })
  } catch (error) {
    console.error('Developer preview-link error:', error)
    return NextResponse.json({ error: 'Failed to mint preview link' }, { status: 500 })
  }
}
