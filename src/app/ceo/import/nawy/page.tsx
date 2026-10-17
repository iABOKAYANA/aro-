'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CloudDownload,
  Loader2,
  Search,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Package,
  Rocket,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatEGP, cn } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import { Reveal } from '@/components/design'

// ─── types ──────────────────────────────────────────────────────
interface CatalogItem {
  id: number
  enUrl: string
  arUrl: string | null
}

interface PreviewEntry {
  url: string
  slug: string | null
  name: string | null
  nameArabic: string | null
  developer: string | null
  area: string | null
  startPrice: number | null
  downPaymentPct: number | null
  years: number | null
  images: number
  isLaunch: boolean
  exists: boolean
  error: string | null
}

interface RunState {
  running: boolean
  finished: boolean
  offset: number
  imported: number
  skipped: number
  errors: string[]
  cancelled: boolean
}

const BATCH = 20

const initialRun: RunState = {
  running: false,
  finished: false,
  offset: 0,
  imported: 0,
  skipped: 0,
  errors: [],
  cancelled: false,
}

export default function ImportNawyPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [catalog, setCatalog] = useState<CatalogItem[] | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState<string | null>(null)

  const [stats, setStats] = useState<{ imported: number; total: number } | null>(null)

  const [publish, setPublish] = useState(true)
  const [includeAr, setIncludeAr] = useState(true)

  const [preview, setPreview] = useState<PreviewEntry[] | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [run, setRun] = useState<RunState>(initialRun)
  const cancelRef = useRef(false)

  const loadStatus = useCallback(async () => {
    setCatalogLoading(true)
    setCatalogError(null)
    try {
      const res = await fetch('/api/ceo/import/nawy')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load catalog')
      setCatalog(data.catalog.items)
      setStats(data.stats)
    } catch (err) {
      console.error('Failed to load catalog:', err)
      setCatalogError(ar ? 'معرفناش نحمّل الكتالوج — حاول تاني.' : 'Failed to load catalog')
    } finally {
      setCatalogLoading(false)
    }
  }, [ar])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  const runPreview = async () => {
    if (!catalog?.length) return
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const res = await fetch('/api/ceo/import/nawy', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'PREVIEW',
          urls: catalog.slice(0, 8).map((c) => c.enUrl),
          includeAr,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Preview failed')
      setPreview(data.entries)
    } catch (err) {
      console.error('Preview failed:', err)
      setPreviewError(ar ? 'المعاينة فشلت — حاول تاني.' : 'Preview failed')
    } finally {
      setPreviewLoading(false)
    }
  }

  const startImport = async () => {
    if (!catalog?.length || run.running) return
    setConfirmOpen(false)
    cancelRef.current = false
    setRun({ ...initialRun, running: true })

    for (let off = 0; off < catalog.length; off += BATCH) {
      if (cancelRef.current) {
        setRun((r) => ({ ...r, cancelled: true }))
        break
      }
      const slice = catalog.slice(off, off + BATCH)
      try {
        const res = await fetch('/api/ceo/import/nawy', {
          method: 'POST',
          headers: { 'X-Requested-With': 'XMLHttpRequest', 'content-type': 'application/json' },
          body: JSON.stringify({
            mode: 'IMPORT',
            urls: slice.map((s) => s.enUrl),
            publish,
            includeAr,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Batch failed')
        setRun((r) => ({
          ...r,
          imported: r.imported + (data.imported?.length || 0),
          skipped: r.skipped + (data.skipped?.length || 0),
          errors: [...r.errors, ...(data.errors || []).map((e: { url: string; error: string }) => `${e.url} — ${e.error}`)],
          offset: off + slice.length,
        }))
      } catch (err) {
        console.error('Import batch failed:', err)
        setRun((r) => ({
          ...r,
          errors: [...r.errors, ar ? `الدفعة عند ${off}: خلل في الشبكة` : `Batch at ${off}: ${err instanceof Error ? err.message : 'network error'}`],
          offset: off + slice.length,
        }))
        break // stop the loop on batch failure so we don't hammer errors
      }
    }
    setRun((r) => ({ ...r, running: false, finished: true }))
    loadStatus()
  }

  const remaining = catalog && stats ? Math.max(0, catalog.length - stats.imported) : null
  const progressPct =
    catalog && catalog.length ? Math.min(100, Math.round((run.offset / catalog.length) * 100)) : 0

  const cardBtn =
    'border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300 hover:bg-card dark:hover:bg-[#0A0A0A] hover:text-foreground'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Reveal>
          <p className="section-kicker">{ar ? 'لوحة المدير · الاستيراد' : 'CEO Console · Import'}</p>
          <h1 className="flex items-center gap-2 font-display display-3 text-foreground">
            <CloudDownload className="h-6 w-6 text-estate-gold" /> {ar ? 'استيراد من ناوي' : 'Import from Nawy'}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-400">
            {ar
              ? 'استورد كتالوج المشاريع كله من خريطة موقع nawy.com العامة — الأسامي والمطوّرين والمناطق والأسعار وخطط الدفع والجاليري والأسامي العربي — عشان متضيفش المشاريع واحد واحد. آمن ضد التكرار: التشغيل التاني بيعدّي اللي موجود أوريدي.'
              : 'Bulk-import the full project catalogue from nawy.com’s public sitemap — names, developers, areas, prices, payment plans, galleries and Arabic names — so you never add projects one by one. Duplicate-safe: re-running skips what already exists.'}
          </p>
          <hr className="gold-hairline mt-4" />
        </Reveal>
        <Button variant="outline" size="sm" onClick={loadStatus} disabled={catalogLoading} className={cardBtn}>
          <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', catalogLoading && 'animate-spin')} /> {ar ? 'حدّث' : 'Refresh'}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Nawy catalog', labelAr: 'كتالوج ناوي', value: catalog ? catalog.length : '—', cls: 'text-foreground', icon: <Package className="h-4 w-4" /> },
          { label: 'Imported', labelAr: 'اتستورد', value: stats ? stats.imported : '—', cls: 'text-emerald-400', icon: <CheckCircle2 className="h-4 w-4" /> },
          { label: 'Remaining', labelAr: 'الباقي', value: remaining ?? '—', cls: 'text-estate-gold', icon: <Rocket className="h-4 w-4" /> },
          { label: 'Projects in DB', labelAr: 'المشاريع في الداتابيز', value: stats ? stats.total : '—', cls: 'text-blue-400', icon: <CloudDownload className="h-4 w-4" /> },
        ].map((s) => (
          <Card key={s.label} className="border-border dark:border-[#262626] bg-card dark:bg-black">
            <CardContent className="px-4 py-3">
              <p className={cn('flex items-center gap-1.5 text-xl font-bold', s.cls)}>
                {s.icon} {s.value}
              </p>
              <p className="text-[11px] uppercase tracking-wide text-gray-500">{ar ? s.labelAr : s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {catalogError && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {catalogError}
          <Button size="sm" variant="outline" onClick={loadStatus} className={cn('ml-auto', cardBtn)}>
            {ar ? 'حاول تاني' : 'Retry'}
          </Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Catalog */}
        <Card className="border-border dark:border-[#262626] bg-card dark:bg-black">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-estate-gold">
              {ar ? '١ · الكتالوج' : '1 · Catalog'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-400">
            {catalogLoading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" /> {ar ? 'بيقرا خريطة موقع ناوي…' : 'Reading nawy.com sitemap…'}
              </div>
            ) : catalog ? (
              <>
                <p>
                  <b className="text-foreground">{catalog.length}</b>{' '}
                  {ar ? 'مشروع موجود (صفحات إنجليزي، والأسامي العربي بتتربط لوحدها). مثال:' : 'projects found (English pages, Arabic names paired automatically). Sample:'}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {catalog.slice(0, 8).map((c) => (
                    <span key={c.id} className="rounded-full border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-2 py-0.5 font-mono text-[11px] text-gray-400">
                      {c.enUrl.split('/').pop()}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-xs text-gray-500">
                  {ar
                    ? 'المصدر بيحترم robots.txt (الزحف مسموح). الصور والبروشورات بتفضل على هوستها الأصلي؛ ولينك المصدر متخزن لكل مشروع في keywords.'
                    : 'Source respects robots.txt (crawl allowed). Images & brochures stay hot-linked to their original host; source URL is stored per project in keywords.'}
                </p>
              </>
            ) : (
              <div className="py-4 text-center text-sm text-gray-500">{ar ? 'مفيش كتالوج متحمل.' : 'No catalog loaded.'}</div>
            )}
          </CardContent>
        </Card>

        {/* Options + preview */}
        <Card className="border-border dark:border-[#262626] bg-card dark:bg-black">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-estate-gold">
              {ar ? '٢ · الاختيارات والمعاينة' : '2 · Options & preview'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={publish}
                onChange={(e) => setPublish(e.target.checked)}
                className="mt-1 h-4 w-4 accent-estate-gold"
              />
              <span className="text-gray-300">
                {ar ? 'انشر فورًا' : 'Publish immediately'}{' '}
                <span className="text-gray-500">
                  {ar
                    ? '(نشط + منشور، ظاهر على الموقع فورًا). اشيل العلامة عشان تستورد كمسودات مقفولة للمراجعة.'
                    : '(active + PUBLISHED, visible on the site right away). Uncheck to import as inactive drafts for review.'}
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={includeAr}
                onChange={(e) => setIncludeAr(e.target.checked)}
                className="mt-1 h-4 w-4 accent-estate-gold"
              />
              <span className="text-gray-300">
                {ar ? 'الأسامي والوصف بالعربي' : 'Arabic names & descriptions'}{' '}
                <span className="text-gray-500">
                  {ar
                    ? '(بيجيب الصفحة العربي لكل مشروع كمان — أبطأ حوالي الضعف).'
                    : '(fetches each project’s Arabic page too — about 2× slower).'}
                </span>
              </span>
            </label>

            <Button
              variant="outline"
              size="sm"
              onClick={runPreview}
              disabled={previewLoading || !catalog?.length || run.running}
              className={cn('mt-1', cardBtn)}
            >
              {previewLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Search className="mr-1.5 h-3.5 w-3.5" />}
              {ar ? 'عاين أول ٨ مشاريع' : 'Preview first 8 projects'}
            </Button>

            {previewError && (
              <p className="flex items-center gap-1.5 text-xs text-red-400">
                <XCircle className="h-3.5 w-3.5" /> {previewError}
              </p>
            )}
            {preview && (
              <div className="max-h-56 overflow-y-auto rounded-2xl border border-border dark:border-[#262626]">
                <table className="w-full text-xs">
                  <tbody>
                    {preview.map((p) => (
                      <tr key={p.url} className="border-b border-border dark:border-[#262626] last:border-0">
                        <td className="px-2 py-1.5">
                          {p.error ? (
                            <span className="text-red-400">{p.url.split('/').pop()} — {p.error}</span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-gray-200">
                              {ar && p.nameArabic ? p.nameArabic : p.name}
                              {p.nameArabic && (
                                <span dir="rtl" className="text-gray-500">· {p.nameArabic}</span>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">
                          {!p.error && (
                            <>
                              <span className="text-gray-300">
                                {typeof p.startPrice === 'number' ? formatEGP(p.startPrice) : '—'}
                              </span>
                              <span className="block text-[10px] text-gray-500">
                                {p.downPaymentPct != null
                                  ? (ar ? `${p.downPaymentPct}% مقدم · ${p.years ?? '—'} سنة` : `${p.downPaymentPct}% down · ${p.years ?? '—'}y`)
                                  : p.images > 0
                                    ? (ar ? `${p.images} صورة` : `${p.images} images`)
                                    : ''}
                              </span>
                            </>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {p.exists ? (
                            <span className="text-gray-500">{ar ? 'موجود' : 'exists'}</span>
                          ) : (
                            <span className="text-emerald-400">{ar ? 'جديد' : 'new'}</span>
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

      {/* Import */}
      <Card className="border-border dark:border-[#262626] bg-card dark:bg-black">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-estate-gold">
            {ar ? '٣ · الاستيراد' : '3 · Import'}
          </CardTitle>
          {!run.running && !run.finished && catalog && (
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={!catalog.length}
              className="bg-estate-gold text-black hover:bg-estate-gold/90"
            >
              <CloudDownload className="mr-1.5 h-4 w-4" /> {ar ? `استورد كل الـ${catalog.length} مشروع` : `Import all ${catalog.length} projects`}
            </Button>
          )}
          {run.running && (
            <Button variant="outline" size="sm" onClick={() => { cancelRef.current = true }} className={cardBtn}>
              {ar ? 'وقّف بعد الدفعة الحالية' : 'Stop after current batch'}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-gray-400">
          {!run.running && !run.finished && (
            <p>
              {ar
                ? `الاستيراد بيمشي دفعات ${BATCH} مع وقفة قصيرة بينهم — خلّي التاب ده مفتوح لحد ما شريط التقدم يخلص. قفل التاب آمن: التشغيل التاني بيكمّل وبيعدّي كل اللي اتستورد أوريدي.`
                : `Imports run in batches of ${BATCH} with a short pause between them — keep this tab open until the progress bar finishes. Closing the tab is safe: re-running resumes and skips everything already imported.`}
            </p>
          )}

          {(run.running || run.finished) && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                <span className="text-gray-300">
                  {ar ? 'التقدم:' : 'Progress:'} <b className="text-foreground">{run.offset}</b>
                  {catalog ? ` / ${catalog.length}` : ''} ({progressPct}%)
                </span>
                <span className="text-emerald-400">{ar ? 'اتستورد' : 'imported'} <b>{run.imported}</b></span>
                <span className="text-gray-400">{ar ? 'اتعدّى' : 'skipped'} <b>{run.skipped}</b></span>
                <span className="text-red-400">{ar ? 'أخطاء' : 'errors'} <b>{run.errors.length}</b></span>
                {run.running && (
                  <span className="flex items-center gap-1.5 text-estate-gold">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> {ar ? 'شغال…' : 'working…'}
                  </span>
                )}
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-300',
                    run.finished && !run.cancelled && run.errors.length === 0
                      ? 'bg-emerald-500'
                      : 'bg-estate-gold'
                  )}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {run.finished && (
                <p className={cn('text-sm', run.cancelled ? 'text-yellow-400' : 'text-emerald-400')}>
                  {run.cancelled
                    ? (ar ? `وقّفنا بدري — ${run.imported} اتستوردوا لحد دلوقتي. شغّل تاني عشان تكمّل (اللي اتستورد بيتعدّى).` : `Stopped early — ${run.imported} imported so far. Run again to continue (already-imported items are skipped).`)
                    : (ar ? `خلص — ${run.imported} اتستوردوا، ${run.skipped} كانوا موجودين، ${run.errors.length} أخطاء.` : `Done — ${run.imported} imported, ${run.skipped} already existed, ${run.errors.length} errors.`)}
                </p>
              )}
              {run.errors.length > 0 && (
                <details className="rounded-2xl border border-red-500/20 bg-red-500/5 p-3">
                  <summary className="cursor-pointer text-xs font-medium text-red-400">
                    {run.errors.length} {ar ? 'خطأ (دوس عشان تفتح)' : 'errors (click to expand)'}
                  </summary>
                  <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs text-red-300">
                    {run.errors.map((e, i) => (
                      <li key={i} dir="ltr">{e}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirm modal */}
      {confirmOpen && catalog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <Card className="w-full max-w-md border-border dark:border-[#262626] bg-card dark:bg-black">
            <CardHeader>
              <CardTitle className="text-lg text-foreground">{ar ? `استورد كل الـ${catalog.length} مشروع؟` : `Import all ${catalog.length} projects?`}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-gray-300">
              <p>
                {ar
                  ? `كل مشروع بيتجاب من nawy.com (إنجليزي${includeAr ? ' + عربي' : ''}) وبيتعمل بالمطوّر والمكان والأسعار وخطط الدفع.`
                  : `Each project is fetched from nawy.com (EN${includeAr ? ' + AR' : ''}) and created with its developer, location, prices and payment plans.`}
              </p>
              <p className="text-gray-400">
                {ar ? 'الوضع:' : 'Mode:'}{' '}
                <b className={publish ? 'text-emerald-400' : 'text-yellow-400'}>
                  {publish ? (ar ? 'منشور وظاهر فورًا' : 'Published & visible immediately') : (ar ? 'مسودات مقفولة (للمراجعة)' : 'Inactive drafts (for review)')}
                </b>
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setConfirmOpen(false)} className={cardBtn}>
                  {ar ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button onClick={startImport} className="gold-shimmer bg-estate-gold text-black hover:bg-estate-gold/90">
                  {ar ? 'ابدأ الاستيراد' : 'Start import'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
