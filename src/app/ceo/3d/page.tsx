'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { useLanguage } from '@/lib/language-context'
import { ceoApi, Toast, type ToastState } from '../components/manager-ui'

/**
 * CEO 3D studio — completely private. Everything on this page is admin-only
 * and the PUBLIC site keeps staying dark until the master publishing switch
 * at the top is flipped ON deliberately (default: OFF forever).
 */

interface AdminModel {
  id: string
  sourceType: string
  sourceId: string
  sourceLabel: string
  sourceSub: string
  sourcePublic: boolean
  kind: string
  labelAr: string | null
  labelEn: string | null
  hasFile: boolean
  originalName: string | null
  sizeBytes: number | null
  status: string
  hotspotCount: number
  floorCount: number
  fallbackImageUrl: string | null
  updatedAt: string
}

interface ProjectLite {
  id: string
  name: string
  nameArabic?: string
  slug: string
}

const KIND_AR = { EXTERIOR: 'مجسم خارجي', INTERIOR: 'مجسم داخلي', BUILDING: 'مبنى كامل' } as Record<string, string>
const KIND_EN = { EXTERIOR: 'Exterior model', INTERIOR: 'Interior model', BUILDING: 'Full building' } as Record<string, string>

function fmtMB(bytes: number | null): string {
  if (!bytes) return '—'
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

export default function CEOModels3DPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [gating, setGating] = useState({ publishEnabled: false })
  const [models, setModels] = useState<AdminModel[]>([])
  const [projects, setProjects] = useState<ProjectLite[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<ToastState>(null)
  const [confirmSwitch, setConfirmSwitch] = useState<'ON' | 'OFF' | null>(null)

  // Upload form state
  const sourceTypeRef = useRef<HTMLSelectElement>(null)
  const [sourceType, setSourceType] = useState<'PROJECT' | 'UNIT'>('PROJECT')
  const [sourceId, setSourceId] = useState('')
  const [kind, setKind] = useState<'EXTERIOR' | 'INTERIOR' | 'BUILDING'>('EXTERIOR')
  const [labelAr, setLabelAr] = useState('')
  const [labelEn, setLabelEn] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [demoOnly, setDemoOnly] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const data = await ceoApi<{ gating: { publishEnabled: boolean }; models: AdminModel[] }>('/api/ceo/models3d')
      setGating(data.gating)
      setModels(data.models)
    } catch (e) {
      setToast({ msg: (e as Error).message, tone: 'err' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
    fetch('/api/projects?limit=80', { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      .then((r) => r.json())
      .then((d: { projects?: { id: string; name: string; nameArabic?: string; slug: string }[] }) => {
        setProjects(d.projects || [])
      })
      .catch(() => {})
  }, [loadData])

  const toggleSwitch = async (enabled: boolean) => {
    setConfirmSwitch(null)
    setBusy(true)
    try {
      const r = await ceoApi<{ publishEnabled: boolean }>('/api/ceo/models3d/switch', 'POST', { enabled })
      setGating({ publishEnabled: r.publishEnabled })
      setToast({ msg: enabled ? (ar ? 'النشر العام اشتغل — التجربة 3D بقت ظاهرة للجميع' : 'Public publishing is ON — 3D is now visible') : (ar ? 'اتطفي النشر — كل حاجة اتخافت من الموقع العام' : 'Publishing is OFF — the feature is fully hidden again'), tone: 'ok' })
    } catch (e) {
      setToast({ msg: (e as Error).message, tone: 'err' })
    } finally {
      setBusy(false)
    }
  }

  const upload = async () => {
    if (!sourceId) {
      setToast({ msg: ar ? 'اختار المشروع الأول' : 'Pick a project first', tone: 'err' })
      return
    }
    if (!file && !demoOnly) {
      setToast({ msg: ar ? 'اختار ملف .glb أو سجله مرة تجريبية من غير ملف' : 'Choose a .glb file, or save as a labeled demo-only row', tone: 'err' })
      return
    }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('payload', JSON.stringify({ sourceType, sourceId, kind, labelAr, labelEn }))
      if (file) fd.append('file', file)
      const res = await fetch('/api/ceo/models3d', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        body: fd,
      })
      const d = (await res.json()) as { id?: string; error?: string }
      if (!res.ok || !d.id) throw new Error(d.error || 'Upload failed')
      setToast({ msg: ar ? 'تم الرفع — افتح الإعدادات واكمل التجهيز' : 'Uploaded — open its config next', tone: 'ok' })
      setFile(null)
      setLabelAr('')
      setLabelEn('')
      setDemoOnly(false)
      await loadData()
    } catch (e) {
      setToast({ msg: (e as Error).message, tone: 'err' })
    } finally {
      setBusy(false)
    }
  }

  const del = async (m: AdminModel) => {
    if (!window.confirm(ar ? `متأكد من حذف مجسم «${m.labelAr || m.sourceLabel}» نهائيًا؟` : `Delete “${m.labelEn || m.sourceLabel}” permanently?`)) return
    setBusy(true)
    try {
      await ceoApi(`/api/ceo/models3d/${m.id}`, 'DELETE')
      setToast({ msg: ar ? 'اتحذف بالملف بتاعه' : 'Deleted with its file', tone: 'ok' })
      await loadData()
    } catch (e) {
      setToast({ msg: (e as Error).message, tone: 'err' })
    } finally {
      setBusy(false)
    }
  }

  const togglePublishRow = async (m: AdminModel) => {
    setBusy(true)
    try {
      await ceoApi(`/api/ceo/models3d/${m.id}`, 'PATCH', { status: m.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED' })
      await loadData()
      setToast({ msg: ar ? 'حالة النشر اتحدثت' : 'Status updated', tone: 'ok' })
    } catch (e) {
      setToast({ msg: (e as Error).message, tone: 'err' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div>
        <h1 className="font-display text-2xl font-bold">3D Studio</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {ar ? 'مجسمات معمارية حقيقية (.glb) تتربط بالمشاريع والوحدات — كله خاص لحد ما تنشره بإيدك.' : 'Real architectural GLB models linked to projects and units — fully private until you publish.'}
        </p>
      </div>

      {/* Master switch */}
      <Card className={gating.publishEnabled ? 'border-amber-400/40' : undefined}>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div className="flex items-center gap-3">
            <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${gating.publishEnabled ? 'bg-amber-400/10' : 'bg-estate-gold/10'}`}>
              <span aria-hidden="true" className="text-xl">{gating.publishEnabled ? '🌍' : '🔒'}</span>
            </span>
            <div>
              <h2 className="font-display text-lg font-bold">
                {ar ? 'مفتاح النشر العام' : 'Master publishing switch'}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {gating.publishEnabled
                  ? (ar ? 'شغال — التجربة ظاهرة للزوار على صفحات المشاريع/الوحدات و/3d/<id>' : 'ON — the experience is public on project/unit pages and /3d/<id>')
                  : (ar ? 'مقفول — لا صفحة ولا لينك ولا API ولا SEO شايف حاجة. الافتراضي دايمًا OFF' : 'OFF — no page, link, API or SEO exposure exists. Default is always OFF')}
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={gating.publishEnabled}
            disabled={busy}
            onClick={() => setConfirmSwitch(gating.publishEnabled ? 'OFF' : 'ON')}
            className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${gating.publishEnabled ? 'bg-amber-400' : 'bg-gray-300 dark:bg-[#262626]'} ${busy ? 'opacity-50' : ''}`}
          >
            <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${gating.publishEnabled ? 'left-7' : 'left-1'}`} />
          </button>
        </CardContent>
      </Card>

      {confirmSwitch ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#12131a] p-6 text-gray-100 shadow-2xl">
            <h3 className="font-display text-lg font-bold">
              {confirmSwitch === 'ON' ? (ar ? 'تشغيل النشر العام للتجربة 3D؟' : 'Publish the 3D experience publicly?') : (ar ? 'إخفاء التجربة من الجميع؟' : 'Hide the experience from everyone?')}
            </h3>
            <p className="mt-2 text-sm text-gray-400">
              {confirmSwitch === 'ON'
                ? (ar ? 'هيفضل متاح لكل الزوار على الصفحات المنشورة. تقدر تطفيه برجوع من نفس المكان.' : 'It becomes available to all visitors on published pages. You can switch it off anytime.')
                : (ar ? 'كل صفحات 3D هترجع 404 للزوار والمفات فورًا.' : 'Every 3D page and API returns 404 to visitors immediately.')}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirmSwitch(null)} className="rounded-full px-4 py-2 text-sm text-gray-400 hover:text-white">
                {ar ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={() => void toggleSwitch(confirmSwitch === 'ON')}
                className={`rounded-full px-5 py-2 text-sm font-bold ${confirmSwitch === 'ON' ? 'bg-amber-400 text-black hover:brightness-110' : 'bg-estate-gold text-[#0F1A2C] hover:brightness-110'}`}
                disabled={busy}
              >
                {confirmSwitch === 'ON' ? (ar ? 'شغّل النشر' : 'Publish it') : ar ? 'اطفه' : 'Unpublish'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Upload new model */}
      <Card>
        <CardContent className="p-6">
          <h2 className="font-display text-lg font-bold">{ar ? 'ارفع مجسم جديد' : 'Upload a new model'}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{ar ? 'ملفات .glb أو .gltf لغاية 80MB — يفضّل GLB مضغوط draco' : '.glb / .gltf up to 80MB — draco-compressed GLB recommended'}</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-500">{ar ? 'الربط بـ' : 'Linked to'}</span>
              <select
                ref={sourceTypeRef}
                value={sourceType}
                onChange={(e) => { setSourceType(e.target.value as 'PROJECT' | 'UNIT'); setSourceId('') }}
                className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm"
              >
                <option value="PROJECT">{ar ? 'مشروع' : 'Project'}</option>
                <option value="UNIT">{ar ? 'وحدة' : 'Unit'}</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-500">{ar ? sourceType === 'PROJECT' ? 'المشروع' : 'المشروع ثم الوحدة' : 'Project'}</span>
              <select
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm"
              >
                <option value="">{ar ? 'اختار…' : 'Pick…'}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.nameArabic || p.name || p.id}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-500">{ar ? 'النوع' : 'Kind'}</span>
              <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm">
                <option value="EXTERIOR">{ar ? KIND_AR.EXTERIOR : KIND_EN.EXTERIOR}</option>
                <option value="INTERIOR">{ar ? KIND_AR.INTERIOR : KIND_EN.INTERIOR}</option>
                <option value="BUILDING">{ar ? KIND_AR.BUILDING : KIND_EN.BUILDING}</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-500">{ar ? 'الاسم بالعربي' : 'Label (Arabic)'}</span>
              <input value={labelAr} onChange={(e) => setLabelAr(e.target.value)} className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm" placeholder={ar ? 'مثال: جولة الواجهة' : 'e.g. Façade tour'} />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-gray-500">{ar ? 'الاسم بالإنجليزي' : 'Label (English)'}</span>
              <input value={labelEn} onChange={(e) => setLabelEn(e.target.value)} dir="ltr" className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm" placeholder="e.g. Façade tour" />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-gray-500">{ar ? 'ملف المجسم' : 'Model file'}</span>
              <input
                type="file"
                accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                dir="ltr"
                className="w-full cursor-pointer rounded-xl border border-border bg-card px-3 py-2.5 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-estate-gold/10 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-estate-gold"
              />
            </label>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={demoOnly} onChange={(e) => setDemoOnly(e.target.checked)} className="h-4 w-4" />
            {ar ? 'تسجيل من غير ملف دلوقتي (مشهد توضيحي معلّم — أرفع الملف بعدين)' : 'Save without a file for now (labeled demo scene — add the GLB later)'}
          </label>
          <button
            onClick={() => void upload()}
            disabled={busy}
            className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-full bg-estate-gold px-6 text-sm font-bold text-[#0F1A2C] transition-colors hover:bg-estate-gold-dark disabled:opacity-50"
          >
            {busy ? (ar ? 'جاري الرفع…' : 'Uploading…') : ar ? 'ارفع وسجّل' : 'Upload & register'}
          </button>
        </CardContent>
      </Card>

      {/* List */}
      <div className="space-y-3">
        <h2 className="font-display text-lg font-bold">{ar ? 'المجسمات المسجلة' : 'Registered models'}</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">{ar ? 'جاري التحميل…' : 'Loading…'}</p>
        ) : models.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {ar ? 'لسه مفيش مجسمات — ابدأ برفع أعلاه' : 'No models yet — start with the upload card above'}
          </p>
        ) : (
          models.map((m) => (
            <Card key={m.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${m.status === 'PUBLISHED' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-gray-500/10 text-gray-500'}`}>
                      {m.status === 'PUBLISHED' ? (ar ? 'منشور' : 'Published') : ar ? 'مسودة' : 'Draft'}
                    </span>
                    <span className="rounded-full bg-estate-gold/10 px-2.5 py-1 text-[11px] font-bold text-estate-gold">{ar ? KIND_AR[m.kind] : KIND_EN[m.kind]}</span>
                    {!m.hasFile ? <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-600 dark:text-amber-400">{ar ? 'مجرد عينة' : 'Demo-only'}</span> : null}
                    {!m.sourcePublic && m.status === 'PUBLISHED' ? (
                      <span className="rounded-full bg-red-500/10 px-2.5 py-1 text-[11px] font-bold text-red-600 dark:text-red-400">{ar ? 'المصدر مش منشور؟' : 'Source not public?'}</span>
                    ) : null}
                  </div>
                  <p className="mt-1.5 truncate font-semibold">{ar ? m.labelAr || m.sourceLabel : m.labelEn || m.sourceLabel}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.sourceType === 'PROJECT' ? (ar ? 'مشروع:' : 'Project:') : (ar ? 'وحدة:' : 'Unit:')} {m.sourceLabel}
                    {m.sourceSub ? ` · ${m.sourceSub}` : ''} · {m.hasFile ? `${fmtMB(m.sizeBytes)} · ${m.hotspotCount ? `${m.hotspotCount} ${ar ? 'هوتسبوت' : 'hotspots'}` : ''}${m.floorCount ? ` · ${m.floorCount} ${ar ? 'طوابق' : 'floors'}` : ''}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void togglePublishRow(m)}
                    disabled={busy}
                    className={`min-h-[40px] rounded-full px-4 text-xs font-bold transition-colors ${m.status === 'PUBLISHED' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:brightness-110' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:brightness-110'}`}
                  >
                    {m.status === 'PUBLISHED' ? (ar ? 'إلغاء النشر' : 'Unpublish') : ar ? 'انشر' : 'Publish'}
                  </button>
                  <Link
                    href={`/ceo/3d/${m.id}`}
                    className="inline-flex min-h-[40px] items-center rounded-full bg-estate-gold px-4 text-xs font-bold text-[#0F1A2C] transition-colors hover:bg-estate-gold-dark"
                  >
                    {ar ? 'إعدادات' : 'Config'}
                  </Link>
                  <button
                    onClick={() => void del(m)}
                    disabled={busy}
                    className="min-h-[40px] rounded-full bg-red-500/10 px-4 text-xs font-bold text-red-600 transition-colors hover:brightness-110 dark:text-red-400"
                  >
                    {ar ? 'حذف' : 'Delete'}
                  </button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
