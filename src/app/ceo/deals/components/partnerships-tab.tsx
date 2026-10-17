'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Building2, Users, Loader2, Inbox, RefreshCw, X, CheckCircle2, Plus, Trash2, ShieldCheck, ShieldX,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import { statusLabel } from '@/components/ceo/ceo-charts'

interface Partnership {
  id: string
  developerId: string
  status: string
  allProjectsApproved: boolean
  approvedProjectIds: string[]
  commissionAgreement: string | null
  leadProtectionDays: number | null
  allowedBrokerIds: string[]
  blockedBrokerIds: string[]
  startDate: string | null
  endDate: string | null
  terms: string | null
  isActive: boolean
  reviewNote: string | null
  createdAt: string
  developer: { id: string; companyName: string; user?: { name: string | null } }
}

interface AccessRow {
  id: string
  brokerId: string
  developerId: string | null
  projectId: string | null
  access: string
  expiresAt: string | null
  notes: string | null
  broker: { id: string; user: { name: string | null } }
  developer: { id: string; companyName: string } | null
  project: { id: string; name: string } | null
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  UNDER_REVIEW: 'border-purple-500/30 bg-purple-500/10 text-purple-400',
  APPROVED: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400',
  ACTIVE: 'border-green-500/30 bg-green-500/10 text-green-400',
  SUSPENDED: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  REJECTED: 'border-red-500/30 bg-red-500/10 text-red-400',
  EXPIRED: 'border-gray-500/30 bg-gray-500/10 text-gray-400',
}

const STATUSES = ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'EXPIRED']

