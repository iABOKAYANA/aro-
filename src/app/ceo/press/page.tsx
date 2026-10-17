'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import ImageInput from '../components/image-input'
import { useLanguage } from '@/lib/language-context'
import {
  Newspaper,
  Plus,
  Eye,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Search,
  Inbox,
  X,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react'
import { Reveal } from '@/components/design'

type PressRelease = {
  id: string
  title: string
  titleArabic: string | null
  slug: string
  excerpt: string | null
  content: string
  coverImage: string | null
  source: string | null
  sourceUrl: string | null
  isPublished: boolean
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

type PressForm = {
  title: string
  titleArabic: string
  slug: string
  excerpt: string
  content: string
  coverImage: string
  source: string
  sourceUrl: string
  isPublished: boolean
}

const emptyForm: PressForm = {
  title: '',
  titleArabic: '',
  slug: '',
  excerpt: '',
  content: '',
  coverImage: '',
  source: '',
  sourceUrl: '',
  isPublished: false,
}

export default function CEOPressPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [releases, setReleases] = useState<PressRelease[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<PressForm>(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchReleases = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/press?limit=100&all=true')
      if (!res.ok) throw new Error('Failed to fetch press releases')
      const data = await res.json()
      // The API answers { items, total, page, totalPages } — older code
      // assigned that object straight into state and crashed on .filter().
      setReleases(Array.isArray(data) ? data : data.items || data.releases || data.pressReleases || [])
    } catch (err) {
      console.error('Failed to fetch press releases:', err)
      setError(ar ? 'معرفناش نجيب الأخبار الصحفية — حاول تاني.' : 'Failed to fetch press releases')
    } finally {
      setLoading(false)
    }
  }, [ar])

  useEffect(() => {
    fetchReleases()
  }, [fetchReleases])

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
  }

  const handleTitleChange = (value: string) => {
    setForm((prev) => ({
      ...prev,
      title: value,
      slug: prev.slug === generateSlug(prev.title) || prev.slug === '' ? generateSlug(value) : prev.slug,
    }))
  }

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.content.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/press', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error('Failed to create press release')
      setShowForm(false)
      setForm(emptyForm)
      await fetchReleases()
    } catch (err) {
      console.error('Failed to create press release:', err)
      alert(ar ? 'معرفناش نعمل البيان — حاول تاني.' : 'Failed to create press release')
    } finally {
      setSubmitting(false)
    }
  }

  const togglePublish = async (release: PressRelease) => {
    setTogglingId(release.id)
    try {
      const res = await fetch('/api/press', {
        method: 'PATCH',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: release.id, isPublished: !release.isPublished }),
      })
      if (!res.ok) throw new Error('Failed to update press release')
      await fetchReleases()
    } catch (err) {
      console.error('Failed to update press release:', err)
      alert(ar ? 'معرفناش نحدّث البيان — حاول تاني.' : 'Failed to update press release')
    } finally {
      setTogglingId(null)
    }
  }

  const deleteRelease = async (id: string) => {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/press?id=${id}`, { method: 'DELETE', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      if (!res.ok) throw new Error('Failed to delete press release')
      setExpandedId(null)
      await fetchReleases()
    } catch (err) {
      console.error('Failed to delete press release:', err)
      alert(ar ? 'معرفناش نمسح البيان — حاول تاني.' : 'Failed to delete press release')
    } finally {
      setDeletingId(null)
    }
  }

  const filteredReleases = releases.filter((release) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      release.title.toLowerCase().includes(q) ||
      (release.source && release.source.toLowerCase().includes(q))
    )
  })

  const publishedCount = releases.filter((r) => r.isPublished).length

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Reveal>
          <p className="section-kicker">{ar ? 'لوحة المدير · الصحافة' : 'CEO Console · Press'}</p>
          <h1 className="font-display display-3 text-foreground">{ar ? 'إدارة الصحافة' : 'Press Management'}</h1>
          <p className="mt-1 text-sm text-gray-400">{ar ? 'اتحكم في البيانات الصحفية والتغطية الإعلامية' : 'Manage press releases and media coverage'}</p>
          <hr className="gold-hairline mt-4" />
        </Reveal>
        <div className="flex gap-2">
          <Button onClick={fetchReleases} variant="outline" className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]">
            <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
            {ar ? 'حدّث' : 'Refresh'}
          </Button>
          <Button onClick={() => setShowForm(!showForm)} className="bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold/90">
            <Plus className="mr-2 h-4 w-4" />
            {ar ? 'بيان صحفي جديد' : 'New Press Release'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total Releases', labelAr: 'كل البيانات', value: releases.length, color: 'text-blue-400 bg-blue-500/10', icon: <Newspaper className="h-5 w-5" /> },
          { label: 'Published', labelAr: 'منشورين', value: publishedCount, color: 'text-green-400 bg-green-500/10', icon: <CheckCircle2 className="h-5 w-5" /> },
          { label: 'Drafts', labelAr: 'مسودات', value: releases.length - publishedCount, color: 'text-yellow-400 bg-yellow-500/10', icon: <XCircle className="h-5 w-5" /> },
          { label: 'Sources', labelAr: 'المصادر', value: [...new Set(releases.map((r) => r.source).filter(Boolean))].length, color: 'text-estate-gold bg-estate-gold/10', icon: <ExternalLink className="h-5 w-5" /> },
        ].map((stat) => (
          <div key={stat.label} className="flex items-center gap-3 rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-4">
            <div className={cn('flex h-10 w-10 items-center justify-center rounded-2xl', stat.color)}>
              {stat.icon}
            </div>
            <div>
              <p className="text-xs text-gray-500">{ar ? stat.labelAr : stat.label}</p>
              <p className="text-lg font-bold text-foreground">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border dark:border-[#262626] pb-4">
            <CardTitle className="text-lg text-foreground">{ar ? 'بيان صحفي جديد' : 'New Press Release'}</CardTitle>
            <button onClick={() => { setShowForm(false); setForm(emptyForm) }} className="rounded-full p-1 text-gray-500 hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">{ar ? 'العنوان *' : 'Title *'}</label>
                <Input
                  value={form.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder={ar ? 'اكتب عنوان البيان…' : 'Enter press release title...'}
                  className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50 focus:ring-estate-gold/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">{ar ? 'العنوان (بالعربي)' : 'Title (Arabic)'}</label>
                <Input
                  value={form.titleArabic}
                  onChange={(e) => setForm({ ...form, titleArabic: e.target.value })}
                  placeholder="العنوان بالعربية"
                  className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50 focus:ring-estate-gold/20"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">{ar ? 'الرابط' : 'Slug'}</label>
                <Input
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  placeholder="auto-generated-from-title"
                  className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50 focus:ring-estate-gold/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">{ar ? 'المصدر' : 'Source'}</label>
                <Input
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                  placeholder="e.g. Al Ahram, Reuters"
                  className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50 focus:ring-estate-gold/20"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-400">{ar ? 'لينك المصدر' : 'Source URL'}</label>
              <Input
                value={form.sourceUrl}
                onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
                placeholder="https://example.com/article"
                className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50 focus:ring-estate-gold/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-400">{ar ? 'مختصر' : 'Excerpt'}</label>
              <Input
                value={form.excerpt}
                onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
                placeholder={ar ? 'ملخص سريع للبيان…' : 'Brief summary of the press release...'}
                className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50 focus:ring-estate-gold/20"
              />
            </div>
            <ImageInput
              label={ar ? 'صورة الغلاف (ارفع ملف أو حط لينك)' : 'Cover Image (upload a file or paste a URL)'}
              value={form.coverImage}
              onChange={(v) => setForm({ ...form, coverImage: v })}
            />
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-400">{ar ? 'المحتوى *' : 'Content *'}</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                rows={8}
                placeholder={ar ? 'اكتب محتوى البيان كامل…' : 'Write the full press release content...'}
                className="w-full rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50 focus:outline-none focus:ring-1 focus:ring-estate-gold/20"
              />
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">{ar ? 'انشر فورًا' : 'Publish immediately'}</p>
                <p className="text-xs text-gray-500">{ar ? 'شغّلها عشان تنشر أو سيبها مسودة' : 'Toggle to publish or save as draft'}</p>
              </div>
              <button
                onClick={() => setForm({ ...form, isPublished: !form.isPublished })}
                className={cn(
                  'relative h-6 w-11 rounded-full transition-colors',
                  form.isPublished ? 'bg-estate-gold' : 'bg-muted'
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                    form.isPublished ? 'translate-x-5' : 'translate-x-0.5'
                  )}
                />
              </button>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => { setShowForm(false); setForm(emptyForm) }} className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A]">
                {ar ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button onClick={handleSubmit} disabled={!form.title.trim() || !form.content.trim() || submitting} className="gold-shimmer bg-estate-gold text-[#0F1A2C] hover:bg-estate-gold/90">
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {ar ? 'بيتعمل…' : 'Creating...'}
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    {ar ? 'اعمل البيان' : 'Create Release'}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <Input
          placeholder={ar ? 'دوّر بالعنوان أو المصدر…' : 'Search by title or source...'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] pl-10 text-foreground placeholder:text-muted-foreground focus:border-estate-gold/50 focus:ring-estate-gold/20"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-400">
          <XCircle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
          <Button onClick={fetchReleases} variant="ghost" size="sm" className="ml-auto text-red-400 hover:text-red-300">
            {ar ? 'حاول تاني' : 'Retry'}
          </Button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-estate-gold" />
        </div>
      )}

      {!loading && !error && filteredReleases.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] py-20">
          <Inbox className="h-12 w-12 text-gray-600" />
          <p className="mt-4 text-lg font-medium text-gray-400">{ar ? 'مفيش بيانات صحفية' : 'No press releases found'}</p>
          <p className="mt-1 text-sm text-gray-500">{search ? (ar ? 'جرّب تظبط البحث' : 'Try adjusting your search') : (ar ? 'اعمل أول بيان صحفي' : 'Create your first press release')}</p>
        </div>
      )}

      {!loading && !error && filteredReleases.length > 0 && (
        <Card className="border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] backdrop-blur-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border dark:border-[#262626]">
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'العنوان' : 'Title'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 md:table-cell">{ar ? 'المصدر' : 'Source'}</th>
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'الحالة' : 'Status'}</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-400 sm:table-cell">{ar ? 'تاريخ النشر' : 'Published Date'}</th>
                    <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'إجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border dark:divide-[#262626]">
                  {filteredReleases.map((release) => {
                    const isExpanded = expandedId === release.id
                    return (
                      <>
                        <tr
                          key={release.id}
                          onClick={() => setExpandedId(isExpanded ? null : release.id)}
                          className={cn('cursor-pointer transition-colors hover:bg-card dark:hover:bg-[#0A0A0A]', isExpanded && 'bg-muted')}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-400">
                                <Newspaper className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-foreground truncate max-w-[200px] sm:max-w-none">{release.title}</p>
                                {release.titleArabic && (
                                  <p className="text-xs text-gray-500 truncate max-w-[200px] sm:max-w-none">{release.titleArabic}</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="hidden px-4 py-3 md:table-cell">
                            {release.source ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-gray-400">{release.source}</span>
                                {release.sourceUrl && (
                                  <a href={release.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-estate-gold hover:text-estate-gold/80" onClick={(e) => e.stopPropagation()}>
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-600">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={(e) => { e.stopPropagation(); togglePublish(release) }}
                              disabled={togglingId === release.id}
                              className={cn(
                                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                                release.isPublished
                                  ? 'border-green-500/30 bg-green-500/15 text-green-400 hover:bg-green-500/20'
                                  : 'border-yellow-500/30 bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/20'
                              )}
                            >
                              {togglingId === release.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : release.isPublished ? (
                                <CheckCircle2 className="h-3 w-3" />
                              ) : (
                                <XCircle className="h-3 w-3" />
                              )}
                              {release.isPublished ? (ar ? 'منشور' : 'Published') : (ar ? 'مسودة' : 'Draft')}
                            </button>
                          </td>
                          <td className="hidden px-4 py-3 sm:table-cell">
                            <span className="text-gray-400">
                              {release.publishedAt
                                ? new Date(release.publishedAt).toLocaleDateString(ar ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => togglePublish(release)}
                                disabled={togglingId === release.id}
                                className="rounded-full border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-1.5 text-gray-400 transition-colors hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-foreground"
                              >
                                {release.isPublished ? <XCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                              </button>
                              <button
                                onClick={() => deleteRelease(release.id)}
                                disabled={deletingId === release.id}
                                className="rounded-full border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-1.5 text-gray-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
                              >
                                {deletingId === release.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              </button>
                              <button
                                onClick={() => setExpandedId(isExpanded ? null : release.id)}
                                className="rounded-full border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-1.5 text-gray-400 transition-colors hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-foreground"
                              >
                                {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr key={`${release.id}-expanded`}>
                            <td colSpan={5} className="border-b border-border dark:border-[#262626] bg-white/[0.02] px-4 py-5">
                              <div className="grid gap-6 lg:grid-cols-2">
                                <div className="space-y-3">
                                  <h4 className="text-sm font-semibold text-estate-gold">{ar ? 'التفاصيل' : 'Details'}</h4>
                                  <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                      <span className="text-gray-500">{ar ? 'الرابط' : 'Slug'}</span>
                                      <span className="text-gray-300">{release.slug}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-500">{ar ? 'اتعمل' : 'Created'}</span>
                                      <span className="text-gray-300">{new Date(release.createdAt).toLocaleDateString(ar ? 'ar-EG' : undefined)}</span>
                                    </div>
                                    {release.source && (
                                      <div className="flex justify-between">
                                        <span className="text-gray-500">{ar ? 'المصدر' : 'Source'}</span>
                                        <span className="text-gray-300">{release.source}</span>
                                      </div>
                                    )}
                                    {release.sourceUrl && (
                                      <div className="flex justify-between">
                                        <span className="text-gray-500">{ar ? 'لينك المصدر' : 'Source URL'}</span>
                                        <a href={release.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-estate-gold hover:underline">
                                          {ar ? 'شوف المصدر' : 'View Source'}
                                        </a>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="space-y-3">
                                  <h4 className="text-sm font-semibold text-estate-gold">{ar ? 'المحتوى' : 'Content'}</h4>
                                  <div className="rounded-2xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] p-3">
                                    {release.excerpt && <p className="mb-2 text-sm text-gray-400 italic">{release.excerpt}</p>}
                                    <p className="whitespace-pre-wrap text-sm text-gray-300 line-clamp-6">{release.content}</p>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
