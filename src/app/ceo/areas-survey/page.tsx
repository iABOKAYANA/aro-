'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileSpreadsheet, Loader2, Download, AlertTriangle, MapPin, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatEGP } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'
import { Reveal } from '@/components/design'

// ─── types (mirror /api/ceo/areas-survey + /api/geo) ────────────
interface GeoName {
  id: string
  name: string
  nameArabic: string
  nameSlug: string
}

interface AreaBucket {
  key: string
  city: GeoName | null
  governorate: GeoName | null
  projects: Record<string, any>[]
}

interface SurveyMeta {
  totalMatching: number
  returned: number
  capped: boolean
  cap: number
  unitCount: number
  planCount: number
  resolved: {
    governorateId: string | null
    governorateResolvedAs: string | null
    cityId: string | null
    cityResolvedAs: string | null
  }
}

interface GeoSnapshot {
  governorates: { id: string; name: string; nameArabic: string }[]
  cities: { id: string; name: string; nameArabic: string; nameSlug: string; governorateId: string }[]
  districts: { id: string; name: string; nameArabic: string; cityId: string }[]
}

const yn = (v: unknown, ar: boolean) => {
  if (v === null || v === undefined) return ''
  return v ? (ar ? 'أيوه' : 'Yes') : (ar ? 'لأ' : 'No')
}

const txt = (v: unknown): string | number => {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? '1' : '0'
  return String(v)
}

const dateTxt = (v: unknown) => {
  if (!v) return ''
  const s = String(v)
  return s.length >= 10 ? s.slice(0, 10) : s
}

// JSON-array columns (gallery, propertyTypes, …) are stored as strings —
// join them so the Excel cell reads naturally instead of raw JSON.
const jsonTxt = (v: unknown) => {
  if (v === null || v === undefined || v === '') return ''
  if (Array.isArray(v)) return v.join('، ')
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v)
      if (Array.isArray(p)) return p.join('، ')
      if (p && typeof p === 'object') return v
      return String(p)
    } catch {
      return v
    }
  }
  return String(v)
}

// Header = Arabic label with the English field name in parentheses.
const H = (arLabel: string, en: string) => `${arLabel} (${en})`

// ─── Projects-sheet cell builders (shared by the Excel sheet + preview) ───
// Bilingual convention everywhere: Arabic-first in `ar` mode
// (`xArabic || x`), Latin name in English mode — same as the old sheet did.
const devCell = (p: Record<string, any>, ar: boolean) =>
  p.developer ? (ar ? p.developer.companyNameArabic || p.developer.companyName : p.developer.companyName) || '' : ''

const projCell = (p: Record<string, any>, ar: boolean) =>
  (ar ? p.nameArabic || p.name : p.name) || ''

// District column — blank when the project has no district (never invented).
// Field shape verified from locCell below: p.district?.nameArabic / p.district?.name.
const distCell = (p: Record<string, any>, ar: boolean) =>
  p.district ? (ar ? p.district.nameArabic || p.district.name : p.district.name) || '' : ''

// Sort key: governorate → city → district (empty last) → project.
// No existing sort in this file — plain dependency-free localeCompare with 'ar'.
const cmpAr = (a: string, b: string) => a.localeCompare(b, 'ar')
const cmpDistEmptyLast = (a: string, b: string) => {
  if (a === b) return 0
  if (!a) return 1
  if (!b) return -1
  return cmpAr(a, b)
}

// city + district + address, skipping empties cleanly.
const locCell = (p: Record<string, any>, ar: boolean) => {
  const city = p.city ? (ar ? p.city.nameArabic || p.city.name : p.city.name) : ''
  const dist = p.district ? (ar ? p.district.nameArabic || p.district.name : p.district.name) : ''
  return [city, dist, p.address]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .join(' - ')
}

const priceCell = (p: Record<string, any>, sheet: boolean) =>
  typeof p.startPrice === 'number' ? formatEGP(p.startPrice) : sheet ? '' : '—'

// Same milestones-join shape the Plans sheet uses:
// `label: pct% @ month N` joined with ` | `.
const milestonesShort = (milestones: any[], ar: boolean): string =>
  (milestones || [])
    .map((m: any) => {
      const label = ar ? m.nameArabic || m.name : m.name
      const when = m.monthNumber !== null && m.monthNumber !== undefined ? ` @ ${ar ? 'شهر' : 'month'} ${m.monthNumber}` : ''
      return `${label}: ${m.percentage}%${when}`
    })
    .join(' | ')

