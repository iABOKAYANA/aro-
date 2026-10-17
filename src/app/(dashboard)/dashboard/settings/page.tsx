'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, CheckCircle, Dna, RefreshCw } from 'lucide-react'
import { useLanguage } from '@/lib/language-context'
import { Reveal, SectionHeader } from '@/components/design'

// ─── Notification preferences (wired to /api/preferences) ─────
const PREF_FIELDS: Array<{ key: string; label: string; labelAr: string }> = [
  { key: 'emailInquiries', label: 'Email alerts for new inquiries', labelAr: 'تنبيهات الإيميل للاستفسارات الجديدة' },
  { key: 'emailLeads', label: 'Email alerts for lead updates', labelAr: 'تنبيهات الإيميل لتحديثات الليدز' },
  { key: 'emailPayments', label: 'Email alerts for payments', labelAr: 'تنبيهات الإيميل للمدفوعات' },
  { key: 'emailViewings', label: 'Email alerts for viewings', labelAr: 'تنبيهات الإيميل للمعاينات' },
  { key: 'pushInquiries', label: 'Push alerts for new inquiries', labelAr: 'تنبيهات فورية للاستفسارات الجديدة' },
  { key: 'smsNotifications', label: 'SMS notifications', labelAr: 'تنبيهات SMS' },
  { key: 'whatsappNotifications', label: 'WhatsApp notifications', labelAr: 'تنبيهات واتساب' },
  { key: 'emailMarketing', label: 'Marketing emails', labelAr: 'إيميلات تسويقية' },
  { key: 'watchAlerts', label: 'Price & availability alerts for items I watch', labelAr: 'تنبيهات السعر والتوافر للحاجات اللي متابعها' },
]

const ROLE_LABEL_AR: Record<string, string> = {
  BROKER: 'بروكر',
  DEVELOPER: 'مطور',
  CEO: 'مدير تنفيذي',
  ADMIN: 'أدمن',
}

interface DnaData {
  budget?: { min?: number; max?: number }
  locations?: string[]
  propertyTypes?: string[]
  bedrooms?: number
  intent?: 'LIVING' | 'INVESTMENT'
  urgency?: 'LOW' | 'MEDIUM' | 'HIGH'
  fields?: number
}

