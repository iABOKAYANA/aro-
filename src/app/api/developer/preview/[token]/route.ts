import { NextResponse } from 'next/server'
import { verifyPreviewToken } from '@/lib/developer-preview'

export const dynamic = 'force-dynamic'

/**
 * GET /api/developer/preview/[token]
 * Verifies a signed owner-preview token minted by
 * GET /api/developer/projects/[id]/preview-link. No session required —
 * possession of a valid signature is the auth (shareable with buyers for
 * unlisted projects). Expired tokens → 410, malformed/forged → 404.
 * → 200 { projectId }
 */
export async function GET(
  _req: Request,
  { params }: { params: { token: string } }
) {
  const result = verifyPreviewToken(params.token)
  if (!result.ok) {
    if (result.reason === 'expired') {
      return NextResponse.json({ error: 'Preview link expired' }, { status: 410 })
    }
    return NextResponse.json({ error: 'Invalid preview link' }, { status: 404 })
  }
  return NextResponse.json({ projectId: result.projectId })
}
