'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import { Reveal } from '@/components/design'
import {
  AlertTriangle,
  ArrowUpDown,
  Building2,
  CheckCircle2,
  Download,
  FileText,
  ImageOff,
  Loader2,
  Newspaper,
  PartyPopper,
  Briefcase,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import type { GapKey } from '@/app/api/ceo/inventory-gaps/route'

interface ProjectGap {
  projectId: string
  slug: string
  name: string
  nameArabic: string | null
  missing: GapKey[]
  gapCount: number
  units: number
  unitsTotal: number
  plans: number
}

interface GapsResponse {
  projects: ProjectGap[]
  rollup: {
    projectsTotal: number
    projectsWithoutUnits: number
    projectsWithoutCovers: number
    unitsTotal: number
    gapsByKey: Record<GapKey, number>
    completeCount: number
    contentCounts: {
      blog: { published: number; draft: number; total: number }
      press: { published: number; draft: number; total: number }
      jobs: { published: number; draft: number; total: number }
    }
    reviewsTotal: number
    arabicCoveragePct: number
  }
  meta: { totalMatching: number; returned: number; capped: boolean; cap: number }
}

const GAP_LABELS: Record<GapKey, { en: string; ar: string }> = {
  cover: { en: 'No cover', ar: 'مفيش غلاف' },
  gallery: { en: 'No gallery', ar: 'مفيش جاليري' },
  descAr: { en: 'No Arabic desc.', ar: 'مفيش وصف عربي' },
  price: { en: 'No price', ar: 'مفيش سعر' },
  units: { en: 'No units', ar: 'مفيش وحدات' },
  plans: { en: 'No payment plans', ar: 'مفيش خطط دفع' },
  location: { en: 'No location', ar: 'مفيش لوكيشن' },
  'arabic-name': { en: 'No Arabic name', ar: 'مفيش اسم عربي' },
}

type SortKey = 'name' | 'gapCount' | 'units'
type FilterKey = 'ALL' | 'no-units' | GapKey

export default function CEOInventoryGapsPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [data, setData] = useState<GapsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('ALL')
  const [sortKey, setSortKey] = useState<SortKey>('gapCount')
  const [sortDir, setSortDir] = useState<1 | -1>(-1)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ceo/inventory-gaps')
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to load')
      setData(body)
    } catch (e) {
      console.error('Failed to load inventory gaps:', e)
      setError(ar ? 'معرفناش نجيب النواقص — حاول تاني.' : 'Failed to load inventory gaps')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows = useMemo(() => {
    if (!data) return []
    let list = data.projects
    if (filter === 'no-units') list = list.filter((p) => p.unitsTotal === 0)
    else if (filter !== 'ALL') list = list.filter((p) => p.missing.includes(filter))
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.nameArabic && p.nameArabic.toLowerCase().includes(q)) ||
          p.slug.toLowerCase().includes(q)
      )
    }
    const dir = sortDir
    return [...list].sort((a, b) => {
      if (sortKey === 'name') return (ar ? a.nameArabic || a.name : a.name).localeCompare(ar ? b.nameArabic || b.name : b.name) * dir
      if (sortKey === 'units') return (a.units - b.units) * dir
      return (a.gapCount - b.gapCount) * dir
    })
  }, [data, filter, search, sortKey, sortDir, ar])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 1 ? -1 : 1))
    } else {
      setSortKey(key)
      setSortDir(key === 'name' ? 1 : -1)
    }
  }

  const exportCsv = () => {
    const headers = ar
      ? ['المشروع', 'الاسم العربي', 'الرابط', 'نوع النقص', 'عدد النواقص', 'الوحدات', 'إجمالي الوحدات', 'خطط الدفع']
      : ['Project', 'Arabic name', 'Slug', 'Gap type', 'Gap count', 'Units', 'Total units', 'Payment plans']
    const csvRows = rows.flatMap((project) => {
      const gaps: Array<GapKey | ''> = project.missing.length ? project.missing : ['']
      return gaps.map((gap) => [
        project.name,
        project.nameArabic || '',
        project.slug,
        gap ? `${GAP_LABELS[gap].en} / ${GAP_LABELS[gap].ar}` : (ar ? 'كامل' : 'Complete'),
        project.gapCount,
        project.units,
        project.unitsTotal,
        project.plans,
      ])
    })
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
    const csv = '\uFEFF' + [headers, ...csvRows].map((row) => row.map(escape).join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `inventory-gaps-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  // Soft-delete (archive) via the shared project endpoint — same semantics as
  // the CEO projects pages: isActive=false + APPROVED→ARCHIVED, nothing is
  // physically removed (units/plans/images stay in the DB). Archived projects
  // are excluded from this gaps list, so the row drops out on success.
  const handleDelete = async (p: ProjectGap) => {
    setDeletingId(p.projectId)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/ceo/projects/${p.projectId}`, {
        method: 'DELETE',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || 'Failed to delete')
      setData((d) => (d ? { ...d, projects: d.projects.filter((r) => r.projectId !== p.projectId) } : d))
    } catch (e) {
      console.error('Failed to delete project:', e)
      setDeleteError(ar ? 'معرفناش نمسح المشروع — حاول تاني.' : 'Failed to delete project — please try again.')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading && !data) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-estate-gold" />
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3">
        <p className="text-red-400">{error}</p>
        <Button onClick={load} variant="outline">
          {ar ? 'حاول تاني' : 'Retry'}
        </Button>
      </div>
    )
  }

  const r = data!.rollup
  const allComplete = data!.projects.length > 0 && r.completeCount === data!.projects.length

  const cards = [
    { label: 'Projects w/o units', labelAr: 'مشاريع من غير وحدات', value: r.projectsWithoutUnits, icon: Building2, tone: r.projectsWithoutUnits > 0 ? 'text-red-400 bg-red-500/10' : 'text-green-400 bg-green-500/10' },
    { label: 'Projects w/o covers', labelAr: 'مشاريع من غير غلاف', value: r.projectsWithoutCovers, icon: ImageOff, tone: r.projectsWithoutCovers > 0 ? 'text-amber-400 bg-amber-500/10' : 'text-green-400 bg-green-500/10' },
    { label: 'Real units total', labelAr: 'إجمالي الوحدات الحقيقية', value: r.unitsTotal, icon: CheckCircle2, tone: 'text-estate-gold bg-estate-gold/10' },
    { label: 'Arabic coverage', labelAr: 'تغطية العربي', value: `${r.arabicCoveragePct}%`, icon: FileText, tone: 'text-blue-400 bg-blue-500/10' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Reveal>
          <p className="section-kicker">{ar ? 'لوحة المدير · نواقص المخزون' : 'CEO Console · Inventory gaps'}</p>
          <h1 className="font-display display-3 flex items-center gap-2 text-foreground">
            <AlertTriangle className="h-6 w-6 text-estate-gold" />
            {ar ? 'إيه اللي ناقص؟' : "What's missing?"}
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            {ar
              ? 'كل مشروع وإيه اللي ناقصه — دوس على المشروع عشان تكمّله.'
              : 'Every project and what it still needs — click a project to complete it.'}
          </p>
          <hr className="gold-hairline mt-4" />
        </Reveal>
        <span className="flex flex-wrap items-center gap-2">
          <Button onClick={exportCsv} variant="outline" disabled={!rows.length} className="gap-2 border-border bg-card text-gray-300 dark:border-[#262626] dark:bg-[#0A0A0A]">
            <Download className="h-4 w-4" />
            {ar ? `صدّر CSV (${rows.length})` : `Export CSV (${rows.length})`}
          </Button>
          <Button onClick={load} variant="outline" className="gap-2 border-border bg-card text-gray-300 dark:border-[#262626] dark:bg-[#0A0A0A]">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            {ar ? 'حدّث' : 'Refresh'}
          </Button>
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 dark:border-[#262626] dark:bg-[#0A0A0A]">
            <div className={cn('flex h-10 w-10 items-center justify-center rounded-2xl', c.tone)}>
              <c.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500">{ar ? c.labelAr : c.label}</p>
              <p className="text-lg font-bold text-foreground">{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Content shortcuts */}
      <Card className="border-border bg-card dark:border-[#262626] dark:bg-[#0A0A0A]">
        <CardContent className="flex flex-wrap items-center gap-2 px-4 py-3">
          <span className="text-xs text-gray-500">
            {ar ? 'المحتوى:' : 'Content:'} {ar ? `${r.contentCounts.blog.published} مقال منشور` : `${r.contentCounts.blog.published} posts published`} ·{' '}
            {ar ? `${r.contentCounts.press.published} خبر منشور` : `${r.contentCounts.press.published} press published`} ·{' '}
            {ar ? `${r.contentCounts.jobs.published} وظيفة منشورة` : `${r.contentCounts.jobs.published} jobs published`} ·{' '}
            {ar ? `${r.reviewsTotal} تقييم` : `${r.reviewsTotal} reviews`}
          </span>
          <span className="ml-auto flex gap-2">
            <Link href="/ceo/blog">
              <Button size="sm" variant="outline" className="gap-1.5"><FileText className="h-3.5 w-3.5" />{ar ? 'مقال جديد' : 'New post'}</Button>
            </Link>
            <Link href="/ceo/press">
              <Button size="sm" variant="outline" className="gap-1.5"><Newspaper className="h-3.5 w-3.5" />{ar ? 'خبر جديد' : 'New press'}</Button>
            </Link>
            <Link href="/ceo/jobs">
              <Button size="sm" variant="outline" className="gap-1.5"><Briefcase className="h-3.5 w-3.5" />{ar ? 'وظيفة جديدة' : 'New job'}</Button>
            </Link>
          </span>
        </CardContent>
      </Card>

      {allComplete ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-green-500/20 bg-green-500/5 py-20">
          <PartyPopper className="h-12 w-12 text-green-400" />
          <p className="mt-4 text-lg font-medium text-foreground">{ar ? 'كله كامل — مفيش نواقص!' : 'All complete — nothing missing!'}</p>
          <p className="mt-1 text-sm text-gray-500">{ar ? 'كل المشاريع فيها كل البيانات المطلوبة.' : 'Every project has all required data.'}</p>
        </div>
      ) : (
        <>
          {/* Search + gap filter */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <Input
                placeholder={ar ? 'دوّر باسم المشروع…' : 'Search projects by name…'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border-border bg-card pl-10 text-foreground placeholder:text-muted-foreground dark:border-[#262626] dark:bg-[#0A0A0A]"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {(['ALL', 'no-units', 'cover', 'gallery', 'descAr', 'price', 'units', 'plans', 'location', 'arabic-name'] as FilterKey[]).map((f) => {
                const count = f === 'ALL' ? data!.projects.length : f === 'no-units' ? r.projectsWithoutUnits : r.gapsByKey[f as GapKey]
                const active = filter === f
                return (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      active
                        ? 'border-estate-gold/50 bg-estate-gold/15 text-estate-gold'
                        : 'border-border bg-card text-gray-400 hover:text-foreground dark:border-[#262626] dark:bg-[#0A0A0A]'
                    )}
                  >
                    {f === 'ALL'
                      ? (ar ? `الكل (${count})` : `All (${count})`)
                      : f === 'no-units'
                        ? (ar ? `بدون وحدات (${count})` : `No units (${count})`)
                        : `${ar ? GAP_LABELS[f as GapKey].ar : GAP_LABELS[f as GapKey].en} (${count})`}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Per-project table */}
          {deleteError && (
            <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
              {deleteError}
            </p>
          )}
          <Card className="border-border bg-card dark:border-[#262626] dark:bg-[#0A0A0A]">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border dark:border-[#262626]">
                      <th className="px-4 py-3 font-medium text-gray-400">
                        <button onClick={() => toggleSort('name')} className="inline-flex items-center gap-1 hover:text-foreground">
                          {ar ? 'المشروع' : 'Project'} <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="px-4 py-3 font-medium text-gray-400">{ar ? 'النواقص' : 'Missing'}</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-400">
                        <button onClick={() => toggleSort('gapCount')} className="inline-flex items-center gap-1 hover:text-foreground">
                          {ar ? 'العدد' : 'Count'} <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="hidden px-4 py-3 text-right font-medium text-gray-400 sm:table-cell">
                        <button onClick={() => toggleSort('units')} className="inline-flex items-center gap-1 hover:text-foreground">
                          {ar ? 'الوحدات' : 'Units'} <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-gray-400">{ar ? 'إجراء' : 'Action'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border dark:divide-[#262626]">
                    {rows.map((p) => (
                      <tr key={p.projectId} className="transition-colors hover:bg-white/[0.03]">
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground">{ar ? p.nameArabic || p.name : p.name}</p>
                          <p className="text-xs text-gray-500">{p.slug} · {p.plans} {ar ? 'خطة دفع' : 'plans'}</p>
                        </td>
                        <td className="px-4 py-3">
                          {p.missing.length === 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/15 px-2.5 py-0.5 text-xs font-medium text-green-400">
                              <CheckCircle2 className="h-3 w-3" /> {ar ? 'كامل' : 'Complete'}
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {p.missing.map((m) => (
                                <span key={m} className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-400">
                                  {ar ? GAP_LABELS[m].ar : GAP_LABELS[m].en}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-foreground">{p.gapCount}</td>
                        <td className="hidden px-4 py-3 text-right text-gray-300 sm:table-cell">{p.units}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="inline-flex items-center gap-1.5">
                            <Link href={`/ceo/projects/${p.projectId}`}>
                              <Button size="sm" variant="outline" className="gap-1.5">
                                {ar ? 'كمّل' : 'Fix'} →
                              </Button>
                            </Link>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={deletingId === p.projectId}
                              onClick={() => handleDelete(p)}
                              className="gap-1.5 text-gray-400 hover:text-red-400 disabled:opacity-50"
                              title={ar ? 'حذف (أرشيف)' : 'Delete (archive)'}
                              aria-label={ar ? 'حذف (أرشيف)' : 'Delete (archive)'}
                            >
                              {deletingId === p.projectId ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                              {ar ? 'حذف' : 'Delete'}
                            </Button>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length === 0 && (
                <p className="py-14 text-center text-sm text-gray-400">
                  {ar ? 'مفيش مشاريع بالفلتر ده.' : 'No projects match this filter.'}
                </p>
              )}
            </CardContent>
          </Card>
          {data!.meta.capped && (
            <p className="text-xs text-gray-500">
              {ar ? `معروض أول ${data!.meta.cap} مشروع من ${data!.meta.totalMatching}.` : `Showing first ${data!.meta.cap} of ${data!.meta.totalMatching} projects.`}
            </p>
          )}
        </>
      )}
    </div>
  )
}
