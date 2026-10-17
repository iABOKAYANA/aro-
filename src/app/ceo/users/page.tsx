'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn, getInitials } from '@/lib/utils'
import ExportCsvBtn from '@/components/ui/export-csv'
import { useLanguage } from '@/lib/language-context'
import { roleLabel, statusLabel } from '@/components/ceo/ceo-charts'
import {
  Search,
  Users,
  Shield,
  Crown,
  Briefcase,
  Code,
  UserCheck,
  UserX,
  ChevronDown,
  X,
  AlertTriangle,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { Reveal } from '@/components/design'

type Role = 'CEO' | 'ADMIN' | 'BROKER' | 'DEVELOPER' | 'SELLER' | 'BUYER'
type Status = 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'REJECTED' | 'DISABLED'

interface User {
  id: string
  name: string
  email: string
  role: Role
  status: Status
  createdAt: string
  lastLogin: string | null
  isActive: boolean
  avatar?: string | null
}

const ROLE_TABS: { label: string; value: Role | 'ALL' }[] = [
  { label: 'ALL', value: 'ALL' },
  { label: 'CEO', value: 'CEO' },
  { label: 'ADMIN', value: 'ADMIN' },
  { label: 'BROKER', value: 'BROKER' },
  { label: 'DEVELOPER', value: 'DEVELOPER' },
  { label: 'SELLER', value: 'SELLER' },
  { label: 'BUYER', value: 'BUYER' },
]

const ROLE_OPTIONS: Role[] = ['CEO', 'ADMIN', 'BROKER', 'DEVELOPER', 'SELLER', 'BUYER']

// Cursor-pagination page size for GET /api/ceo/users (`?cursor=&limit=` →
// `{items, nextCursor}`). Filters/sorts/search stay client-side over loaded pages.
const USERS_PAGE_SIZE = 50

const ROLE_BADGE_STYLES: Record<Role, string> = {
  CEO: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  ADMIN: 'bg-red-500/10 text-red-400 border-red-500/20',
  BROKER: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  DEVELOPER: 'bg-green-500/10 text-green-400 border-green-500/20',
  SELLER: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  BUYER: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
}

const ROLE_ICON: Record<Role, React.ReactNode> = {
  CEO: <Crown className="h-3 w-3" />,
  ADMIN: <Shield className="h-3 w-3" />,
  BROKER: <Briefcase className="h-3 w-3" />,
  DEVELOPER: <Code className="h-3 w-3" />,
  SELLER: <Users className="h-3 w-3" />,
  BUYER: <UserCheck className="h-3 w-3" />,
}

const AVATAR_COLORS: Record<Role, string> = {
  CEO: 'bg-amber-500/20 text-amber-400 ring-amber-500/30',
  ADMIN: 'bg-red-500/20 text-red-400 ring-red-500/30',
  BROKER: 'bg-blue-500/20 text-blue-400 ring-blue-500/30',
  DEVELOPER: 'bg-green-500/20 text-green-400 ring-green-500/30',
  SELLER: 'bg-purple-500/20 text-purple-400 ring-purple-500/30',
  BUYER: 'bg-cyan-500/20 text-cyan-400 ring-cyan-500/30',
}

const STATUS_BADGE: Record<Status, string> = {
  ACTIVE: 'border-green-500/20 bg-green-500/10 text-green-400',
  PENDING: 'border-yellow-500/20 bg-yellow-500/10 text-yellow-400',
  SUSPENDED: 'border-red-500/20 bg-red-500/10 text-red-400',
  REJECTED: 'border-gray-500/20 bg-gray-500/10 text-gray-500',
  DISABLED: 'border-gray-500/20 bg-gray-500/10 text-gray-500',
}

function SkeletonRow() {
  return (
    <tr className="border-b border-border dark:border-[#262626]">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
          <div className="space-y-1.5">
            <div className="h-3.5 w-28 animate-pulse rounded-full bg-muted" />
            <div className="h-3 w-40 animate-pulse rounded-full bg-muted" />
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
      </td>
      <td className="px-4 py-3">
        <div className="h-3.5 w-24 animate-pulse rounded-full bg-muted" />
      </td>
      <td className="px-4 py-3">
        <div className="h-3.5 w-24 animate-pulse rounded-full bg-muted" />
      </td>
      <td className="px-4 py-3">
        <div className="h-5 w-14 animate-pulse rounded-full bg-muted" />
      </td>
      <td className="px-4 py-3">
        <div className="h-8 w-24 animate-pulse rounded-full bg-muted" />
      </td>
    </tr>
  )
}

export default function CEOUsersPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeRole, setActiveRole] = useState<Role | 'ALL'>('ALL')
  const [activeStatus, setActiveStatus] = useState<Status | 'ALL'>('ALL')
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{
    userId: string
    userName: string
    currentRole: Role
    newRole: Role
  } | null>(null)
  const [changingRole, setChangingRole] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  // Cursor pagination state — `pagingOn` is true only once the backend speaks
  // `{items, nextCursor}`; legacy `{users}` responses fall back to full-list.
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [pagingOn, setPagingOn] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState<string | null>(null)

  const fetchUsersPage = useCallback(async (cursor: string | null) => {
    const params = new URLSearchParams({ limit: String(USERS_PAGE_SIZE) })
    if (cursor) params.set('cursor', cursor)
    const res = await fetch(`/api/ceo/users?${params.toString()}`)
    if (!res.ok) throw new Error('Failed to fetch users')
    const data = await res.json()
    // Paginated contract: {items, nextCursor}
    if (Array.isArray((data as { items?: unknown }).items)) {
      const paged = data as { items: User[]; nextCursor?: string | null }
      return { items: paged.items || [], nextCursor: paged.nextCursor ?? null, paged: true }
    }
    // Legacy fallback: {users} — no crash during backend rollout.
    return { items: ((data as { users?: User[] }).users || []) as User[], nextCursor: null as string | null, paged: false }
  }, [])

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    setMoreError(null)
    try {
      const { items, nextCursor: nc, paged } = await fetchUsersPage(null)
      setUsers(items)
      setNextCursor(nc)
      setPagingOn(paged)
    } catch (err) {
      console.error('Failed to fetch users:', err)
      setError(ar ? 'معرفناش نجيب اليوزرز — حاول تاني.' : 'Failed to fetch users')
    } finally {
      setLoading(false)
    }
  }, [ar, fetchUsersPage])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  // Append-only "load more" — filters/search stay client-side over loaded pages.
  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    setMoreError(null)
    try {
      const { items, nextCursor: nc } = await fetchUsersPage(nextCursor)
      setUsers((prev) => {
        const seen = new Set(prev.map((u) => u.id))
        return [...prev, ...items.filter((u) => !seen.has(u.id))]
      })
      setNextCursor(nc)
    } catch (err) {
      console.error('Failed to load more users:', err)
      setMoreError(ar ? 'معرفناش نجيب الباقي — حاول تاني.' : 'Failed to load more')
    } finally {
      setLoadingMore(false)
    }
  }, [nextCursor, loadingMore, fetchUsersPage, ar])

  const roleCounts = ROLE_OPTIONS.reduce(
    (acc, role) => {
      acc[role] = users.filter((u) => u.role === role).length
      return acc
    },
    {} as Record<Role, number>
  )

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      search === '' ||
      user.name.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase())
    const matchesRole = activeRole === 'ALL' || user.role === activeRole
    const matchesStatus = activeStatus === 'ALL' || user.status === activeStatus
    return matchesSearch && matchesRole && matchesStatus
  })

  const handleRoleChangeRequest = (userId: string, userName: string, currentRole: Role, newRole: Role) => {
    if (currentRole === newRole) {
      setOpenDropdownId(null)
      return
    }
    setConfirmDialog({ userId, userName, currentRole, newRole })
    setOpenDropdownId(null)
  }

  const confirmRoleChange = async () => {
    if (!confirmDialog) return
    setChangingRole(confirmDialog.userId)
    try {
      const res = await fetch(`/api/ceo/users/${confirmDialog.userId}/role`, {
        method: 'PATCH',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: confirmDialog.newRole }),
      })
      if (!res.ok) throw new Error('Failed to update role')
      setUsers((prev) =>
        prev.map((u) =>
          u.id === confirmDialog.userId ? { ...u, role: confirmDialog.newRole } : u
        )
      )
    } catch {
      // silent
    } finally {
      setChangingRole(null)
      setConfirmDialog(null)
    }
  }

  /** Suspend/reactivate an account — PATCH /api/ceo/users. The server
   *  rejects self-changes and unknown ids, so surface its message. */
  const toggleActive = async (user: User) => {
    const activating = !user.isActive
    setTogglingId(user.id)
    try {
      const res = await fetch('/api/ceo/users', {
        method: 'PATCH',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          isActive: activating,
          status: activating ? 'ACTIVE' : 'SUSPENDED',
        }),
      })
      const payload = await res.json().catch(() => ({} as { error?: string }))
      if (!res.ok) throw new Error(payload.error || 'Failed to update account')
      const nextStatus = (activating ? 'ACTIVE' : 'SUSPENDED') as Status
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, isActive: activating, status: nextStatus } : u))
      )
    } catch (err) {
      console.error('Failed to update account:', err)
      alert(ar ? 'معرفناش نحدّث الحساب — حاول تاني.' : 'Failed to update account')
    } finally {
      setTogglingId(null)
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString(ar ? 'ar-EG' : 'en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Reveal>
          <p className="section-kicker">{ar ? 'لوحة المدير · المستخدمون' : 'CEO Console · Users'}</p>
          <h1 className="font-display display-3 text-foreground">{ar ? 'إدارة المستخدمين' : 'User Management'}</h1>
          <p className="text-sm text-gray-400">{ar ? 'اتحكم في كل يوزرز المنصة والأدوار والصلاحيات' : 'Manage all platform users, roles, and access levels'}</p>
          <hr className="gold-hairline mt-4" />
        </Reveal>
        <Button
          onClick={fetchUsers}
          variant="outline"
          className="w-fit border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]"
        >
          <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
          {ar ? 'حدّث' : 'Refresh'}
        </Button>
      </div>

      {/* Role Stats */}
      <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
        {ROLE_OPTIONS.map((role) => (
          <button
            key={role}
            onClick={() => setActiveRole(activeRole === role ? 'ALL' : role)}
            className={cn(
              'flex items-center gap-3 rounded-2xl border p-4 transition-all',
              activeRole === role
                ? 'border-estate-gold/30 bg-estate-gold/5'
                : 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] hover:bg-card dark:hover:bg-[#0A0A0A]'
            )}
          >
            <div
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-2xl',
                role === 'CEO' && 'bg-amber-500/10 text-amber-400',
                role === 'ADMIN' && 'bg-red-500/10 text-red-400',
                role === 'BROKER' && 'bg-blue-500/10 text-blue-400',
                role === 'DEVELOPER' && 'bg-green-500/10 text-green-400',
                role === 'SELLER' && 'bg-purple-500/10 text-purple-400',
                role === 'BUYER' && 'bg-cyan-500/10 text-cyan-400'
              )}
            >
              {ROLE_ICON[role]}
            </div>
            <div className="text-left">
              <p className="text-xs text-gray-500">{roleLabel(role, ar)}</p>
              <p className="text-lg font-bold text-foreground">{roleCounts[role]}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Status Filter */}
      <div className="flex flex-wrap gap-2">
        {(['ALL', 'ACTIVE', 'PENDING', 'SUSPENDED', 'REJECTED', 'DISABLED'] as const).map((s) => {
          const count = s === 'ALL' ? users.length : users.filter(u => u.status === s).length
          return (
            <button
              key={s}
              onClick={() => setActiveStatus(activeStatus === s ? 'ALL' : s)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-all border',
                activeStatus === s
                  ? s === 'ALL'
                    ? 'border-estate-gold/30 bg-estate-gold/10 text-estate-gold'
                    : s === 'ACTIVE'
                    ? 'border-green-500/30 bg-green-500/10 text-green-400'
                    : s === 'PENDING'
                    ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400'
                    : s === 'SUSPENDED'
                    ? 'border-red-500/30 bg-red-500/10 text-red-400'
                    : 'border-gray-500/30 bg-gray-500/10 text-gray-400'
                  : 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-500 hover:text-gray-300'
              )}
            >
              {s === 'ALL' ? (ar ? 'الكل' : 'ALL') : statusLabel(s, ar)} ({count})
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <Input
          placeholder={ar ? 'دوّر بالاسم أو الإيميل…' : 'Search by name or email...'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] pl-10 text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50 focus:ring-estate-gold/20"
        />
      </div>

      {/* Role Tabs + export */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {ROLE_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveRole(tab.value)}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium transition-all',
                activeRole === tab.value
                  ? 'bg-estate-gold text-[#0F1A2C]'
                  : 'border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-400 hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-foreground'
              )}
            >
              {tab.value === 'ALL' ? (ar ? 'الكل' : 'ALL') : roleLabel(tab.value, ar)}
            </button>
          ))}
        </div>

        {/* Exports exactly the rows shown in the current role tab/search. */}
        <ExportCsvBtn
          filename="ceo-users"
          rows={filteredUsers.map((u) => ({
            name: u.name,
            email: u.email,
            role: u.role,
            status: u.status,
            isActive: u.isActive,
            createdAt: u.createdAt,
            lastLogin: u.lastLogin,
          }))}
          columns={[
            { key: 'name', label: ar ? 'الاسم' : 'Name' },
            { key: 'email', label: ar ? 'الإيميل' : 'Email' },
            { key: 'role', label: ar ? 'الدور' : 'Role' },
            { key: 'status', label: ar ? 'الحالة' : 'Status' },
            { key: 'isActive', label: ar ? 'نشط' : 'Active' },
            { key: 'createdAt', label: ar ? 'اتعمل' : 'Created' },
            { key: 'lastLogin', label: ar ? 'آخر دخول' : 'Last login' },
          ]}
        />
      </div>

      {/* Table */}
      <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
        <CardContent className="p-0">
          {error ? (
            <div className="flex flex-col items-center gap-3 py-16">
              <AlertTriangle className="h-10 w-10 text-red-400" />
              <p className="text-sm text-gray-400">{error}</p>
              <Button
                onClick={fetchUsers}
                variant="outline"
                size="sm"
                className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300"
              >
                {ar ? 'حاول تاني' : 'Try Again'}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border dark:border-[#262626] text-left text-xs uppercase tracking-wider text-gray-500">
                    <th className="px-4 py-3 font-medium">{ar ? 'اليوزر' : 'User'}</th>
                    <th className="px-4 py-3 font-medium">{ar ? 'الدور' : 'Role'}</th>
                    <th className="px-4 py-3 font-medium">{ar ? 'متسجل من' : 'Registered'}</th>
                    <th className="px-4 py-3 font-medium">{ar ? 'آخر دخول' : 'Last Login'}</th>
                    <th className="px-4 py-3 font-medium">{ar ? 'الحالة' : 'Status'}</th>
                    <th className="px-4 py-3 font-medium">{ar ? 'إجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <>
                      <SkeletonRow />
                      <SkeletonRow />
                      <SkeletonRow />
                      <SkeletonRow />
                      <SkeletonRow />
                    </>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-16 text-center">
                        <Users className="mx-auto mb-3 h-10 w-10 text-gray-600" />
                        <p className="text-sm text-gray-400">{ar ? 'مفيش يوزرز' : 'No users found'}</p>
                        <p className="text-xs text-gray-600">{ar ? 'جرّب تظبط البحث أو الفلاتر' : 'Try adjusting your search or filters'}</p>
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <tr
                        key={user.id}
                        className="border-b border-border dark:border-[#262626] transition-colors hover:bg-white/[0.02]"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                'flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-offset-1 ring-offset-transparent text-sm font-semibold',
                                AVATAR_COLORS[user.role]
                              )}
                            >
                              {user.avatar ? (
                                <Image
                                  src={user.avatar}
                                  alt={user.name}
                                  width={36}
                                  height={36}
                                  className="h-9 w-9 rounded-full object-cover"
                                />
                              ) : (
                                getInitials(user.name)
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-foreground">{user.name}</p>
                              <p className="text-xs text-gray-500">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            className={cn(
                              'border text-xs font-medium',
                              ROLE_BADGE_STYLES[user.role]
                            )}
                          >
                            {ROLE_ICON[user.role]}
                            <span className="ml-1">{roleLabel(user.role, ar)}</span>
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-400">{formatDate(user.createdAt)}</td>
                        <td className="px-4 py-3 text-sm text-gray-400">{formatDate(user.lastLogin)}</td>
                        <td className="px-4 py-3">
                          <Badge className={cn('border text-xs', STATUS_BADGE[user.status] || STATUS_BADGE.ACTIVE)}>
                            {statusLabel(user.status || (user.isActive ? 'ACTIVE' : 'INACTIVE'), ar)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => toggleActive(user)}
                              disabled={togglingId === user.id || changingRole === user.id}
                              title={user.isActive ? (ar ? 'وقّف الحساب ده' : 'Suspend this account') : (ar ? 'شغّل الحساب ده تاني' : 'Reactivate this account')}
                              className={cn(
                                'flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
                                user.isActive
                                  ? 'border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20'
                                  : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                              )}
                            >
                              {togglingId === user.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : user.isActive ? (
                                <>
                                  <UserX className="h-3 w-3" />
                                  {ar ? 'وقّف' : 'Suspend'}
                                </>
                              ) : (
                                <>
                                  <UserCheck className="h-3 w-3" />
                                  {ar ? 'شغّل' : 'Activate'}
                                </>
                              )}
                            </button>
                            <div className="relative">
                              <button
                                onClick={() =>
                                  setOpenDropdownId(openDropdownId === user.id ? null : user.id)
                                }
                                disabled={changingRole === user.id}
                                className="flex items-center gap-1 rounded-full border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:bg-card dark:hover:bg-[#0A0A0A] disabled:opacity-50"
                              >
                                {changingRole === user.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <>
                                    {ar ? 'غيّر الدور' : 'Change Role'}
                                    <ChevronDown className="h-3 w-3" />
                                  </>
                                )}
                              </button>
                              {openDropdownId === user.id && (
                                <>
                                  <div
                                    className="fixed inset-0 z-40"
                                    onClick={() => setOpenDropdownId(null)}
                                  />
                                  <div className="absolute right-0 z-50 mt-1 w-40 overflow-hidden rounded-2xl border border-border dark:border-[#262626] bg-[#1a2536] shadow-xl shadow-black/30">
                                    {ROLE_OPTIONS.map((role) => (
                                      <button
                                        key={role}
                                        onClick={() =>
                                          handleRoleChangeRequest(
                                            user.id,
                                            user.name,
                                            user.role,
                                            role
                                          )
                                        }
                                        className={cn(
                                          'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-card dark:hover:bg-[#0A0A0A]',
                                          user.role === role && 'text-estate-gold'
                                        )}
                                      >
                                        {ROLE_ICON[role]}
                                        <span className={user.role === role ? 'font-medium' : 'text-gray-300'}>
                                          {roleLabel(role, ar)}
                                        </span>
                                        {user.role === role && (
                                          <span className="ml-auto text-xs text-gray-500">{ar ? 'الحالي' : 'current'}</span>
                                        )}
                                      </button>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cursor pagination footer — hidden for legacy {users} shape (pagingOn=false). */}
      {pagingOn && !loading && !error && users.length > 0 && (
        <div className="flex flex-col items-center gap-2 py-2">
          {nextCursor ? (
            <>
              <Button
                onClick={loadMore}
                disabled={loadingMore}
                variant="outline"
                className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300"
              >
                {loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {loadingMore
                  ? (ar ? 'بيحمّل…' : 'Loading…')
                  : (ar ? `حمّل كمان (${users.length} محمّلين)` : `Load more (${users.length} loaded)`)}
              </Button>
              {moreError && (
                <p className="text-xs text-red-400">{moreError}</p>
              )}
            </>
          ) : (
            <p className="text-xs text-gray-600">
              {ar ? `كل اليوزرز المحمّلين (${users.length})` : `All loaded users (${users.length})`}
            </p>
          )}
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-3xl border border-border dark:border-[#262626] bg-card dark:bg-black p-6 shadow-2xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
              <AlertTriangle className="h-6 w-6 text-amber-400" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">{ar ? 'تغيير دور اليوزر' : 'Change User Role'}</h3>
            <p className="mt-2 text-sm text-gray-400">
              {ar ? (
                <>متأكد عايز تغيّر دور{' '}
                <span className="font-medium text-foreground">{confirmDialog.userName}</span>{' '}
                من{' '}
                <span className={cn('font-medium', confirmDialog.currentRole === 'CEO' ? 'text-amber-400' : 'text-gray-300')}>
                  {roleLabel(confirmDialog.currentRole, ar)}
                </span>{' '}
                لـ{' '}
                <span className={cn('font-medium', confirmDialog.newRole === 'CEO' ? 'text-amber-400' : 'text-gray-300')}>
                  {roleLabel(confirmDialog.newRole, ar)}
                </span>
                ؟</>
              ) : (
                <>Are you sure you want to change{' '}
                <span className="font-medium text-foreground">{confirmDialog.userName}</span>
                &apos;s role from{' '}
                <span className={cn('font-medium', confirmDialog.currentRole === 'CEO' ? 'text-amber-400' : 'text-gray-300')}>
                  {roleLabel(confirmDialog.currentRole, ar)}
                </span>{' '}
                to{' '}
                <span className={cn('font-medium', confirmDialog.newRole === 'CEO' ? 'text-amber-400' : 'text-gray-300')}>
                  {roleLabel(confirmDialog.newRole, ar)}
                </span>
                ?</>
              )}
            </p>
            <p className="mt-1 text-xs text-gray-500">{ar ? 'التغيير هيطبق فورًا.' : 'This action will take effect immediately.'}</p>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setConfirmDialog(null)}
                className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]"
              >
                {ar ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button
                onClick={confirmRoleChange}
                disabled={changingRole !== null}
                className="gold-shimmer bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold/90"
              >
                {changingRole ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {ar ? 'بيتحدّث…' : 'Updating...'}
                  </>
                ) : (
                  ar ? 'أكّد التغيير' : 'Confirm Change'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
