'use client'

import { X } from 'lucide-react'
import { useSearch } from '@/components/search/search-context'
import { useLanguage } from '@/lib/language-context'

const FILTER_LABELS: Record<string, string> = {
  city: 'Location', propertyType: 'Type', listingType: 'Listing', bedrooms: 'Bedrooms',
  bathrooms: 'Bathrooms', minPrice: 'Min Price', maxPrice: 'Max Price',
  minArea: 'Min Area', maxArea: 'Max Area', sortBy: 'Sort',
}

const FILTER_LABELS_AR: Record<string, string> = {
  city: 'المكان', propertyType: 'النوع', listingType: 'الإعلان', bedrooms: 'الأوض',
  bathrooms: 'الحمامات', minPrice: 'أقل سعر', maxPrice: 'أعلى سعر',
  minArea: 'أقل مساحة', maxArea: 'أكبر مساحة', sortBy: 'الترتيب',
}

function formatValue(key: string, val: string, ar: boolean): string {
  if (key === 'city') return val.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  if (key === 'minPrice' || key === 'maxPrice') return `${(Number(val) / 1_000_000).toFixed(0)}M`
  if (key === 'minArea' || key === 'maxArea') return ar ? `${val} م²` : `${val} m²`
  if (key === 'sortBy') {
    const map: Record<string, string> = ar
      ? { price_asc: 'السعر: من الأقل', price_desc: 'السعر: من الأعلى', popular: 'الأشهر', newest: 'الأجدد', area_desc: 'الأكبر مساحة' }
      : { price_asc: 'Price ↑', price_desc: 'Price ↓', popular: 'Popular', newest: 'Newest', area_desc: 'Largest' }
    return map[val] || val
  }
  return val
}

export function ActiveFilters() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const { filters, clearFilters, clearFilter, pushToURL } = useSearch()

  const chips = Object.entries(filters).filter(
    ([k, v]) => v && v !== '' && k !== 'page' && !(k === 'sortBy' && v === 'newest')
  )

  if (chips.length === 0) return null

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">{ar ? 'النشطة:' : 'Active:'}</span>
      {chips.map(([key, val]) => (
        <button
          key={key}
          onClick={() => { clearFilter(key as keyof import('@/components/search/search-context').SearchState); setTimeout(() => pushToURL(), 0) }}
          className="inline-flex items-center gap-1 rounded-full border border-[#D4A843]/20 bg-[#D4A843]/5 px-3 py-1 text-xs font-medium text-[#B8922E] transition-colors hover:bg-[#D4A843]/10 dark:border-[#D4A84333] dark:bg-[#D4A843]/10"
        >
          {(ar ? FILTER_LABELS_AR[key] : FILTER_LABELS[key]) || key}: {formatValue(key, val, ar)}
          <X className="h-3 w-3 ml-0.5" />
        </button>
      ))}
      {chips.length > 1 && (
        <button
          onClick={() => { clearFilters(); setTimeout(() => pushToURL(), 0) }}
          className="text-xs text-red-500 hover:underline"
        >
          {ar ? 'امسح الكل' : 'Clear all'}
        </button>
      )}
    </div>
  )
}
