'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { MapPin, ArrowUpRight, X, Maximize2, Search } from 'lucide-react'
import { useLanguage } from '@/lib/language-context'
import { formatEGP } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Project {
  id: string
  name: string
  nameArabic?: string | null
  slug: string
  coverImage?: string | null
  latitude?: number | null
  longitude?: number | null
  startPrice?: number | null
  status: string
  propertyTypes: string
  city?: { name: string; nameArabic?: string | null; nameSlug?: string } | null
  developer?: { companyName: string } | null
}

const statusColors: Record<string, string> = {
  AVAILABLE: '#22c55e',
  UNDER_CONSTRUCTION: '#3b82f6',
  COMING_SOON: '#a855f7',
  DELIVERED: '#6b7280',
  SOLD_OUT: '#ef4444',
}

const statusLabelsAr: Record<string, string> = {
  AVAILABLE: 'متاح',
  UNDER_CONSTRUCTION: 'تحت الإنشاء',
  COMING_SOON: 'قريباً',
  DELIVERED: 'تم التسليم',
  SOLD_OUT: ' SOLD OUT',
}

const EGYPT_CENTER: [number, number] = [30.0444, 31.2357]
const EGYPT_ZOOM = 6

const GOVERNORATES = [
  { name: 'Cairo', nameAr: 'القاهرة', lat: 30.0444, lng: 31.2357 },
  { name: 'Giza', nameAr: 'الجيزة', lat: 30.0131, lng: 31.2089 },
  { name: 'Alexandria', nameAr: 'الإسكندرية', lat: 31.2001, lng: 29.9187 },
  { name: 'New Capital', nameAr: 'العاصمة الإدارية', lat: 30.0273, lng: 31.7533 },
  { name: 'New Cairo', nameAr: 'القاهرة الجديدة', lat: 30.0286, lng: 31.4697 },
  { name: 'Sheikh Zayed', nameAr: 'الشيخ زايد', lat: 30.0740, lng: 31.0126 },
  { name: '6th October', nameAr: '6 أكتوبر', lat: 29.9719, lng: 31.0103 },
  { name: 'Ain Sokhna', nameAr: 'العين السخنة', lat: 29.6000, lng: 32.3500 },
  { name: 'North Coast', nameAr: 'الساحل الشمالي', lat: 30.8575, lng: 29.0500 },
  { name: 'Luxor', nameAr: 'الأقصر', lat: 25.6872, lng: 32.6396 },
  { name: 'Aswan', nameAr: 'أسوان', lat: 24.0889, lng: 32.8998 },
  { name: 'Hurghada', nameAr: 'الغردقة', lat: 27.2579, lng: 33.8116 },
  { name: 'Sharm El Sheikh', nameAr: 'شرم الشيخ', lat: 27.9158, lng: 34.3300 },
  { name: 'Marsa Matrouh', nameAr: 'مطروح', lat: 31.3543, lng: 27.2453 },
  { name: 'Sohag', nameAr: 'سوهاج', lat: 26.5560, lng: 31.6949 },
  { name: 'Minya', nameAr: 'المنيا', lat: 28.1099, lng: 30.7503 },
  { name: 'Fayoum', nameAr: 'الفيوم', lat: 29.3100, lng: 30.8418 },
  { name: 'Qena', nameAr: 'قنا', lat: 26.1551, lng: 32.7269 },
  { name: 'Ismailia', nameAr: 'الإسماعيلية', lat: 30.5965, lng: 32.2715 },
  { name: 'Port Said', nameAr: 'بورسعيد', lat: 31.2653, lng: 32.3019 },
  { name: 'Suez', nameAr: 'السويس', lat: 29.9668, lng: 32.5498 },
  { name: 'Damanhur', nameAr: 'دمنهور', lat: 31.0359, lng: 30.4675 },
  { name: 'Tanta', nameAr: 'طنطا', lat: 30.7865, lng: 31.0004 },
  { name: 'Zagazig', nameAr: 'الزقازيق', lat: 30.5877, lng: 31.5020 },
  { name: 'Mansoura', nameAr: 'المنصورة', lat: 31.3797, lng: 31.6974 },
  { name: 'Assiut', nameAr: 'أسيوط', lat: 27.1809, lng: 31.1837 },
]

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function getL(): any {
  return typeof window !== 'undefined' ? (window as any).L : null
}

