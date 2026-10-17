'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import {
  Rocket,
  Loader2,
  Save,
  Pin,
  PinOff,
  EyeOff,
  Eye,
  Search,
  Sparkles,
  CheckCircle2,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import { Reveal } from '@/components/design'

// ─── types (mirror /api/ceo/new-launches) ──────────────────
interface LaunchConfig {
  enabled: boolean
  windowDays: number
  limit: number
  pinnedIds: string[]
  hiddenIds: string[]
}

interface LiveProject {
  id: string
  name: string
  nameArabic?: string | null
  slug: string
  coverImage?: string | null
  startPrice?: number | null
  createdAt: string
  developer?: { companyName: string } | null
  city?: { name: string } | null
  district?: { name: string } | null
}

type LaunchState = 'PINNED' | 'AUTO' | 'HIDDEN' | 'OUTDATED'

interface Candidate extends LiveProject {
  launchState: LaunchState
  isActive: boolean
}

const STATE_BADGE: Record<LaunchState, { label: string; labelAr: string; cls: string }> = {
  PINNED: {
    label: 'Pinned',
    labelAr: 'متثبّت',
    cls: 'border-estate-gold/40 bg-estate-gold/10 text-estate-gold',
  },
  AUTO: {
    label: 'Auto · in window',
    labelAr: 'تلقائي · في المدة',
    cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  },
  HIDDEN: {
    label: 'Hidden',
    labelAr: 'مستخبي',
    cls: 'border-red-500/30 bg-red-500/10 text-red-400',
  },
  OUTDATED: {
    label: 'Out of window',
    labelAr: 'بره المدة',
    cls: 'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-400',
  },
}