// One line per plan: `name: down% + years + milestones…`, plans split by newline.
const plansCell = (p: Record<string, any>, ar: boolean): string =>
  (p.paymentPlans || [])
    .map((pl: any) => {
      const name = (ar ? pl.nameArabic || pl.name : pl.name) || (ar ? 'خطة' : 'Plan')
      const bits: string[] = []
      if (pl.downPaymentPct !== null && pl.downPaymentPct !== undefined && pl.downPaymentPct !== '')
        bits.push(`${pl.downPaymentPct}% ${ar ? 'مقدم' : 'down'}`)
      if (pl.installmentYears !== null && pl.installmentYears !== undefined && pl.installmentYears !== '')
        bits.push(`${pl.installmentYears} ${ar ? 'سنين' : 'yrs'}`)
      const ms = milestonesShort(pl.milestones, ar)
      if (ms) bits.push(ms)
      return `${name}: ${bits.join(' + ')}`
    })
    .join('\n')

// Selling point = the project's own tagline (already fetched by the API).
// Never invented — empty when the project has no tagline.
const sellingCell = (p: Record<string, any>, ar: boolean): string =>
  (ar ? p.taglineArabic || p.tagline : p.tagline) || ''

export default function AreasSurveyPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'

  const [geo, setGeo] = useState<GeoSnapshot | null>(null)
  const [governorate, setGovernorate] = useState('ALL')
  const [city, setCity] = useState('ALL')

  const [areas, setAreas] = useState<AreaBucket[]>([])
  const [meta, setMeta] = useState<SurveyMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState('')

  // ─── geo dropdowns (public /api/geo snapshot) ───
  useEffect(() => {
    fetch('/api/geo')
      .then((r) => r.json())
      .then((d) => {
        if (d.governorates) setGeo(d)
      })
      .catch((e) => console.error('Failed to load geo:', e))
  }, [])

  const cityOptions = useMemo(() => {
    if (!geo) return []
    if (governorate === 'ALL') return geo.cities
    return geo.cities.filter((c) => c.governorateId === governorate)
  }, [geo, governorate])

  // ─── survey data (same filters the export uses) ───
  const load = useCallback(
    async (gov: string, cty: string) => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (gov !== 'ALL') params.set('governorate', gov)
        if (cty !== 'ALL') params.set('city', cty)
        const res = await fetch(`/api/ceo/areas-survey?${params}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load')
        setAreas(data.areas || [])
        setMeta(data.meta || null)
      } catch (err) {
        console.error('Failed to load areas survey:', err)
        setError(ar ? 'معرفناش نحمّل مسح المناطق — حاول تاني.' : 'Failed to load areas survey')
      } finally {
        setLoading(false)
      }
    },
    [ar]
  )

  useEffect(() => {
    load(governorate, city)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [governorate, city])

  // ─── flat preview rows (ALL projects, same 7 columns as the sheet, same sort) ───
  const preview = useMemo(() => {
    const rows: { p: Record<string, any>; gov: string; city: string; dist: string; proj: string }[] = []
    for (const a of areas) {
      const gov = a.governorate ? (ar ? a.governorate.nameArabic || a.governorate.name : a.governorate.name) : ''
      const cty = a.city ? (ar ? a.city.nameArabic || a.city.name : a.city.name) : ''
      for (const p of a.projects) {
        rows.push({ p, gov, city: cty, dist: distCell(p, ar), proj: projCell(p, ar) })
      }
    }
    rows.sort(
      (x, y) => cmpAr(x.gov, y.gov) || cmpAr(x.city, y.city) || cmpDistEmptyLast(x.dist, y.dist) || cmpAr(x.proj, y.proj)
    )
    return rows.map((r) => r.p)
  }, [areas, ar])

  // ─── Excel export (client-side, chunked so the UI stays alive) ───
  const handleExport = async () => {
    setExporting(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (governorate !== 'ALL') params.set('governorate', governorate)
      if (city !== 'ALL') params.set('city', city)

      setProgress(ar ? 'بيحمّل البيانات من السيرفر…' : 'Loading data from server…')
      const res = await fetch(`/api/ceo/areas-survey?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      const surveyAreas: AreaBucket[] = data.areas || []

      // Dynamic import — exceljs only loads when the CEO actually exports.
      const ExcelJS = await import('exceljs')
      const yieldUi = () => new Promise<void>((r) => setTimeout(r, 0))
      const CHUNK = 400

      // ── Sheet1: المشاريع (one row per project, 7 columns) ──
      const projectHeaders = [
        H('اسم المطور', 'developer'),
        H('اسم المشروع', 'project'),
        H('الحي', 'district'),
        H('لوكيشن المشروع', 'location'),
        H('السعر الابتدائي', 'starting price'),
        H('خطط السداد', 'payment plans'),
        H('سيلينج بوينت', 'selling point'),
      ]

      const projectRow = (p: Record<string, any>) => [
        devCell(p, ar),
        projCell(p, ar),
        distCell(p, ar),
        locCell(p, ar),
        priceCell(p, true),
        plansCell(p, ar),
        sellingCell(p, ar),
      ]

      // ── Sheet2: الوحدات (one row per unit + parent columns) ──
      const unitHeaders = [
        H('المحافظة', 'governorate'),
        H('المدينة', 'city'),
        H('المشروع', 'project'),
        H('معرف المشروع', 'projectId'),
        H('المعرف', 'id'),
        H('اسم الوحدة', 'name'),
        H('اسم الوحدة بالعربي', 'nameArabic'),
        H('رقم الوحدة', 'unitNumber'),
        H('الدور', 'floor'),
        H('نوع الوحدة', 'unitType'),
        H('نوع الإعلان', 'listingType'),
        H('الحالة', 'status'),
        H('أوض النوم', 'bedrooms'),
        H('الحمامات', 'bathrooms'),
        H('المساحة', 'area'),
        H('صافي المساحة', 'netArea'),
        H('مساحة الروف', 'roofArea'),
        H('مساحة الجاردن', 'gardenArea'),
        H('السعر', 'price'),
        H('سعر المتر', 'pricePerSqm'),
        H('العملة', 'currency'),
        H('المقدم', 'downPayment'),
        H('القسط الشهري', 'monthlyInstallment'),
        H('سنين التقسيط', 'installmentYears'),
        H('شروط التسليم', 'deliveryTerms'),
        H('التشطيب', 'finishingType'),
        H('الفيو', 'view'),
        H('ناصية؟', 'isCorner'),
        H('بلكونة؟', 'hasBalcony'),
        H('باركينج؟', 'hasParking'),
        H('رقم الباركينج', 'parkingNumber'),
        H('الجاليري', 'gallery'),
        H('المخطط', 'floorPlan'),
        H('البروشور', 'brochureUrl'),
        H('مميزة؟', 'isFeatured'),
        H('عينة؟', 'isSample'),
        H('المشاهدات', 'viewCount'),
        H('المفضلة', 'favoriteCount'),
        H('عنوان الميتا', 'metaTitle'),
        H('وصف الميتا', 'metaDescription'),
        H('الرابط', 'slug'),
        H('ثقة البيانات', 'dataTrust'),
        H('معرف المرحلة', 'phaseId'),
        H('اتعملت', 'createdAt'),
        H('اتحدّثت', 'updatedAt'),
      ]

      const unitRow = (u: Record<string, any>, areaGov: string, areaCity: string, projectName: string) => [
        areaGov,
        areaCity,
        projectName,
        txt(u.projectId),
        txt(u.id),
        txt(u.name),
        txt(u.nameArabic),
        txt(u.unitNumber),
        txt(u.floor),
        txt(u.unitType),
        txt(u.listingType),
        txt(u.status),
        txt(u.bedrooms),
        txt(u.bathrooms),
        txt(u.area),
        txt(u.netArea),
        txt(u.roofArea),
        txt(u.gardenArea),
        txt(u.price),
        txt(u.pricePerSqm),
        txt(u.currency),
        txt(u.downPayment),
        txt(u.monthlyInstallment),
        txt(u.installmentYears),
        txt(u.deliveryTerms),
        txt(u.finishingType),
        txt(u.view),
        yn(u.isCorner, ar),
        yn(u.hasBalcony, ar),
        yn(u.hasParking, ar),
        txt(u.parkingNumber),
        jsonTxt(u.gallery),
        txt(u.floorPlan),
        txt(u.brochureUrl),
        yn(u.isFeatured, ar),
        yn(u.isSample, ar),
        txt(u.viewCount),
        txt(u.favoriteCount),
        txt(u.metaTitle),
        txt(u.metaDescription),
        txt(u.slug),
        jsonTxt(u.dataTrust),
        txt(u.phaseId),
        dateTxt(u.createdAt),
        dateTxt(u.updatedAt),
      ]

      // ── Sheet3: خطط السداد (one row per plan + milestones as text) ──
      const planHeaders = [
        H('المحافظة', 'governorate'),
        H('المدينة', 'city'),
        H('المشروع', 'project'),
        H('معرف المشروع', 'projectId'),
        H('المعرف', 'id'),
        H('اسم الخطة', 'name'),
        H('اسم الخطة بالعربي', 'nameArabic'),
        H('الوصف', 'description'),
        H('المقدم %', 'downPaymentPct'),
        H('سنين التقسيط', 'installmentYears'),
        H('الصيانة %', 'maintenanceFeePct'),
        H('نصف سنوي %', 'semiAnnualPct'),
        H('دفعة الاستلام %', 'deliveryPaymentPct'),
        H('خصم الكاش %', 'cashDiscount'),
        H('افتراضية؟', 'isDefault'),
        H('نشطة؟', 'isActive'),
        H('الترتيب', 'sortOrder'),
        H('معرف المرحلة', 'phaseId'),
        H('عدد المراحل', 'milestonesCount'),
        H('المراحل (نص)', 'milestones'),
        H('اتعملت', 'createdAt'),
        H('اتحدّثت', 'updatedAt'),
      ]

      const planRow = (pl: Record<string, any>, areaGov: string, areaCity: string, projectName: string) => {
        const milestones: string = (pl.milestones || [])
          .map((m: any) => {
            const label = ar ? m.nameArabic || m.name : m.name
            const when = m.monthNumber !== null && m.monthNumber !== undefined ? ` @ ${ar ? 'شهر' : 'month'} ${m.monthNumber}` : ''
            return `${label}: ${m.percentage}%${when}`
          })
          .join(' | ')
        return [
          areaGov,
          areaCity,
          projectName,
          txt(pl.projectId),
          txt(pl.id),
          txt(pl.name),
          txt(pl.nameArabic),
          txt(pl.description),
          txt(pl.downPaymentPct),
          txt(pl.installmentYears),
          txt(pl.maintenanceFeePct),
          txt(pl.semiAnnualPct),
          txt(pl.deliveryPaymentPct),
          txt(pl.cashDiscount),
          yn(pl.isDefault, ar),
          yn(pl.isActive, ar),
          txt(pl.sortOrder),
          txt(pl.phaseId),
          pl.milestones?.length ?? 0,
          milestones,
          dateTxt(pl.createdAt),
          dateTxt(pl.updatedAt),
        ]
      }

      // ── Walk the survey in chunks, yielding so the UI never freezes ──
      const projectAoa: (string | number)[][] = [projectHeaders]
      const unitAoa: (string | number)[][] = [unitHeaders]
      const planAoa: (string | number)[][] = [planHeaders]

      let doneProjects = 0
      const totalProjects: number = data.meta?.returned ?? 0
      // Flatten + sort ALL rows by (governorate → city → district-empty-last → project)
      // before writing, so the sheet is organized by district.
      const sortedProjects: { p: Record<string, any>; govName: string; cityName: string }[] = []
      for (const a of surveyAreas) {
        const govName = a.governorate ? (ar ? a.governorate.nameArabic || a.governorate.name : a.governorate.name) : ''
        const cityName = a.city ? (ar ? a.city.nameArabic || a.city.name : a.city.name) : ''
        for (const p of a.projects) {
          sortedProjects.push({ p, govName, cityName })
        }
      }
      sortedProjects.sort(
        (x, y) =>
          cmpAr(x.govName, y.govName) ||
          cmpAr(x.cityName, y.cityName) ||
          cmpDistEmptyLast(distCell(x.p, ar), distCell(y.p, ar)) ||
          cmpAr(projCell(x.p, ar), projCell(y.p, ar))
      )
      for (const { p, govName, cityName } of sortedProjects) {
          const projectName = ar ? p.nameArabic || p.name : p.name
          projectAoa.push(projectRow(p))
          for (const u of p.units || []) unitAoa.push(unitRow(u, govName, cityName, projectName))
          for (const pl of p.paymentPlans || []) planAoa.push(planRow(pl, govName, cityName, projectName))
          doneProjects += 1
          if (doneProjects % CHUNK === 0) {
            setProgress(
              ar
                ? `بيجهّز الشيتات… ${doneProjects} / ${totalProjects} مشروع`
                : `Building sheets… ${doneProjects} / ${totalProjects} projects`
            )
            await yieldUi()
          }
      }

      setProgress(ar ? 'بيكتب ملف الإكسل…' : 'Writing Excel file…')
      await yieldUi()

      const wb = new ExcelJS.Workbook()
      const addSheet = async (name: string, aoa: (string | number)[][]) => {
        const [headers, ...rows] = aoa
        const ws = wb.addWorksheet(name)
        // Sensible column widths from the header length (capped so one long
        // description doesn't blow out the whole sheet).
        ws.columns = headers.map((h, i) => ({
          header: String(h),
          key: `c${i}`,
          width: Math.min(42, Math.max(12, String(h).length + 2)),
        }))
        for (let i = 0; i < rows.length; i += 1) {
          ws.addRow(rows[i])
          if (i % CHUNK === 0 && i > 0) await yieldUi()
        }
      }
      await addSheet('المشاريع', projectAoa)
      await addSheet('الوحدات', unitAoa)
      await addSheet('خطط السداد', planAoa)

      const stamp = new Date().toISOString().slice(0, 10)
      const filename = `ghaya-areas-survey-${stamp}.xlsx`
      const buffer = await wb.xlsx.writeBuffer()
      const blob = new Blob([buffer as unknown as BlobPart], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setProgress(ar ? 'اتصدّر بنجاح — بص على ملف التحميلات.' : 'Exported successfully — check your downloads.')
    } catch (err) {
      console.error('Areas survey export failed:', err)
      setError(ar ? 'التصدير فشل — حاول تاني.' : 'Export failed — try again')
      setProgress('')
    } finally {
      setExporting(false)
    }
  }

  const selectCls =
    'h-10 rounded-xl border border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] px-3 text-sm text-gray-300 outline-none focus:border-estate-gold/50'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Reveal>
          <p className="section-kicker">{ar ? 'لوحة المدير · مسح المناطق' : 'CEO Console · Areas survey'}</p>
          <h1 className="flex items-center gap-2 font-display display-3 text-foreground">
            <FileSpreadsheet className="h-6 w-6 text-estate-gold" /> {ar ? 'مسح المناطق' : 'Areas survey'}
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            {ar
              ? 'كل المشاريع بأسعارها ووحداتها وخطط السداد — فلتر بالمحافظة والمدينة وبعدين صدّرهم ملف إكسل حقيقي.'
              : 'Every project with prices, units and payment plans — filter by governorate and city, then export a real Excel file.'}
          </p>
          <hr className="gold-hairline mt-4" />
        </Reveal>
        <Button
          onClick={handleExport}
          disabled={exporting || loading || preview.length === 0}
          className="h-12 gap-2 rounded-2xl bg-gradient-to-br from-estate-gold to-estate-gold-dark px-6 text-base font-bold text-[#0F1A2C] shadow-lg shadow-estate-gold/20 hover:brightness-110"
        >
          {exporting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
          {ar ? 'صدّر إكسل' : 'Export Excel'}
        </Button>
      </div>

      {progress && (
        <div className="flex items-center gap-2 rounded-2xl border border-estate-gold/30 bg-estate-gold/10 px-4 py-3 text-sm text-estate-gold">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> {progress}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* Filters */}
      <Card className="border-border dark:border-[#262626] bg-card dark:bg-black">
        <CardContent className="flex flex-wrap items-center gap-2 px-4 py-3">
          <select
            value={governorate}
            onChange={(e) => {
              setGovernorate(e.target.value)
              setCity('ALL')
            }}
            className={selectCls}
          >
            <option value="ALL">{ar ? 'كل المحافظات' : 'All governorates'}</option>
            {geo?.governorates.map((g) => (
              <option key={g.id} value={g.id}>
                {ar ? g.nameArabic || g.name : g.name}
              </option>
            ))}
          </select>
          <select value={city} onChange={(e) => setCity(e.target.value)} className={selectCls}>
            <option value="ALL">{ar ? 'كل المدن' : 'All cities'}</option>
            {cityOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {ar ? c.nameArabic || c.name : c.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            onClick={() => load(governorate, city)}
            disabled={loading}
            className="gap-1.5 border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-gray-300"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            {ar ? 'حدّث' : 'Refresh'}
          </Button>
          {meta && (
            <p className="ml-auto text-xs text-gray-500">
              {ar
                ? `${meta.returned} مشروع · ${meta.unitCount} وحدة · ${meta.planCount} خطة دفع${meta.capped ? ` (مقصوص عند ${meta.cap})` : ''}`
                : `${meta.returned} projects · ${meta.unitCount} units · ${meta.planCount} payment plans${meta.capped ? ` (capped at ${meta.cap})` : ''}`}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Live preview */}
      <Card className="border-border dark:border-[#262626] bg-card dark:bg-black">
        <CardContent className="p-0">
          <div className="flex items-center gap-2 border-b border-border dark:border-[#262626] px-4 py-3">
            <MapPin className="h-4 w-4 text-estate-gold" />
            <p className="text-sm font-semibold text-foreground">
              {ar ? 'معاينة حيّة (كل المشاريع)' : 'Live preview (all projects)'}
            </p>
          </div>
          {loading && preview.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-14 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> {ar ? 'بيحمّل المسح…' : 'Loading survey…'}
            </div>
          ) : preview.length === 0 ? (
            <div className="py-14 text-center text-sm text-gray-400">
              {ar ? 'مفيش مشاريع بالفلاتر دي.' : 'No projects with these filters.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border dark:border-[#262626] bg-card dark:bg-[#0A0A0A] text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-3 py-2.5 font-medium">{ar ? 'المطوّر' : 'Developer'}</th>
                    <th className="px-3 py-2.5 font-medium">{ar ? 'المشروع' : 'Project'}</th>
                    <th className="px-3 py-2.5 font-medium">{ar ? 'الحي' : 'District'}</th>
                    <th className="px-3 py-2.5 font-medium">{ar ? 'اللوكيشن' : 'Location'}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{ar ? 'السعر الابتدائي' : 'Starting price'}</th>
                    <th className="px-3 py-2.5 font-medium">{ar ? 'خطط السداد' : 'Payment plans'}</th>
                    <th className="px-3 py-2.5 font-medium">{ar ? 'سيلينج بوينت' : 'Selling point'}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((p) => (
                    <tr key={p.id} className="border-b border-border dark:border-[#262626] last:border-0 hover:bg-white/[0.04]">
                      <td className="px-3 py-2.5 text-gray-300">{devCell(p, ar) || '—'}</td>
                      <td className="px-3 py-2.5 font-medium text-foreground">{projCell(p, ar)}</td>
                      <td className="px-3 py-2.5 text-gray-300">{distCell(p, ar) || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-estate-gold">{locCell(p, ar) || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right text-gray-300">
                        {priceCell(p, false)}
                      </td>
                      <td className="max-w-[300px] whitespace-pre-line px-3 py-2.5 text-xs text-gray-300">
                        {plansCell(p, ar) || '—'}
                      </td>
                      <td className="max-w-[240px] px-3 py-2.5 text-xs text-gray-300">
                        {sellingCell(p, ar) || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* What the file contains */}
      <Card className="border-border dark:border-[#262626] bg-card dark:bg-black">
        <CardContent className="px-4 py-3 text-xs leading-relaxed text-gray-500">
          {ar ? (
            <>
              ملف الإكسل فيه ٣ شيتات: <b className="text-gray-300">المشاريع</b> (صف لكل مشروع بـ٧ أعمدة مختصرة: المطوّر والمشروع والحي واللوكيشن والسعر الابتدائي وخطط السداد والسيلينج بوينت)،{' '}
              <b className="text-gray-300">الوحدات</b> (صف لكل وحدة + أعمدة المشروع والمدينة الأب)،{' '}
              <b className="text-gray-300">خطط السداد</b> (صف لكل خطة + المراحل مكتوبة كنص + الأعمدة الأب). العناوين
              عربي والإنجليزي بين قوسين.
            </>
          ) : (
            <>
              The Excel file has 3 sheets: <b className="text-gray-300">Projects</b> (one row per project, 7
              summary columns: developer, project, district, location, starting price, payment plans, selling point), <b className="text-gray-300">Units</b> (one row per unit + parent project/city columns),{' '}
              <b className="text-gray-300">Payment plans</b> (one row per plan + milestones as text + parent columns).
              Headers are Arabic with English in parentheses.
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
