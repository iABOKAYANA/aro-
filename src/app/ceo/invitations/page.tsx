'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Mail,
  Send,
  Clock,
  CheckCircle,
  XCircle,
  Copy,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react'
import { useLanguage } from '@/lib/language-context'
import { roleLabel, statusLabel } from '@/components/ceo/ceo-charts'
import { Reveal } from '@/components/design'

type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED'

interface Invitation {
  id: string
  email: string
  role: string
  status: InvitationStatus
  message: string | null
  expiresAt: string
  createdAt: string
  acceptedAt: string | null
  sender: { name: string; email: string }
  invitedUser: { name: string; email: string } | null
}

const STATUS_BADGE: Record<InvitationStatus, string> = {
  PENDING: 'border-yellow-500/20 bg-yellow-500/10 text-yellow-400',
  ACCEPTED: 'border-green-500/20 bg-green-500/10 text-green-400',
  EXPIRED: 'border-gray-500/20 bg-gray-500/10 text-gray-500',
  REVOKED: 'border-red-500/20 bg-red-500/10 text-red-400',
}

const ROLES = [
  { value: 'BUYER', label: 'Buyer' },
  { value: 'BROKER', label: 'Broker' },
  { value: 'DEVELOPER', label: 'Developer' },
  { value: 'SELLER', label: 'Seller' },
]