const fmtDate = (v: string, ar = false) =>
  new Date(v).toLocaleDateString(ar ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

const locationOf = (p: LiveProject) =>
  [p.district?.name, p.city?.name].filter(Boolean).join(', ')

export default function NewLaunchesControlPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [form, setForm] = useState<LaunchConfig | null>(null)
  const [live, setLive] = useState<LiveProject[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')

  const load = useCallback(async (q?: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (q && q.trim()) params.set('search', q.trim())
      const res = await fetch(`/api/ceo/new-launches${params.toString() ? `?${params}` : ''}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      setForm(data.config)
      setLive(data.live || [])
      setCandidates(data.candidates || [])
    } catch (err) {
      console.error('Failed to load new launches:', err)
      setError(ar ? 'معرفناش نحمّل البيانات — حاول تاني.' : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [ar])

  useEffect(() => {
    load()
  }, [load])

  const flash = (msg: string) => {
    setSuccess(msg)
    setTimeout(() => setSuccess(null), 3500)
  }

  // ── settings ─────────────────────────────────────────────
  const saveSettings = async () => {
    if (!form) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/ceo/new-launches', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'SETTINGS', config: form }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setForm(data.config)
      setLive(data.live || [])
      flash(ar ? 'الإعدادات اتحفظت — شريط الرئيسية اتحدّث.' : 'Settings saved — homepage band updated.')
    } catch (err) {
      console.error('Failed to save settings:', err)
      setError(ar ? 'معرفناش نحفظ — حاول تاني.' : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // ── per-project actions ──────────────────────────────────
  const act = async (type: 'PIN' | 'UNPIN' | 'HIDE' | 'SHOW', project: Candidate) => {
    if (type === 'HIDE') {
      const ok = window.confirm(
        ar
          ? `تخفي "${project.name}" من قسم اللانشات الجديدة وتشيل شارة "جديد"؟`
          : `Hide "${project.name}" from the New Launches section and remove its New badge?`
      )
      if (!ok) return
    }
    setBusyId(project.id)
    setError(null)
    try {
      const res = await fetch('/api/ceo/new-launches', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, projectId: project.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Action failed')
      setForm(data.config)
      setLive(data.live || [])
      const actAr = type === 'PIN' ? 'اتثبّت' : type === 'UNPIN' ? 'اتشال التثبيت' : type === 'HIDE' ? 'استخبى' : 'ظهر'
      const actEn = type === 'PIN' ? 'Pinned' : type === 'UNPIN' ? 'Unpinned' : type === 'HIDE' ? 'Hidden' : 'Shown'
      flash(`${ar ? actAr : actEn} — ${project.name}`)
      await load(query)
    } catch (err) {
      console.error('Launch action failed:', err)
      setError(ar ? 'الحركة فشلت — حاول تاني.' : 'Action failed')
    } finally {
      setBusyId(null)
    }
  }

  const runSearch = (e?: React.FormEvent) => {
    e?.preventDefault()
    setQuery(search)
    load(search)
  }

  if (loading && !form) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin" /> {ar ? 'بيحمّل التحكم في اللانشات…' : 'Loading New Launches control…'}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Reveal>
          <p className="section-kicker">{ar ? 'لوحة المدير · اللانشات' : 'CEO Console · Launches'}</p>
          <h1 className="flex items-center gap-2 font-display display-3 text-foreground">
            <Rocket className="h-6 w-6 text-estate-gold" /> {ar ? 'التحكم في اللانشات الجديدة' : 'New Launches Control'}
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            {ar
              ? 'تحكم كامل في شريط "اللانشات الجديدة" على الرئيسية وكل شارة "جديد" على كروت المشاريع — المدة والعدد والتثبيت والإخفاء، وبيتطبق من السيرفر.'
              : 'Full control over the homepage “New Launches” band and every “New” badge on project cards — window, limit, pinning and hiding, applied server-side.'}
          </p>
          <hr className="gold-hairline mt-4" />
        </Reveal>
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm font-medium text-gray-300 transition-colors hover:border-estate-gold/40 hover:text-estate-gold"
        >
          <ExternalLink className="h-4 w-4" /> {ar ? 'شوف الرئيسية' : 'View homepage'}
        </a>
      </div>

      {/* banners */}
      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {success}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-5">
        {/* ── Section settings ───────────────────────────── */}
        <Card className="border-border dark:border-[#262626] bg-card dark:bg-black xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Sparkles className="h-5 w-5 text-estate-gold" /> {ar ? 'إعدادات القسم' : 'Section Settings'}
            </CardTitle>
            <CardDescription className="text-gray-400">
              {ar ? 'بتتطبق على شريط الرئيسية وشارات "جديد" في كل حتة.' : 'Applies to the homepage band and the “New” badges everywhere.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {form && (
              <>
                {/* enable switch */}
                <div className="flex items-center justify-between rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {form.enabled ? (ar ? 'القسم شغال' : 'Section enabled') : (ar ? 'القسم مقفول' : 'Section disabled')}
                    </p>
                    <p className="text-xs text-gray-500">
                      {form.enabled
                        ? (ar ? 'الشريط وشارات الجديد شغالة على الموقع.' : 'The band and New badges are live on the site.')
                        : (ar ? 'الشريط مستخبي وكل شارات الجديد مقفولة.' : 'Band hidden and all New badges turned off.')}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.enabled}
                    onClick={() => setForm({ ...form, enabled: !form.enabled })}
                    className={cn(
                      'relative h-6 w-11 shrink-0 rounded-full transition-colors',
                      form.enabled ? 'bg-estate-gold' : 'bg-muted'
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all',
                        form.enabled ? 'left-[22px]' : 'left-0.5'
                      )}
                    />
                  </button>
                </div>

                {/* window + limit */}
                <div className="grid grid-cols-2 gap-4">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-gray-400">{ar ? 'المدة التلقائية (بالأيام)' : 'Auto window (days)'}</span>
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      value={form.windowDays}
                      onChange={(e) =>
                        setForm({ ...form, windowDays: Number(e.target.value) || 1 })
                      }
                      className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground"
                    />
                    <span className="block text-[11px] text-gray-500">
                      {ar ? 'المشاريع اللي اتضافت في المدة دي بتظهر لوحدها.' : 'Projects added within this window appear automatically.'}
                    </span>
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-gray-400">{ar ? 'أقصى عدد كروت' : 'Max cards shown'}</span>
                    <Input
                      type="number"
                      min={1}
                      max={12}
                      value={form.limit}
                      onChange={(e) => setForm({ ...form, limit: Number(e.target.value) || 1 })}
                      className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground"
                    />
                    <span className="block text-[11px] text-gray-500">
                      {ar ? 'المتثبتين ظاهرين على طول ومش محسوبين.' : 'Pinned projects are always shown and don’t count.'}
                    </span>
                  </label>
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-dashed border-border dark:border-[#262626] px-4 py-2.5 text-xs text-gray-400">
                  <span>
                    {ar ? 'المتثبت:' : 'Pinned:'} <b className="text-estate-gold">{form.pinnedIds.length}</b> · {ar ? 'المستخبي:' : 'Hidden:'}{' '}
                    <b className="text-red-400">{form.hiddenIds.length}</b>
                  </span>
                  <span>
                    {ar ? 'الكروت الشغالة:' : 'Live cards:'} <b className="text-foreground">{live.length}</b>
                  </span>
                </div>

                <Button
                  onClick={saveSettings}
                  disabled={saving}
                  className="w-full bg-gradient-to-r from-estate-gold to-estate-gold-dark text-[#0F1A2C]"
                >
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {ar ? 'احفظ الإعدادات' : 'Save Settings'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Live band ──────────────────────────────────── */}
        <Card className="border-border dark:border-[#262626] bg-card dark:bg-black xl:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Rocket className="h-5 w-5 text-estate-gold" /> {ar ? 'الشغال على الرئيسية' : 'Live on Homepage'}
              <span className="ml-auto rounded-full border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-2 py-0.5 text-xs font-normal text-gray-400">
                {live.length} / {form?.limit ?? '—'}
              </span>
            </CardTitle>
            <CardDescription className="text-gray-400">
              {ar
                ? `بالظبط اللي الزوار شايفينه دلوقتي، بالترتيب. المتثبت الأول، وبعدين الأحدث في مدة الـ${form?.windowDays ?? '—'} يوم.`
                : `Exactly what visitors see right now, in display order. Pinned first, then newest inside the ${form?.windowDays ?? '—'}-day window.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!form?.enabled ? (
              <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-4 py-6 text-center text-sm text-gray-400">
                {ar ? <>القسم <b className="text-red-400">مقفول</b> — مفيش حاجة ظاهرة على الرئيسية. شغّله من إعدادات القسم.</> : <>The section is <b className="text-red-400">disabled</b> — nothing is shown on the homepage. Enable it in Section Settings.</>}
              </div>
            ) : live.length === 0 ? (
              <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-4 py-6 text-center text-sm text-gray-400">
                {ar ? 'مفيش مشاريع مطابقة للقواعد الحالية. ثبّت مشروع من تحت أو وسّع المدة.' : 'No projects match the current rules. Pin a project below or widen the auto window.'}
              </div>
            ) : (
              <ol className="space-y-2">
                {live.map((p, idx) => {
                  const pinned = form?.pinnedIds.includes(p.id)
                  return (
                    <li
                      key={p.id}
                      className="flex items-center gap-3 rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-2.5"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-estate-gold/15 text-xs font-bold text-estate-gold">
                        {idx + 1}
                      </span>
                      <Image
                        src={p.coverImage || '/images/placeholder.jpg'}
                        alt=""
                        width={64}
                        height={40}
                        className="h-10 w-16 shrink-0 rounded-2xl object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {ar && p.nameArabic ? p.nameArabic : p.name}
                        </p>
                        <p className="truncate text-xs text-gray-500">
                          {locationOf(p) ? `${locationOf(p)} · ` : ''}{ar ? 'اتضاف' : 'Added'} {fmtDate(p.createdAt, ar)}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'hidden shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide sm:block',
                          STATE_BADGE[pinned ? 'PINNED' : 'AUTO'].cls
                        )}
                      >
                        {ar ? STATE_BADGE[pinned ? 'PINNED' : 'AUTO'].labelAr : pinned ? 'Pinned' : 'Auto'}
                      </span>
                      <div className="flex shrink-0 gap-1">
                        {pinned ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busyId === p.id}
                            onClick={() => act('UNPIN', { ...p, launchState: 'PINNED', isActive: true })}
                            className="h-8 text-gray-400 hover:text-foreground"
                            title={ar ? 'اشيل التثبيت' : 'Unpin'}
                          >
                            <PinOff className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busyId === p.id}
                            onClick={() => act('PIN', { ...p, launchState: 'AUTO', isActive: true })}
                            className="h-8 text-gray-400 hover:text-estate-gold"
                            title={ar ? 'طلّعه فوق (ثبّت)' : 'Move to top (pin)'}
                          >
                            <Pin className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyId === p.id}
                          onClick={() => act('HIDE', { ...p, launchState: pinned ? 'PINNED' : 'AUTO', isActive: true })}
                          className="h-8 text-gray-400 hover:text-red-400"
                          title={ar ? 'اخفي من القسم' : 'Hide from section'}
                        >
                          <EyeOff className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Manage every project ─────────────────────────── */}
      <Card className="border-border dark:border-[#262626] bg-card dark:bg-black">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-foreground">
            <Search className="h-5 w-5 text-estate-gold" /> {ar ? 'اتحكم في المشاريع' : 'Manage Projects'}
          </CardTitle>
          <CardDescription className="text-gray-400">
            {ar
              ? 'التثبيت بيخلّي المشروع في الشريط مهما كان قديم · الإخفاء بيشيله هو وشارة الجديد حتى لو لسه نازل · الإظهار بيرجّع القواعد التلقائية.'
              : 'Pin keeps a project in the band regardless of age · Hide removes it and its New badge even if it was just launched · Show restores automatic rules.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={runSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={ar ? 'دوّر باسم المشروع (عربي/إنجليزي) أو الرابط…' : 'Search by project name (Arabic/English) or slug…'}
                className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] pl-9 text-foreground"
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              disabled={loading}
              className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (ar ? 'دوّر' : 'Search')}
            </Button>
            {query && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setSearch('')
                  setQuery('')
                  load()
                }}
                className="text-gray-400"
              >
                {ar ? 'امسح' : 'Clear'}
              </Button>
            )}
          </form>

          {loading && candidates.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> {ar ? 'بيحمّل المشاريع…' : 'Loading projects…'}
            </div>
          ) : candidates.length === 0 ? (
            <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-4 py-6 text-center text-sm text-gray-400">
              {ar ? 'مفيش مشاريع' : 'No projects found'}{query ? (ar ? ` لـ"${query}"` : ` for “${query}”`) : ''}.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border dark:border-[#262626]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-2.5 font-medium">{ar ? 'المشروع' : 'Project'}</th>
                    <th className="px-4 py-2.5 font-medium">{ar ? 'اتضاف' : 'Added'}</th>
                    <th className="px-4 py-2.5 font-medium">{ar ? 'الحالة' : 'State'}</th>
                    <th className="px-4 py-2.5 text-right font-medium">{ar ? 'إجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-border dark:border-[#262626] last:border-0 hover:bg-white/[0.03]"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <Image
                            src={p.coverImage || '/images/placeholder.jpg'}
                            alt=""
                            width={48}
                            height={32}
                            className="h-8 w-12 shrink-0 rounded-2xl object-cover"
                          />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">
                              {ar && p.nameArabic ? p.nameArabic : p.name}
                            </p>
                            <p className="truncate text-xs text-gray-500">/projects/{p.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-400">
                        {fmtDate(p.createdAt, ar)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={cn(
                            'inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                            STATE_BADGE[p.launchState].cls
                          )}
                        >
                          {ar ? STATE_BADGE[p.launchState].labelAr : STATE_BADGE[p.launchState].label}
                        </span>
                        {!p.isActive && (
                          <span className="ml-1.5 inline-block rounded-full border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-2 py-0.5 text-[10px] font-semibold uppercase text-gray-500">
                            {ar ? 'مش نشط' : 'Inactive'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1.5">
                          {p.launchState === 'PINNED' ? (
                            <>
                              <ActionBtn
                                busy={busyId === p.id}
                                onClick={() => act('UNPIN', p)}
                                icon={<PinOff className="h-4 w-4" />}
                                label={ar ? 'اشيل التثبيت' : 'Unpin'}
                              />
                              <ActionBtn
                                busy={busyId === p.id}
                                onClick={() => act('HIDE', p)}
                                icon={<EyeOff className="h-4 w-4" />}
                                label={ar ? 'اخفي' : 'Hide'}
                                danger
                              />
                            </>
                          ) : p.launchState === 'HIDDEN' ? (
                            <ActionBtn
                              busy={busyId === p.id}
                              onClick={() => act('SHOW', p)}
                              icon={<Eye className="h-4 w-4" />}
                              label={ar ? 'اظهر' : 'Show'}
                            />
                          ) : p.launchState === 'AUTO' ? (
                            <>
                              <ActionBtn
                                busy={busyId === p.id}
                                onClick={() => act('PIN', p)}
                                icon={<Pin className="h-4 w-4" />}
                                label={ar ? 'ثبّت' : 'Pin'}
                              />
                              <ActionBtn
                                busy={busyId === p.id}
                                onClick={() => act('HIDE', p)}
                                icon={<EyeOff className="h-4 w-4" />}
                                label={ar ? 'اخفي' : 'Hide'}
                                danger
                              />
                            </>
                          ) : (
                            <ActionBtn
                              busy={busyId === p.id}
                              onClick={() => act('PIN', p)}
                              icon={<Pin className="h-4 w-4" />}
                              label={ar ? 'ثبّت' : 'Pin'}
                            />
                          )}
                        </div>
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

function ActionBtn({
  busy,
  onClick,
  icon,
  label,
  danger,
}: {
  busy: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  danger?: boolean
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={busy}
      onClick={onClick}
      className={cn(
        'h-8 gap-1.5 px-2.5 text-xs',
        danger
          ? 'text-gray-400 hover:bg-red-500/10 hover:text-red-400'
          : 'text-gray-400 hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-foreground'
      )}
      title={label}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      <span className="hidden md:inline">{label}</span>
    </Button>
  )
}
