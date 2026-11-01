'use client'

import Link from 'next/link'
import nextDynamic from 'next/dynamic'
import { useEffect, useState, useCallback } from 'react'

import { useLanguage } from '@/lib/language-context'
import type { PublicModel3D, Hotspot3D } from '@/lib/models3d'

/**
 * Public 3D experience shell. Three never touches this chunk: canvas-root
 * (the R3F subtree) is loaded lazily behind `ssr:false` and skipped entirely
 * when the device has no WebGL — exactly one bundle policy, nothing blocks
 * the page, and static fallback images always render first for fallbacks.
 */
const CanvasRoot = nextDynamic(() => import('./canvas-root'), {
  ssr: false,
  loading: () => null,
})

const FALLBACK_PLACEMENT =
  'absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-[#0d1526] to-[#050914] text-white'

function hasWebGL(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}
function statusColors(s: string): { dot: string; text: string; ar: string; en: string } {
  if (s === 'SOLD') return { dot: 'bg-gray-400', text: 'text-gray-300', ar: 'مباع', en: 'Sold' }
  if (s === 'RESERVED') return { dot: 'bg-amber-400', text: 'text-amber-200', ar: 'محجوز', en: 'Reserved' }
  return { dot: 'bg-emerald-400', text: 'text-emerald-200', ar: 'متاح', en: 'Available' }
}

function fmtPrice(v: number, ar: boolean): string {
  return `${new Intl.NumberFormat(ar ? 'ar-EG' : 'en-US', { maximumFractionDigits: 0 }).format(v)} ${ar ? 'جنيه' : 'EGP'}`
}

function fmtArea(v: number, ar: boolean): string {
  return `${new Intl.NumberFormat(ar ? 'ar-EG' : 'en-US', { maximumFractionDigits: 1 }).format(v)} ${ar ? 'م²' : 'sqm'}`
}

interface SelectedRoom {
  kind: 'hotspot'
  hotspot: Hotspot3D
}
interface SelectedUnit {
  kind: 'unit'
  unit: { id: string; label: string; status: string; price?: number; area?: number; rooms?: number; unitId?: string; floorNameAr: string; floorNameEn: string }
}
type Selection = SelectedRoom | SelectedUnit | null

interface PanelBaseProps {
  ar: boolean
  onDismiss: () => void
}

function RoomPanel({ hotspot, ar, onDismiss }: { hotspot: Hotspot3D } & PanelBaseProps) {
  const label = ar ? hotspot.labelAr : hotspot.labelEn
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0e1930]/95 p-4 shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-estate-gold">{ar ? 'غرفة' : 'Room'}</p>
          <h3 className="mt-0.5 font-display text-lg font-bold text-white">{label}</h3>
        </div>
        <button onClick={onDismiss} aria-label={ar ? 'اقفل' : 'Close'} className="text-gray-500 transition-colors hover:text-white">✕</button>
      </div>
      <div className="mt-3 space-y-1.5 text-sm text-gray-300">
        {hotspot.area ? <p>📐 {ar ? 'المساحة:' : 'Area:'} {fmtArea(hotspot.area, ar)}</p> : null}
        {hotspot.dimsAr || hotspot.dimsEn ? (
          <p>📏 {ar ? 'الأبعاد:' : 'Dimensions:'} {ar ? hotspot.dimsAr : hotspot.dimsEn || hotspot.dimsAr}</p>
        ) : null}
        {(ar ? hotspot.noteAr : hotspot.noteEn) || hotspot.noteEn || hotspot.noteAr ? (
          <p className="leading-relaxed text-gray-400">{ar ? hotspot.noteAr : hotspot.noteEn || hotspot.noteAr}</p>
        ) : null}
      </div>
    </div>
  )
}

