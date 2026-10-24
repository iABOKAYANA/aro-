'use client'

import Link from 'next/link'
import { MapPin, Bed, Bath, Maximize, ChevronRight } from 'lucide-react'
import { formatEGP, formatSQM } from '@/lib/utils'
import { useLanguage } from '@/lib/language-context'

interface ChatPropertyGridProps {
  title: string
  projects?: any[]
  units?: any[]
  total: number
}

export function ChatPropertyGrid({ title, projects, units, total }: ChatPropertyGridProps) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const items = projects || units
  if (!items || items.length === 0) return null

  return (
    <div className="mt-1">
      {title && <p className="mb-1.5 text-[11px] font-medium text-gray-400 uppercase tracking-wide">{title}</p>}
      <div className="space-y-1.5">
        {projects && projects.map((p) => (
          <Link
            key={p.id}
            href={`/projects/${p.slug}`}
            target="_blank"
            className="group flex items-center gap-2.5 rounded-2xl border border-gray-100 bg-white p-2 transition-all hover:border-[#D4A843]/30 hover:shadow-sm dark:border-[#262626] dark:bg-[#0A0A0A]"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h4 className="truncate text-xs font-semibold text-gray-800 group-hover:text-[#D4A843] dark:text-white">{p.name}</h4>
                <ChevronRight className="h-3 w-3 flex-shrink-0 text-gray-300 group-hover:text-[#D4A843] rtl:rotate-180" />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                {p.developerName && <span>{p.developerName}</span>}
                {p.city && <span className="flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5 shrink-0" />{p.city}</span>}
              </div>
              <div className="mt-1 flex items-center gap-2">
                {p.startPrice && <span className="text-[11px] font-bold text-[#D4A843]">{formatEGP(p.startPrice)} {ar ? 'ج.م' : 'EGP'}</span>}
                {p.unitCount > 0 && <span className="text-[9px] text-gray-400">{p.unitCount} {ar ? 'وحدة' : p.unitCount === 1 ? 'unit' : 'units'}</span>}
              </div>
            </div>
          </Link>
        ))}
        {units && units.map((u) => (
          <Link
            key={u.id}
            href={`/units/${u.slug || u.id}`}
            target="_blank"
            className="group flex items-center gap-2.5 rounded-2xl border border-gray-100 bg-white p-2 transition-all hover:border-[#D4A843]/30 hover:shadow-sm dark:border-[#262626] dark:bg-[#0A0A0A]"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h4 className="truncate text-xs font-semibold text-gray-800 group-hover:text-[#D4A843] dark:text-white">{u.projectName}</h4>
                <span className="flex-shrink-0 rounded-full bg-[#D4A843]/10 px-1.5 py-0.5 text-[8px] font-medium text-[#B8922E]">{u.unitType.replace(/_/g, ' ')}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                {u.bedrooms != null && <span className="flex items-center gap-0.5"><Bed className="h-2.5 w-2.5 shrink-0" />{u.bedrooms}</span>}
                {u.bathrooms != null && <span className="flex items-center gap-0.5"><Bath className="h-2.5 w-2.5 shrink-0" />{u.bathrooms}</span>}
                <span className="flex items-center gap-0.5"><Maximize className="h-2.5 w-2.5 shrink-0" />{u.area}{ar ? 'م²' : 'm²'}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-[11px] font-bold text-[#D4A843]">{formatEGP(u.price)} {ar ? 'ج.م' : 'EGP'}</span>
                {u.pricePerSqm && <span className="text-[9px] text-gray-400">{formatEGP(u.pricePerSqm)}{ar ? '/م²' : '/m²'}</span>}
              </div>
            </div>
          </Link>
        ))}
      </div>
      {total > items.length && (
        <Link
          href="/projects"
          target="_blank"
          className="mt-1.5 flex items-center justify-center gap-1 rounded-full border border-dashed border-gray-200 py-1.5 text-[11px] text-gray-400 transition-colors hover:border-[#D4A843]/30 hover:text-[#D4A843] dark:border-[#262626] dark:text-gray-400"
        >
          {ar ? <>عرض كل {total} نتيجة</> : <>View all {total} results</>}
          <ChevronRight className="h-2.5 w-2.5 rtl:rotate-180" />
        </Link>
      )}
    </div>
  )
}