export default function InvitationsPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [sending, setSending] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [form, setForm] = useState({ email: '', role: 'BUYER', message: '' })
  const [error, setError] = useState<string | null>(null)
  const [successLink, setSuccessLink] = useState<string | null>(null)
  // 'outbox' = no RESEND_API_KEY / SMTP_* configured: the invite was saved,
  // the email was queued to /ceo/outbox, and the link must be shared manually.
  const [emailQueued, setEmailQueued] = useState(false)

  const fetchInvitations = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/invite')
      const data = await res.json()
      setInvitations(data.invitations || [])
    } catch {
      console.error('Failed to fetch invitations')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchInvitations()
  }, [])

  const handleSend = async () => {
    setError(null)
    setSending(true)
    try {
      const res = await fetch('/api/auth/invite', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send invitation')
      setSuccessLink(data.registrationLink)
      setEmailQueued(data.emailDriver === 'outbox')
      setForm({ email: '', role: 'BUYER', message: '' })
      fetchInvitations()
    } catch (err) {
      console.error('Failed to send invitation:', err)
      setError(ar ? 'معرفناش نبعت الدعوة — حاول تاني.' : 'Failed to send invitation')
    } finally {
      setSending(false)
    }
  }

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link)
    setCopied(link)
    setTimeout(() => setCopied(null), 2000)
  }

  const formatDate = (d: string) => new Date(d).toLocaleDateString(ar ? 'ar-EG' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })

  const pendingCount = invitations.filter(i => i.status === 'PENDING').length
  const acceptedCount = invitations.filter(i => i.status === 'ACCEPTED').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Reveal>
          <p className="section-kicker">{ar ? 'لوحة المدير · الدعوات' : 'CEO Console · Invites'}</p>
          <h1 className="font-display display-3">{ar ? 'الدعوات' : 'Invitations'}</h1>
          <p className="text-muted-foreground">{ar ? 'اتحكم في دعوات اليوزرز ولينكات التسجيل' : 'Manage user invitations and registration links'}</p>
          <hr className="gold-hairline mt-4" />
        </Reveal>
        <Button onClick={() => setShowForm(!showForm)} className="bg-estate-gold hover:bg-estate-gold-dark">
          <Plus className="mr-2 h-4 w-4" />
          {ar ? 'ابعت دعوة' : 'Send Invitation'}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-yellow-500/10">
                <Clock className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingCount}</p>
                <p className="text-sm text-muted-foreground">{ar ? 'مستنيين' : 'Pending'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-green-500/10">
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{acceptedCount}</p>
                <p className="text-sm text-muted-foreground">{ar ? 'اتقبلوا' : 'Accepted'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-estate-gold/10">
                <Mail className="h-5 w-5 text-estate-gold" />
              </div>
              <div>
                <p className="text-2xl font-bold">{invitations.length}</p>
                <p className="text-sm text-muted-foreground">{ar ? 'كل اللي اتبعتوا' : 'Total Sent'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Send Invitation Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{ar ? 'ابعت دعوة جديدة' : 'Send New Invitation'}</CardTitle>
            <CardDescription>
              {ar ? 'ابعت إيميل دعوة بلينك تسجيل مميز. اللينك بيخلص بعد ٧ أيام.' : 'Send an invitation email with a unique registration link. The link expires in 7 days.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-2xl bg-red-50 p-3 text-sm text-red-600">{error}</div>
            )}

            {successLink && (
              <div className="rounded-2xl bg-green-50 p-4">
                <p className="text-sm font-medium text-green-800">{ar ? 'الدعوة اتبعتت بنجاح!' : 'Invitation sent successfully!'}</p>
                {emailQueued && (
                  <p className="mt-1 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-2 text-xs text-yellow-700">
                    {ar
                      ? 'الإيميل مش متظبّط — الدعوة محفوظة ومتسجلة في صفحة البريد الصادر. انسخ اللينك وابعته بنفسك.'
                      : 'Email is not configured — the invitation is saved and queued in the Email Outbox. Copy the link and share it manually.'}
                  </p>
                )}
                <p className="mt-1 text-xs text-green-700">{ar ? 'لينك التسجيل (انسخه وابعته):' : 'Registration link (copy and share):'}</p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 truncate rounded-2xl bg-white p-2 text-xs text-gray-900">{successLink}</code>
                  <Button size="sm" variant="outline" onClick={() => copyLink(successLink)}>
                    {copied === successLink ? (ar ? 'اتنسخ!' : 'Copied!') : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <button onClick={() => setSuccessLink(null)} className="mt-2 text-xs text-green-700 underline">
                  {ar ? 'اقفل' : 'Dismiss'}
                </button>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">{ar ? 'الإيميل *' : 'Email *'}</label>
                <Input
                  type="email"
                  placeholder="user@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{ar ? 'الدور *' : 'Role *'}</label>
                <select
                  className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>{ar ? roleLabel(r.value, true) : r.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{ar ? 'رسالة (اختياري)' : 'Message (optional)'}</label>
              <textarea
                rows={2}
                placeholder={ar ? 'اكتب رسالة شخصية مع الدعوة…' : 'Add a personal message to the invitation...'}
                className="flex w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm"
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSend}
                disabled={sending || !form.email}
                className="gold-shimmer bg-estate-gold hover:bg-estate-gold-dark"
              >
                {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                {ar ? 'ابعت الدعوة' : 'Send Invitation'}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>
                {ar ? 'إلغاء' : 'Cancel'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invitations Table */}
      <Card>
        <CardHeader>
          <CardTitle>{ar ? 'كل الدعوات' : 'All Invitations'}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-full bg-muted" />
              ))}
            </div>
          ) : invitations.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">{ar ? 'لسه مبعتّش دعوات' : 'No invitations sent yet'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-3 font-medium">{ar ? 'الإيميل' : 'Email'}</th>
                    <th className="pb-3 font-medium">{ar ? 'الدور' : 'Role'}</th>
                    <th className="pb-3 font-medium">{ar ? 'الحالة' : 'Status'}</th>
                    <th className="pb-3 font-medium">{ar ? 'اتبعتت' : 'Sent'}</th>
                    <th className="pb-3 font-medium">{ar ? 'بتخلص' : 'Expires'}</th>
                    <th className="pb-3 font-medium">{ar ? 'إجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((inv) => (
                    <tr key={inv.id} className="border-b last:border-0">
                      <td className="py-3">
                        <div>
                          <p className="font-medium">{inv.email}</p>
                          {inv.invitedUser && (
                            <p className="text-xs text-muted-foreground">
                              {ar ? `متسجل باسم ${inv.invitedUser.name}` : `Registered as ${inv.invitedUser.name}`}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="py-3">
                        <Badge variant="outline" className="capitalize">
                          {ar ? roleLabel(inv.role, true) : inv.role.toLowerCase()}
                        </Badge>
                      </td>
                      <td className="py-3">
                        <Badge variant="outline" className={STATUS_BADGE[inv.status]}>
                          {statusLabel(inv.status, ar)}
                        </Badge>
                      </td>
                      <td className="py-3 text-muted-foreground">{formatDate(inv.createdAt)}</td>
                      <td className="py-3 text-muted-foreground">{formatDate(inv.expiresAt)}</td>
                      <td className="py-3">
                        {inv.status === 'PENDING' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyLink(`${window.location.origin}/auth/register?token=${inv.id}`)}
                          >
                            {copied === inv.id ? (ar ? 'اتنسخ!' : 'Copied!') : <Copy className="h-4 w-4" />}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
