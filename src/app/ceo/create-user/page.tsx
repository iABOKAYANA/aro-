'use client'

import { useState } from 'react'
import ImageInput from '../components/image-input'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UserPlus, Loader2, CheckCircle, Copy } from 'lucide-react'
import { useLanguage } from '@/lib/language-context'
import { Reveal } from '@/components/design'

const ROLES = [
  { value: 'BUYER', label: 'Buyer', labelAr: 'مشتري' },
  { value: 'BROKER', label: 'Broker', labelAr: 'بروكر' },
  { value: 'DEVELOPER', label: 'Developer', labelAr: 'مطوّر' },
  { value: 'SELLER', label: 'Seller', labelAr: 'بايع' },
  { value: 'ADMIN', label: 'Admin', labelAr: 'أدمن' },
]

export default function CreateUserPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'BUYER', avatar: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ email: string; password: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const handleCreate = async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/ceo/create-user', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setSuccess({ email: form.email, password: form.password })
      setForm({ email: '', name: '', password: '', role: 'BUYER', avatar: '' })
    } catch (err) {
      console.error('Failed to create user:', err)
      setError(ar ? 'معرفناش نعمل الحساب — حاول تاني.' : 'Failed to create account')
    } finally {
      setLoading(false)
    }
  }

  const copyCredentials = () => {
    if (!success) return
    navigator.clipboard.writeText(`Email: ${success.email}\nPassword: ${success.password}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      <Reveal>
        <p className="section-kicker">{ar ? 'لوحة المدير · يوزر جديد' : 'CEO Console · New User'}</p>
        <h1 className="font-display display-3">{ar ? 'اعمل حساب يوزر' : 'Create User Account'}</h1>
        <p className="text-muted-foreground">{ar ? 'ضيف يوزر جديد على طول. ابعتله بيانات الدخول.' : 'Add a new user directly. Share the credentials with them.'}</p>
        <hr className="gold-hairline mt-4" />
      </Reveal>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            {ar ? 'حساب جديد' : 'New Account'}
          </CardTitle>
          <CardDescription>
            {ar ? 'اليوزر هيقدر يدخل فورًا ويغيّر الباسورد من الإعدادات.' : 'The user can log in immediately and change their password from settings.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-2xl bg-red-50 p-3 text-sm text-red-600">{error}</div>
          )}

          {success && (
            <div className="rounded-2xl bg-green-50 p-4">
              <div className="flex items-center gap-2 text-green-800">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">{ar ? 'الحساب اتعمل بنجاح!' : 'Account created successfully!'}</span>
              </div>
              <div className="mt-3 rounded-2xl bg-white p-3 text-sm text-gray-900">
                <p><span className="font-medium">{ar ? 'الإيميل:' : 'Email:'}</span> {success.email}</p>
                <p><span className="font-medium">{ar ? 'الباسورد:' : 'Password:'}</span> {success.password}</p>
              </div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" onClick={copyCredentials}>
                  {copied ? (ar ? 'اتنسخ!' : 'Copied!') : <Copy className="mr-1 h-3 w-3" />}
                  {ar ? 'انسخ البيانات' : 'Copy Credentials'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSuccess(null)}>
                  {ar ? 'اقفل' : 'Dismiss'}
                </Button>
              </div>
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
              <label className="text-sm font-medium">{ar ? 'الاسم' : 'Name'}</label>
              <Input
                placeholder={ar ? 'الاسم بالكامل' : 'Full name'}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
          </div>

          <ImageInput
            label={ar ? 'الصورة الشخصية (اختياري)' : 'Profile photo (optional)'}
            value={form.avatar}
            onChange={(v) => setForm({ ...form, avatar: v })}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">{ar ? 'الباسورد *' : 'Password *'}</label>
              <Input
                type="password"
                placeholder={ar ? '١٠ حروف على الأقل' : 'Minimum 10 characters'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
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
                  <option key={r.value} value={r.value}>{ar ? r.labelAr : r.label}</option>
                ))}
              </select>
            </div>
          </div>

          <Button
            onClick={handleCreate}
            disabled={loading || !form.email || !form.password}
            className="gold-shimmer bg-estate-gold hover:bg-estate-gold-dark"
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
            {ar ? 'اعمل الحساب' : 'Create Account'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
