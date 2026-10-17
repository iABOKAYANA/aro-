'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Building2,
  Globe,
  Bell,
  Sparkles,
  Database,
  Save,
  CheckCircle2,
  Loader2,
  X,
  MessageCircle,
} from 'lucide-react'
import { useLanguage } from '@/lib/language-context'
import { Reveal } from '@/components/design'

interface SettingsState {
  company: {
    name: string
    email: string
    phone: string
    address: string
    website: string
  }
  platform: {
    currency: string
    language: string
    maintenanceMode: boolean
    registrationEnabled: boolean
  }
  ai: {
    searchEnabled: boolean
    recommendationsEnabled: boolean
    priceEstimation: boolean
  }
  notifications: {
    email: boolean
    sms: boolean
    newLead: boolean
    newInquiry: boolean
    weeklyReport: boolean
  }
  cta: {
    enabled: boolean
    whatsappNumber: string
    messageEn: string
    messageAr: string
    labelEn: string
    labelAr: string
    phone: string
    whatsapp: string
  }
}

const defaultSettings: SettingsState = {
  company: {
    name: 'Estate Pro',
    email: 'info@estatepro.com',
    phone: '+20 100 000 0000',
    address: 'Cairo, Egypt',
    website: 'https://estatepro.com',
  },
  platform: {
    currency: 'EGP',
    language: 'English',
    maintenanceMode: false,
    registrationEnabled: true,
  },
  ai: {
    searchEnabled: true,
    recommendationsEnabled: true,
    priceEstimation: false,
  },
  notifications: {
    email: true,
    sms: false,
    newLead: true,
    newInquiry: true,
    weeklyReport: false,
  },
  cta: {
    enabled: true,
    whatsappNumber: '',
    messageEn: "Hi GHAYA! I'm interested in your properties.",
    messageAr: 'أهلاً غاية! مهتم بالعقارات اللي عندكم.',
    labelEn: 'Chat with us on WhatsApp',
    labelAr: 'كلّمنا على واتساب',
    phone: '',
    whatsapp: '',
  },
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-2xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400 shadow-xl backdrop-blur-sm">
      <CheckCircle2 className="h-4 w-4" />
      {message}
      <button onClick={onClose} className="ml-2 text-green-400/60 hover:text-green-400">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function Toggle({
  enabled,
  onChange,
  label,
  description,
}: {
  enabled: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="mt-0.5 text-xs text-gray-500">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors ${
          enabled ? 'bg-estate-gold' : 'bg-muted'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-estate-gold" />
      <span className="text-sm font-semibold text-foreground">{title}</span>
    </div>
  )
}

export default function CEOSettingsPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [settings, setSettings] = useState<SettingsState>(defaultSettings)
  const [saving, setSaving] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    setLoading(true)
    setLoadError(false)
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) {
          setSettings((prev) => ({
            company: { ...prev.company, ...data.company },
            platform: { ...prev.platform, ...data.platform },
            ai: { ...prev.ai, ...data.ai },
            notifications: { ...prev.notifications, ...data.notifications },
            cta: { ...prev.cta, ...data.cta },
          }))
        } else {
          setLoadError(true)
        }
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [retryKey])

  function update<K extends keyof SettingsState>(
    section: K,
    key: keyof SettingsState[K],
    value: SettingsState[K][keyof SettingsState[K]]
  ) {
    setSettings((prev) => ({
      ...prev,
      [section]: { ...prev[section], [key]: value },
    }))
  }

  async function handleSave(section: string) {
    setSaving(section)
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, data: settings[section as keyof SettingsState] }),
      })
      if (res.ok) {
        setToast(ar ? 'الإعدادات اتحفظت بنجاح' : 'Settings saved successfully')
      } else {
        setToast(ar ? 'معرفناش نحفظ الإعدادات' : 'Failed to save settings')
      }
    } catch {
      setToast(ar ? 'معرفناش نحفظ الإعدادات' : 'Failed to save settings')
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-estate-gold" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center">
        <p className="text-sm text-red-400">{ar ? 'معرفناش نحمّل الإعدادات — حاول تاني.' : 'Could not load the settings — try again.'}</p>
        <Button
          onClick={() => setRetryKey((k) => k + 1)}
          className="mt-4 bg-gradient-to-r from-estate-gold to-yellow-600 text-[#0F1A2C]"
        >
          {ar ? 'حاول تاني' : 'Try again'}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-estate-gold to-yellow-600 shadow-lg shadow-estate-gold/20">
          <Building2 className="h-5 w-5 text-foreground" />
        </div>
        <Reveal>
          <p className="section-kicker">{ar ? 'لوحة المدير · الإعدادات' : 'CEO Console · Settings'}</p>
          <h1 className="font-display display-3 text-foreground">{ar ? 'الإعدادات' : 'Settings'}</h1>
          <p className="text-sm text-gray-400">{ar ? 'اتحكم في إعدادات المنصة' : 'Manage platform configuration'}</p>
          <hr className="gold-hairline mt-4" />
        </Reveal>
      </div>

      {/* Company Information */}
      <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
        <CardHeader>
          <SectionHeader icon={Building2} title={ar ? 'بيانات الشركة' : 'Company Information'} />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-400">{ar ? 'اسم الشركة' : 'Company Name'}</label>
              <Input
                value={settings.company.name}
                onChange={(e) => update('company', 'name', e.target.value)}
                className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-400">{ar ? 'الإيميل' : 'Email'}</label>
              <Input
                type="email"
                value={settings.company.email}
                onChange={(e) => update('company', 'email', e.target.value)}
                className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-400">{ar ? 'التليفون' : 'Phone'}</label>
              <Input
                value={settings.company.phone}
                onChange={(e) => update('company', 'phone', e.target.value)}
                className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-400">{ar ? 'الموقع' : 'Website'}</label>
              <Input
                value={settings.company.website}
                onChange={(e) => update('company', 'website', e.target.value)}
                className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-400">{ar ? 'العنوان' : 'Address'}</label>
            <textarea
              value={settings.company.address}
              onChange={(e) => update('company', 'address', e.target.value)}
              rows={2}
              className="w-full rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-estate-gold/50 focus:ring-1 focus:ring-estate-gold/20"
            />
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => handleSave('company')}
              disabled={saving === 'company'}
              className="bg-gradient-to-r from-estate-gold to-yellow-600 text-[#0F1A2C]"
            >
              {saving === 'company' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {ar ? 'احفظ' : 'Save'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* WhatsApp CTA Bubble — global floating button on every public page */}
      <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
        <CardHeader>
          <SectionHeader icon={MessageCircle} title={ar ? 'زر واتساب العائم' : 'WhatsApp CTA Bubble'} />
        </CardHeader>
        <CardContent className="space-y-2">
          <Toggle
            enabled={settings.cta.enabled}
            onChange={(v) => update('cta', 'enabled', v)}
            label={ar ? 'إظهار زر واتساب' : 'Show WhatsApp bubble'}
            description={ar ? 'زر عائم أخضر في كل صفحات الموقع' : 'Floating green button on every public page'}
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-400">{ar ? 'رقم واتساب (أرقام بس)' : 'WhatsApp Number (digits only)'}</label>
              <Input
                dir="ltr"
                inputMode="tel"
                placeholder="201000000000"
                value={settings.cta.whatsappNumber}
                onChange={(e) => update('cta', 'whatsappNumber', e.target.value.replace(/\D/g, '').slice(0, 15))}
                className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50"
              />
              <p className="text-[11px] text-gray-500">
                {ar ? 'من غير + أو مسافات — مثال: 201000000000. فاضي = الزر مخفي.' : 'No + or spaces — e.g. 201000000000. Empty = bubble hidden.'}
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-400">{ar ? 'تلميح الزر (عربي)' : 'Button Tooltip (Arabic)'}</label>
              <Input
                value={settings.cta.labelAr}
                onChange={(e) => update('cta', 'labelAr', e.target.value)}
                className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50"
              />
              <label className="pt-2 text-xs font-medium text-gray-400">{ar ? 'تلميح الزر (إنجليزي)' : 'Button Tooltip (English)'}</label>
              <Input
                value={settings.cta.labelEn}
                onChange={(e) => update('cta', 'labelEn', e.target.value)}
                className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50"
              />
            </div>
          </div>
          {/* Floating contact numbers (phone-call button + WhatsApp bubble).
              Leave a field empty to hide its button — the floating buttons show
              on all public pages only when a number is set. */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-400">{ar ? 'رقم الواتساب' : 'WhatsApp number'}</label>
              <Input
                dir="ltr"
                placeholder="+20 100 000 0000"
                value={settings.cta.whatsapp}
                onChange={(e) => update('cta', 'whatsapp', e.target.value)}
                className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-400">{ar ? 'رقم التليفون (زر الاتصال)' : 'Phone number (call button)'}</label>
              <Input
                dir="ltr"
                placeholder="+20 100 000 0000"
                value={settings.cta.phone}
                onChange={(e) => update('cta', 'phone', e.target.value)}
                className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500">
            {ar ? 'أرقام و+ ومسافات بس (٢٠ حرف كحد أقصى).' : 'Digits, + and spaces only (max 20 chars).'}
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-400">{ar ? 'الرسالة الجاهزة (عربي)' : 'Prefilled Message (Arabic)'}</label>
              <textarea
                value={settings.cta.messageAr}
                onChange={(e) => update('cta', 'messageAr', e.target.value)}
                rows={2}
                className="w-full rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-estate-gold/50 focus:ring-1 focus:ring-estate-gold/20"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-400">{ar ? 'الرسالة الجاهزة (إنجليزي)' : 'Prefilled Message (English)'}</label>
              <textarea
                value={settings.cta.messageEn}
                onChange={(e) => update('cta', 'messageEn', e.target.value)}
                rows={2}
                className="w-full rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-estate-gold/50 focus:ring-1 focus:ring-estate-gold/20"
              />
            </div>
          </div>
          {settings.cta.whatsappNumber !== '' && settings.cta.whatsappNumber.replace(/\D/g, '').length < 7 && (
            <p className="text-xs text-red-400">{ar ? 'الرقم قصير — لازم 7 أرقام على الأقل.' : 'Number too short — at least 7 digits required.'}</p>
          )}
          <div className="flex justify-end pt-2">
            <Button
              onClick={() => handleSave('cta')}
              disabled={saving === 'cta' || (settings.cta.whatsappNumber !== '' && settings.cta.whatsappNumber.replace(/\D/g, '').length < 7)}
              className="bg-gradient-to-r from-estate-gold to-yellow-600 text-[#0F1A2C]"
            >
              {saving === 'cta' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {ar ? 'احفظ' : 'Save'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Platform Settings */}
      <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
        <CardHeader>
          <SectionHeader icon={Globe} title={ar ? 'إعدادات المنصة' : 'Platform Settings'} />
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-400">{ar ? 'العملة الافتراضية' : 'Default Currency'}</label>
              <select
                value={settings.platform.currency}
                onChange={(e) => update('platform', 'currency', e.target.value)}
                className="w-full rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-foreground outline-none focus:border-estate-gold/50"
              >
                <option value="EGP">{ar ? 'جنيه مصري (EGP)' : 'EGP - Egyptian Pound'}</option>
                <option value="USD">{ar ? 'دولار أمريكي (USD)' : 'USD - US Dollar'}</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-400">{ar ? 'اللغة الافتراضية' : 'Default Language'}</label>
              <select
                value={settings.platform.language}
                onChange={(e) => update('platform', 'language', e.target.value)}
                className="w-full rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-foreground outline-none focus:border-estate-gold/50"
              >
                <option value="English">{ar ? 'إنجليزي' : 'English'}</option>
                <option value="Arabic">{ar ? 'عربي' : 'Arabic'}</option>
              </select>
            </div>
          </div>
          <Toggle
            enabled={settings.platform.maintenanceMode}
            onChange={(v) => update('platform', 'maintenanceMode', v)}
            label={ar ? 'وضع الصيانة' : 'Maintenance Mode'}
            description={ar ? 'اقفل الدخول العام مؤقتًا' : 'Temporarily disable public access'}
          />
          <Toggle
            enabled={settings.platform.registrationEnabled}
            onChange={(v) => update('platform', 'registrationEnabled', v)}
            label={ar ? 'التسجيل مفتوح' : 'Registration Enabled'}
            description={ar ? 'اسمح لليوزرز الجداد يسجلوا' : 'Allow new users to register'}
          />
          <div className="flex justify-end pt-2">
            <Button
              onClick={() => handleSave('platform')}
              disabled={saving === 'platform'}
              className="bg-gradient-to-r from-estate-gold to-yellow-600 text-[#0F1A2C]"
            >
              {saving === 'platform' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {ar ? 'احفظ' : 'Save'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* AI Configuration */}
      <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
        <CardHeader>
          <SectionHeader icon={Sparkles} title={ar ? 'إعدادات الذكاء الاصطناعي' : 'AI Configuration'} />
        </CardHeader>
        <CardContent className="space-y-2">
          <Toggle
            enabled={settings.ai.searchEnabled}
            onChange={(v) => update('ai', 'searchEnabled', v)}
            label={ar ? 'البحث بالذكاء الاصطناعي' : 'AI-Powered Search'}
            description={ar ? 'استخدم الذكاء الاصطناعي لتحسين نتايج البحث' : 'Use AI to enhance property search results'}
          />
          <Toggle
            enabled={settings.ai.recommendationsEnabled}
            onChange={(v) => update('ai', 'recommendationsEnabled', v)}
            label={ar ? 'ترشيحات الذكاء الاصطناعي' : 'AI Recommendations'}
            description={ar ? 'اعرض ترشيحات عقارات مخصوصة' : 'Show personalized property recommendations'}
          />
          <Toggle
            enabled={settings.ai.priceEstimation}
            onChange={(v) => update('ai', 'priceEstimation', v)}
            label={ar ? 'تقدير الأسعار بالذكاء الاصطناعي' : 'AI Price Estimation'}
            description={ar ? 'استخدم الذكاء الاصطناعي لتقدير أسعار العقارات' : 'Use AI to estimate property prices'}
          />
          <div className="flex justify-end pt-2">
            <Button
              onClick={() => handleSave('ai')}
              disabled={saving === 'ai'}
              className="bg-gradient-to-r from-estate-gold to-yellow-600 text-[#0F1A2C]"
            >
              {saving === 'ai' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {ar ? 'احفظ' : 'Save'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
        <CardHeader>
          <SectionHeader icon={Bell} title={ar ? 'إعدادات التنبيهات' : 'Notification Settings'} />
        </CardHeader>
        <CardContent className="space-y-2">
          <Toggle
            enabled={settings.notifications.email}
            onChange={(v) => update('notifications', 'email', v)}
            label={ar ? 'تنبيهات الإيميل' : 'Email Notifications'}
            description={ar ? 'استقبل التنبيهات على الإيميل' : 'Receive alerts via email'}
          />
          <Toggle
            enabled={settings.notifications.sms}
            onChange={(v) => update('notifications', 'sms', v)}
            label={ar ? 'تنبيهات الـSMS' : 'SMS Notifications'}
            description={ar ? 'استقبل التنبيهات على الموبايل' : 'Receive alerts via SMS'}
          />
          <Toggle
            enabled={settings.notifications.newLead}
            onChange={(v) => update('notifications', 'newLead', v)}
            label={ar ? 'تنبيه الليد الجديد' : 'New Lead Alerts'}
            description={ar ? 'يتبعتلك لما ليد جديد يتعمل' : 'Get notified when a new lead is created'}
          />
          <Toggle
            enabled={settings.notifications.newInquiry}
            onChange={(v) => update('notifications', 'newInquiry', v)}
            label={ar ? 'تنبيه الاستفسار الجديد' : 'New Inquiry Alerts'}
            description={ar ? 'يتبعتلك لما استفسار جديد يوصل' : 'Get notified when a new inquiry is received'}
          />
          <Toggle
            enabled={settings.notifications.weeklyReport}
            onChange={(v) => update('notifications', 'weeklyReport', v)}
            label={ar ? 'التقرير الأسبوعي' : 'Weekly Report'}
            description={ar ? 'استقبل ملخص أداء أسبوعي' : 'Receive a weekly performance summary'}
          />
          <div className="flex justify-end pt-2">
            <Button
              onClick={() => handleSave('notifications')}
              disabled={saving === 'notifications'}
              className="bg-gradient-to-r from-estate-gold to-yellow-600 text-[#0F1A2C]"
            >
              {saving === 'notifications' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {ar ? 'احفظ' : 'Save'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* System Settings */}
      <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
        <CardHeader>
          <SectionHeader icon={Database} title={ar ? 'إعدادات السيستم' : 'System Settings'} />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: 'Users', labelAr: 'المستخدمين', count: '1,247' },
              { label: 'Properties', labelAr: 'العقارات', count: '3,891' },
              { label: 'Leads', labelAr: 'الليدز', count: '8,432' },
              { label: 'Inquiries', labelAr: 'الاستفسارات', count: '5,674' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-4 py-3 text-center"
              >
                <p className="text-lg font-bold text-foreground">{stat.count}</p>
                <p className="text-xs text-gray-400">{ar ? stat.labelAr : stat.label}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">{ar ? 'نسخة المنصة' : 'Platform Version'}</p>
              <p className="text-xs text-gray-500">Estate Pro v2.4.1</p>
            </div>
            <Badge variant="outline" className="border-green-500/30 bg-green-500/10 text-green-400">
              {ar ? 'محدّثة' : 'Up to date'}
            </Badge>
          </div>

          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => setToast(ar ? 'الكاش اتمسح بنجاح' : 'Cache cleared successfully')}
              className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]"
            >
              {ar ? 'امسح الكاش' : 'Clear Cache'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
