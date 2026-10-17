'use client'

import { useState } from 'react'
import { SlidersHorizontal, X, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useSearch } from '@/components/search/search-context'
import { useLanguage } from '@/lib/language-context'
import { cn } from '@/lib/utils'

const propertyTypes = [
  { value: 'APARTMENT', label: 'Apartment', labelAr: 'شقة' },
  { value: 'VILLA', label: 'Villa', labelAr: 'فيلا' },
  { value: 'TOWNHOUSE', label: 'Townhouse', labelAr: 'تاون هاوس' },
  { value: 'PENTHOUSE', label: 'Penthouse', labelAr: 'بنتهاوس' },
  { value: 'STUDIO', label: 'Studio', labelAr: 'استوديو' },
  { value: 'DUPLEX', label: 'Duplex', labelAr: 'دوبلكس' },
  { value: 'CHALET', label: 'Chalet', labelAr: 'شاليه' },
  { value: 'COMMERCIAL', label: 'Commercial', labelAr: 'تجاري' },
]

const bedroomOptions = [1, 2, 3, 4, 5]

const sortOptions = [
  { value: 'newest', label: 'Newest', labelAr: 'الأجدد' },
  { value: 'popular', label: 'Most Popular', labelAr: 'الأشهر' },
  { value: 'price_asc', label: 'Price: Low to High', labelAr: 'السعر: من الأقل للأعلى' },
  { value: 'price_desc', label: 'Price: High to Low', labelAr: 'السعر: من الأعلى للأقل' },
  { value: 'area_desc', label: 'Largest First', labelAr: 'الأكبر مساحة الأول' },
]

interface FilterSidebarProps {
  className?: string
}

export function FilterSidebar({ className }: FilterSidebarProps) {
  const { lang, dir } = useLanguage()
  const ar = lang === 'ar'
  const { filters, setFilter, clearFilters, activeCount, pushToURL } = useSearch()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    type: true, bedrooms: true, price: true, sort: true,
  })

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleApply = () => {
    pushToURL()
    setMobileOpen(false)
  }

  const handleClear = () => {
    clearFilters()
    setTimeout(() => pushToURL(), 0)
    setMobileOpen(false)
  }

  const FilterContent = () => (
    <div className="space-y-6" dir={dir}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          <span className="font-semibold">{ar ? 'الفلاتر' : 'Filters'}</span>
          {activeCount > 0 && <Badge variant="gold">{activeCount}</Badge>}
        </div>
        {activeCount > 0 && (
          <button onClick={handleClear} className="text-xs text-red-500 hover:underline">
            {ar ? 'امسح الكل' : 'Clear all'}
          </button>
        )}
      </div>

      {/* City */}
      <div>
        <label className="mb-2 block text-sm font-medium">{ar ? 'المدينة / المنطقة' : 'City / Area'}</label>
        <Input
          placeholder={ar ? 'مثال: التجمع الخامس' : 'e.g. New Cairo'}
          value={filters.city}
          onChange={(e) => setFilter('city', e.target.value)}
        />
      </div>

      {/* Property Type */}
      <div>
        <button onClick={() => toggleSection('type')} className="flex w-full items-center justify-between text-sm font-medium">
          {ar ? 'نوع العقار' : 'Property Type'}
          {expandedSections.type ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {expandedSections.type && (
          <div className="mt-3 space-y-2">
            {propertyTypes.map((t) => (
              <label key={t.value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="propertyType"
                  value={t.value}
                  checked={filters.propertyType === t.value}
                  onChange={(e) => setFilter('propertyType', e.target.checked ? t.value : '')}
                  className="accent-estate-gold"
                />
                {ar ? t.labelAr : t.label}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Bedrooms */}
      <div>
        <button onClick={() => toggleSection('bedrooms')} className="flex w-full items-center justify-between text-sm font-medium">
          {ar ? 'عدد الأوض' : 'Bedrooms'}
          {expandedSections.bedrooms ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {expandedSections.bedrooms && (
          <div className="mt-3 flex flex-wrap gap-2">
            {bedroomOptions.map((n) => (
              <button
                key={n}
                onClick={() => setFilter('bedrooms', filters.bedrooms === String(n) ? '' : String(n))}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm transition-colors',
                  filters.bedrooms === String(n)
                    ? 'border-estate-gold bg-estate-gold text-white'
                    : 'hover:border-estate-gold dark:border-[#262626] dark:bg-[#0A0A0A] dark:text-gray-300 dark:hover:border-[#D4A843]'
                )}
              >
                {n}+
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Price Range */}
      <div>
        <button onClick={() => toggleSection('price')} className="flex w-full items-center justify-between text-sm font-medium">
          {ar ? 'السعر (جنيه)' : 'Price Range (EGP)'}
          {expandedSections.price ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {expandedSections.price && (
          <div className="mt-3 flex gap-2">
            <Input
              type="number"
              placeholder={ar ? 'من' : 'Min'}
              value={filters.minPrice}
              onChange={(e) => setFilter('minPrice', e.target.value)}
            />
            <span className="self-center text-muted-foreground">-</span>
            <Input
              type="number"
              placeholder={ar ? 'لحد' : 'Max'}
              value={filters.maxPrice}
              onChange={(e) => setFilter('maxPrice', e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Sort */}
      <div>
        <button onClick={() => toggleSection('sort')} className="flex w-full items-center justify-between text-sm font-medium">
          {ar ? 'رتب حسب' : 'Sort By'}
          {expandedSections.sort ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {expandedSections.sort && (
          <div className="mt-3 space-y-2">
            {sortOptions.map((s) => (
              <label key={s.value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="sortBy"
                  value={s.value}
                  checked={filters.sortBy === s.value}
                  onChange={(e) => setFilter('sortBy', e.target.value)}
                  className="accent-estate-gold"
                />
                {s.label}
              </label>
            ))}
          </div>
        )}
      </div>

      <Button onClick={handleApply} className="w-full bg-estate-gold hover:bg-estate-gold-dark">
        {ar ? 'طبق الفلاتر' : 'Apply Filters'}
      </Button>
    </div>
  )

  return (
    <>
      <Button variant="outline" className="lg:hidden" onClick={() => setMobileOpen(true)}>
        <SlidersHorizontal className="mr-2 h-4 w-4" />
        {ar ? 'الفلاتر' : 'Filters'} {activeCount > 0 && `(${activeCount})`}
      </Button>

      <div className={`hidden lg:block ${className || ''}`}>
        <FilterContent />
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-80 bg-white p-6 overflow-y-auto dark:border-r dark:border-[#262626] dark:bg-[#0A0A0A]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{ar ? 'الفلاتر' : 'Filters'}</h2>
              <button onClick={() => setMobileOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <FilterContent />
          </div>
        </div>
      )}
    </>
  )
}