function UnitPanel({ unit, ar, onDismiss }: { unit: SelectedUnit['unit'] } & PanelBaseProps) {
  const sc = statusColors(unit.status)
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0e1930]/95 p-4 shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-estate-gold">
            {ar ? 'الطابق:' : 'Floor:'} {ar ? unit.floorNameAr : unit.floorNameEn}
          </p>
          <h3 className="mt-0.5 font-display text-lg font-bold text-white">{unit.label}</h3>
        </div>
        <button onClick={onDismiss} aria-label={ar ? 'اقفل' : 'Close'} className="text-gray-500 transition-colors hover:text-white">✕</button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 ${sc.text}`}>
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${sc.dot}`} />
          {ar ? sc.ar : sc.en}
        </span>
        {unit.price ? <span className="rounded-full bg-white/5 px-2.5 py-1 text-gray-200">💰 {fmtPrice(unit.price, ar)}</span> : null}
        {unit.area ? <span className="rounded-full bg-white/5 px-2.5 py-1 text-gray-200">📐 {fmtArea(unit.area, ar)}</span> : null}
        {unit.rooms ? <span className="rounded-full bg-white/5 px-2.5 py-1 text-gray-200">🛏 {unit.rooms} {ar ? 'غرف' : 'rooms'}</span> : null}
      </div>
      {unit.unitId ? (
        <Link
          href={`/units/${unit.unitId}`}
          className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-full bg-estate-gold px-5 text-sm font-bold text-[#0F1A2C] transition-colors hover:bg-estate-gold-dark"
        >
          {ar ? 'افتح تفاصيل الوحدة' : 'Open unit details'}
        </Link>
      ) : null}
    </div>
  )
}

