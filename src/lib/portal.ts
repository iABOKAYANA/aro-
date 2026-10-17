import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'

export type PortalRole = 'BROKER' | 'DEVELOPER'

export type PortalUser = {
  id: string
  name: string
  email: string
  role: string
  avatar: string | null
}

/**
 * Resolve the signed-in user for a role portal.
 *
 * Returns `null` only when there is no session at all (middleware already
 * guards these routes, so this is defence in depth rather than the first line).
 * Callers decide what to render for "signed in but wrong role / no profile".
 */
export async function currentPortalUser(): Promise<PortalUser | null> {
  const session = await auth()
  const userId = (session?.user as any)?.id as string | undefined
  if (!userId) return null

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, avatar: true, isActive: true },
  })
  if (!user) return null
  if (!user.isActive) return null

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
  }
}

/** True when this user may view the given role portal (CEO/ADMIN may preview). */
export function canOpenPortal(user: PortalUser | null, role: PortalRole): boolean {
  if (!user) return false
  return user.role === role || user.role === 'CEO' || user.role === 'ADMIN'
}

/** Convenience for server pages: resolves the user or sends them to login. */
export async function requirePortalUser(role: PortalRole): Promise<PortalUser> {
  const user = await currentPortalUser()
  if (!user) redirect('/auth/login?callbackUrl=/' + role)
  if (!canOpenPortal(user, role)) redirect('/dashboard')
  return user
}
