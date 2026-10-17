'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { MapPin, Maximize2 } from 'lucide-react'
import { useLanguage } from '@/lib/language-context'
import { formatEGP } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface MapPin {
  id: string
  slug: string
  name: string
  nameArabic?: string | null
  startPrice?: number | null
  lat: number
  lng: number
  precision: 'exact' | 'city'
  city?: { name: string; nameArabic?: string | null; nameSlug?: string | null } | null
}

interface ProjectsListingMapProps {
  searchParams: Record<string, string | undefined>
}

const EGYPT_CENTER: [number, number] = [30.0444, 31.2357]
const EGYPT_ZOOM = 6

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function getL(): any {
  return typeof window !== 'undefined' ? (window as any).L : null
}

/**
 * Map view for the /projects listing — same List/Map toggle as the mobile
 * Explore tab. Pins come from GET /api/projects/map with the listing's own
 * filters, so the map and the list always show the same corpus.
 *
 * Leaflet loads from CDN at runtime (same pattern as
 * src/components/projects/projects-map.tsx): no npm import, no
 * next/dynamic, nothing for SSR to choke on — the server renders a plain
 * container div. `exact` pins are full gold price pills; `city` (centroid
 * fallback) pins are dimmed and labelled with their city.
 */
export function ProjectsListingMap({ searchParams }: ProjectsListingMapProps) {
  const { lang } = useLanguage()
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const markersLayerRef = useRef<any>(null)
  const [pins, setPins] = useState<MapPin[]>([])
  const [coverage, setCoverage] = useState<{ matched: number; skipped: number } | null>(null)
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')

  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: '100' })
    for (const key of [
      'q',
      'governorate',
      'city',
      'district',
      'propertyType',
      'listingType',
      'minPrice',
      'maxPrice',
      'minArea',
      'maxArea',
      'bedrooms',
      'bathrooms',
      'status',
      'developer',
      'amenities',
    ] as const) {
      if (searchParams[key]) params.set(key, searchParams[key]!)
    }
    return params.toString()
  }, [searchParams])

  const fetchPins = useCallback(() => {
    setStatus('loading')
    fetch(`/api/projects/map?${query}`)
      .then((r) => {
        if (!r.ok) throw new Error(`map fetch failed (${r.status})`)
        return r.json()
      })
      .then((d) => {
        setPins(Array.isArray(d.pins) ? d.pins : [])
        setCoverage({
          matched: typeof d.matched === 'number' ? d.matched : Array.isArray(d.pins) ? d.pins.length : 0,
          skipped: typeof d.skipped === 'number' ? d.skipped : 0,
        })
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
  }, [query])

  useEffect(() => {
    fetchPins()
  }, [fetchPins])

  // Load Leaflet from CDN (build-safe: no SSR import, plain <script> at runtime)
  const [leafletReady, setLeafletReady] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (getL()) {
      setLeafletReady(true)
      return
    }
    if (!document.querySelector('link[href*="leaflet"]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }
    const existing = document.querySelector('script[src*="leaflet"]')
    if (existing) {
      existing.addEventListener('load', () => setLeafletReady(true))
      return
    }
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => {
      if (!document.getElementById('listing-map-pin-styles')) {
        const style = document.createElement('style')
        style.id = 'listing-map-pin-styles'
        style.textContent = `
          .listing-pin { background: none !important; border: none !important; }
          .listing-pill { display: inline-block; white-space: nowrap; font-size: 11px; font-weight: 700;
            padding: 4px 10px; border-radius: 999px; box-shadow: 0 2px 8px rgba(0,0,0,0.25);
            border: 2px solid white; }
          .listing-pill-exact { background: #D4A843; color: #0F1A2C; }
          .listing-pill-city { background: rgba(148,163,184,0.92); color: white; opacity: 0.75; }
          .leaflet-popup-content-wrapper { border-radius: 12px !important; box-shadow: 0 8px 24px rgba(0,0,0,0.15) !important; }
          .leaflet-popup-content { margin: 12px 14px !important; line-height: 1.4 !important; }
          .leaflet-control-attribution { font-size: 9px !important; }
          .dark .leaflet-popup-content-wrapper { background: #0A0A0A !important; color: #f5f5f5 !important; border: 1px solid #262626 !important; box-shadow: 0 8px 24px rgba(0,0,0,0.5) !important; }
          .dark .leaflet-popup-tip { background: #0A0A0A !important; box-shadow: 2px 2px 4px rgba(0,0,0,0.4) !important; }
          .dark .leaflet-popup-close-button { color: #a3a3a3 !important; }
          .dark .leaflet-popup-close-button:hover { color: #D4A843 !important; }
          .dark .leaflet-control-attribution { background: rgba(0,0,0,0.7) !important; color: #a3a3a3 !important; }
          .dark .leaflet-control-attribution a { color: #D4A843 !important; }
        `
        document.head.appendChild(style)
      }
      setLeafletReady(true)
    }
    script.onerror = () => setStatus('error')
    document.body.appendChild(script)
  }, [])

  // Init map once
  useEffect(() => {
    if (!leafletReady || !mapRef.current || mapInstanceRef.current) return
    const L = getL()
    if (!L) return
    const dark = document.documentElement.classList.contains('dark')
    const map = L.map(mapRef.current, {
      center: EGYPT_CENTER,
      zoom: EGYPT_ZOOM,
      minZoom: 5,
      maxZoom: 18,
      scrollWheelZoom: true,
      maxBounds: [[18, 20], [35, 40]],
      maxBoundsViscosity: 0.8,
    })
    const tiles: Record<'standard' | 'dark', any> = {
      standard: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap', maxZoom: 19 }),
      // Dark: Esri dark-gray canvas (labeled reference map), NOT CartoDB
      // dark_all — dark_all is near-black at Egypt-wide zooms (desert + sea
      // carry almost no features), so the map read as pitch black with no
      // streets/labels. Same Esri host family as the satellite layer and
      // covered by CSP img-src https:, so no policy change is needed.
      dark: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { attribution: '&copy; Esri', maxZoom: 19 }),
    }
    const initial = dark ? 'dark' : 'standard'
    tiles[initial].addTo(map)
    markersLayerRef.current = L.layerGroup().addTo(map)
    mapInstanceRef.current = { map, tiles, current: initial }
    const resize = () => setTimeout(() => map.invalidateSize(), 100)
    window.addEventListener('resize', resize)
    map.whenReady(() => map.invalidateSize())
    return () => {
      window.removeEventListener('resize', resize)
      map.remove()
      mapInstanceRef.current = null
      markersLayerRef.current = null
    }
  }, [leafletReady])

  // Paint pins (re-runs when pins or language change)
  useEffect(() => {
    const inst = mapInstanceRef.current
    const layer = markersLayerRef.current
    const L = getL()
    if (!inst?.map || !layer || !L) return
    layer.clearLayers()
    pins.forEach((p) => {
      const exact = p.precision === 'exact'
      const label = p.startPrice
        ? escapeHtml(formatEGP(p.startPrice))
        : escapeHtml(p.city?.nameArabic || p.city?.name || (lang === 'ar' ? 'مشروع' : 'Project'))
      const cityTag = !exact && p.city ? `<div style="font-size:9px;font-weight:600;opacity:0.9;">${escapeHtml(p.city.nameArabic || p.city.name)}</div>` : ''
      const icon = L.divIcon({
        className: 'listing-pin',
        html: `<div style="text-align:center;"><span class="listing-pill ${exact ? 'listing-pill-exact' : 'listing-pill-city'}">${label}</span>${cityTag}</div>`,
        iconSize: undefined,
      })
      const marker = L.marker([p.lat, p.lng], { icon })
      const safeName = escapeHtml(lang === 'ar' ? p.nameArabic || p.name : p.name)
      const priceLine = p.startPrice ? `<div style="font-size:13px;font-weight:700;color:#B8923A;margin:4px 0;">${escapeHtml(formatEGP(p.startPrice))}</div>` : ''
      const approxLine = !exact
        ? `<div style="font-size:10px;color:#9ca3af;">${lang === 'ar' ? 'مكان تقريبي للمنطقة' : 'Approximate area location'}</div>`
        : ''
      marker.bindPopup(
        `<div style="min-width:160px;"><div style="font-size:13px;font-weight:700;">${safeName}</div>${priceLine}${approxLine}` +
          `<a href="/projects/${escapeHtml(p.slug)}" style="display:inline-block;margin-top:8px;padding:10px 18px;min-height:44px;line-height:24px;background:#D4A843;color:#0F1A2C;border-radius:8px;font-size:12px;font-weight:600;text-decoration:none;">` +
          `${lang === 'ar' ? 'عرض المشروع' : 'View project'}</a></div>`
      )
      layer.addLayer(marker)
    })
    if (pins.length > 0) {
      const bounds = L.latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number]))
      inst.map.fitBounds(bounds.pad(0.25), { maxZoom: 12 })
    } else {
      inst.map.setView(EGYPT_CENTER, EGYPT_ZOOM)
    }
  }, [pins, lang])

  // Follow the live theme: swap OSM <-> Esri dark-gray tiles in place
  // (MutationObserver on the `dark` class) without remounting the map.
  useEffect(() => {
    if (!leafletReady) return
    const applyTheme = () => {
      const inst = mapInstanceRef.current
      if (!inst?.map || !inst.tiles) return
      const want = document.documentElement.classList.contains('dark') ? 'dark' : 'standard'
      if (inst.current === want || !inst.tiles[want]) return
      inst.map.removeLayer(inst.tiles[inst.current])
      inst.tiles[want].addTo(inst.map)
      inst.current = want
    }
    applyTheme()
    const obs = new MutationObserver(applyTheme)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [leafletReady])

  const resetView = useCallback(() => {
    mapInstanceRef.current?.map?.setView(EGYPT_CENTER, EGYPT_ZOOM)
  }, [])

  const ar = lang === 'ar'

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-full bg-estate-gold/10 px-3 py-1">
          <span className="text-xs font-bold text-estate-gold">{pins.length}</span>
          <span className="text-[10px] text-estate-gold/70">{ar ? 'علامة على الخريطة' : 'pins on the map'}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-estate-gold" />
          {ar ? 'مكان المشروع بالظبط' : 'Exact location'}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-400 opacity-60" />
          {ar ? 'مكان تقريبي للمنطقة' : 'Approximate area'}
        </div>
        <div className="flex-1" />
        <button
          onClick={resetView}
          className="flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-estate-gold hover:text-estate-gold md:min-h-0"
        >
          <Maximize2 className="h-3 w-3" />
          {ar ? 'مصر' : 'Egypt'}
        </button>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-[#262626] dark:bg-black">
        {status === 'loading' ? (
          <div className="flex h-[320px] items-center justify-center sm:h-[480px]">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-estate-gold border-t-transparent" />
              <p className="text-sm text-muted-foreground">{ar ? 'بنحمّل الخريطة…' : 'Loading the map…'}</p>
            </div>
          </div>
        ) : null}

        {status === 'error' ? (
          <div className="flex h-[320px] flex-col items-center justify-center gap-3 text-center sm:h-[480px]">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 dark:bg-[#0A0A0A] dark:border dark:border-[#262626]">
              <MapPin className="h-6 w-6 text-gray-300 dark:text-[#737373]" />
            </div>
            <p className="text-sm font-semibold">{ar ? 'الخريطة مش راضية تحمّل' : 'The map failed to load'}</p>
            <button
              onClick={fetchPins}
              className="inline-flex min-h-[44px] items-center rounded-full bg-estate-gold px-4 py-2 text-sm font-medium text-[#0F1A2C] hover:bg-estate-gold-dark md:min-h-0"
            >
              {ar ? 'حاول تاني' : 'Try again'}
            </button>
          </div>
        ) : null}

        <div ref={mapRef} className={cn('z-0 h-[320px] sm:h-[480px]', status !== 'ready' && 'hidden')} />

        {status === 'ready' && pins.length === 0 ? (
          <div className="flex h-[320px] flex-col items-center justify-center gap-2 text-center sm:h-[480px]">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 dark:bg-[#0A0A0A] dark:border dark:border-[#262626]">
              <MapPin className="h-6 w-6 text-gray-300 dark:text-[#737373]" />
            </div>
            <h3 className="text-base font-semibold">{ar ? 'مفيش علامات على الخريطة' : 'No pins on the map'}</h3>
            <p className="max-w-sm text-sm text-gray-500">
              {ar ? 'مفيش مشاريع ليها موقع بالفلاتر دي — امسح الفلاتر وجرّب تاني.' : 'No projects have a location with these filters — clear them and try again.'}
            </p>
            <Link
              href="/projects"
              className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-estate-gold px-4 py-2 text-sm font-medium text-[#0F1A2C] hover:bg-estate-gold-dark md:min-h-0"
            >
              {ar ? 'امسح كل الفلاتر' : 'Clear all filters'}
            </Link>
          </div>
        ) : null}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {ar ? 'دوس على أي علامة عشان تفتح صفحة المشروع' : 'Tap any pin to open its project page'}
        {status === 'ready' && coverage && coverage.skipped > 0 ? (
          <span className="ms-2">
            {ar
              ? `(${pins.length} من ${coverage.matched} مشروع ليهم موقع على الخريطة)`
              : `(${pins.length} of ${coverage.matched} projects have map locations)`}
          </span>
        ) : null}
      </p>
    </div>
  )
}