export default function Model3DViewerRoot({ model }: { model: PublicModel3D }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  // Two-pass WebGL detection: SSR renders the fallback branch, the client
  // re-decides after mount — no hydration mismatch (React #418/#423).
  const [webgl, setWebgl] = useState(false)
  useEffect(() => setWebgl(hasWebGL()), [])
  const [night, setNight] = useState(false)
  const [walk, setWalk] = useState(false)
  const [selection, setSelection] = useState<Selection>(null)
  const [activeFloor, setActiveFloor] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [loadError, setLoadError] = useState(false)

  const label = ar ? model.labelAr || model.labelEn || '' : model.labelEn || model.labelAr || ''

  useEffect(() => {
    const onProg = (e: Event) => setProgress(Math.min(100, Math.round(((e as CustomEvent<{ p: number }>).detail?.p || 0) * 100)))
    window.addEventListener('m3d-progress', onProg)
    const onErr = () => setLoadError(true)
    window.addEventListener('m3d-load-error', onErr)
    // Belt-and-braces: a stalled loader must never trap the visitor behind
    // the veil — any real failure surfaces through the error strip instead.
    const bailout = setTimeout(() => setProgress((p) => (p === null || p < 100 ? 100 : p)), 25_000)
    return () => {
      window.removeEventListener('m3d-progress', onProg)
      window.removeEventListener('m3d-load-error', onErr)
      clearTimeout(bailout)
    }
  }, [])

  // Exit walk mode when the panel opens a room (keyboard handoff is confusing).
  useEffect(() => {
    if (walk && selection) {
      window.dispatchEvent(new CustomEvent('m3d-exit-walk'))
    }
  }, [selection, walk])

  const floors = model.floors
  const demo = !model.hasRealModel || loadError

  const zoom = useCallback((dir: 1 | -1) => {
    window.dispatchEvent(new CustomEvent('m3d-zoom', { detail: dir }))
  }, [])

  const fallbackImage = model.fallbackImageUrl

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#050914]" dir={ar ? 'rtl' : 'ltr'}>
      {/* Top bar */}
      <header className="pointer-events-none z-20 flex items-start justify-between gap-3 p-4">
        <div className="pointer-events-auto max-w-[70%] rounded-2xl border border-white/10 bg-[#0e1930]/90 px-4 py-3 backdrop-blur">
          <p className="text-[11px] uppercase tracking-[0.2em] text-estate-gold">GHAYA · 3D</p>
          <h1 className="font-display text-base font-bold text-white sm:text-lg">{label}</h1>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            onClick={() => setNight((v) => !v)}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-[#0e1930]/90 text-lg backdrop-blur transition-colors hover:border-estate-gold/50"
            aria-label={ar ? (night ? 'نهار' : 'ليل') : night ? 'Day light' : 'Night light'}
            title={ar ? (night ? 'إضاءة النهار' : 'إضاءة الليل') : night ? 'Day light' : 'Night light'}
          >
            {night ? '☀️' : '🌙'}
          </button>
          <Link
            href="/"
            className="flex h-11 items-center rounded-full border border-white/10 bg-[#0e1930]/90 px-4 text-sm font-semibold text-gray-200 backdrop-blur transition-colors hover:border-estate-gold/50 hover:text-white"
          >
            {ar ? 'رجوع' : 'Back'}
          </Link>
        </div>
      </header>

      {/* Canvas / fallback */}
      <div className="relative flex-1">
        {webgl ? (
          <CanvasRoot
            model={model}
            night={night}
            walk={walk}
            activeFloor={activeFloor}
            onSelectHotspot={(h: Hotspot3D) => setSelection({ kind: 'hotspot', hotspot: h })}
            onSelectUnit={(u: SelectedUnit['unit']) => setSelection({ kind: 'unit', unit: u })}
          />
        ) : (
          <div className={FALLBACK_PLACEMENT}>
            {fallbackImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fallbackImage} alt={label} className="absolute inset-0 h-full w-full object-cover opacity-70" />
            ) : null}
            <p className="relative z-10 rounded-full bg-[#0e1930]/90 px-4 py-2 text-sm text-gray-300">
              {ar ? 'المتصفح ده مش بيدعم 3D — دي صورة المكان بداله' : 'This browser does not support 3D — showing the photo instead'}
            </p>
          </div>
        )}

        {/* Loading veil */}
        {webgl && progress !== null && progress < 100 && !loadError ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#050914]/85">
            <div className="text-center">
              <div className="mx-auto h-12 w-12 rounded-full border-2 border-estate-gold/30 border-t-estate-gold animate-spin" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-gray-200">{ar ? 'جاري تحميل المجسم…' : 'Loading the 3D model…'}</p>
              <p className="mt-1 text-xs text-gray-500">{ar ? 'انضاف جديد؟ سطوره هتظهر هنا' : ''}{Math.min(progress, 99)}%</p>
            </div>
          </div>
        ) : null}

        {loadError ? (
          <div className="absolute inset-x-0 top-4 z-20 mx-auto max-w-md">
            <p className="rounded-2xl border border-amber-400/30 bg-[#0e1930]/95 px-4 py-3 text-center text-sm text-amber-200 backdrop-blur">
              {ar ? 'المجسم محملش كامل — جرب تحديث الصفحة أو عايز صور بتاعت المشروع' : 'The model could not load fully — refresh, or browse the project photos'}
            </p>
          </div>
        ) : null}

        {/* Demo disclosure — never removable while no real architectural model exists */}
        {demo ? (
          <div className="absolute inset-x-0 bottom-24 z-20 mx-auto max-w-lg px-4 sm:bottom-4">
            <p className="rounded-2xl border border-estate-gold/40 bg-[#0e1930]/95 px-4 py-3 text-center text-sm font-semibold text-estate-gold backdrop-blur">
              ⚠️ {ar ? 'عينة توضيحية معمارية — مش مجسم وحدة حقيقية من الكتالوج' : 'Illustrative demo scene — not a real catalog unit model'}
            </p>
          </div>
        ) : null}

        {/* Selection panel — bottom sheet on mobile, right card on desktop */}
        {selection ? (
          <div className="absolute inset-x-0 bottom-0 z-30 p-4 sm:inset-y-0 sm:left-auto sm:right-6 sm:flex sm:items-center sm:p-0">
            <div className="mx-auto w-full max-w-sm sm:mx-0">
              {selection.kind === 'hotspot' ? (
                <RoomPanel hotspot={selection.hotspot} ar={ar} onDismiss={() => setSelection(null)} />
              ) : (
                <UnitPanel unit={selection.unit} ar={ar} onDismiss={() => setSelection(null)} />
              )}
            </div>
          </div>
        ) : null}

        {/* Controls strip — orbit/walk + zoom, floating bottom-center */}
        <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center p-4">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-[#0e1930]/95 px-2 py-2 backdrop-blur">
            <button
              onClick={() => setWalk(false)}
              className={`min-h-[44px] rounded-full px-4 text-sm font-semibold transition-colors ${!walk ? 'bg-estate-gold text-[#0F1A2C]' : 'text-gray-300 hover:text-white'}`}
            >
              🛰 {ar ? 'لف حواليك' : 'Orbit'}
            </button>
            <button
              onClick={() => setWalk(true)}
              className={`min-h-[44px] rounded-full px-4 text-sm font-semibold transition-colors ${walk ? 'bg-estate-gold text-[#0F1A2C]' : 'text-gray-300 hover:text-white'}`}
            >
              🚶 {ar ? 'تمشّى جوه' : 'Walk'}
            </button>
            <span aria-hidden="true" className="mx-1 h-6 w-px bg-white/10" />
            <button onClick={() => zoom(-1)} aria-label={ar ? 'قرّب' : 'Zoom in'} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/5 text-lg text-gray-200 hover:bg-white/10">＋</button>
            <button onClick={() => zoom(1)} aria-label={ar ? 'بعّد' : 'Zoom out'} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/5 text-lg text-gray-200 hover:bg-white/10">－</button>
          </div>
        </div>

        {/* Floor chips (BUILDING) */}
        {floors.length > 0 ? (
          <div className="absolute inset-x-0 top-[76px] z-10 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
            <div className="mx-auto flex w-max max-w-full items-center gap-2 sm:mx-0 sm:w-auto">
              <button
                onClick={() => setActiveFloor(null)}
                className={`min-h-[40px] shrink-0 rounded-full px-4 text-xs font-bold backdrop-blur transition-colors ${!activeFloor ? 'bg-estate-gold text-[#0F1A2C]' : 'border border-white/10 bg-[#0e1930]/85 text-gray-300'}`}
              >
                {ar ? 'كل الطوابق' : 'All floors'}
              </button>
              {floors.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setActiveFloor(f.id === activeFloor ? null : f.id)}
                  className={`min-h-[40px] shrink-0 rounded-full px-4 text-xs font-bold backdrop-blur transition-colors ${f.id === activeFloor ? 'bg-estate-gold text-[#0F1A2C]' : 'border border-white/10 bg-[#0e1930]/85 text-gray-300 hover:text-white'}`}
                >
                  {ar ? f.nameAr : f.nameEn}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* Legend + status hint (BUILDING) */}
      {floors.length > 0 ? (
        <footer className="z-10 flex flex-wrap items-center justify-center gap-3 border-t border-white/5 bg-[#050914]/90 px-4 py-2 text-[11px] text-gray-400 sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-400" />{ar ? 'متاح' : 'Available'}</span>
            <span className="flex items-center gap-1"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-400" />{ar ? 'محجوز' : 'Reserved'}</span>
            <span className="flex items-center gap-1"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-gray-400" />{ar ? 'مباع' : 'Sold'}</span>
          </div>
          <span className="hidden sm:block">{ar ? 'اضغط أي وحدة من المنظر لتشوف تفاصيلها' : 'Tap any unit in the scene to view its details'}</span>
        </footer>
      ) : null}
    </div>
  )
}
