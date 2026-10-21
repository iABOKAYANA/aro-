'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

export type MapProject = {
  slug: string
  name: string
  status: string
  startPrice: number | null
  lat: number
  lng: number
  city: string | null
}

// Simplified Egypt outline in plain (lng, lat) pairs — equirectangular, zero
// deps. Borders: Mediterranean coast, straight western border, straight
// southern border, Red Sea / Gulf of Suez coast, Sinai.
const EGYPT_OUTLINE: Array<[number, number]> = [
  [25.0, 31.6], [27.0, 31.2], [29.0, 31.0], [30.5, 31.5], [31.2, 31.6], // Med coast → Sinai west
  [32.3, 31.2], [34.25, 31.2], [34.9, 29.5], [34.25, 28.0], [33.5, 28.5], // Sinai + Gulf of Aqaba → Suez
  [32.6, 29.7], [33.0, 28.0], [34.0, 27.0], [35.2, 24.5], [35.8, 23.9], // Red Sea coast south
  [36.9, 22.0], [31.4, 22.0], [24.9, 22.0], [24.7, 30.0], [25.0, 31.6], // southern + western borders
]

// Bounding box covering Egypt (+ padding)
const LNG_MIN = 24.0
const LNG_MAX = 37.4
const LAT_MIN = 21.6
const LAT_MAX = 32.1

function project(lat: number, lng: number, w: number, h: number) {
  const x = ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * w
  const y = h - ((lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * h
  return { x, y }
}

const STATUS_COLOR: Record<string, string> = {
  AVAILABLE: '#16a34a',
  UNDER_CONSTRUCTION: '#d97706',
  COMING_SOON: '#9333ea',
  DELIVERED: '#2563eb',
}

const fmtCompact = (n: number) =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)

export default function ProjectsMapView({ projects }: { projects: MapProject[] }) {
  const [hover, setHover] = useState<MapProject | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('ALL')

  const statuses = useMemo(
    () => ['ALL', ...Array.from(new Set(projects.map((p) => p.status)))],
    [projects]
  )
  const shown = statusFilter === 'ALL' ? projects : projects.filter((p) => p.status === statusFilter)
  const W = 640
  const H = 620

  const outline = EGYPT_OUTLINE.map(([lng, lat]) => {
    const { x, y } = project(lat, lng, W, H)
    return `${x.toFixed(0)},${y.toFixed(0)}`
  }).join(' ')

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {statuses.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            aria-pressed={statusFilter === s}
            className={`min-h-[36px] rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === s
                ? 'border-estate-gold bg-estate-gold text-[#0F1A2C]'
                : 'border-border bg-background hover:bg-muted'
            }`}
          >
            {s === 'ALL' ? 'الكل' : s.replace(/_/g, ' ').toLowerCase()}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[640px_1fr]">
        <div className="overflow-hidden rounded-2xl border border-border bg-muted/30 p-2 dark:bg-[#0A0A0A]">
          <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block h-auto w-full max-w-[640px]" role="img" aria-label="خريطة مصر بمواقع المشاريع">
            <polygon points={outline} className="fill-muted dark:fill-[#161616]" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
            {shown.map((p) => {
              const { x, y } = project(p.lat, p.lng, W, H)
              return (
                <a
                  key={p.slug}
                  href={`/projects/${p.slug}`}
                  onMouseEnter={() => setHover(p)}
                  onMouseLeave={() => setHover(null)}
                  className="outline-none"
                  aria-label={`${p.name} — ${p.city ?? ''}`}
                >
                  <circle
                    cx={x}
                    cy={y}
                    r={hover?.slug === p.slug ? 8 : 5}
                    fill={STATUS_COLOR[p.status] || '#d4a843'}
                    fillOpacity="0.9"
                    stroke="#fff"
                    strokeWidth="1.5"
                    className="cursor-pointer transition-all"
                  />
                  <title>{p.name}{p.city ? ` · ${p.city}` : ''}</title>
                </a>
              )
            })}
          </svg>
        </div>

        <div className="min-h-[120px]">
          {hover ? (
            <Link href={`/projects/${hover.slug}`} className="block rounded-2xl border border-estate-gold/30 p-4 hover:bg-muted/40">
              <p className="font-display mb-1 text-lg font-bold">{hover.name}</p>
              {hover.city && <p className="mb-2 text-xs text-muted-foreground">{hover.city}</p>}
              {hover.startPrice != null && (
                <p className="text-sm font-semibold text-estate-gold">يبدأ من {fmtCompact(hover.startPrice)} ج</p>
              )}
              <p className="mt-3 text-xs text-estate-gold underline">افتح صفحة المشروع ←</p>
            </Link>
          ) : (
            <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              حرّك الماوس على أي نقطة على الخريطة لعرض المشروع ({shown.length} معروض).
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