export function ProjectsMap({ className }: { className?: string }) {
  const { lang } = useLanguage()
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const markersLayerRef = useRef<any>(null)
  const cityMarkersRef = useRef<any>(null)
  const govDropdownRef = useRef<HTMLDivElement>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [selected, setSelected] = useState<Project | null>(null)
  const [isMapReady, setIsMapReady] = useState(false)
  const [showGovList, setShowGovList] = useState(false)
  const [govSearch, setGovSearch] = useState('')
  const [mapStyle, setMapStyle] = useState<'standard' | 'satellite' | 'dark'>('standard')
  const [loadError, setLoadError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const styleRef = useRef<'standard' | 'satellite' | 'dark'>('standard')

  // Load Leaflet from CDN
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (getL()) {
      setIsMapReady(true)
      return
    }

    const existingLink = document.querySelector('link[href*="leaflet"]')
    if (!existingLink) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }

    const existingScript = document.querySelector('script[src*="leaflet"]')
    if (existingScript) {
      existingScript.addEventListener('load', () => setIsMapReady(true))
      return
    }

    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => {
      const style = document.createElement('style')
      style.id = 'leaflet-estateai-styles'
      style.textContent = `
        @keyframes pulse-ring {
          0% { transform: scale(0.8); opacity: 0.3; }
          50% { transform: scale(1.5); opacity: 0; }
          100% { transform: scale(0.8); opacity: 0.3; }
        }
        .custom-marker, .city-marker { background: none !important; border: none !important; }
        .city-tooltip {
          background: white !important;
          border: none !important;
          border-radius: 8px !important;
          padding: 4px 8px !important;
          font-size: 11px !important;
          font-weight: 600 !important;
          color: #374151 !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.12) !important;
        }
        .city-tooltip::before { border-top-color: white !important; }
        .dark .city-tooltip {
          background: #0A0A0A !important;
          color: #f5f5f5 !important;
          border: 1px solid rgba(212,168,67,0.4) !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5) !important;
        }
        .dark .city-tooltip::before { border-top-color: #0A0A0A !important; }
        .lp-title { font-size: 14px !important; font-weight: 700 !important; color: #111827 !important; margin-bottom: 6px !important; }
        .lp-dev { font-size: 10px !important; color: #94a3b8 !important; margin-bottom: 2px !important; }
        .lp-city { display: flex !important; align-items: center !important; gap: 4px !important; font-size: 11px !important; color: #6b7280 !important; margin-bottom: 6px !important; }
        .lp-price { font-size: 13px !important; font-weight: 700 !important; color: #D4A843 !important; }
        .dark .lp-title { color: #fafafa !important; }
        .dark .lp-dev { color: #a3a3a3 !important; }
        .dark .lp-city { color: #d4d4d4 !important; }
        .leaflet-popup-content-wrapper {
          border-radius: 12px !important;
          box-shadow: 0 8px 24px rgba(0,0,0,0.15) !important;
          padding: 0 !important;
        }
        .dark .leaflet-popup-content-wrapper {
          background: #0A0A0A !important;
          color: #f5f5f5 !important;
          border: 1px solid #262626 !important;
          box-shadow: 0 8px 24px rgba(0,0,0,0.5) !important;
        }
        .dark .leaflet-popup-tip { background: #0A0A0A !important; box-shadow: none !important; }
        .leaflet-popup-content { margin: 0 !important; width: 240px !important; }
        .leaflet-popup-tip { box-shadow: none !important; }
        .leaflet-popup-close-button {
          position: absolute !important;
          top: 8px !important;
          right: 8px !important;
          z-index: 10 !important;
          width: 24px !important;
          height: 24px !important;
          line-height: 24px !important;
          font-size: 14px !important;
          color: #6b7280 !important;
          background: rgba(255,255,255,0.9) !important;
          border-radius: 50% !important;
          text-align: center !important;
          padding: 0 !important;
        }
        .leaflet-popup-close-button:hover { color: #1f2937 !important; background: white !important; }
        .leaflet-control-zoom {
          border: none !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1) !important;
          border-radius: 10px !important;
          overflow: hidden;
        }
        .leaflet-control-zoom a {
          width: 34px !important;
          height: 34px !important;
          line-height: 34px !important;
          font-size: 16px !important;
          color: #374151 !important;
        }
        .leaflet-control-zoom a:hover { background: #f3f4f6 !important; color: #D4A843 !important; }
        .dark .leaflet-control-zoom a { background: #0A0A0A !important; color: #e5e5e5 !important; }
        .dark .leaflet-control-zoom a:hover { background: #262626 !important; color: #D4A843 !important; }
        .dark .leaflet-control-zoom-in { border-bottom: 1px solid #262626 !important; }
        .dark .leaflet-popup-close-button { color: #a3a3a3 !important; background: rgba(10,10,10,0.9) !important; }
        .dark .leaflet-popup-close-button:hover { color: #D4A843 !important; background: #0A0A0A !important; }
        .dark .leaflet-control-attribution { background: rgba(0,0,0,0.7) !important; color: #a3a3a3 !important; }
        .dark .leaflet-control-attribution a { color: #D4A843 !important; }
        .leaflet-control-zoom-in { border-bottom: 1px solid #e5e7eb !important; }
        .leaflet-tile-pane { filter: saturate(1.1); }
        .leaflet-control-attribution { font-size: 9px !important; }
      `
      document.head.appendChild(style)
      setIsMapReady(true)
    }
    script.onerror = () => console.error('Failed to load Leaflet from CDN')
    document.body.appendChild(script)
  }, [])

  // Initialize map
  useEffect(() => {
    if (!isMapReady || !mapRef.current || mapInstanceRef.current) return
    const L = getL()
    if (!L) return

    const map = L.map(mapRef.current, {
      center: EGYPT_CENTER,
      zoom: EGYPT_ZOOM,
      minZoom: 5,
      maxZoom: 18,
      zoomControl: false,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      dragging: true,
      touchZoom: true,
      maxBounds: [[18, 20], [35, 40]],
      maxBoundsViscosity: 0.8,
    })

    L.control.zoom({ position: 'topright' }).addTo(map)

    const tiles: Record<string, any> = {
      standard: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }),
      satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; Esri',
        maxZoom: 18,
      }),
      // Dark: Esri dark-gray canvas (labeled reference map), NOT CartoDB
      // dark_all — dark_all is near-black at Egypt-wide zooms (desert + sea
      // carry almost no features), so the map read as pitch black with no
      // streets/labels. Same Esri host family as the satellite layer and
      // covered by CSP img-src https:, so no policy change is needed.
      dark: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; Esri',
        maxZoom: 19,
      }),
    }

    const initialLayer = (typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'standard') as 'standard' | 'dark'
    tiles[initialLayer].addTo(map)

    const markersLayer = L.layerGroup().addTo(map)
    const cityMarkers = L.layerGroup().addTo(map)

    mapInstanceRef.current = { map, tiles, currentLayer: initialLayer }
    styleRef.current = initialLayer
    setMapStyle(initialLayer)
    markersLayerRef.current = markersLayer
    cityMarkersRef.current = cityMarkers

    GOVERNORATES.forEach(gov => {
      const icon = L.divIcon({
        className: 'city-marker',
        html: `<div style="width:8px;height:8px;border-radius:50%;background:#94a3b8;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.2);"></div>`,
        iconSize: [8, 8],
        iconAnchor: [4, 4],
      })
      const marker = L.marker([gov.lat, gov.lng], { icon })
        .bindTooltip(lang === 'ar' ? gov.nameAr : gov.name, {
          permanent: false,
          direction: 'top',
          offset: [0, -6],
          className: 'city-tooltip',
        })
      cityMarkers.addLayer(marker)
    })

    const resizeHandler = () => setTimeout(() => map.invalidateSize(), 100)
    window.addEventListener('resize', resizeHandler)
    map.whenReady(() => map.invalidateSize())

    return () => {
      window.removeEventListener('resize', resizeHandler)
      map.remove()
      mapInstanceRef.current = null
      markersLayerRef.current = null
      cityMarkersRef.current = null
    }
  }, [isMapReady, lang])

  // Follow the live theme: swap OSM <-> Esri dark-gray tiles in place
  // without remounting the map. A manual satellite choice is respected
  // (theme flips only swap standard <-> dark).
  useEffect(() => {
    if (!isMapReady) return
    const applyTheme = () => {
      const inst = mapInstanceRef.current
      if (!inst?.map || !inst.tiles) return
      const want = document.documentElement.classList.contains('dark') ? 'dark' : 'standard'
      if (inst.currentLayer !== 'standard' && inst.currentLayer !== 'dark') return
      if (inst.currentLayer === want) return
      inst.map.removeLayer(inst.tiles[inst.currentLayer])
      inst.tiles[want].addTo(inst.map)
      inst.currentLayer = want
      styleRef.current = want
      setMapStyle(want)
    }
    applyTheme()
    const obs = new MutationObserver(applyTheme)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [isMapReady])

  // Fetch projects
  useEffect(() => {
    setLoadError(false)
    fetch('/api/projects')
      .then(r => r.json())
      .then(d => setProjects(d.projects || []))
      .catch(() => setLoadError(true))
  }, [retryKey])

  // Update project markers
  useEffect(() => {
    const map = mapInstanceRef.current?.map
    const layer = markersLayerRef.current
    const L = getL()
    if (!map || !layer || !L) return

    layer.clearLayers()

    const withCoords = projects.filter(p => p.latitude && p.longitude)

    withCoords.forEach(p => {
      const color = statusColors[p.status] || '#6b7280'
      const icon = L.divIcon({
        className: 'custom-marker',
        html: `
          <div style="position:relative;width:30px;height:30px;">
            <div style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:0.25;animation:pulse-ring 2s ease-out infinite;"></div>
            <div style="position:absolute;inset:3px;border-radius:50%;background:white;box-shadow:0 2px 8px rgba(0,0,0,0.2);"></div>
            <div style="position:absolute;inset:5px;border-radius:50%;background:${color};"></div>
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:7px;height:7px;border-radius:50%;background:white;opacity:0.8;"></div>
          </div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -19],
      })

      const marker = L.marker([p.latitude!, p.longitude!], { icon })

      const safeName = escapeHtml(p.nameArabic || p.name)
      const safeDev = escapeHtml(p.developer?.companyName || '')
      const safeCity = escapeHtml(p.city?.nameArabic || p.city?.name || '')
      const safeSlug = escapeHtml(p.slug)
      const safeStatus = escapeHtml(p.status.replace(/_/g, ' '))
      const priceStr = p.startPrice ? formatEGP(p.startPrice) : ''
      const viewLabel = lang === 'ar' ? 'عرض المشروع' : 'View Project'

      // NOTE: the <img> inside the popup HTML string below is intentional —
      // Leaflet renders popups outside React from a raw string, so next/image
      // cannot apply there.
      marker.bindPopup(`
        <div style="width:240px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
          ${p.coverImage ? `<img src="${escapeHtml(p.coverImage)}" style="width:100%;height:120px;object-fit:cover;border-radius:8px 8px 0 0;" onerror="this.style.display='none'" />` : ''}
          <div style="padding:12px;">
            <div class="lp-dev">${safeDev}</div>
            <div class="lp-title">${safeName}</div>
            <div class="lp-city">
              📍 ${safeCity}
            </div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
              ${priceStr ? `<span class="lp-price">${escapeHtml(priceStr)}</span>` : ''}
              <span style="font-size:9px;padding:2px 6px;border-radius:10px;background:${color}20;color:${color};font-weight:600;">${safeStatus}</span>
            </div>
            <a href="/projects/${safeSlug}" style="display:inline-flex;align-items:center;gap:4px;padding:10px 18px;min-height:44px;line-height:24px;background:#D4A843;color:white;border-radius:8px;font-size:12px;font-weight:600;text-decoration:none;">
              ${viewLabel} →
            </a>
          </div>
        </div>
      `, { maxWidth: 260, closeButton: true })

      marker.on('click', () => setSelected(p))
      layer.addLayer(marker)
    })
  }, [projects, lang])

  // Close dropdown on outside click
  useEffect(() => {
    if (!showGovList) return
    const handler = (e: MouseEvent) => {
      if (govDropdownRef.current && !govDropdownRef.current.contains(e.target as Node)) {
        setShowGovList(false)
        setGovSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showGovList])

  const flyTo = useCallback((lat: number, lng: number, zoom: number = 12) => {
    mapInstanceRef.current?.map?.flyTo([lat, lng], zoom, { duration: 1.5 })
  }, [])

  const resetView = useCallback(() => {
    mapInstanceRef.current?.map?.flyTo(EGYPT_CENTER, EGYPT_ZOOM, { duration: 1 })
    setSelected(null)
  }, [])

  const switchLayer = useCallback((style: 'standard' | 'satellite' | 'dark') => {
    const inst = mapInstanceRef.current
    if (!inst || inst.currentLayer === style) return
    inst.map.removeLayer(inst.tiles[inst.currentLayer])
    inst.tiles[style].addTo(inst.map)
    inst.currentLayer = style
    styleRef.current = style
    setMapStyle(style)
  }, [])

  const filteredGovs = useMemo(() => {
    if (!govSearch) return GOVERNORATES
    const q = govSearch.toLowerCase()
    return GOVERNORATES.filter(g =>
      g.name.toLowerCase().includes(q) || g.nameAr.includes(q)
    )
  }, [govSearch])

  const withCoords = projects.filter(p => p.latitude && p.longitude)

  return (
    <div className={className}>
      <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-[#262626] dark:bg-[#0A0A0A]">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4 py-2.5 dark:border-[#262626] dark:bg-black">
          <div className="flex items-center gap-1 rounded-2xl bg-muted p-0.5">
            {(['standard', 'satellite', 'dark'] as const).map(s => (
              <button
                key={s}
                onClick={() => switchLayer(s)}
                className={cn(
                  'min-h-[44px] rounded-full px-3 py-1 text-xs font-medium transition-colors md:min-h-0',
                  mapStyle === s ? 'bg-white text-foreground shadow-sm dark:bg-[#262626] dark:text-white' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {s === 'standard' ? (lang === 'ar' ? 'عادي' : 'Map') : s === 'satellite' ? (lang === 'ar' ? 'قمر صناعي' : 'Satellite') : (lang === 'ar' ? 'داكن' : 'Dark')}
              </button>
            ))}
          </div>

          <div className="h-5 w-px bg-border" />

          <div className="relative" ref={govDropdownRef}>
            <button
              onClick={() => { setShowGovList(!showGovList); setGovSearch('') }}
              className={cn(
                'flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors md:min-h-0',
                showGovList ? 'border-estate-gold bg-estate-gold/5 text-estate-gold' : 'text-muted-foreground hover:border-estate-gold hover:text-estate-gold'
              )}
            >
              <MapPin className="h-3 w-3" />
              {lang === 'ar' ? 'المحافظات' : 'Governorates'}
            </button>

            {showGovList && (
              <div className="absolute start-0 top-full z-[2000] mt-2 max-h-[420px] w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-[#262626] dark:bg-[#0A0A0A]">
                <div className="sticky top-0 border-b border-gray-200 bg-white px-3 py-2 dark:border-[#262626] dark:bg-black">
                  <div className="relative">
                    <Search className="absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder={lang === 'ar' ? 'ابحث عن محافظة...' : 'Search governorate...'}
                      value={govSearch}
                      onChange={e => setGovSearch(e.target.value)}
                      className="w-full rounded-xl border bg-muted py-1.5 ps-8 pe-3 text-base outline-none focus:border-estate-gold md:text-xs"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="max-h-[340px] overflow-y-auto">
                  {filteredGovs.length === 0 ? (
                    <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                      {lang === 'ar' ? 'مفيش نتائج' : 'No results found'}
                    </div>
                  ) : (
                    filteredGovs.map(gov => (
                      <button
                        key={gov.name}
                        onClick={() => {
                          flyTo(gov.lat, gov.lng, 12)
                          setShowGovList(false)
                          setGovSearch('')
                        }}
                        className="flex min-h-[44px] w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-estate-gold/5 md:min-h-0"
                      >
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-estate-gold/10">
                          <MapPin className="h-4 w-4 text-estate-gold" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold">{lang === 'ar' ? gov.nameAr : gov.name}</div>
                          <div className="text-[10px] text-muted-foreground">{gov.lat.toFixed(2)}°N, {gov.lng.toFixed(2)}°E</div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={resetView}
            className="flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-estate-gold hover:text-estate-gold md:min-h-0"
          >
            <Maximize2 className="h-3 w-3" />
            {lang === 'ar' ? 'مصر' : 'Egypt'}
          </button>

          <div className="flex-1" />

          <div className="flex items-center gap-1.5 rounded-full bg-estate-gold/10 px-3 py-1">
            <span className="text-xs font-bold text-estate-gold">{withCoords.length}</span>
            <span className="text-[10px] text-estate-gold/70">
              {lang === 'ar' ? 'مشاريع' : 'projects'}
            </span>
          </div>
        </div>

        {loadError && (
          <div className="flex items-center justify-between gap-2 border-b bg-red-50 px-4 py-2 text-xs text-red-600 dark:bg-red-950 dark:text-red-300">
            <span>{lang === 'ar' ? 'معرفناش نجيب المشاريع — جرب تاني.' : 'Could not load the projects — try again.'}</span>
            <button
              onClick={() => setRetryKey((k) => k + 1)}
              className="inline-flex min-h-[44px] shrink-0 items-center rounded-full bg-estate-gold px-3 py-1 font-medium text-[#0F1A2C] md:min-h-0"
            >
              {lang === 'ar' ? 'جرب تاني' : 'Try again'}
            </button>
          </div>
        )}

        {/* Map */}
        <div className="relative">
          <div ref={mapRef} className="z-0 h-[320px] sm:h-[480px]" />

          {/* Legend */}
          <div className="absolute bottom-4 start-4 z-[1000] rounded-2xl border border-gray-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur-sm dark:border-[#262626] dark:bg-black/95">
            <p className="mb-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              {lang === 'ar' ? 'الحالة' : 'Status'}
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {Object.entries(statusColors).map(([key, color]) => (
                <div key={key} className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: color }} />
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {lang === 'ar' ? statusLabelsAr[key] : key.replace(/_/g, ' ')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Selected project detail */}
        {selected && (
          <div className="border-t border-gray-200 bg-white p-4 dark:border-[#262626] dark:bg-black">
            <div className="flex items-start gap-4">
              {selected.coverImage && (
                <Image src={selected.coverImage} alt={selected.name} width={112} height={80} className="h-20 w-28 flex-shrink-0 rounded-2xl object-cover" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">{selected.developer?.companyName}</p>
                    <h3 className="text-base font-bold leading-tight">{selected.nameArabic || selected.name}</h3>
                  </div>
                  <button onClick={() => setSelected(null)} aria-label={lang === 'ar' ? 'إغلاق' : 'Close'} className="min-h-[44px] min-w-[44px] flex-shrink-0 rounded-full p-1 hover:bg-muted md:min-h-0 md:min-w-0">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {selected.city?.nameArabic || selected.city?.name}
                  </span>
                  {selected.startPrice && (
                    <span className="font-semibold text-estate-gold">{formatEGP(selected.startPrice)}</span>
                  )}
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
                    {selected.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild size="sm" className="min-h-[44px] bg-estate-gold hover:bg-estate-gold-dark md:min-h-0 md:h-8">
                    <Link href={`/projects/${selected.slug}`}>
                      {lang === 'ar' ? 'عرض المشروع' : 'View Project'} <ArrowUpRight className="ms-1 h-3 w-3" />
                    </Link>
                  </Button>
                  {selected.city?.nameSlug && (
                    <Button asChild size="sm" variant="outline" className="min-h-[44px] md:min-h-0 md:h-8">
                      <Link href={`/projects?city=${selected.city.nameSlug}`}>
                        {lang === 'ar' ? `المزيد في ${selected.city.nameArabic || selected.city.name}` : `More in ${selected.city.name}`}
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
