import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const ROLES = ['CEO', 'ADMIN', 'BROKER', 'DEVELOPER', 'SELLER', 'BUYER'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_DASHBOARDS: Record<string, string> = {
  CEO: '/ceo',
  ADMIN: '/admin',
  BROKER: '/dashboard',
  DEVELOPER: '/developer',
  SELLER: '/seller',
  BUYER: '/buyer',
}

export const PERMISSIONS: Record<string, string[]> = {
  CEO: ['*'],
  ADMIN: [
    'users.read', 'users.write',
    'projects.read', 'projects.write',
    'leads.read', 'leads.write',
    'inquiries.read', 'inquiries.write',
    'brokers.read', 'developers.read',
    'analytics.read', 'approvals.read', 'approvals.write',
  ],
  BROKER: [
    'leads.read', 'leads.write',
    'inquiries.read', 'inquiries.write',
    'viewings.read', 'viewings.write',
    'projects.read', 'units.read',
    'customers.read',
  ],
  DEVELOPER: [
    'projects.read', 'projects.write',
    'units.read', 'units.write',
    'analytics.read',
  ],
  SELLER: [
    'units.read', 'units.write',
    'listings.read', 'listings.write',
    'customers.read',
    'inquiries.read',
  ],
  BUYER: [
    'projects.read', 'units.read',
    'favorites.read', 'favorites.write',
    'inquiries.read', 'inquiries.write',
    'viewings.read',
  ],
}

export type Permission = string

/** CEO & ADMIN act as every role: they pass all role checks and hold
 *  all permissions ('*') without ever switching their account role. */
export const SUPER_ROLES = ['CEO', 'ADMIN'] as const

export function isSuperRole(role: string): boolean {
  return (SUPER_ROLES as readonly string[]).includes(role)
}

export function hasPermission(role: string, permission: string): boolean {
  const perms = PERMISSIONS[role]
  if (isSuperRole(role)) return true
  if (!perms) return false
  if (perms.includes('*')) return true
  return perms.includes(permission)
}

export function isValidRole(role: string): boolean {
  return ROLES.includes(role as Role)
}

export function getDashboardForRole(role: string): string {
  return ROLE_DASHBOARDS[role] || '/dashboard'
}

export async function requireAuth() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  return { session, role: (session.user as any).role as string }
}

export async function requireCEO() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login?callbackUrl=/ceo')
  const role = (session.user as any).role as string
  if (role !== 'CEO' && role !== 'ADMIN') redirect('/dashboard')
  return { session, role }
}

export async function requireRole(roles: string[]) {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const role = (session.user as any).role as string
  if (!roles.includes(role) && !isSuperRole(role)) {
    redirect(getDashboardForRole(role))
  }
  return { session, role }
}

export async function requirePermission(permission: string) {
  const session = await auth()
  if (!session?.user) return null
  const role = (session.user as any).role as string
  if (!hasPermission(role, permission)) return null
  return { session, role }
}

export async function requireCEOApi() {
  const session = await auth()
  if (!session?.user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), session: null, role: null }
  const role = (session.user as any).role as string
  if (role !== 'CEO' && role !== 'ADMIN') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), session: null, role: null }
  return { error: null, session, role }
}

export async function requireRoleApi(roles: string[]) {
  const session = await auth()
  if (!session?.user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), session: null, role: null }
  const role = (session.user as any).role as string
  if (!roles.includes(role) && !isSuperRole(role)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), session: null, role: null }
  return { error: null, session, role }
}

export async function requirePermissionApi(permission: string) {
  const session = await auth()
  if (!session?.user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), session: null, role: null }
  const role = (session.user as any).role as string
  if (!hasPermission(role, permission)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), session: null, role: null }
  return { error: null, session, role }
}

export async function logAudit(params: {
  userId?: string
  action: string
  entity: string
  entityId?: string
  changes?: Record<string, unknown>
  ipAddress?: string
}) {
  try {
    await db.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        changes: params.changes ? JSON.stringify(params.changes) : null,
        ipAddress: params.ipAddress,
      },
    })
  } catch (e) {
    console.error('Audit log error:', e)
  }
}
