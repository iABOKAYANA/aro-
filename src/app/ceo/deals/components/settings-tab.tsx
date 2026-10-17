'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Shield, DollarSign, Loader2, RefreshCw, X, CheckCircle2, Plus, Trash2, Pencil, AlertTriangle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn, formatEGP } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import RoutingPanel from './routing-panel'

interface ProtectionConfig {
  defaultDays: number
  expiringSoonDays: number
  allowRenewal: boolean
  maxRenewals: number
  renewalDays: number
  expirationBehavior: 'AUTO_EXPIRE' | 'ALERT_ONLY'
  inactivityDays: number
  developerOverrides: Record<string, number>
  projectOverrides: Record<string, number>
}

interface CommissionSplit {
  totalPct: number
  estateaiPct: number
  brokerPct: number
  otherPct: number
  otherLabel: string | null
}

interface RuleRow {
  id: string
  name: string
  developerId: string | null
  projectId: string | null
  totalPct: number
  estateaiPct: number
  brokerPct: number
  otherPct: number
  otherLabel: string | null
  minDealValue: number | null
  maxDealValue: number | null
  isActive: boolean
  isDefault: boolean
  priority: number
  developer?: { id: string; companyName: string } | null
  project?: { id: string; name: string } | null
}

export default function SettingsTab() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [protection, setProtection] = useState<ProtectionConfig | null>(null)
  const [defaults, setDefaults] = useState<CommissionSplit | null>(null)
  const [rules, setRules] = useState<RuleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editingRule, setEditingRule] = useState<RuleRow | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch('/api/ceo/growth-config')
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || 'Failed')
        return r.json()
      })
      .then((data) => {
        setProtection(data.protection)
        setDefaults(data.commissionDefaults)
        setRules(data.rules || [])
      })
      .catch((e) => {
        console.error('Failed to load growth config:', e)
        setError(ar ? 'معرفناش نجيب الإعدادات — حاول تاني.' : 'Failed to load settings')
      })
      .finally(() => setLoading(false))
  }, [ar])

  useEffect(() => { load() }, [load])

  const post = async (body: Record<string, unknown>, successMsg: string) => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch('/api/ceo/growth-config', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        console.error('Failed to save growth config:', data)
        setError(ar ? 'معرفناش نحفظ — حاول تاني.' : 'Failed to save')
        return false
      }
      setMessage(successMsg)
      load()
      return true
    } catch (err) {
      console.error('Growth config network error:', err)
      setError(ar ? 'مشكلة في الشبكة — حاول تاني.' : 'Network error')
      return false
    } finally {
      setBusy(false)
    }
  }

  const deleteRule = async (id: string) => {
    if (!confirm(ar ? 'امسح / وقّف قاعدة العمولة دي؟ العمولات القديمة محتفظة بنسختها.' : 'Delete/deactivate this commission rule? Historical commissions keep their snapshot.')) return
    const ok = await post({ type: 'RULE_DELETE', ruleId: id }, ar ? 'القاعدة اتشالت' : 'Rule removed')
    if (ok) setEditingRule(null)
  }

  if (loading) {
    return <div className="flex items-center justify-center gap-2 py-16 text-gray-500"><Loader2 className="h-5 w-5 animate-spin" />{ar ? 'بيحمّل الإعدادات…' : 'Loading settings...'}</div>
  }

  return (
    <div className="space-y-6">
      {error && <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}
      {message && <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400">{message}</div>}

      <RoutingPanel />

      <div className="grid gap-6 lg:grid-cols-2">
        <ProtectionPanel protection={protection} ar={ar} onSave={(cfg) => post({ type: 'PROTECTION', config: cfg }, ar ? 'إعدادات الحماية اتحفظت' : 'Protection settings saved')} busy={busy} />
        <CommissionDefaultsPanel defaults={defaults} ar={ar} onSave={(cfg) => post({ type: 'COMMISSION_DEFAULTS', config: cfg }, ar ? 'التقسيمة الافتراضية اتحفظت' : 'Commission defaults saved')} busy={busy} />
      </div>

      {/* Rules */}
      <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-black">
        <div className="flex items-center justify-between border-b border-border dark:border-[#262626] px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <DollarSign className="h-4 w-4 text-estate-gold" /> {ar ? 'قواعد العمولة' : 'Commission rules'}
            <span className="text-xs font-normal text-gray-500">{ar ? '(الأولوية ← المشروع ← المطوّر ← الافتراضي)' : '(priority → project → developer → default)'}</span>
          </h3>
          <Button
            size="sm"
            className="gold-shimmer bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold-dark"
            onClick={() => setEditingRule({
              id: '', name: '', developerId: null, projectId: null, totalPct: 4, estateaiPct: 1, brokerPct: 3,
              otherPct: 0, otherLabel: null, minDealValue: null, maxDealValue: null,
              isActive: true, isDefault: false, priority: 0,
            })}
          >
            <Plus className="mr-1 h-4 w-4" />{ar ? 'قاعدة جديدة' : 'New rule'}
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border dark:border-[#262626] text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2.5">{ar ? 'القاعدة' : 'Rule'}</th>
                <th className="px-4 py-2.5">{ar ? 'النطاق' : 'Scope'}</th>
                <th className="px-4 py-2.5">{ar ? 'التقسيمة' : 'Split'}</th>
                <th className="px-4 py-2.5">{ar ? 'الأولوية' : 'Priority'}</th>
                <th className="px-4 py-2.5">{ar ? 'الحالة' : 'State'}</th>
                <th className="px-4 py-2.5 text-right">{ar ? 'إجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border dark:divide-[#262626]">
              {rules.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500">{ar ? 'مفيش قواعد مخصوصة — الافتراضي بتاع المنصة هو اللي شغال.' : 'No custom rules — the platform default applies.'}</td></tr>
              )}
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td className="px-4 py-2.5 font-medium text-gray-200">{rule.name}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">
                    {rule.project ? (ar ? `مشروع: ${rule.project.name}` : `Project: ${rule.project.name}`) : rule.developer ? (ar ? `مطوّر: ${rule.developer.companyName}` : `Developer: ${rule.developer.companyName}`) : (ar ? 'على كل المنصة' : 'Platform-wide')}
                    {(rule.minDealValue != null || rule.maxDealValue != null) && (
                      <span className="ml-1 rounded-full border border-purple-500/30 bg-purple-500/10 px-1.5 py-0.5 text-[10px] text-purple-300" dir="ltr">
                        [{rule.minDealValue != null ? formatEGP(rule.minDealValue) : '…'}, {rule.maxDealValue != null ? formatEGP(rule.maxDealValue) : '…'})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    <span className="text-foreground">{rule.totalPct}%</span> ={' '}
                    <span className="text-estate-gold">{rule.estateaiPct}%</span> +{' '}
                    <span className="text-blue-400">{rule.brokerPct}%</span>
                    {rule.otherPct > 0 && <> + <span className="text-purple-400">{rule.otherPct}%</span></>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">{rule.priority}</td>
                  <td className="px-4 py-2.5">
                    {rule.isDefault && <Badge className="mr-1 border border-estate-gold/40 bg-estate-gold/10 text-estate-gold">{ar ? 'افتراضية' : 'DEFAULT'}</Badge>}
                    <Badge className={cn('border', rule.isActive ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-gray-500/30 bg-gray-500/10 text-gray-400')}>
                      {rule.isActive ? (ar ? 'شغالة' : 'ACTIVE') : (ar ? 'واقفة' : 'INACTIVE')}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => setEditingRule(rule)} className="rounded-full p-1.5 text-gray-400 hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-foreground">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => deleteRule(rule.id)} className="rounded-full p-1.5 text-gray-500 hover:bg-red-500/10 hover:text-red-400">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editingRule && (
        <RuleModal
          rule={editingRule}
          ar={ar}
          onClose={() => setEditingRule(null)}
          onSave={async (body) => {
            const ok = await post(body, editingRule.id ? (ar ? 'القاعدة اتحدّثت' : 'Rule updated') : (ar ? 'القاعدة اتعملت' : 'Rule created'))
            if (ok) setEditingRule(null)
          }}
          busy={busy}
        />
      )}
    </div>
  )
}

// ─── Protection settings ──────────────────────────────────
function ProtectionPanel({
  protection, ar, onSave, busy,
}: { protection: ProtectionConfig | null; ar: boolean; onSave: (cfg: ProtectionConfig) => void; busy: boolean }) {
  const [form, setForm] = useState<ProtectionConfig | null>(protection)
  useEffect(() => { if (protection) setForm(protection) }, [protection])
  if (!form) return null

  const field = 'w-full rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-gray-300 outline-none'

  return (
    <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-black">
      <div className="border-b border-border dark:border-[#262626] px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Shield className="h-4 w-4 text-green-400" /> {ar ? 'الحماية الافتراضية لليدز' : 'Lead protection defaults'}
        </h3>
        <p className="mt-0.5 text-xs text-gray-500">{ar ? 'الاحتياطي بتاع المنصة كلها. عدد أيام حماية الشراكة وإعدادات المشروع بيغلبوا ده.' : 'Platform-wide fallback. DeveloperPartnership.leadProtectionDays and project settings override this.'}</p>
      </div>
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-gray-500">{ar ? 'الحماية الافتراضية (بالأيام)' : 'Default protection (days)'}</label>
            <input type="number" min={1} max={730} className={field} value={form.defaultDays} onChange={(e) => setForm({ ...form, defaultDays: Number(e.target.value) })} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">{ar ? 'نافذة "هيخلص قريب" (بالأيام)' : 'Expiring-soon window (days)'}</label>
            <input type="number" min={0} max={180} className={field} value={form.expiringSoonDays} onChange={(e) => setForm({ ...form, expiringSoonDays: Number(e.target.value) })} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">{ar ? 'مدة التجديد (بالأيام)' : 'Renewal duration (days)'}</label>
            <input type="number" min={1} max={730} className={field} value={form.renewalDays} onChange={(e) => setForm({ ...form, renewalDays: Number(e.target.value) })} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">{ar ? 'أقصى تجديدات' : 'Max renewals'}</label>
            <input type="number" min={0} max={99} className={field} value={form.maxRenewals} onChange={(e) => setForm({ ...form, maxRenewals: Number(e.target.value) })} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">{ar ? 'تنبيه الخمول (بالأيام)' : 'Inactivity alert (days)'}</label>
            <input type="number" min={1} max={365} className={field} value={form.inactivityDays} onChange={(e) => setForm({ ...form, inactivityDays: Number(e.target.value) })} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">{ar ? 'سلوك الانتهاء' : 'Expiration behavior'}</label>
            <select className={field} value={form.expirationBehavior} onChange={(e) => setForm({ ...form, expirationBehavior: e.target.value as any })}>
              <option value="AUTO_EXPIRE">{ar ? 'إنهاء تلقائي (علّم الليد منتهي)' : 'AUTO_EXPIRE (mark lead EXPIRED)'}</option>
              <option value="ALERT_ONLY">{ar ? 'تنبيه بس (نبّه بس)' : 'ALERT_ONLY (notify only)'}</option>
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" checked={form.allowRenewal} onChange={(e) => setForm({ ...form, allowRenewal: e.target.checked })} />
          {ar ? 'اسمح بتجديد الحماية' : 'Allow protection renewals'}
        </label>
        <div className="flex justify-end">
          <Button size="sm" className="gold-shimmer bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold-dark" disabled={busy} onClick={() => onSave(form)}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}{ar ? 'احفظ الحماية' : 'Save protection'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Commission defaults ──────────────────────────────────
function CommissionDefaultsPanel({
  defaults, ar, onSave, busy,
}: { defaults: CommissionSplit | null; ar: boolean; onSave: (cfg: CommissionSplit) => void; busy: boolean }) {
  const [form, setForm] = useState<CommissionSplit | null>(defaults)
  useEffect(() => { if (defaults) setForm(defaults) }, [defaults])
  if (!form) return null

  const set = (k: keyof CommissionSplit, v: number) => {
    const next = { ...form, [k]: v } as CommissionSplit
    setForm(next)
  }
  const sum = form.estateaiPct + form.brokerPct + (form.otherPct || 0)
  const valid = Math.abs(sum - form.totalPct) <= 0.01

  const field = 'w-full rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-gray-300 outline-none'

  return (
    <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-black">
      <div className="border-b border-border dark:border-[#262626] px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <DollarSign className="h-4 w-4 text-estate-gold" /> {ar ? 'التقسيمة الافتراضية للعمولة' : 'Default commission split'}
        </h3>
        <p className="mt-0.5 text-xs text-gray-500">{ar ? 'بتتستخدم لما مفيش قاعدة مشروع/مطوّر مطابقة. الحسابات دايمًا على السيرفر.' : 'Used when no project/developer rule matches. Calculations always run server-side.'}</p>
      </div>
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs text-gray-500">{ar ? 'الكل %' : 'Total %'}</label>
            <input type="number" step="0.01" min={0} max={100} className={field} value={form.totalPct} onChange={(e) => set('totalPct', Number(e.target.value))} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">EstateAI %</label>
            <input type="number" step="0.01" min={0} max={100} className={cn(field, 'text-estate-gold')} value={form.estateaiPct} onChange={(e) => set('estateaiPct', Number(e.target.value))} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">{ar ? 'البروكر %' : 'Broker %'}</label>
            <input type="number" step="0.01" min={0} max={100} className={cn(field, 'text-blue-400')} value={form.brokerPct} onChange={(e) => set('brokerPct', Number(e.target.value))} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">{ar ? 'تاني %' : 'Other %'}</label>
            <input type="number" step="0.01" min={0} max={100} className={field} value={form.otherPct} onChange={(e) => set('otherPct', Number(e.target.value))} />
          </div>
        </div>
        <div className={cn(
          'flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs',
          valid ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-red-500/30 bg-red-500/10 text-red-400',
        )}>
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {valid
            ? (ar ? `التقسيمة سليمة: ${form.estateaiPct}% + ${form.brokerPct}%${form.otherPct ? ` + ${form.otherPct}%` : ''} = ${form.totalPct}%` : `Split valid: ${form.estateaiPct}% + ${form.brokerPct}%${form.otherPct ? ` + ${form.otherPct}%` : ''} = ${form.totalPct}%`)
            : (ar ? `التقسيمة مش مظبوطة: الأجزاء مجموعها ${sum.toFixed(2)}% بس الكلي ${form.totalPct}%` : `Split mismatch: parts sum to ${sum.toFixed(2)}% but total is ${form.totalPct}%`)}
        </div>
        <div className="flex justify-end">
          <Button size="sm" className="gold-shimmer bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold-dark" disabled={busy || !valid} onClick={() => onSave(form)}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}{ar ? 'احفظ التقسيمة' : 'Save split'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Rule editor ──────────────────────────────────────────
function RuleModal({
  rule, ar, onClose, onSave, busy,
}: { rule: RuleRow; ar: boolean; onClose: () => void; onSave: (body: Record<string, unknown>) => void; busy: boolean }) {
  const [form, setForm] = useState({
    name: rule.name,
    totalPct: rule.totalPct,
    estateaiPct: rule.estateaiPct,
    brokerPct: rule.brokerPct,
    otherPct: rule.otherPct,
    otherLabel: rule.otherLabel || '',
    minDealValue: rule.minDealValue != null ? String(rule.minDealValue) : '',
    maxDealValue: rule.maxDealValue != null ? String(rule.maxDealValue) : '',
    priority: rule.priority,
    isActive: rule.isActive,
    isDefault: rule.isDefault,
  })

  const sum = form.estateaiPct + form.brokerPct + (form.otherPct || 0)
  // Tier band: blank = open-ended (null). Client-validated: each ≥ 0, min ≤ max.
  const minV = form.minDealValue.trim() === '' ? null : Number(form.minDealValue)
  const maxV = form.maxDealValue.trim() === '' ? null : Number(form.maxDealValue)
  const tierOk =
    (minV === null || (Number.isFinite(minV) && minV >= 0)) &&
    (maxV === null || (Number.isFinite(maxV) && maxV >= 0)) &&
    (minV === null || maxV === null || minV <= maxV)
  const valid = Math.abs(sum - form.totalPct) <= 0.01 && form.name.trim().length >= 2 && tierOk
  const field = 'w-full rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-gray-300 outline-none'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-3xl border border-border dark:border-[#262626] bg-card dark:bg-black p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <DollarSign className="h-5 w-5 text-estate-gold" />{rule.id ? (ar ? 'تعديل القاعدة' : 'Edit rule') : (ar ? 'قاعدة عمولة جديدة' : 'New commission rule')}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-gray-500">{ar ? 'اسم القاعدة' : 'Rule name'}</label>
            <input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. SODIC Eastown 4%" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs text-gray-500">{ar ? 'الكل %' : 'Total %'}</label>
              <input type="number" step="0.01" className={field} value={form.totalPct} onChange={(e) => setForm({ ...form, totalPct: Number(e.target.value) })} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">EstateAI %</label>
              <input type="number" step="0.01" className={field} value={form.estateaiPct} onChange={(e) => setForm({ ...form, estateaiPct: Number(e.target.value) })} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">{ar ? 'البروكر %' : 'Broker %'}</label>
              <input type="number" step="0.01" className={field} value={form.brokerPct} onChange={(e) => setForm({ ...form, brokerPct: Number(e.target.value) })} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">{ar ? 'تاني %' : 'Other %'}</label>
              <input type="number" step="0.01" className={field} value={form.otherPct} onChange={(e) => setForm({ ...form, otherPct: Number(e.target.value) })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-gray-500">{ar ? 'أقل قيمة صفقة (جنيه — فاضي = مفتوحة)' : 'Min deal value (EGP — blank = open)'}</label>
              <input type="number" min={0} dir="ltr" className={field} value={form.minDealValue} onChange={(e) => setForm({ ...form, minDealValue: e.target.value })} placeholder="—" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">{ar ? 'أعلى قيمة صفقة (جنيه — فاضي = مفتوحة)' : 'Max deal value (EGP — blank = open)'}</label>
              <input type="number" min={0} dir="ltr" className={field} value={form.maxDealValue} onChange={(e) => setForm({ ...form, maxDealValue: e.target.value })} placeholder="—" />
            </div>
          </div>
          {!tierOk && (
            <div className="flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {ar ? 'نطاق القيمة مش مظبوط: كل حد موجب (أو فاضي) والأقل ≤ الأعلى.' : 'Invalid value band: each bound ≥ 0 (or blank) and min ≤ max.'}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-gray-500">{ar ? 'اسم الطرف التاني' : 'Other label'}</label>
              <input className={field} value={form.otherLabel} onChange={(e) => setForm({ ...form, otherLabel: e.target.value })} placeholder="e.g. Developer partner" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">{ar ? 'الأولوية (الأعلى يكسب)' : 'Priority (higher wins)'}</label>
              <input type="number" min={0} max={1000} className={field} value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> {ar ? 'شغالة' : 'Active'}
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} /> {ar ? 'الافتراضية بتاعة المنصة (بتستبدل الحالية)' : 'Platform default (replaces current)'}
            </label>
          </div>

          <div className={cn(
            'flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs',
            valid ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-red-500/30 bg-red-500/10 text-red-400',
          )}>
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {valid ? `${sum.toFixed(2)}% = ${form.totalPct}% ✓` : (ar ? `الأجزاء ${sum.toFixed(2)}% ≠ الكلي ${form.totalPct}% (مسموح ±0.01)` : `Parts ${sum.toFixed(2)}% ≠ total ${form.totalPct}% (±0.01 allowed)`)}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" className="border-border dark:border-[#262626] text-gray-300" onClick={onClose} disabled={busy}>{ar ? 'إلغاء' : 'Cancel'}</Button>
            <Button
              size="sm"
              className="gold-shimmer bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold-dark"
              disabled={busy || !valid}
              onClick={() => onSave({
                type: rule.id ? 'RULE_UPDATE' : 'RULE_CREATE',
                ruleId: rule.id || undefined,
                rule: {
                  name: form.name.trim(),
                  developerId: rule.developerId,
                  projectId: rule.projectId,
                  totalPct: form.totalPct,
                  estateaiPct: form.estateaiPct,
                  brokerPct: form.brokerPct,
                  otherPct: form.otherPct,
                  otherLabel: form.otherLabel || null,
                  minDealValue: minV,
                  maxDealValue: maxV,
                  isActive: form.isActive,
                  isDefault: form.isDefault,
                  priority: form.priority,
                },
              })}
            >
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}{ar ? 'احفظ القاعدة' : 'Save rule'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