export default function PartnershipsTab() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [partnerships, setPartnerships] = useState<Partnership[]>([])
  const [accessRows, setAccessRows] = useState<AccessRow[]>([])
  const [developers, setDevelopers] = useState<Array<{ id: string; companyName: string }>>([])
  const [brokers, setBrokers] = useState<Array<{ id: string; user: { name: string | null } }>>([])
  const [projects, setProjects] = useState<Array<{ id: string; name: string; developerId?: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Partnership | null>(null)
  const [showAccessForm, setShowAccessForm] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch('/api/ceo/partnerships')
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || 'Failed')
        return r.json()
      })
      .then((data) => {
        setPartnerships(data.partnerships || [])
        setAccessRows(data.brokerAccess || [])
      })
      .catch((e) => {
        console.error('Failed to load partnerships:', e)
        setError(ar ? 'معرفناش نجيب الشراكات — حاول تاني.' : 'Failed to load partnerships')
      })
      .finally(() => setLoading(false))
  }, [ar])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    Promise.all([
      fetch('/api/ceo/developers').then((r) => (r.ok ? r.json() : { developers: [] })).catch(() => ({ developers: [] })),
      fetch('/api/ceo/brokers').then((r) => (r.ok ? r.json() : { brokers: [] })).catch(() => ({ brokers: [] })),
      fetch('/api/projects?limit=100').then((r) => (r.ok ? r.json() : { projects: [] })).catch(() => ({ projects: [] })),
    ]).then(([d, b, p]) => {
      setDevelopers(d.developers || [])
      setBrokers(b.brokers || [])
      setProjects(p.projects || [])
    })
  }, [])

  const deleteAccess = async (id: string) => {
    if (!confirm(ar ? 'اشيل قاعدة صلاحية البروكر دي؟' : 'Remove this broker access rule?')) return
    try {
      const res = await fetch('/api/ceo/partnerships', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ACCESS_DELETE', accessId: id }),
      })
      if (res.ok) load()
    } catch { /* ignore */ }
  }

  const uncoveredDevelopers = developers.filter((d) => !partnerships.some((p) => p.developerId === d.id))

  return (
    <div className="space-y-6">
      {/* Partnerships table */}
      <div className="flex items-center justify-between">
        <h2 className="section-kicker flex items-center gap-2">
          <Building2 className="h-4 w-4" /> {ar ? 'شراكات المطوّرين' : 'Developer partnerships'}
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]" onClick={load}>
            <RefreshCw className="mr-1 h-4 w-4" />{ar ? 'حدّث' : 'Refresh'}
          </Button>
          <Button
            size="sm"
            className="gold-shimmer bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold-dark"
            disabled={uncoveredDevelopers.length === 0}
            onClick={() => {
              const dev = uncoveredDevelopers[0]
              setEditing({
                id: '', developerId: dev.id, status: 'PENDING', allProjectsApproved: true, approvedProjectIds: [],
                commissionAgreement: null, leadProtectionDays: null, allowedBrokerIds: [], blockedBrokerIds: [],
                startDate: null, endDate: null, terms: null, isActive: true, reviewNote: null,
                createdAt: new Date().toISOString(), developer: { id: dev.id, companyName: dev.companyName },
              })
            }}
          >
            <Plus className="mr-1 h-4 w-4" />{ar ? 'شراكة جديدة' : 'New partnership'}
          </Button>
        </div>
      </div>

      {error && <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-gray-500"><Loader2 className="h-5 w-5 animate-spin" />{ar ? 'بيحمّل…' : 'Loading...'}</div>
      ) : partnerships.length === 0 ? (
        <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-black py-12 text-center">
          <Inbox className="mx-auto h-10 w-10 text-gray-700" />
          <p className="mt-3 text-sm text-gray-500">{ar ? 'لسه مفيش شراكات. اعمل واحدة عشان تتحكم في دخول البروكرز على الليدز والصفقات لكل مطوّر.' : 'No partnerships yet. Create one to gate broker lead/deal access per developer.'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-black">
          <table className="w-full text-sm">
            <thead className="border-b border-border dark:border-[#262626] text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">{ar ? 'المطوّر' : 'Developer'}</th>
                <th className="px-4 py-3">{ar ? 'الحالة' : 'Status'}</th>
                <th className="px-4 py-3">{ar ? 'حماية الليد' : 'Lead protection'}</th>
                <th className="px-4 py-3">{ar ? 'المدة' : 'Term'}</th>
                <th className="px-4 py-3">{ar ? 'البروكرز' : 'Brokers'}</th>
                <th className="px-4 py-3">{ar ? 'المشاريع' : 'Projects'}</th>
                <th className="px-4 py-3 text-right">{ar ? 'إجراء' : 'Action'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border dark:divide-[#262626]">
              {partnerships.map((p) => (
                <tr key={p.id} className="transition hover:bg-white/[0.03]">
                  <td className="px-4 py-3 font-medium text-gray-200">{p.developer?.companyName || p.developerId}</td>
                  <td className="px-4 py-3">
                    <Badge className={cn('border', STATUS_COLORS[p.status] || 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-400')}>{statusLabel(p.status, ar)}</Badge>
                    {!p.isActive && <Badge className="ml-1 border border-red-500/30 bg-red-500/10 text-red-400">{ar ? 'مقفولة' : 'INACTIVE'}</Badge>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {p.leadProtectionDays ? (ar ? `${p.leadProtectionDays} يوم` : `${p.leadProtectionDays} days`) : (ar ? 'الافتراضي بتاع المنصة' : 'Platform default')}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {p.startDate ? new Date(p.startDate).toLocaleDateString(ar ? 'ar-EG' : 'en-US') : '—'} → {p.endDate ? new Date(p.endDate).toLocaleDateString(ar ? 'ar-EG' : 'en-US') : (ar ? 'مفتوحة' : 'Open')}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span className="text-green-400">{p.allowedBrokerIds.length} {ar ? 'مسموح' : 'allowed'}</span> · <span className="text-red-400">{p.blockedBrokerIds.length} {ar ? 'محظور' : 'blocked'}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {p.allProjectsApproved ? (ar ? 'الكل متوافق عليه' : 'All approved') : (ar ? `${p.approvedProjectIds.length} متوافق عليه` : `${p.approvedProjectIds.length} approved`)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="outline" size="sm" className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]" onClick={() => setEditing(p)}>
                      {ar ? 'تعديل' : 'Edit'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Broker access rules */}
      <div className="flex items-center justify-between">
        <h2 className="section-kicker flex items-center gap-2">
          <Users className="h-4 w-4" /> {ar ? 'قواعد دخول البروكرز' : 'Broker access rules'}
        </h2>
        <Button size="sm" variant="outline" className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]" onClick={() => setShowAccessForm((v) => !v)}>
          <Plus className="mr-1 h-4 w-4" />{ar ? 'ضيف قاعدة' : 'Add rule'}
        </Button>
      </div>

      {showAccessForm && (
        <AccessForm
          brokers={brokers}
          developers={developers}
          projects={projects}
          ar={ar}
          onClose={() => setShowAccessForm(false)}
          onSaved={() => { setShowAccessForm(false); load() }}
        />
      )}

      {accessRows.length === 0 ? (
        <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-black py-8 text-center text-sm text-gray-500">
          {ar ? 'مفيش قواعد دخول مخصوصة — البروكرز ماشيين على قوايم السماح/الحظر بتاعة الشراكة.' : 'No explicit access rules — brokers follow partnership allow/block lists.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-black">
          <table className="w-full text-sm">
            <thead className="border-b border-border dark:border-[#262626] text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">{ar ? 'البروكر' : 'Broker'}</th>
                <th className="px-4 py-3">{ar ? 'النطاق' : 'Scope'}</th>
                <th className="px-4 py-3">{ar ? 'الصلاحية' : 'Access'}</th>
                <th className="px-4 py-3">{ar ? 'بتخلص' : 'Expires'}</th>
                <th className="px-4 py-3 text-right">{ar ? 'إجراء' : 'Action'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border dark:divide-[#262626]">
              {accessRows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 text-gray-200">{row.broker.user?.name || row.brokerId}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {row.project ? (ar ? `مشروع: ${row.project.name}` : `Project: ${row.project.name}`) : row.developer ? (ar ? `مطوّر: ${row.developer.companyName}` : `Developer: ${row.developer.companyName}`) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {row.access === 'APPROVED' ? (
                      <Badge className="border border-green-500/30 bg-green-500/10 text-green-400"><ShieldCheck className="mr-1 h-3 w-3" />{ar ? 'مسموح' : 'APPROVED'}</Badge>
                    ) : (
                      <Badge className="border border-red-500/30 bg-red-500/10 text-red-400"><ShieldX className="mr-1 h-3 w-3" />{ar ? 'محظور' : 'BLOCKED'}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {row.expiresAt ? new Date(row.expiresAt).toLocaleDateString(ar ? 'ar-EG' : 'en-US') : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => deleteAccess(row.id)} className="rounded-full p-1.5 text-gray-500 hover:bg-red-500/10 hover:text-red-400">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <PartnershipModal
          partnership={editing}
          developers={developers}
          projects={projects}
          ar={ar}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

// ─── Partnership editor ───────────────────────────────────
function PartnershipModal({
  partnership, developers, projects, ar, onClose, onSaved,
}: {
  partnership: Partnership
  developers: Array<{ id: string; companyName: string }>
  projects: Array<{ id: string; name: string }>
  ar: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    developerId: partnership.developerId,
    status: partnership.status,
    allProjectsApproved: partnership.allProjectsApproved,
    approvedProjectIds: partnership.approvedProjectIds,
    commissionAgreement: partnership.commissionAgreement || '',
    leadProtectionDays: partnership.leadProtectionDays ? String(partnership.leadProtectionDays) : '',
    startDate: partnership.startDate ? partnership.startDate.slice(0, 10) : '',
    endDate: partnership.endDate ? partnership.endDate.slice(0, 10) : '',
    terms: partnership.terms || '',
    isActive: partnership.isActive,
    reviewNote: partnership.reviewNote || '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/ceo/partnerships', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'PARTNERSHIP_UPSERT',
          partnership: {
            developerId: form.developerId,
            status: form.status,
            allProjectsApproved: form.allProjectsApproved,
            approvedProjectIds: form.approvedProjectIds,
            commissionAgreement: form.commissionAgreement || null,
            leadProtectionDays: form.leadProtectionDays ? Number(form.leadProtectionDays) : null,
            allowedBrokerIds: partnership.allowedBrokerIds,
            blockedBrokerIds: partnership.blockedBrokerIds,
            startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
            endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
            terms: form.terms || null,
            isActive: form.isActive,
            reviewNote: form.reviewNote || null,
          },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        console.error('Failed to save partnership:', data)
        setError(ar ? 'معرفناش نحفظ الشراكة — حاول تاني.' : 'Failed to save')
        return
      }
      onSaved()
    } catch (err) {
      console.error('Partnership network error:', err)
      setError(ar ? 'مشكلة في الشبكة — حاول تاني.' : 'Network error')
    } finally {
      setBusy(false)
    }
  }

  const field = 'w-full rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-gray-300 outline-none'
  const devProjects = projects // project list (unfiltered — approved list may span)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-border dark:border-[#262626] bg-card dark:bg-black p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <Building2 className="h-5 w-5 text-estate-gold" />
            {partnership.id ? (ar ? 'تعديل الشراكة' : 'Edit partnership') : (ar ? 'شراكة جديدة' : 'New partnership')}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-gray-500">{ar ? 'المطوّر' : 'Developer'}</label>
              <select className={field} value={form.developerId} onChange={(e) => setForm({ ...form, developerId: e.target.value })} disabled={!!partnership.id}>
                {developers.map((d) => <option key={d.id} value={d.id}>{d.companyName}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">{ar ? 'الحالة' : 'Status'}</label>
              <select className={field} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s, ar)}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs text-gray-500">{ar ? 'حماية الليد (بالأيام)' : 'Lead protection (days)'}</label>
              <input type="number" min={1} max={730} className={field} value={form.leadProtectionDays} placeholder={ar ? 'الافتراضي' : 'Default'} onChange={(e) => setForm({ ...form, leadProtectionDays: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">{ar ? 'تاريخ البداية' : 'Start date'}</label>
              <input type="date" className={field} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">{ar ? 'تاريخ النهاية' : 'End date'}</label>
              <input type="date" className={field} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={form.allProjectsApproved} onChange={(e) => setForm({ ...form, allProjectsApproved: e.target.checked })} />
            {ar ? 'كل المشاريع متوافق عليها' : 'All projects approved'}
          </label>

          {!form.allProjectsApproved && (
            <div>
              <label className="mb-1 block text-xs text-gray-500">{ar ? 'المشاريع المتوافق عليها' : 'Approved projects'}</label>
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-2">
                {devProjects.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-xs text-gray-300">
                    <input
                      type="checkbox"
                      checked={form.approvedProjectIds.includes(p.id)}
                      onChange={(e) => setForm({
                        ...form,
                        approvedProjectIds: e.target.checked
                          ? [...form.approvedProjectIds, p.id]
                          : form.approvedProjectIds.filter((id) => id !== p.id),
                      })}
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs text-gray-500">{ar ? 'اتفاق العمولة (ملاحظات)' : 'Commission agreement (notes)'}</label>
            <textarea rows={2} className={field} value={form.commissionAgreement} onChange={(e) => setForm({ ...form, commissionAgreement: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">{ar ? 'الشروط' : 'Terms'}</label>
            <textarea rows={2} className={field} value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">{ar ? 'ملاحظة المراجعة' : 'Review note'}</label>
            <input className={field} value={form.reviewNote} onChange={(e) => setForm({ ...form, reviewNote: e.target.value })} />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            {ar ? 'الشراكة شغالة' : 'Partnership active'}
          </label>

          {error && <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" className="border-border dark:border-[#262626] text-gray-300" onClick={onClose} disabled={busy}>{ar ? 'إلغاء' : 'Cancel'}</Button>
            <Button size="sm" className="gold-shimmer bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold-dark" onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}{ar ? 'احفظ' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Access rule form ─────────────────────────────────────
function AccessForm({
  brokers, developers, projects, ar, onClose, onSaved,
}: {
  brokers: Array<{ id: string; user: { name: string | null } }>
  developers: Array<{ id: string; companyName: string }>
  projects: Array<{ id: string; name: string }>
  ar: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({ brokerId: '', scope: 'developer', developerId: '', projectId: '', access: 'APPROVED', expiresAt: '', notes: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    if (!form.brokerId) { setError(ar ? 'اختار بروكر' : 'Select a broker'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/ceo/partnerships', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'ACCESS_UPSERT',
          brokerId: form.brokerId,
          developerId: form.scope === 'developer' ? form.developerId || null : null,
          projectId: form.scope === 'project' ? form.projectId || null : null,
          access: form.access,
          expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
          notes: form.notes || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        console.error('Failed to save access rule:', data)
        setError(ar ? 'معرفناش نحفظ القاعدة — حاول تاني.' : 'Failed to save rule')
        return
      }
      onSaved()
    } catch (err) {
      console.error('Access rule network error:', err)
      setError(ar ? 'مشكلة في الشبكة — حاول تاني.' : 'Network error')
    } finally {
      setBusy(false)
    }
  }

  const field = 'w-full rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-gray-300 outline-none'

  return (
    <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-black p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{ar ? 'ضيف قاعدة دخول بروكر' : 'Add broker access rule'}</h3>
        <button onClick={onClose} className="text-gray-500 hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs text-gray-500">{ar ? 'البروكر' : 'Broker'}</label>
          <select className={field} value={form.brokerId} onChange={(e) => setForm({ ...form, brokerId: e.target.value })}>
            <option value="">{ar ? '— اختار —' : '— Select —'}</option>
            {brokers.map((b) => <option key={b.id} value={b.id}>{b.user?.name || b.id}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">{ar ? 'النطاق' : 'Scope'}</label>
          <select className={field} value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
            <option value="developer">{ar ? 'على مستوى المطوّر' : 'Developer-wide'}</option>
            <option value="project">{ar ? 'مشروع واحد' : 'Single project'}</option>
          </select>
        </div>
        {form.scope === 'developer' ? (
          <div>
            <label className="mb-1 block text-xs text-gray-500">{ar ? 'المطوّر' : 'Developer'}</label>
            <select className={field} value={form.developerId} onChange={(e) => setForm({ ...form, developerId: e.target.value })}>
              <option value="">{ar ? '— اختار —' : '— Select —'}</option>
              {developers.map((d) => <option key={d.id} value={d.id}>{d.companyName}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-xs text-gray-500">{ar ? 'المشروع' : 'Project'}</label>
            <select className={field} value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
              <option value="">{ar ? '— اختار —' : '— Select —'}</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs text-gray-500">{ar ? 'الصلاحية' : 'Access'}</label>
          <select className={field} value={form.access} onChange={(e) => setForm({ ...form, access: e.target.value })}>
            <option value="APPROVED">{ar ? 'مسموح' : 'APPROVED'}</option>
            <option value="BLOCKED">{ar ? 'محظور' : 'BLOCKED'}</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">{ar ? 'بتخلص (اختياري)' : 'Expires (optional)'}</label>
          <input type="date" className={field} value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">{ar ? 'ملاحظات' : 'Notes'}</label>
          <input className={field} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>
      {error && <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-2.5 text-sm text-red-400">{error}</div>}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" size="sm" className="border-border dark:border-[#262626] text-gray-300" onClick={onClose} disabled={busy}>{ar ? 'إلغاء' : 'Cancel'}</Button>
        <Button size="sm" className="gold-shimmer bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold-dark" onClick={submit} disabled={busy}>
          {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}{ar ? 'احفظ القاعدة' : 'Save rule'}
        </Button>
      </div>
    </div>
  )
}
