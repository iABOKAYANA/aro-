import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { isSuperRole } from '@/lib/permissions'

// ─── Lead / Deal access control (server-side only) ───────
// Every route uses these helpers — roles are never trusted from the client.

export interface ActorContext {
  userId: string
  role: string
  brokerId: string | null
  developerId: string | null
  isCEO: boolean
}

export type ActorResult =
  | { ok: true; ctx: ActorContext }
  | { ok: false; response: NextResponse }

export async function requireActor(roles?: string[]): Promise<ActorResult> {
  const session = await auth()
  const user = session?.user as any
  if (!user?.id) {
    return {
      ok: false,
      response: jsonError('Unauthorized', 401),
    }
  }
  const role = (user.role as string) || 'BUYER'
  // CEO/ADMIN pass every role list — they act as all roles.
  if (roles && !roles.includes(role) && !isSuperRole(role)) {
    return { ok: false, response: jsonError('Forbidden', 403) }
  }

  let brokerId: string | null = null
  let developerId: string | null = null
  try {
    if (role === 'BROKER') {
      const p = await db.brokerProfile.findFirst({ where: { userId: user.id }, select: { id: true } })
      brokerId = p?.id ?? null
    }
    if (role === 'DEVELOPER') {
      const p = await db.developerProfile.findFirst({ where: { userId: user.id }, select: { id: true } })
      developerId = p?.id ?? null
    }
  } catch (e) {
    console.error('[access] profile lookup failed:', e)
  }

  return {
    ok: true,
    ctx: {
      userId: user.id,
      role,
      brokerId,
      developerId,
      isCEO: role === 'CEO' || role === 'ADMIN',
    },
  }
}

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

/** Leads visible to this actor:
 *  CEO/ADMIN → all
 *  BROKER    → own leads only
 *  DEVELOPER → leads attached to their projects/developer record
 *  others    → nothing (their leads are not exposed through this API)
 */
export function leadScopeWhere(ctx: ActorContext): Record<string, unknown> {
  if (ctx.isCEO) return {}
  if (ctx.role === 'BROKER') {
    if (!ctx.brokerId) return { id: '__none__' }
    return { brokerId: ctx.brokerId }
  }
  if (ctx.role === 'DEVELOPER') {
    if (!ctx.developerId) return { id: '__none__' }
    return { OR: [{ developerId: ctx.developerId }, { project: { developerId: ctx.developerId } }] }
  }
  return { id: '__none__' }
}

/** Single-lead access check. Returns 'full' | 'masked' | 'none'.
 *  'masked' = developer sees the lead but without raw client phone/email.
 */
export function leadAccessLevel(
  ctx: ActorContext,
  lead: { brokerId: string | null; developerId: string | null; projectDeveloperId: string | null }
): 'full' | 'masked' | 'none' {
  if (ctx.isCEO) return 'full'
  if (ctx.role === 'BROKER') return lead.brokerId && lead.brokerId === ctx.brokerId ? 'full' : 'none'
  if (ctx.role === 'DEVELOPER') {
    const mine =
      (lead.developerId && lead.developerId === ctx.developerId) ||
      (lead.projectDeveloperId && lead.projectDeveloperId === ctx.developerId)
    return mine ? 'masked' : 'none'
  }
  return 'none'
}
