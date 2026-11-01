'use client'

import Link from 'next/link'
import nextDynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { useLanguage } from '@/lib/language-context'
import { ceoApi, Toast, type ToastState } from '../../components/manager-ui'

/**
 * Per-model 3D configurator — private CEO surface. Left: live preview canvas
 * (streams through the CEO-only file route regardless of publish state).
 * Right: link/kind/labels, hotspot editor, floors/units editor, publish row.
 */

const CanvasRoot = nextDynamic(() => import('@/components/models3d/canvas-root').then((m) => m.default), {
  ssr: false,
  loading: () => null,
})

interface Hotspot {
  id: string
  position: [number, number, number]
  labelAr: string
  labelEn: string
  noteAr?: string
  noteEn?: string
  area?: number
  dimsAr?: string
  dimsEn?: string
}

interface FloorUnit {
  id: string
  label: string
  status: 'AVAILABLE' | 'RESERVED' | 'SOLD'
  price?: number
  area?: number
  rooms?: number
  unitId?: string
}

interface Floor {
  id: string
  nameAr: string
  nameEn: string
  y?: number
  units: FloorUnit[]
}

interface Row {
  id: string
  sourceType: string
  sourceId: string
  kind: string
  labelAr: string | null
  labelEn: string | null
  storageKey: string | null
  originalName: string | null
  sizeBytes: number | null
  fallbackImageUrl: string | null
  status: string
}

const KIND_OPTS = ['EXTERIOR', 'INTERIOR', 'BUILDING'] as const
const KIND_AR = { EXTERIOR: 'مجسم خارجي', INTERIOR: 'مجسم داخلي', BUILDING: 'مبنى كامل' } as Record<string, string>
const KIND_EN = { EXTERIOR: 'Exterior', INTERIOR: 'Interior', BUILDING: 'Full building' } as Record<string, string>

