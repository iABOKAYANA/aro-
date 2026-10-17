import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Public access requests are CLOSED. Accounts are created by invitation from
 * the administration only (CEO `create-user` + `invitations` → register with
 * token). This endpoint stays to answer old clients/links with a clear
 * message instead of silently dropping them.
 *
 * Existing PENDING rows remain in the DB for the CEO access-requests console
 * (`/api/ceo/access-requests`, untouched) to review/reject.
 */
const CLOSED_MESSAGE =
  'Access requests are closed. Account creation is by invitation from the administration — please contact us. / طلبات الدخول مقفولة. إنشاء الحسابات بالدعوة من الإدارة — تواصل معانا.'

export async function POST() {
  return NextResponse.json({ error: CLOSED_MESSAGE }, { status: 410 })
}