function NotificationPrefsCard() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/preferences')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          const map: Record<string, boolean> = {}
          for (const f of PREF_FIELDS) map[f.key] = !!(d.preferences && d.preferences[f.key])
          setPrefs(map)
        }
      })
      .catch(() => setPrefs({}))
  }, [])

  const save = async () => {
    if (!prefs) return
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const res = await fetch('/api/preferences', {
        method: 'PATCH',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed to save')
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      console.error('Save preferences failed:', e)
      setError(ar ? 'معرفناش نحفظ — جرب تاني.' : 'Could not save — try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="border-estate-gold/20 dark:border-[#D4A843]/20 dark:bg-[#0A0A0A]">
      <CardHeader>
        <CardTitle className="font-display">{ar ? 'تفضيلات التنبيهات' : 'Notification Preferences'}</CardTitle>
        <CardDescription>{ar ? 'تحكم في التنبيهات اللي بتوصلك' : 'Control what notifications you receive'}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {prefs === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {ar ? 'بنحمّل التفضيلات...' : 'Loading preferences…'}
          </div>
        ) : (
          <>
            {error && <div className="rounded-2xl bg-red-50 p-3 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</div>}
            {saved && (
              <div className="flex items-center gap-2 rounded-2xl bg-green-50 p-3 text-sm text-green-700 dark:bg-green-500/10 dark:text-green-400">
                <CheckCircle className="h-4 w-4" /> {ar ? 'اتحفظت التفضيلات.' : 'Preferences saved.'}
              </div>
            )}
            {PREF_FIELDS.map((f) => (
              <label key={f.key} className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={!!prefs[f.key]}
                  onChange={(e) => setPrefs({ ...prefs, [f.key]: e.target.checked })}
                  className="accent-estate-gold"
                />
                {ar ? f.labelAr : f.label}
              </label>
            ))}
            <Button variant="outline" onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {ar ? 'احفظ التفضيلات' : 'Save Preferences'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Client DNA editor (F1) ──────────────────────────────────
function ClientDnaCard() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [dna, setDna] = useState<DnaData | null>(null)
  const [confidence, setConfidence] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [budgetMin, setBudgetMin] = useState('')
  const [budgetMax, setBudgetMax] = useState('')
  const [locations, setLocations] = useState('')
  const [types, setTypes] = useState('')

  const load = async (force = false) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/client-dna${force ? '?force=true' : ''}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed to load')
      const b: DnaData = d.dna || {}
      setDna(b)
      setConfidence(d.confidence || 0)
      setBudgetMin(b.budget?.min ? String(b.budget.min) : '')
      setBudgetMax(b.budget?.max ? String(b.budget.max) : '')
      setLocations((b.locations || []).join(', '))
      setTypes((b.propertyTypes || []).join(', '))
    } catch (e) {
      console.error('Client DNA load failed:', e)
      setError(ar ? 'معرفناش نحمّل البيانات — جرب تاني.' : 'Could not load — try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = async () => {
    setSaving(true)
    setMsg(null)
    setError(null)
    try {
      const patch: Record<string, unknown> = {}
      const min = budgetMin.trim() === '' ? undefined : Number(budgetMin)
      const max = budgetMax.trim() === '' ? undefined : Number(budgetMax)
      if (budgetMin.trim() !== '' || budgetMax.trim() !== '') {
        if ((min !== undefined && (!Number.isFinite(min) || min < 0)) || (max !== undefined && (!Number.isFinite(max) || max < 0))) {
          setError(ar ? 'الميزانية لازم تبقى أرقام موجبة' : 'Budget must be positive numbers')
          return
        }
        patch.budget = { min, max, currency: 'EGP' }
      }
      const locs = locations.split(',').map((s) => s.trim()).filter(Boolean)
      if (locs.length) patch.locations = locs
      const tps = types.split(',').map((s) => s.trim()).filter(Boolean)
      if (tps.length) patch.propertyTypes = tps
      if (dna?.bedrooms !== undefined) patch.bedrooms = dna.bedrooms
      if (dna?.intent) patch.intent = dna.intent
      if (dna?.urgency) patch.urgency = dna.urgency

      if (!Object.keys(patch).length) {
        setError(ar ? 'مفيش حاجة تتحفظ' : 'Nothing to save')
        return
      }
      const res = await fetch('/api/client-dna', {
        method: 'PATCH',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed to save')
      setDna(d.dna)
      setConfidence(d.confidence || 0)
      setMsg(ar ? 'اتحفظت التفضيلات — تعديلاتك أهم من القيم المستنتجة.' : 'Preferences saved — your edits take priority over inferred signals.')
      setTimeout(() => setMsg(null), 4000)
    } catch (e) {
      console.error('Client DNA save failed:', e)
      setError(ar ? 'معرفناش نحفظ — جرب تاني.' : 'Could not save — try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="border-estate-gold/20 dark:border-[#D4A843]/20 dark:bg-[#0A0A0A]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display">
          <Dna className="h-5 w-5" /> {ar ? 'تفضيلاتي العقارية (AI DNA)' : 'My Property Preferences (AI DNA)'}
        </CardTitle>
        <CardDescription>
          {ar
            ? 'مبنية على نشاطك — بحثك واللي حفظته ومحادثاتك. تقدر تعدّل أو تمسح أي حاجة؛ تعديلاتك هي اللي بتمشي.'
            : 'Built from your own activity — searches, saved properties, conversations. You can edit or clear anything; your edits win over inferred values.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {ar ? 'بنحلّل نشاطك...' : 'Analyzing your activity…'}
          </div>
        ) : (
          <>
            {error && <div className="rounded-2xl bg-red-50 p-3 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</div>}
            {msg && (
              <div className="flex items-center gap-2 rounded-2xl bg-green-50 p-3 text-sm text-green-700 dark:bg-green-500/10 dark:text-green-400">
                <CheckCircle className="h-4 w-4" /> {msg}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-muted-foreground">{ar ? 'الثقة:' : 'Confidence:'}</span>
              <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-estate-gold" style={{ width: `${Math.round(confidence * 100)}%` }} />
              </div>
              <span className="font-medium">{Math.round(confidence * 100)}%</span>
              <Button variant="ghost" size="sm" onClick={() => load(true)} title={ar ? 'إعادة بناء من أحدث نشاط' : 'Rebuild from latest activity'}>
                <RefreshCw className="mr-1 h-3.5 w-3.5" /> {ar ? 'إعادة بناء' : 'Rebuild'}
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">{ar ? 'أقل ميزانية (جنيه)' : 'Budget min (EGP)'}</label>
                <Input inputMode="numeric" placeholder={ar ? 'مثال: 3000000' : 'e.g. 3000000'} value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{ar ? 'أقصى ميزانية (جنيه)' : 'Budget max (EGP)'}</label>
                <Input inputMode="numeric" placeholder={ar ? 'مثال: 15000000' : 'e.g. 15000000'} value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{ar ? 'المناطق المفضلة (افصل بفصلة)' : 'Preferred locations (comma separated)'}</label>
                <Input placeholder="new-cairo, sheikh-zayed" value={locations} onChange={(e) => setLocations(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{ar ? 'أنواع العقارات (افصل بفصلة)' : 'Property types (comma separated)'}</label>
                <Input placeholder="APARTMENT, VILLA" value={types} onChange={(e) => setTypes(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{ar ? 'الهدف' : 'Intent'}</label>
                <select
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  value={dna?.intent || ''}
                  onChange={(e) => setDna({ ...dna!, intent: (e.target.value || undefined) as DnaData['intent'] })}
                >
                  <option value="">{ar ? 'مش متحدد' : 'Not set'}</option>
                  <option value="LIVING">{ar ? 'سكن' : 'Living'}</option>
                  <option value="INVESTMENT">{ar ? 'استثمار' : 'Investment'}</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{ar ? 'الاستعجال' : 'Urgency'}</label>
                <select
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  value={dna?.urgency || ''}
                  onChange={(e) => setDna({ ...dna!, urgency: (e.target.value || undefined) as DnaData['urgency'] })}
                >
                  <option value="">{ar ? 'مش متحدد' : 'Not set'}</option>
                  <option value="LOW">{ar ? 'قليل — لسه بتفرج' : 'Low — exploring'}</option>
                  <option value="MEDIUM">{ar ? 'متوسط' : 'Medium'}</option>
                  <option value="HIGH">{ar ? 'عالي — جاهز تشتري' : 'High — ready to buy'}</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              {dna?.bedrooms !== undefined && <span>{ar ? `أوض النوم: ${dna.bedrooms}` : `Bedrooms: ${dna.bedrooms}`}</span>}
              <span>{ar ? `خانات مملية: ${dna?.fields ?? 0}` : `Populated fields: ${dna?.fields ?? 0}`}</span>
              <span>{ar ? 'المصادر: إشارات النشاط + تعديلاتك' : 'Sources: activity signals + your edits'}</span>
            </div>

            <Button onClick={save} disabled={saving} className="bg-estate-gold hover:bg-estate-gold-dark">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {ar ? 'احفظ التفضيلات' : 'Save Preferences'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default function DashboardSettingsPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const { data: session } = useSession()
  const user = session?.user as any
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handlePasswordChange = async () => {
    setError(null)
    setSuccess(false)
    if (form.newPassword !== form.confirmPassword) {
      setError(ar ? 'الباسورد الجديد مش زي بعضه' : 'New passwords do not match')
      return
    }
    if (form.newPassword.length < 10) {
      setError(ar ? 'الباسورد لازم يبقى ١٠ حروف على الأقل' : 'Password must be at least 10 characters')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setSuccess(true)
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) {
      console.error('Change password failed:', err)
      setError(ar ? 'معرفناش نغيّر الباسورد — جرب تاني.' : 'Could not change the password — try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Reveal>
        <SectionHeader
          kicker={ar ? 'حسابك' : 'Your account'}
          title={ar ? 'الإعدادات' : 'Settings'}
          description={ar ? 'إدارة إعدادات حسابك' : 'Manage your account settings'}
        />
      </Reveal>

      <Reveal>
      <Card className="border-estate-gold/20 dark:border-[#D4A843]/20 dark:bg-[#0A0A0A]">
        <CardHeader>
          <CardTitle className="font-display">{ar ? 'البيانات الشخصية' : 'Profile Information'}</CardTitle>
          <CardDescription>{ar ? 'حدّث بياناتك الشخصية' : 'Update your personal details'}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">{ar ? 'الاسم' : 'Name'}</label>
              <Input defaultValue={user?.name || ''} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{ar ? 'الإيميل' : 'Email'}</label>
              <Input defaultValue={user?.email || ''} disabled />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{ar ? 'التليفون' : 'Phone'}</label>
              <Input defaultValue={user?.phone || ''} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{ar ? 'الدور' : 'Role'}</label>
              <Input defaultValue={ar ? ROLE_LABEL_AR[user?.role] || user?.role || '' : user?.role || ''} disabled />
            </div>
          </div>
          <Button className="bg-estate-gold hover:bg-estate-gold-dark">{ar ? 'احفظ التغييرات' : 'Save Changes'}</Button>
        </CardContent>
      </Card>
      </Reveal>

      <Reveal>
      <Card className="border-estate-gold/20 dark:border-[#D4A843]/20 dark:bg-[#0A0A0A]">
        <CardHeader>
          <CardTitle className="font-display">{ar ? 'غيّر الباسورد' : 'Change Password'}</CardTitle>
          <CardDescription>{ar ? 'حدّث باسورد حسابك' : 'Update your account password'}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <div className="rounded-2xl bg-red-50 p-3 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</div>}
          {success && (
            <div className="rounded-2xl bg-green-50 p-3 text-sm text-green-700 flex items-center gap-2 dark:bg-green-500/10 dark:text-green-400">
              <CheckCircle className="h-4 w-4" />
              {ar ? 'اتغيّر الباسورد بنجاح!' : 'Password changed successfully!'}
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium">{ar ? 'الباسورد الحالي' : 'Current Password'}</label>
            <Input type="password" placeholder="••••••••" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{ar ? 'الباسورد الجديد' : 'New Password'}</label>
            <Input type="password" placeholder="••••••••" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{ar ? 'أكّد الباسورد الجديد' : 'Confirm New Password'}</label>
            <Input type="password" placeholder="••••••••" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} />
          </div>
          <Button onClick={handlePasswordChange} disabled={loading || !form.currentPassword || !form.newPassword} className="bg-estate-gold hover:bg-estate-gold-dark">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {ar ? 'غيّر الباسورد' : 'Change Password'}
          </Button>
        </CardContent>
      </Card>
      </Reveal>

      <hr className="gold-hairline" />

      <Reveal>
        <NotificationPrefsCard />
      </Reveal>

      <Reveal delay={80}>
        <ClientDnaCard />
      </Reveal>
    </div>
  )
}
