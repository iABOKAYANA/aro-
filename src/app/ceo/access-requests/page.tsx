'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import { roleLabel, statusLabel } from '@/components/ceo/ceo-charts'
import {
  Users, UserPlus, CheckCircle2, XCircle, Loader2, RefreshCw, X,
  Eye, EyeOff, Send, Ban, AlertTriangle, Inbox, Copy, Check, ChevronDown,
} from 'lucide-react'
import { Reveal } from '@/components/design'

interface AccessRequest {
  id: string; name: string; email: string; phone: string; company: string
  requestedRole: string; status: string; rejectionReason?: string | null
  createdAt: string; updatedAt: string
}

interface Invitation {
  id: string; email: string; role: string; status: string; message?: string | null
  sentBy: string; createdAt: string; acceptedAt?: string | null; expiresAt?: string | null
}

const STATUS_TABS = ['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const
const INVITATION_ROLES = ['BROKER', 'DEVELOPER', 'SELLER', 'ADMIN', 'BUYER'] as const

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  APPROVED: 'bg-green-500/15 text-green-400 border-green-500/30',
  REJECTED: 'bg-red-500/15 text-red-400 border-red-500/30',
  ACCEPTED: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  EXPIRED: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
  REVOKED: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
}

function formatDate(d: string | null, ar = false) {
  if (!d) return '--'
  return new Date(d).toLocaleDateString(ar ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const REQ_HEADERS_AR: Record<string, string> = {
  Name: 'الاسم',
  Email: 'الإيميل',
  Phone: 'التليفون',
  Company: 'الشركة',
  Role: 'الدور',
  Status: 'الحالة',
  Submitted: 'اتقدم',
  Actions: 'إجراءات',
  'Sent By': 'بعتها',
  Sent: 'اتبعتت',
  Accepted: 'اتقبلت',
}

function SkeletonRows({ rows, cols }: { rows: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-border dark:border-[#262626]">
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="px-4 py-3">
              <div className="h-4 w-full animate-pulse rounded-full bg-muted" />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

const inputClass = 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-[#D4A843]/50 focus:ring-[#D4A843]/20'

export default function CEOAccessRequestsPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [activeTab, setActiveTab] = useState<'requests' | 'invitations'>('requests')
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [approveDialog, setApproveDialog] = useState<AccessRequest | null>(null)
  const [approvePassword, setApprovePassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [rejectDialog, setRejectDialog] = useState<AccessRequest | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'BROKER', password: '', message: '' })
  const [sendingInvite, setSendingInvite] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const fetchRequests = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/ceo/access-requests')
      if (!res.ok) throw new Error('Failed to fetch access requests')
      const data = await res.json()
      setRequests(data.requests || []); setStatusCounts(data.statusCounts || {})
    } catch (err) {
      console.error('Failed to fetch access requests:', err)
      setError(ar ? 'معرفناش نجيب طلبات الصلاحية — حاول تاني.' : 'Failed to fetch access requests')
    }
    finally { setLoading(false) }
  }, [ar])

  const fetchInvitations = useCallback(async () => {
    try {
      const res = await fetch('/api/ceo/invitations')
      if (!res.ok) throw new Error('Failed to fetch invitations')
      const data = await res.json(); setInvitations(data.invitations || [])
    } catch (err) {
      console.error('Failed to fetch invitations:', err)
      setError(ar ? 'معرفناش نجيب الدعوات — حاول تاني.' : 'Failed to fetch invitations')
    }
  }, [ar])

  useEffect(() => { fetchRequests(); fetchInvitations() }, [fetchRequests, fetchInvitations])

  const filteredRequests = requests.filter((r) => statusFilter === 'ALL' || r.status === statusFilter)

  const handleApprove = async () => {
    if (!approveDialog) return
    setProcessingId(approveDialog.id)
    try {
      const res = await fetch('/api/ceo/access-requests', {
        method: 'PATCH', headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: approveDialog.id, action: 'approve', ...(approvePassword ? { password: approvePassword } : {}) }),
      })
      if (!res.ok) throw new Error('Failed to approve')
      const data = await res.json()
      if (data.password) { setApprovePassword(data.password); setCopiedId(null); return }
      setRequests((p) => p.map((r) => r.id === approveDialog.id ? { ...r, status: 'APPROVED' } : r))
      setStatusCounts((p) => ({ ...p, PENDING: Math.max(0, (p.PENDING || 0) - 1), APPROVED: (p.APPROVED || 0) + 1 }))
      setApproveDialog(null); setApprovePassword('')
    } catch {} finally { setProcessingId(null) }
  }

  const handleReject = async () => {
    if (!rejectDialog || !rejectReason.trim()) return
    setProcessingId(rejectDialog.id)
    try {
      const res = await fetch('/api/ceo/access-requests', {
        method: 'PATCH', headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rejectDialog.id, action: 'reject', rejectionReason: rejectReason.trim() }),
      })
      if (!res.ok) throw new Error('Failed to reject')
      setRequests((p) => p.map((r) => r.id === rejectDialog.id ? { ...r, status: 'REJECTED', rejectionReason: rejectReason.trim() } : r))
      setStatusCounts((p) => ({ ...p, PENDING: Math.max(0, (p.PENDING || 0) - 1), REJECTED: (p.REJECTED || 0) + 1 }))
      setRejectDialog(null); setRejectReason('')
    } catch {} finally { setProcessingId(null) }
  }

  const handleSendInvite = async () => {
    if (!inviteForm.email.trim()) return; setSendingInvite(true)
    try {
      const res = await fetch('/api/ceo/invitations', {
        method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteForm.email.trim(), role: inviteForm.role,
          ...(inviteForm.password ? { password: inviteForm.password } : {}),
          ...(inviteForm.message ? { message: inviteForm.message } : {}),
        }),
      })
      if (!res.ok) throw new Error('Failed to send invitation')
      const data = await res.json()
      setInvitations((p) => [data.invitation || data, ...p])
      setShowInviteModal(false); setInviteForm({ email: '', role: 'BROKER', password: '', message: '' })
    } catch {} finally { setSendingInvite(false) }
  }

  const handleRevoke = async (id: string) => {
    setRevokingId(id)
    try {
      const res = await fetch(`/api/ceo/invitations?id=${id}`, { method: 'DELETE', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      if (!res.ok) throw new Error('Failed to revoke')
      setInvitations((p) => p.map((inv) => inv.id === id ? { ...inv, status: 'REVOKED' } : inv))
    } catch {} finally { setRevokingId(null) }
  }

  const copyPassword = (pw: string, id: string) => {
    navigator.clipboard.writeText(pw); setCopiedId(id); setTimeout(() => setCopiedId(null), 2000)
  }

  const refreshAll = () => { fetchRequests(); fetchInvitations() }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Reveal>
          <p className="section-kicker">{ar ? 'لوحة المدير · الصلاحيات' : 'CEO Console · Access'}</p>
          <h1 className="font-display display-3 text-foreground">{ar ? 'طلبات الصلاحية والدعوات' : 'Access Requests & Invitations'}</h1>
          <p className="text-sm text-gray-400">{ar ? 'اتحكم في طلبات الدخول على المنصة ودعوات اليوزرز' : 'Manage platform access requests and user invitations'}</p>
          <hr className="gold-hairline mt-4" />
        </Reveal>
        <Button onClick={refreshAll} variant="outline" className="w-fit border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]">
          <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} /> {ar ? 'حدّث' : 'Refresh'}
        </Button>
      </div>

      <div className="flex gap-3">
        {([['requests', Users, 'Access Requests', 'طلبات الصلاحية', requests.length], ['invitations', UserPlus, 'Invitations', 'الدعوات', invitations.length]] as const).map(([tab, Icon, label, labelAr, count]) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={cn(
            'flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-all',
            activeTab === tab ? 'bg-[#D4A843] text-[#0a1220]' : 'border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-400 hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-foreground'
          )}>
            <Icon className="h-4 w-4" /> {ar ? labelAr : label}
            <Badge className="ml-1 border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-xs text-gray-300">{count}</Badge>
          </button>
        ))}
      </div>

      {activeTab === 'requests' && (
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => (
            <button key={tab} onClick={() => setStatusFilter(tab)} className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-all',
              statusFilter === tab ? 'bg-[#D4A843] text-[#0a1220]' : 'border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-400 hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-foreground'
            )}>
              {tab === 'ALL' ? (ar ? 'الكل' : 'ALL') : statusLabel(tab, ar)}{tab !== 'ALL' && statusCounts[tab] !== undefined && <span className="ml-1.5 text-xs opacity-70">({statusCounts[tab]})</span>}
            </button>
          ))}
        </div>
      )}

      {activeTab === 'invitations' && (
        <div className="flex justify-end">
          <Button onClick={() => setShowInviteModal(true)} className="bg-[#D4A843] text-[#0a1220] hover:bg-[#D4A843]/90">
            <UserPlus className="mr-2 h-4 w-4" /> {ar ? 'دعوة جديدة' : 'New Invitation'}
          </Button>
        </div>
      )}

      {error ? (
        <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
          <CardContent className="flex flex-col items-center gap-3 py-16">
            <AlertTriangle className="h-10 w-10 text-red-400" />
            <p className="text-sm text-gray-400">{error}</p>
            <Button onClick={refreshAll} variant="outline" size="sm" className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300">{ar ? 'حاول تاني' : 'Try Again'}</Button>
          </CardContent>
        </Card>
      ) : activeTab === 'requests' ? (
        <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border dark:border-[#262626] text-left text-xs uppercase tracking-wider text-gray-500">
                    {['Name', 'Email', 'Phone', 'Company', 'Role', 'Status', 'Submitted', 'Actions'].map((h) => (
                      <th key={h} className="px-4 py-3 font-medium">{ar ? REQ_HEADERS_AR[h] || h : h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? <SkeletonRows rows={5} cols={8} /> : filteredRequests.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-16 text-center">
                      <Inbox className="mx-auto mb-3 h-10 w-10 text-gray-600" />
                      <p className="text-sm text-gray-400">{ar ? 'مفيش طلبات صلاحية' : 'No access requests found'}</p>
                      <p className="text-xs text-gray-600">{statusFilter !== 'ALL' ? (ar ? 'جرّب تغيّر الفلتر' : 'Try changing the filter') : (ar ? 'لسه مفيش طلبات اتقدمت' : 'No requests have been submitted yet')}</p>
                    </td></tr>
                  ) : filteredRequests.map((req) => (
                    <tr key={req.id} className="border-b border-border dark:border-[#262626] transition-colors hover:bg-white/[0.02]">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#D4A843]/10 text-[#D4A843] text-sm font-semibold ring-1 ring-[#D4A843]/20">
                            {req.name.charAt(0).toUpperCase()}
                          </div>
                          <p className="text-sm font-medium text-foreground">{req.name}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">{req.email}</td>
                      <td className="px-4 py-3 text-sm text-gray-400">{req.phone}</td>
                      <td className="px-4 py-3 text-sm text-gray-400">{req.company || '--'}</td>
                      <td className="px-4 py-3"><Badge className="border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-xs text-gray-300">{roleLabel(req.requestedRole, ar)}</Badge></td>
                      <td className="px-4 py-3">
                        <Badge className={cn('border text-xs font-medium', STATUS_BADGE[req.status] || 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-400')}>{statusLabel(req.status, ar)}</Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">{formatDate(req.createdAt, ar)}</td>
                      <td className="px-4 py-3">
                        {req.status === 'PENDING' && (
                          <div className="flex items-center gap-2">
                            <Button size="sm" onClick={() => { setApproveDialog(req); setApprovePassword(''); setShowPassword(false) }} disabled={processingId === req.id}
                              className="h-8 bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20">
                              {processingId === req.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            </Button>
                            <Button size="sm" onClick={() => { setRejectDialog(req); setRejectReason('') }} disabled={processingId === req.id}
                              className="h-8 bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20">
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                        {req.status === 'REJECTED' && req.rejectionReason && (
                          <span className="text-xs text-red-400/70 max-w-[150px] truncate block" title={req.rejectionReason}>{req.rejectionReason}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border dark:border-[#262626] text-left text-xs uppercase tracking-wider text-gray-500">
                    {['Email', 'Role', 'Sent By', 'Status', 'Sent', 'Accepted', 'Actions'].map((h) => (
                      <th key={h} className="px-4 py-3 font-medium">{ar ? REQ_HEADERS_AR[h] || h : h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? <SkeletonRows rows={3} cols={7} /> : invitations.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-16 text-center">
                      <Inbox className="mx-auto mb-3 h-10 w-10 text-gray-600" />
                      <p className="text-sm text-gray-400">{ar ? 'لسه مبعتّش دعوات' : 'No invitations sent yet'}</p>
                      <p className="text-xs text-gray-600">{ar ? 'دوس "دعوة جديدة" عشان تدعي يوزر' : 'Click "New Invitation" to invite a user'}</p>
                    </td></tr>
                  ) : invitations.map((inv) => (
                    <tr key={inv.id} className="border-b border-border dark:border-[#262626] transition-colors hover:bg-white/[0.02]">
                      <td className="px-4 py-3 text-sm text-foreground font-medium">{inv.email}</td>
                      <td className="px-4 py-3"><Badge className="border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-xs text-gray-300">{roleLabel(inv.role, ar)}</Badge></td>
                      <td className="px-4 py-3 text-sm text-gray-400">{inv.sentBy}</td>
                      <td className="px-4 py-3">
                        <Badge className={cn('border text-xs font-medium', STATUS_BADGE[inv.status] || 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-400')}>{statusLabel(inv.status, ar)}</Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">{formatDate(inv.createdAt, ar)}</td>
                      <td className="px-4 py-3 text-sm text-gray-400">{formatDate(inv.acceptedAt ?? null, ar)}</td>
                      <td className="px-4 py-3">
                        {inv.status === 'PENDING' && (
                          <Button size="sm" onClick={() => handleRevoke(inv.id)} disabled={revokingId === inv.id}
                            className="h-8 bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20">
                            {revokingId === inv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Ban className="mr-1 h-3.5 w-3.5" /> {ar ? 'اسحبها' : 'Revoke'}</>}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {approveDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-3xl border border-border dark:border-[#262626] bg-card dark:bg-black p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground">{approvePassword ? (ar ? 'الحساب اتعمل' : 'Account Created') : (ar ? 'وافق على الطلب' : 'Approve Request')}</h3>
                <p className="text-sm text-gray-400">{approveDialog.name}</p>
              </div>
              <button onClick={() => { setApproveDialog(null); setApprovePassword('') }} className="rounded-full p-1 text-gray-500 hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            {approvePassword ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400" />
                    <p className="text-sm font-medium text-green-400">{ar ? 'الحساب اتعمل بنجاح' : 'Account created successfully'}</p>
                  </div>
                  <p className="text-xs text-gray-400 mb-3">{ar ? 'ابعت الباسورد ده لليوزر. مش هيظهر تاني.' : 'Share this password with the user. It will not be shown again.'}</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 font-mono text-sm text-foreground">
                      {showPassword ? approvePassword : '\u2022'.repeat(12)}
                    </div>
                    <button onClick={() => setShowPassword(!showPassword)} className="rounded-full border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-2 text-gray-400 hover:text-foreground">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    <button onClick={() => copyPassword(approvePassword, approveDialog.id)} className="rounded-full border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-2 text-gray-400 hover:text-foreground">
                      {copiedId === approveDialog.id ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button onClick={() => {
                  setRequests((p) => p.map((r) => r.id === approveDialog.id ? { ...r, status: 'APPROVED' } : r))
                  setStatusCounts((p) => ({ ...p, PENDING: Math.max(0, (p.PENDING || 0) - 1), APPROVED: (p.APPROVED || 0) + 1 }))
                  setApproveDialog(null); setApprovePassword('')
                }} className="w-full bg-[#D4A843] text-[#0a1220] hover:bg-[#D4A843]/90">{ar ? 'تمام' : 'Done'}</Button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-gray-400">{ar ? 'وافق على الطلب ده عشان يتعمله حساب. ممكن تحط باسورد مخصوص.' : 'Approve this request to create a user account. Optionally set a custom password.'}</p>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-400">{ar ? 'باسورد مخصوص (اختياري)' : 'Custom Password (optional)'}</label>
                  <Input type="password" placeholder={ar ? 'سيبه فاضي وهنولّد واحد' : 'Leave blank to auto-generate'} value={approvePassword} onChange={(e) => setApprovePassword(e.target.value)} className={inputClass} />
                </div>
                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => { setApproveDialog(null); setApprovePassword('') }} className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]">{ar ? 'إلغاء' : 'Cancel'}</Button>
                  <Button onClick={handleApprove} disabled={processingId === approveDialog.id} className="gold-shimmer bg-[#D4A843] text-[#0a1220] hover:bg-[#D4A843]/90">
                    {processingId === approveDialog.id ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {ar ? 'بيتوافق…' : 'Approving...'}</> : <><CheckCircle2 className="mr-2 h-4 w-4" /> {ar ? 'وافق' : 'Approve'}</>}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {rejectDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-3xl border border-border dark:border-[#262626] bg-card dark:bg-black p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground">{ar ? 'ارفض الطلب' : 'Reject Request'}</h3>
                <p className="text-sm text-gray-400">{rejectDialog.name} ({rejectDialog.email})</p>
              </div>
              <button onClick={() => { setRejectDialog(null); setRejectReason('') }} className="rounded-full p-1 text-gray-500 hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">{ar ? 'سبب الرفض *' : 'Rejection Reason *'}</label>
                <textarea placeholder={ar ? 'اكتب سبب رفض الطلب…' : 'Provide a reason for rejecting this request...'} value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)} rows={4}
                  className="w-full rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-[#D4A843]/50 focus:outline-none focus:ring-1 focus:ring-[#D4A843]/20" />
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => { setRejectDialog(null); setRejectReason('') }} className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]">{ar ? 'إلغاء' : 'Cancel'}</Button>
                <Button onClick={handleReject} disabled={processingId === rejectDialog.id || !rejectReason.trim()}
                  className="bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30">
                  {processingId === rejectDialog.id ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {ar ? 'بيترفض…' : 'Rejecting...'}</> : <><XCircle className="mr-2 h-4 w-4" /> {ar ? 'ارفض' : 'Reject'}</>}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showInviteModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-3xl border border-border dark:border-[#262626] bg-card dark:bg-black p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground">{ar ? 'دعوة جديدة' : 'New Invitation'}</h3>
                <p className="text-sm text-gray-400">{ar ? 'ادعي يوزر على المنصة' : 'Invite a user to the platform'}</p>
              </div>
              <button onClick={() => setShowInviteModal(false)} className="rounded-full p-1 text-gray-500 hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">{ar ? 'الإيميل *' : 'Email *'}</label>
                <Input type="email" placeholder="user@example.com" value={inviteForm.email}
                  onChange={(e) => setInviteForm((p) => ({ ...p, email: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">{ar ? 'الدور *' : 'Role *'}</label>
                <div className="relative">
                  <select value={inviteForm.role} onChange={(e) => setInviteForm((p) => ({ ...p, role: e.target.value }))}
                    className="w-full appearance-none rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-foreground focus:border-[#D4A843]/50 focus:outline-none focus:ring-1 focus:ring-[#D4A843]/20">
                    {INVITATION_ROLES.map((role) => <option key={role} value={role} className="bg-card dark:bg-black text-foreground">{roleLabel(role, ar)}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">{ar ? 'الباسورد (اختياري)' : 'Password (optional)'}</label>
                <Input type="password" placeholder={ar ? 'لو كتبته الحساب هيتعمل فورًا' : 'If set, account is created immediately'} value={inviteForm.password}
                  onChange={(e) => setInviteForm((p) => ({ ...p, password: e.target.value }))} className={inputClass} />
                {inviteForm.password && <p className="mt-1 text-xs text-[#D4A843]/70">{ar ? 'الحساب هيتعمل بالباسورد ده' : 'Account will be created with this password'}</p>}
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">{ar ? 'رسالة (اختياري)' : 'Message (optional)'}</label>
                <textarea placeholder={ar ? 'رسالة شخصية للدعوة…' : 'Personal message for the invitation...'} value={inviteForm.message}
                  onChange={(e) => setInviteForm((p) => ({ ...p, message: e.target.value }))} rows={3}
                  className="w-full rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-[#D4A843]/50 focus:outline-none focus:ring-1 focus:ring-[#D4A843]/20" />
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowInviteModal(false)} className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]">{ar ? 'إلغاء' : 'Cancel'}</Button>
                <Button onClick={handleSendInvite} disabled={!inviteForm.email.trim() || sendingInvite} className="gold-shimmer bg-[#D4A843] text-[#0a1220] hover:bg-[#D4A843]/90">
                  {sendingInvite ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {ar ? 'بيتبعت…' : 'Sending...'}</> : <><Send className="mr-2 h-4 w-4" /> {ar ? 'ابعت الدعوة' : 'Send Invitation'}</>}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}