export default function CEOModel3DConfigPage({ params }: { params: { id: string } }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const { id } = params

  const [row, setRow] = useState<Row | null>(null)
  const [hotspots, setHotspots] = useState<Hotspot[]>([])
  const [floors, setFloors] = useState<Floor[]>([])
  const [kind, setKind] = useState<string>('EXTERIOR')
  const [labelAr, setLabelAr] = useState('')
  const [labelEn, setLabelEn] = useState('')
  const [fallback, setFallback] = useState('')
  const [rowStatus, setRowStatus] = useState('DRAFT')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [placing, setPlacing] = useState(false)
  const [uploadingImg, setUploadingImg] = useState(false)
  const [toast, setToast] = useState<ToastState>(null)
  const [night, setNight] = useState(false)
  const walk = false

  const load = useCallback(async () => {
    try {
      const d = await ceoApi<{ model: Row; hotspots: Hotspot[]; floors: Floor[] }>(`/api/ceo/models3d/${id}`)
      setRow(d.model)
      setHotspots(d.hotspots || [])
      setFloors(d.floors || [])
      setKind(d.model.kind)
      setLabelAr(d.model.labelAr || '')
      setLabelEn(d.model.labelEn || '')
      setFallback(d.model.fallbackImageUrl || '')
      setRowStatus(d.model.status)
    } catch (e) {
      setToast({ msg: (e as Error).message, tone: 'err' })
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const onPick = (e: Event) => {
      const p = (e as CustomEvent<[number, number, number]>).detail
      const hs: Hotspot = {
        id: `hs-${Date.now().toString(36)}`,
        position: p.map((n: number) => Math.round(n * 100) / 100) as [number, number, number],
        labelAr: ar ? 'غرفة جديدة' : 'New room',
        labelEn: ar ? 'New room' : 'New room',
      }
      setHotspots((prev) => [...prev, hs])
      setDirty(true)
    }
    window.addEventListener('m3d-ceo-pick', onPick)
    return () => window.removeEventListener('m3d-ceo-pick', onPick)
  }, [ar])

  const saveConfig = async () => {
    setBusy(true)
    try {
      await ceoApi(`/api/ceo/models3d/${id}`, 'PATCH', {
        kind,
        labelAr,
        labelEn,
        fallbackImageUrl: fallback || null,
        hotspotData: JSON.stringify(hotspots),
        floorData: JSON.stringify(floors),
      })
      setDirty(false)
      setToast({ msg: ar ? 'اتحفظ كل التغييرات' : 'All changes saved', tone: 'ok' })
      await load()
    } catch (e) {
      setToast({ msg: (e as Error).message, tone: 'err' })
    } finally {
      setBusy(false)
    }
  }

  const setStatus = async (status: string) => {
    setBusy(true)
    try {
      await ceoApi(`/api/ceo/models3d/${id}`, 'PATCH', { status })
      setRowStatus(status)
      setToast({ msg: status === 'PUBLISHED' ? (ar ? 'نشِر المجسم (تحت المفتاح العام)' : 'Model published (under the master switch)') : (ar ? 'رجع مسودة' : 'Back to draft'), tone: 'ok' })
    } catch (e) {
      setToast({ msg: (e as Error).message, tone: 'err' })
    } finally {
      setBusy(false)
    }
  }

  const uploadFallbackImage = async (f: File) => {
    setUploadingImg(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const res = await fetch('/api/ceo/upload', { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' }, body: fd })
      const d = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !d.url) throw new Error(d.error || 'Upload failed')
      setFallback(d.url)
      setDirty(true)
    } catch (e) {
      setToast({ msg: (e as Error).message, tone: 'err' })
    } finally {
      setUploadingImg(false)
    }
  }

  const patchRow = <K extends 'kind' | 'labelAr' | 'labelEn'>(k: K, v: string) => {
    if (k === 'kind') setKind(v)
    if (k === 'labelAr') setLabelAr(v)
    if (k === 'labelEn') setLabelEn(v)
    setDirty(true)
  }

  const previewModel = useMemo(
    () => ({
      id,
      sourceType: row?.sourceType || 'PROJECT',
      sourceId: row?.sourceId || '',
      kind: kind || 'EXTERIOR',
      labelAr: row?.labelAr || '',
      labelEn: row?.labelEn || '',
      hasRealModel: !!row?.storageKey,
      originalName: row?.originalName || '',
      sizeBytes: row?.sizeBytes ?? 0,
      hotspots: hotspots.map((h) => ({ id: h.id, position: h.position, labelAr: h.labelAr, labelEn: h.labelEn })),
      floors,
      fallbackImageUrl: fallback || null,
      updatedAt: '',
    }) as import('@/lib/models3d').PublicModel3D,
    [id, row, kind, hotspots, floors, fallback]
  )

  const updateHotspot = (hid: string, patch: Partial<Hotspot>) => {
    setHotspots((prev) => prev.map((h) => (h.id === hid ? { ...h, ...patch } : h)))
    setDirty(true)
  }
  const removeHotspot = (hid: string) => {
    setHotspots((prev) => prev.filter((h) => h.id !== hid))
    setDirty(true)
  }

  const addFloor = () => {
    const nf: Floor = {
      id: `fl-${Date.now().toString(36)}`,
      nameAr: `طابق ${floors.length + 1}`,
      nameEn: `Floor ${floors.length + 1}`,
      y: floors.length * 3,
      units: [],
    }
    setFloors((prev) => [...prev, nf])
    setDirty(true)
  }
  const updateFloor = (fid: string, patch: Partial<Floor>) => {
    setFloors((prev) => prev.map((f) => (f.id === fid ? { ...f, ...patch } : f)))
    setDirty(true)
  }
  const removeFloor = (fid: string) => {
    setFloors((prev) => prev.filter((f) => f.id !== fid))
    setDirty(true)
  }
  const addUnit = (fid: string) => {
    const src = floors.find((f) => f.id === fid)
    updateFloor(fid, {
      units: [
        ...(src?.units || []),
        { id: `u-${Date.now().toString(36)}`, label: `وحدة ${(src?.units.length ?? 0) + 1}`, status: 'AVAILABLE' as const },
      ],
    })
  }
  const updateUnit = (fid: string, uid: string, patch: Partial<FloorUnit>) => {
    const f = floors.find((x) => x.id === fid)
    if (!f) return
    updateFloor(fid, { units: f.units.map((u) => (u.id === uid ? { ...u, ...patch } : u)) })
  }
  const removeUnit = (fid: string, uid: string) => {
    const f = floors.find((x) => x.id === fid)
    if (!f) return
    updateFloor(fid, { units: f.units.filter((u) => u.id !== uid) })
  }

  if (loading) return <p className="p-6 text-sm text-muted-foreground">{ar ? 'جاري التحميل…' : 'Loading…'}</p>
  if (!row) return <p className="p-6 text-sm text-muted-foreground">{ar ? 'مش لاقي المجسم' : 'Model not found'}</p>

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/ceo/3d" className="text-sm text-muted-foreground hover:text-foreground">← {ar ? 'الاستوديو' : 'Studio'}</Link>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${rowStatus === 'PUBLISHED' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-gray-500/10 text-gray-500'}`}>
              {rowStatus === 'PUBLISHED' ? (ar ? 'منشور' : 'Published') : ar ? 'مسودة' : 'Draft'}
            </span>
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold">{ar ? labelAr || 'مجسم' : labelEn || 'Model'}</h1>
          <p className="text-xs text-muted-foreground">
            {row.sourceType === 'PROJECT' ? (ar ? 'مشروع' : 'Project') : ar ? 'وحدة' : 'Unit'} · {row.originalName || (ar ? 'عينة توضيحية من غير ملف' : 'demo-only, no file')} {row.sizeBytes ? `· ${(row.sizeBytes / 1048576).toFixed(1)}MB` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirty ? (
            <button onClick={() => void saveConfig()} disabled={busy} className="min-h-[44px] rounded-full bg-estate-gold px-5 text-sm font-bold text-[#0F1A2C] hover:bg-estate-gold-dark disabled:opacity-50">
              {ar ? 'احفظ' : 'Save'}
            </button>
          ) : null}
          {rowStatus === 'PUBLISHED' ? (
            <button onClick={() => void setStatus('DRAFT')} disabled={busy} className="min-h-[44px] rounded-full bg-amber-500/10 px-5 text-sm font-bold text-amber-600 hover:brightness-110 dark:text-amber-400">{ar ? 'إلغاء النشر' : 'Unpublish'}</button>
          ) : (
            <button onClick={() => void setStatus('PUBLISHED')} disabled={busy} className="min-h-[44px] rounded-full bg-emerald-500/10 px-5 text-sm font-bold text-emerald-600 hover:brightness-110 dark:text-emerald-400">{ar ? 'انشر' : 'Publish'}</button>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
        {/* Preview canvas + place tool */}
        <Card className="order-1">
          <CardContent className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
              <div>
                <h2 className="font-display font-bold">{ar ? 'المعاينة الحية' : 'Live preview'}</h2>
                <p className="text-xs text-muted-foreground">{ar ? '.كبس على أي مكان في المجسم وانت مفعّل وضع التثبيت للإضافة نقطة غرفة' : 'Enable “place hotspots” then click any surface on the model'}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPlacing((v) => !v)}
                  className={`min-h-[40px] rounded-full px-4 text-xs font-bold transition-colors ${placing ? 'bg-estate-gold text-[#0F1A2C]' : 'bg-gray-500/10 text-gray-500 hover:text-foreground'}`}
                >
                  {placing ? (ar ? 'وضع التثبيت شغال ✓' : 'Placing ON') : ar ? 'تثبيت هوتسبوت' : 'Place hotspots'}
                </button>
                <button onClick={() => setNight((v) => !v)} className="min-h-[40px] rounded-full bg-gray-500/10 px-4 text-sm" aria-label={ar ? (night ? 'إضاءة النهار' : 'إضاءة الليل') : 'Light'}>
                  {night ? '☀️' : '🌙'}
                </button>
              </div>
            </div>
            <div className="relative h-[520px] bg-[#050914]">
              <CanvasRoot
                model={previewModel}
                night={night}
                walk={walk}
                activeFloor={null}
                pickMode={placing}
                onSelectHotspot={() => {}}
                onSelectUnit={() => {}}
              />
              {placing ? (
                <CeoPickTranslator ar={ar} />
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* Config panel */}
        <div className="order-2 space-y-4">
          {/* Link + kind + labels */}
          <Card>
            <CardContent className="space-y-3 p-5">
              <h2 className="font-display font-bold">{ar ? 'بيانات المجسم' : 'Model data'}</h2>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-gray-500">{ar ? 'النوع' : 'Kind'}</span>
                <select value={kind} onChange={(e) => patchRow('kind', e.target.value)} className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm">
                  {KIND_OPTS.map((k) => <option key={k} value={k}>{ar ? KIND_AR[k] : KIND_EN[k]}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-gray-500">{ar ? 'العنوان بالعربي' : 'Label (AR)'}</span>
                <input value={labelAr} onChange={(e) => patchRow('labelAr', e.target.value)} className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-gray-500">{ar ? 'العنوان بالإنجليزي' : 'Label (EN)'}</span>
                <input dir="ltr" value={labelEn} onChange={(e) => patchRow('labelEn', e.target.value)} className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm" />
              </label>
              <div>
                <span className="mb-1 block text-xs font-semibold text-gray-500">{ar ? 'صورة الشكل الاصلي (Fallback)' : 'Fallback image'}</span>
                <div className="flex items-center gap-3">
                  {fallback ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fallback} alt="fallback" className="h-14 w-20 rounded-xl object-cover" />
                  ) : (
                    <span className="flex h-14 w-20 items-center justify-center rounded-xl bg-gray-500/10 text-xs text-gray-500">{ar ? 'مفيش' : 'none'}</span>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadFallbackImage(f) }}
                    className="text-xs"
                    disabled={uploadingImg}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Hotspots editor */}
          <Card>
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-display font-bold">{ar ? 'غرف/نقاط الاستكشاف' : 'Exploration hotspots'}</h2>
                <span className="rounded-full bg-estate-gold/10 px-2.5 py-1 text-[11px] font-bold text-estate-gold">{hotspots.length}</span>
              </div>
              {hotspots.length === 0 ? (
                <p className="text-xs text-muted-foreground">{ar ? 'شغل وضع التثبيت وكبس على المجسم تضيف غرفة' : 'Enable placing, then click the model to add rooms'}</p>
              ) : (
                <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
                  {hotspots.map((h, i) => (
                    <div key={h.id} className="rounded-xl border border-border p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-gray-500">#{i + 1} · [{h.position.join(', ')}]</span>
                        <button onClick={() => removeHotspot(h.id)} className="text-xs text-red-500 hover:underline">{ar ? 'حذف' : 'Remove'}</button>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <input value={h.labelAr} onChange={(e) => updateHotspot(h.id, { labelAr: e.target.value })} placeholder={ar ? 'الاسم (عربي)' : 'Label AR'} className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs" />
                        <input dir="ltr" value={h.labelEn} onChange={(e) => updateHotspot(h.id, { labelEn: e.target.value })} placeholder="Label EN" className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs" />
                        <input type="number" step="0.1" value={h.area ?? ''} onChange={(e) => updateHotspot(h.id, { area: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder={ar ? 'المساحة م²' : 'Area m²'} className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs" />
                        <input value={h.dimsAr || ''} onChange={(e) => updateHotspot(h.id, { dimsAr: e.target.value, dimsEn: e.target.value })} placeholder={ar ? 'الأبعاد، مثال 4×5' : 'Dims 4×5'} className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs" />
                        <input value={h.noteAr || ''} onChange={(e) => updateHotspot(h.id, { noteAr: e.target.value, noteEn: e.target.value })} placeholder={ar ? 'ملحوظة/التشطيب' : 'Note/finishes'} className="col-span-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {kind === 'BUILDING' ? (
            <Card>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-display font-bold">{ar ? 'الطوابق والوحدات' : 'Floors & units'}</h2>
                  <button onClick={addFloor} className="min-h-[36px] rounded-full bg-estate-gold/10 px-3 text-xs font-bold text-estate-gold">+ {ar ? 'طابق' : 'Floor'}</button>
                </div>
                {floors.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{ar ? 'ضيف الطوابق ثم الوحدات بحالة وأسعار من الكتالوج' : 'Add floors, then units with real catalog prices'}</p>
                ) : (
                  <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
                    {floors.map((f) => (
                      <div key={f.id} className="rounded-xl border border-border p-3">
                        <div className="flex items-center gap-2">
                          <input value={f.nameAr} onChange={(e) => updateFloor(f.id, { nameAr: e.target.value })} className="w-24 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs" placeholder={ar ? 'الاسم(عربي)' : 'Name AR'} />
                          <input dir="ltr" value={f.nameEn} onChange={(e) => updateFloor(f.id, { nameEn: e.target.value })} className="w-24 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs" placeholder="Name EN" />
                          <input type="number" value={f.y ?? 0} onChange={(e) => updateFloor(f.id, { y: Number(e.target.value) })} className="w-16 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs" title={ar ? 'المستوى رأسيًا (Y)' : 'World Y'} />
                          <button onClick={() => addUnit(f.id)} className="ml-auto rounded-full bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">+ {ar ? 'وحدة' : 'Unit'}</button>
                          <button onClick={() => removeFloor(f.id)} className="text-xs text-red-500 hover:underline">✕</button>
                        </div>
                        {(f.units || []).map((u) => (
                          <div key={u.id} className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg bg-card/60 p-2">
                            <input value={u.label} onChange={(e) => updateUnit(f.id, u.id, { label: e.target.value })} className="w-20 rounded border border-border bg-card px-2 py-1 text-xs" placeholder={ar ? 'اسم' : 'Label'} />
                            <select value={u.status} onChange={(e) => updateUnit(f.id, u.id, { status: e.target.value as FloorUnit['status'] })} className="rounded border border-border bg-card px-1.5 py-1 text-xs">
                              <option value="AVAILABLE">{ar ? 'متاح' : 'Avail.'}</option>
                              <option value="RESERVED">{ar ? 'محجوز' : 'Res.'}</option>
                              <option value="SOLD">{ar ? 'مباع' : 'Sold'}</option>
                            </select>
                            <input type="number" value={u.price ?? ''} onChange={(e) => updateUnit(f.id, u.id, { price: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder={ar ? 'السعر' : 'Price'} className="w-24 rounded border border-border bg-card px-2 py-1 text-xs" />
                            <input type="number" step="0.1" value={u.area ?? ''} onChange={(e) => updateUnit(f.id, u.id, { area: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder={ar ? 'م²' : 'sqm'} className="w-16 rounded border border-border bg-card px-2 py-1 text-xs" />
                            <input type="number" value={u.rooms ?? ''} onChange={(e) => updateUnit(f.id, u.id, { rooms: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder={ar ? 'غرف' : 'rooms'} className="w-14 rounded border border-border bg-card px-2 py-1 text-xs" />
                            <button onClick={() => removeUnit(f.id, u.id)} className="ml-auto text-[11px] text-red-500 hover:underline">✕</button>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/**
 * Bridges R3F surface clicks (on the model) into hotspot additions.
 * Listens for the canvas-level click payload dispatched from a click-capture
 * plane rendered inside CanvasRoot via the translate layer below.
 */
function CeoPickTranslator({ ar }: { ar: boolean }) {
  void ar
  const [hint, setHint] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setHint(false), 5000)
    return () => clearTimeout(t)
  }, [])
  return hint ? (
    <div className="absolute inset-x-0 top-2 z-10 mx-auto max-w-sm rounded-xl bg-estate-gold/95 px-4 py-2 text-center text-xs font-bold text-[#0F1A2C] shadow-lg">
      {ar ? 'كبس على المجسم تضيف نقطة — وانت في وضع التثبيت' : 'Click the model to drop a hotspot — placing mode is ON'}
    </div>
  ) : null
}
