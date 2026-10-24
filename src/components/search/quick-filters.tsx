'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { createPortal } from 'react-dom'
import { Search, SlidersHorizontal, X, ChevronDown, MapPin, Home, BedDouble, DollarSign, ArrowUpDown, Check } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useSearch } from '@/components/search/search-context'
import { useLanguage } from '@/lib/language-context'
import { cn } from '@/lib/utils'

const CITIES = [
  { slug: 'new-cairo', label: 'New Cairo', labelAr: 'القاهرة الجديدة' },
  { slug: 'new-capital-city', label: 'New Capital', labelAr: 'العاصمة الإدارية' },
  { slug: 'sheikh-zayed', label: 'Sheikh Zayed', labelAr: 'الشيخ زايد' },
  { slug: '6th-of-october-city', label: '6th October', labelAr: 'السادس من أكتوبر' },
  { slug: 'ain-sokhna', label: 'Ain Sokhna', labelAr: 'العين السخنة' },
  { slug: 'ras-el-hekma', label: 'Ras El Hekma', labelAr: 'رأس الحكمة' },
  { slug: 'al-alamein', label: 'Al Alamein', labelAr: 'العلمين' },
]

const PROPERTY_TYPES = [
  { value: 'APARTMENT', label: 'Apartment', labelAr: 'شقة' },
  { value: 'VILLA', label: 'Villa', labelAr: 'فيلا' },
  { value: 'TOWNHOUSE', label: 'Townhouse', labelAr: 'تاون هاوس' },
  { value: 'PENTHOUSE', label: 'Penthouse', labelAr: 'بنتهاوس' },
  { value: 'STUDIO', label: 'Studio', labelAr: 'استوديو' },
  { value: 'DUPLEX', label: 'Duplex', labelAr: 'دوبلكس' },
  { value: 'CHALET', label: 'Chalet', labelAr: 'شاليه' },
  { value: 'COMMERCIAL', label: 'Commercial', labelAr: 'تجاري' },
]

const BEDROOM_OPTIONS = [1, 2, 3, 4, 5]

const PRICE_PRESETS = [
  { label: 'Under 5M', labelAr: 'أقل من 5م', min: '', max: '5000000' },
  { label: '5-10M', labelAr: '5-10م', min: '5000000', max: '10000000' },
  { label: '10-20M', labelAr: '10-20م', min: '10000000', max: '20000000' },
  { label: '20-50M', labelAr: '20-50م', min: '20000000', max: '50000000' },
  { label: '50M+', labelAr: '+50م', min: '50000000', max: '' },
]

const SORT_OPTIONS = [
  { value: 'newest', labelKey: 'projects.sortNewest' },
  { value: 'popular', labelKey: 'projects.sortPopular' },
  { value: 'price_asc', labelKey: 'projects.sortPriceLow' },
  { value: 'price_desc', labelKey: 'projects.sortPriceHigh' },
  { value: 'area_desc', labelKey: 'projects.sortLargest' },
]

const LISTING_TYPES = [
  { value: 'SALE', label: 'Sale', labelAr: 'بيع' },
  { value: 'RENT', label: 'Rent', labelAr: 'إيجار' },
  { value: 'RESALE', label: 'Resale', labelAr: 'إعادة بيع' },
  { value: 'INSTALLMENT', label: 'Installment', labelAr: 'تقسيط' },
]

const PROJECT_STATUSES = [
  { value: 'UNDER_CONSTRUCTION', label: 'Under construction', labelAr: 'تحت الإنشاء' },
  { value: 'COMING_SOON', label: 'Coming soon', labelAr: 'قريباً' },
]

interface QuickFiltersProps {
  total: number
  resultCount: number
}

export function QuickFilters({ total, resultCount }: QuickFiltersProps) {
  const { filters, setFilter, clearFilters, clearFilter, pushToURL, activeCount } = useSearch()
  const { t, lang } = useLanguage()
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const [cityOpen, setCityOpen] = useState(false)
  const [typeOpen, setTypeOpen] = useState(false)
  const [searchValue, setSearchValue] = useState(filters.q || '')
  // Live project suggestions — additive only; the full-search submit flow is untouched.
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [suggestItems, setSuggestItems] = useState<SuggestItem[]>([])
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [suggestQueried, setSuggestQueried] = useState('')
  const [activeIdx, setActiveIdx] = useState(-1)
  const suggestAbort = useRef<AbortController | null>(null)
  const sortRef = useRef<HTMLDivElement>(null)
  const cityRef = useRef<HTMLButtonElement>(null)
  const typeRef = useRef<HTMLButtonElement>(null)
  const [cityPos, setCityPos] = useState<{ top: number; left: number } | null>(null)
  const [typePos, setTypePos] = useState<{ top: number; left: number } | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    setSearchValue(filters.q || '')
  }, [filters.q])

  // Suggestion fetch — debounced ~220ms, stale requests aborted per keystroke,
  // projects corpus only. Errors stay silent: the full search below still works.
  useEffect(() => {
    const q = searchValue.trim()
    if (q.length < 1) {
      suggestAbort.current?.abort()
      setSuggestItems([])
      setSuggestQueried('')
      setSuggestLoading(false)
      setActiveIdx(-1)
      return
    }
    setSuggestLoading(true)
    const timer = setTimeout(() => {
      suggestAbort.current?.abort()
      const ctrl = new AbortController()
      suggestAbort.current = ctrl
      fetch(`/api/search?type=projects&q=${encodeURIComponent(q)}&limit=6`, { signal: ctrl.signal })
        .then((res) => { if (!res.ok) throw new Error('suggest failed'); return res.json() })
        .then((data) => {
          if (ctrl.signal.aborted) return
          setSuggestItems(Array.isArray(data?.items) ? data.items.slice(0, 6) : [])
          setSuggestQueried(q)
          setActiveIdx(-1)
        })
        .catch(() => { /* silent — never an error panel for suggestions */ })
        .finally(() => { if (!ctrl.signal.aborted) setSuggestLoading(false) })
    }, 220)
    return () => { clearTimeout(timer); suggestAbort.current?.abort() }
  }, [searchValue])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false)
      const target = e.target as Element
      if (cityRef.current && !cityRef.current.contains(target) && !target.closest?.('[data-city-dropdown]')) setCityOpen(false)
      if (typeRef.current && !typeRef.current.contains(target) && !target.closest?.('[data-type-dropdown]')) setTypeOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const toggleCity = useCallback(() => {
    if (!cityOpen && cityRef.current) {
      const rect = cityRef.current.getBoundingClientRect()
      setCityPos({ top: rect.bottom + 6, left: rect.left })
    }
    setCityOpen(prev => !prev)
    setTypeOpen(false)
    setSortOpen(false)
  }, [cityOpen])

  const toggleType = useCallback(() => {
    if (!typeOpen && typeRef.current) {
      const rect = typeRef.current.getBoundingClientRect()
      setTypePos({ top: rect.bottom + 6, left: rect.left })
    }
    setTypeOpen(prev => !prev)
    setCityOpen(false)
    setSortOpen(false)
  }, [typeOpen])

  const updateAndPush = useCallback((key: string, val: string) => {
    setFilter(key as any, val)
    requestAnimationFrame(() => pushToURL())
  }, [setFilter, pushToURL])

  const submitSearch = useCallback(() => {
    setFilter('q' as any, searchValue)
    setSuggestOpen(false)
    requestAnimationFrame(() => pushToURL())
  }, [searchValue, setFilter, pushToURL])

  const router = useRouter()
  const goProject = useCallback((slug: string) => {
    setSuggestOpen(false)
    router.push(`/projects/${slug}`)
  }, [router])
  const submitAndClose = useCallback(() => {
    submitSearch()
    setSuggestOpen(false)
  }, [submitSearch])

  const trimmedSearch = searchValue.trim()
  const showSuggest = suggestOpen && trimmedSearch.length >= 1 && (suggestLoading || suggestItems.length > 0 || suggestQueried === trimmedSearch)
  const showNoMatch = !suggestLoading && suggestItems.length === 0 && suggestQueried === trimmedSearch

  const currentSort = SORT_OPTIONS.find(s => s.value === filters.sortBy) || SORT_OPTIONS[0]
  const currentCity = CITIES.find(c => c.slug === filters.city)
  const currentType = PROPERTY_TYPES.find(t => t.value === filters.propertyType)
  const currentListingType = LISTING_TYPES.find(t => t.value === filters.listingType)
  const currentStatus = PROJECT_STATUSES.find(s => s.value === filters.status)
  const ar = lang === 'ar'

  return (
    <div className="space-y-0">
      {/* Main filter bar */}
      <div className="sticky top-16 z-30 border-b border-gray-200 bg-white/95 backdrop-blur-md dark:border-[#262626] dark:bg-black/95">
        <div className="container px-4">
          {/* Top row: Search + Sort + Advanced */}
          <div className="flex items-center gap-3 py-3">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchValue}
                onChange={(e) => { setSearchValue(e.target.value); setSuggestOpen(true); setActiveIdx(-1) }}
                onFocus={() => setSuggestOpen(true)}
                onBlur={() => setSuggestOpen(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setSuggestOpen(false); return }
                  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && showSuggest && suggestItems.length > 0) {
                    e.preventDefault()
                    setActiveIdx((i) => e.key === 'ArrowDown'
                      ? (i + 1) % suggestItems.length
                      : (i - 1 + suggestItems.length) % suggestItems.length)
                    return
                  }
                  if (e.key === 'Enter') {
                    const pick = suggestOpen && activeIdx >= 0 ? suggestItems[activeIdx] : undefined
                    if (pick?.slug) goProject(pick.slug)
                    else submitAndClose()
                  }
                }}
                role="combobox"
                aria-expanded={showSuggest}
                aria-autocomplete="list"
                aria-haspopup="listbox"
                aria-controls={showSuggest ? 'project-suggestions' : undefined}
                aria-label={ar ? 'ابحث في المشاريع' : 'Search projects'}
                placeholder={t('projects.searchPlaceholder')}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 ps-10 pe-11 py-2.5 text-base text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-estate-gold-dark focus:bg-white focus:ring-1 focus:ring-estate-gold/30 md:pe-9 md:text-sm dark:border-[#262626] dark:bg-[#0A0A0A] dark:text-white dark:focus:border-estate-gold dark:focus:ring-estate-gold/20"
              />
              {searchValue && (
                <button
                  type="button"
                  aria-label={ar ? 'مسح البحث' : 'Clear search'}
                  onClick={() => { setSearchValue(''); setSuggestOpen(false); setFilter('q' as any, ''); requestAnimationFrame(() => pushToURL()) }}
                  className="absolute end-1 top-1/2 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-full text-gray-400 hover:text-gray-600 md:end-2.5 md:min-h-0 md:min-w-0 md:h-8 md:w-8 md:p-0"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              {showSuggest && (
                <div
                  id="project-suggestions"
                  role="listbox"
                  aria-label={ar ? 'اقتراحات المشاريع' : 'Project suggestions'}
                  className="absolute start-0 end-0 top-full z-50 mt-1.5 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-[#262626] dark:bg-[#0A0A0A]"
                >
                  {suggestItems.map((item, i) => {
                    const name = ar ? (item.nameArabic || item.name) : item.name
                    const cityLabel = item.city ? (ar ? (item.city.nameArabic || item.city.name) : item.city.name) : ''
                    const detail = [cityLabel, suggestPriceLabel(item.startPrice, ar)].filter(Boolean).join(' • ')
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={activeIdx === i}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { if (item.slug) goProject(item.slug) }}
                        onMouseEnter={() => setActiveIdx(i)}
                        className={cn(
                          'flex w-full items-center gap-3 px-3 py-2 text-start transition-colors',
                          activeIdx === i ? 'bg-estate-gold/10 dark:bg-estate-gold/5' : 'hover:bg-gray-50 dark:hover:bg-white/5'
                        )}
                      >
                        <SuggestThumb src={item.coverImage} alt={name} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">
                            <HighlightedName name={name} query={trimmedSearch} />
                          </span>
                          {detail ? (
                            <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{detail}</span>
                          ) : null}
                        </span>
                      </button>
                    )
                  })}
                  {suggestLoading && suggestItems.length === 0 && (
                    <div className="space-y-2 px-3 py-3" aria-hidden="true">
                      <div className="h-10 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/10" />
                      <div className="h-10 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/10" />
                    </div>
                  )}
                  {showNoMatch && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={submitAndClose}
                      className="w-full px-4 py-3 text-start text-sm text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-white/5"
                    >
                      {ar ? 'لا توجد نتائج مطابقة — عرض كل النتائج' : 'No matches — view all results'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Sort */}
            <div ref={sortRef} className="relative">
              <button
                type="button"
                onClick={() => { setSortOpen(!sortOpen); setCityOpen(false); setTypeOpen(false) }}
                aria-label={ar ? `ترتيب النتائج: ${t(currentSort.labelKey)}` : `Sort results: ${t(currentSort.labelKey)}`}
                aria-expanded={sortOpen}
                aria-controls={sortOpen ? 'project-sort-options' : undefined}
                className={cn(
                  'flex min-h-[44px] items-center gap-2 rounded-full border px-3.5 py-2.5 text-sm font-medium transition-all md:min-h-0',
                  sortOpen
                    ? 'border-estate-gold bg-estate-gold/10 text-estate-navy dark:border-estate-gold dark:bg-estate-gold/5 dark:text-estate-gold'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-[#262626] dark:bg-[#0A0A0A] dark:text-gray-300'
                )}
              >
                <ArrowUpDown className="h-4 w-4" />
                <span className="hidden sm:inline">{t(currentSort.labelKey)}</span>
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', sortOpen && 'rotate-180')} />
              </button>
              {sortOpen && (
                <div id="project-sort-options" className="absolute end-0 top-full z-50 mt-1.5 w-52 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-[#262626] dark:bg-[#0A0A0A]">
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => { setFilter('sortBy' as any, opt.value); setSortOpen(false); requestAnimationFrame(() => pushToURL()) }}
                      className={cn(
                        'flex min-h-[44px] w-full items-center gap-2 px-4 py-2.5 text-sm transition-colors md:min-h-0',
                        filters.sortBy === opt.value
                          ? 'bg-estate-gold/10 font-medium text-estate-navy dark:bg-estate-gold/5 dark:text-estate-gold'
                          : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/10'
                      )}
                    >
                      {filters.sortBy === opt.value && <Check className="h-3.5 w-3.5" />}
                      <span className={filters.sortBy === opt.value ? '' : 'ms-5.5'}>{t(opt.labelKey)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Advanced */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              aria-label={(() => {
                // Matches the visible text exactly (axe label-content-name).
                const base = ar ? 'فلاتر أكتر لو حابب تدقق' : t('projects.advancedFilters')
                return activeCount > 0 ? `${base}${activeCount}` : base
              })()}
              aria-expanded={showAdvanced}
              aria-controls={showAdvanced ? 'advanced-project-filters' : undefined}
              className={cn(
                'flex min-h-[44px] items-center gap-2 rounded-full border px-3.5 py-2.5 text-sm font-medium transition-all md:min-h-0',
                showAdvanced || activeCount > 0
                  ? 'border-estate-gold bg-estate-gold/10 text-estate-navy dark:border-estate-gold dark:bg-estate-gold/5 dark:text-estate-gold'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-[#262626] dark:bg-[#0A0A0A] dark:text-gray-300'
              )}
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span className="hidden sm:inline">{ar ? 'فلاتر أكتر لو حابب تدقق' : t('projects.advancedFilters')}</span>
              {activeCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-estate-gold px-1 text-[10px] font-bold text-white">
                  {activeCount}
                </span>
              )}
            </button>
          </div>

          {/* Filter chips row */}
          <div className="flex items-center gap-3 overflow-x-auto pb-3 scrollbar-hide">
            {/* City button */}
            <button
              ref={cityRef}
              onClick={toggleCity}
              className={cn(
                'flex min-h-[44px] flex-shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all whitespace-nowrap md:min-h-0',
                filters.city
                  ? 'border-estate-gold bg-estate-gold text-[#0F1A2C] dark:border-estate-gold dark:bg-estate-gold'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-[#262626] dark:bg-[#0A0A0A] dark:text-gray-300'
              )}
            >
              <MapPin className="h-3 w-3" />
              {currentCity ? (lang === 'ar' ? currentCity.labelAr : currentCity.label) : (lang === 'ar' ? 'كل المدن' : 'All Cities')}
              <ChevronDown className={cn('h-3 w-3 transition-transform', cityOpen && 'rotate-180')} />
            </button>

            {/* Type button */}
            <button
              ref={typeRef}
              onClick={toggleType}
              className={cn(
                'flex min-h-[44px] flex-shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all whitespace-nowrap md:min-h-0',
                filters.propertyType
                  ? 'border-estate-gold bg-estate-gold text-[#0F1A2C] dark:border-estate-gold dark:bg-estate-gold'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-[#262626] dark:bg-[#0A0A0A] dark:text-gray-300'
              )}
            >
              <Home className="h-3 w-3" />
              {currentType ? (lang === 'ar' ? currentType.labelAr : currentType.label) : (lang === 'ar' ? 'كل الأنواع' : 'All Types')}
              <ChevronDown className={cn('h-3 w-3 transition-transform', typeOpen && 'rotate-180')} />
            </button>

            <div className="h-5 w-px flex-shrink-0 bg-gray-200 dark:bg-[#262626]" />

            {/* Price presets */}
            <div className="flex flex-shrink-0 items-center gap-1.5">
              <DollarSign className="h-3 w-3 flex-shrink-0 text-gray-400" />
              {PRICE_PRESETS.map((preset, i) => {
                const isActive = filters.minPrice === preset.min && filters.maxPrice === preset.max
                return (
                  <button
                    key={i}
                    onClick={() => {
                      if (isActive) {
                        setFilter('minPrice' as any, '')
                        setFilter('maxPrice' as any, '')
                      } else {
                        setFilter('minPrice' as any, preset.min)
                        setFilter('maxPrice' as any, preset.max)
                      }
                      requestAnimationFrame(() => pushToURL())
                    }}
                    className={cn(
                      'flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-all whitespace-nowrap min-h-[44px] inline-flex items-center md:min-h-0',
                      isActive
                        ? 'bg-estate-gold text-[#0F1A2C] dark:bg-estate-gold'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-[#262626] dark:text-gray-300 dark:hover:bg-white/10'
                    )}
                  >
                    {lang === 'ar' ? preset.labelAr : preset.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* City Dropdown — Portal */}
      {cityOpen && mounted && createPortal(
        <div
          data-city-dropdown
          className="fixed z-[100] w-56 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-[#262626] dark:bg-[#0A0A0A]"
          style={{ top: cityPos?.top ?? 0, left: cityPos?.left ?? 0 }}
        >
          <button
            onClick={() => { updateAndPush('city', ''); setCityOpen(false) }}
            className={cn(
              'flex min-h-[44px] w-full items-center px-4 py-2.5 text-sm transition-colors md:min-h-0',
              !filters.city ? 'bg-estate-gold/10 font-medium text-estate-navy dark:bg-estate-gold/5 dark:text-estate-gold' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/10'
            )}
          >
            {lang === 'ar' ? 'كل المدن' : 'All Cities'}
          </button>
          {CITIES.map((city) => (
            <button
              key={city.slug}
              onClick={() => { updateAndPush('city', city.slug); setCityOpen(false) }}
              className={cn(
                'flex min-h-[44px] w-full items-center gap-2 px-4 py-2.5 text-sm transition-colors md:min-h-0',
                filters.city === city.slug
                  ? 'bg-estate-gold/10 font-medium text-estate-navy dark:bg-estate-gold/5 dark:text-estate-gold'
                  : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/10'
              )}
            >
              {filters.city === city.slug && <Check className="h-3.5 w-3.5" />}
              <span className={filters.city === city.slug ? '' : 'ms-5.5'}>{lang === 'ar' ? city.labelAr : city.label}</span>
            </button>
          ))}
        </div>,
        document.body
      )}

      {/* Type Dropdown — Portal */}
      {typeOpen && mounted && createPortal(
        <div
          data-type-dropdown
          className="fixed z-[100] w-52 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-[#262626] dark:bg-[#0A0A0A]"
          style={{ top: typePos?.top ?? 0, left: typePos?.left ?? 0 }}
        >
          <button
            onClick={() => { updateAndPush('propertyType', ''); setTypeOpen(false) }}
            className={cn(
              'flex min-h-[44px] w-full items-center px-4 py-2.5 text-sm transition-colors md:min-h-0',
              !filters.propertyType ? 'bg-estate-gold/10 font-medium text-estate-navy dark:bg-estate-gold/5 dark:text-estate-gold' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/10'
            )}
          >
            {lang === 'ar' ? 'كل الأنواع' : 'All Types'}
          </button>
          {PROPERTY_TYPES.map((type) => (
            <button
              key={type.value}
              onClick={() => { updateAndPush('propertyType', type.value); setTypeOpen(false) }}
              className={cn(
                'flex min-h-[44px] w-full items-center gap-2 px-4 py-2.5 text-sm transition-colors md:min-h-0',
                filters.propertyType === type.value
                  ? 'bg-estate-gold/10 font-medium text-estate-navy dark:bg-estate-gold/5 dark:text-estate-gold'
                  : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/10'
              )}
            >
              {filters.propertyType === type.value && <Check className="h-3.5 w-3.5" />}
              <span className={filters.propertyType === type.value ? '' : 'ms-5.5'}>{lang === 'ar' ? type.labelAr : type.label}</span>
            </button>
          ))}
        </div>,
        document.body
      )}

      {/* Advanced filters panel */}
      {showAdvanced && (
        <div id="advanced-project-filters" className="border-b border-gray-200 bg-white dark:border-[#262626] dark:bg-black">
          <div className="container px-4 py-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-500">{lang === 'ar' ? 'السعر من' : 'Min Price (EGP)'}</label>
                <input
                  type="number"
                  placeholder="0"
                  value={filters.minPrice}
                  onChange={(e) => setFilter('minPrice' as any, e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-base text-gray-900 md:py-2 md:text-sm outline-none transition-colors focus:border-estate-gold-dark focus:bg-white focus:ring-1 focus:ring-estate-gold/30 dark:border-[#262626] dark:bg-[#0A0A0A] dark:text-white dark:focus:border-estate-gold"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-500">{lang === 'ar' ? 'السعر إلى' : 'Max Price (EGP)'}</label>
                <input
                  type="number"
                  placeholder="∞"
                  value={filters.maxPrice}
                  onChange={(e) => setFilter('maxPrice' as any, e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-base text-gray-900 md:py-2 md:text-sm outline-none transition-colors focus:border-estate-gold-dark focus:bg-white focus:ring-1 focus:ring-estate-gold/30 dark:border-[#262626] dark:bg-[#0A0A0A] dark:text-white dark:focus:border-estate-gold"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-500">{lang === 'ar' ? 'المساحة من' : 'Min Area (m²)'}</label>
                <input
                  type="number"
                  placeholder="0"
                  value={filters.minArea}
                  onChange={(e) => setFilter('minArea' as any, e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-base text-gray-900 md:py-2 md:text-sm outline-none transition-colors focus:border-estate-gold-dark focus:bg-white focus:ring-1 focus:ring-estate-gold/30 dark:border-[#262626] dark:bg-[#0A0A0A] dark:text-white dark:focus:border-estate-gold"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-500">{lang === 'ar' ? 'المساحة إلى' : 'Max Area (m²)'}</label>
                <input
                  type="number"
                  placeholder="∞"
                  value={filters.maxArea}
                  onChange={(e) => setFilter('maxArea' as any, e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-base text-gray-900 md:py-2 md:text-sm outline-none transition-colors focus:border-estate-gold-dark focus:bg-white focus:ring-1 focus:ring-estate-gold/30 dark:border-[#262626] dark:bg-[#0A0A0A] dark:text-white dark:focus:border-estate-gold"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-500">{lang === 'ar' ? 'عدد الغرف (على الأقل)' : 'Bedrooms (min)'}</label>
                <div className="flex items-center gap-1.5">
                  <BedDouble className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                  {BEDROOM_OPTIONS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setFilter('bedrooms', filters.bedrooms === String(n) ? '' : String(n))}
                      className={cn(
                        'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full px-1.5 text-xs font-medium transition-all md:h-8 md:min-h-0 md:min-w-8',
                        filters.bedrooms === String(n)
                          ? 'bg-estate-gold text-[#0F1A2C] dark:bg-estate-gold'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-[#262626] dark:text-gray-300 dark:hover:bg-white/10'
                      )}
                    >
                      {n}+
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-500">{lang === 'ar' ? 'الحمامات (على الأقل)' : 'Bathrooms (min)'}</label>
                <input
                  type="number"
                  min="0"
                  placeholder="∞"
                  value={filters.bathrooms}
                  onChange={(e) => setFilter('bathrooms', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-base text-gray-900 md:py-2 md:text-sm outline-none transition-colors focus:border-estate-gold-dark focus:bg-white focus:ring-1 focus:ring-estate-gold/30 dark:border-[#262626] dark:bg-[#0A0A0A] dark:text-white dark:focus:border-estate-gold"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-500">{lang === 'ar' ? 'نوع الإعلان' : 'Listing Type'}</label>
                <select
                  value={filters.listingType}
                  onChange={(e) => setFilter('listingType', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-base text-gray-900 md:py-2 md:text-sm outline-none transition-colors focus:border-estate-gold-dark focus:bg-white focus:ring-1 focus:ring-estate-gold/30 dark:border-[#262626] dark:bg-[#0A0A0A] dark:text-white dark:focus:border-estate-gold"
                >
                  <option value="">{lang === 'ar' ? 'الكل' : 'All'}</option>
                  {LISTING_TYPES.map((o) => (
                    <option key={o.value} value={o.value}>{lang === 'ar' ? o.labelAr : o.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-500">{lang === 'ar' ? 'حالة المشروع' : 'Project Status'}</label>
                <select
                  value={filters.status}
                  onChange={(e) => setFilter('status', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-base text-gray-900 md:py-2 md:text-sm outline-none transition-colors focus:border-estate-gold-dark focus:bg-white focus:ring-1 focus:ring-estate-gold/30 dark:border-[#262626] dark:bg-[#0A0A0A] dark:text-white dark:focus:border-estate-gold"
                >
                  <option value="">{lang === 'ar' ? 'الكل' : 'All'}</option>
                  {PROJECT_STATUSES.map((o) => (
                    <option key={o.value} value={o.value}>{lang === 'ar' ? o.labelAr : o.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-500">{lang === 'ar' ? 'المطوّر' : 'Developer'}</label>
                <input
                  type="text"
                  placeholder={lang === 'ar' ? 'مثال: إعمار' : 'e.g. Emaar Misr'}
                  value={filters.developer}
                  onChange={(e) => setFilter('developer', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-base text-gray-900 md:py-2 md:text-sm outline-none transition-colors focus:border-estate-gold-dark focus:bg-white focus:ring-1 focus:ring-estate-gold/30 dark:border-[#262626] dark:bg-[#0A0A0A] dark:text-white dark:focus:border-estate-gold"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-500">{lang === 'ar' ? 'المرافق (افصل بفاصلة)' : 'Amenities (comma-separated)'}</label>
                <input
                  type="text"
                  placeholder={lang === 'ar' ? 'مثال: حمام سباحة، جيم' : 'e.g. Swimming Pool, Gym'}
                  value={filters.amenities}
                  onChange={(e) => setFilter('amenities', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-base text-gray-900 md:py-2 md:text-sm outline-none transition-colors focus:border-estate-gold-dark focus:bg-white focus:ring-1 focus:ring-estate-gold/30 dark:border-[#262626] dark:bg-[#0A0A0A] dark:text-white dark:focus:border-estate-gold"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-500">{lang === 'ar' ? 'المحافظة (slug)' : 'Governorate (slug)'}</label>
                <input
                  type="text"
                  placeholder={lang === 'ar' ? 'مثال: cairo' : 'e.g. cairo'}
                  value={filters.governorate}
                  onChange={(e) => setFilter('governorate', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-base text-gray-900 md:py-2 md:text-sm outline-none transition-colors focus:border-estate-gold-dark focus:bg-white focus:ring-1 focus:ring-estate-gold/30 dark:border-[#262626] dark:bg-[#0A0A0A] dark:text-white dark:focus:border-estate-gold"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-500">{lang === 'ar' ? 'الحي (slug)' : 'District (slug)'}</label>
                <input
                  type="text"
                  placeholder={lang === 'ar' ? 'مثال: fifth-settlement' : 'e.g. fifth-settlement'}
                  value={filters.district}
                  onChange={(e) => setFilter('district', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-base text-gray-900 md:py-2 md:text-sm outline-none transition-colors focus:border-estate-gold-dark focus:bg-white focus:ring-1 focus:ring-estate-gold/30 dark:border-[#262626] dark:bg-[#0A0A0A] dark:text-white dark:focus:border-estate-gold"
                />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Button onClick={() => pushToURL()} className="min-h-[44px] bg-estate-gold hover:bg-estate-gold-dark md:min-h-0 dark:bg-estate-gold dark:hover:bg-estate-gold-dark">
                {t('projects.applyFilters')}
              </Button>
              {activeCount > 0 && (
                <button
                  onClick={() => { clearFilters(); setSearchValue(''); requestAnimationFrame(() => pushToURL()) }}
                  className="inline-flex min-h-[44px] items-center text-sm text-red-500 hover:underline md:min-h-0"
                >
                  {t('projects.clearAll')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Active filter chips */}
      {activeCount > 0 && (
        <div className="border-b border-gray-100 bg-white dark:border-[#262626] dark:bg-black">
          <div className="container flex items-center gap-2 px-4 py-2.5 overflow-x-auto scrollbar-hide">
            <span className="flex-shrink-0 text-xs text-gray-400">{lang === 'ar' ? 'الفلاتر:' : 'Filters:'}</span>
            {filters.q && (
              <ActiveChip
                label={`"${filters.q}"`}
                onRemove={() => { clearFilter('q'); setSearchValue(''); requestAnimationFrame(() => pushToURL()) }}
              />
            )}
            {filters.city && (
              <ActiveChip
                label={currentCity ? (lang === 'ar' ? currentCity.labelAr : currentCity.label) : filters.city}
                onRemove={() => { clearFilter('city'); requestAnimationFrame(() => pushToURL()) }}
              />
            )}
            {filters.propertyType && (
              <ActiveChip
                label={currentType ? (lang === 'ar' ? currentType.labelAr : currentType.label) : filters.propertyType}
                onRemove={() => { clearFilter('propertyType'); requestAnimationFrame(() => pushToURL()) }}
              />
            )}
            {filters.bedrooms && (
              <ActiveChip
                label={`${filters.bedrooms} ${lang === 'ar' ? 'غرف نوم' : 'Beds'}`}
                onRemove={() => { clearFilter('bedrooms'); requestAnimationFrame(() => pushToURL()) }}
              />
            )}
            {filters.minPrice && (
              <ActiveChip
                label={`${lang === 'ar' ? 'من' : 'Min'} ${(Number(filters.minPrice) / 1_000_000).toFixed(0)}M`}
                onRemove={() => { clearFilter('minPrice'); requestAnimationFrame(() => pushToURL()) }}
              />
            )}
            {filters.maxPrice && (
              <ActiveChip
                label={`${lang === 'ar' ? 'إلى' : 'Max'} ${(Number(filters.maxPrice) / 1_000_000).toFixed(0)}M`}
                onRemove={() => { clearFilter('maxPrice'); requestAnimationFrame(() => pushToURL()) }}
              />
            )}
            {filters.minArea && (
              <ActiveChip
                label={`${lang === 'ar' ? 'مساحة من' : 'Area ≥'} ${filters.minArea}m²`}
                onRemove={() => { clearFilter('minArea'); requestAnimationFrame(() => pushToURL()) }}
              />
            )}
            {filters.maxArea && (
              <ActiveChip
                label={`${lang === 'ar' ? 'مساحة إلى' : 'Area ≤'} ${filters.maxArea}m²`}
                onRemove={() => { clearFilter('maxArea'); requestAnimationFrame(() => pushToURL()) }}
              />
            )}
            {filters.bathrooms && (
              <ActiveChip
                label={`${filters.bathrooms} ${lang === 'ar' ? 'حمامات' : 'Baths'}`}
                onRemove={() => { clearFilter('bathrooms'); requestAnimationFrame(() => pushToURL()) }}
              />
            )}
            {filters.listingType && (
              <ActiveChip
                label={currentListingType ? (lang === 'ar' ? currentListingType.labelAr : currentListingType.label) : filters.listingType}
                onRemove={() => { clearFilter('listingType'); requestAnimationFrame(() => pushToURL()) }}
              />
            )}
            {filters.governorate && (
              <ActiveChip
                label={filters.governorate}
                onRemove={() => { clearFilter('governorate'); requestAnimationFrame(() => pushToURL()) }}
              />
            )}
            {filters.district && (
              <ActiveChip
                label={filters.district}
                onRemove={() => { clearFilter('district'); requestAnimationFrame(() => pushToURL()) }}
              />
            )}
            {filters.developer && (
              <ActiveChip
                label={filters.developer}
                onRemove={() => { clearFilter('developer'); requestAnimationFrame(() => pushToURL()) }}
              />
            )}
            {filters.status && (
              <ActiveChip
                label={currentStatus ? (lang === 'ar' ? currentStatus.labelAr : currentStatus.label) : filters.status}
                onRemove={() => { clearFilter('status'); requestAnimationFrame(() => pushToURL()) }}
              />
            )}
            {filters.amenities && (
              <ActiveChip
                label={filters.amenities}
                onRemove={() => { clearFilter('amenities'); requestAnimationFrame(() => pushToURL()) }}
              />
            )}
            <button
              onClick={() => { clearFilters(); setSearchValue(''); requestAnimationFrame(() => pushToURL()) }}
              className="flex-shrink-0 text-xs font-medium text-red-500 hover:text-red-600"
            >
              {t('projects.clearAll')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

interface SuggestItem {
  id: string
  name: string
  nameArabic?: string | null
  slug: string
  coverImage?: string | null
  startPrice?: number | null
  city?: { name: string; nameArabic?: string | null } | null
}

function suggestPriceLabel(startPrice: number | null | undefined, ar: boolean): string {
  if (typeof startPrice !== 'number' || !Number.isFinite(startPrice) || startPrice <= 0) return ''
  const short = startPrice >= 1_000_000
    ? `${(startPrice / 1_000_000).toFixed(startPrice % 1_000_000 === 0 ? 0 : 1)}M`
    : `${Math.round(startPrice / 1000)}K`
  return ar ? `من ${short} ج.م` : `from ${short} EGP`
}

// Cheap inline `<mark>` highlight of the matched substring — layout-neutral, RTL-safe.
function HighlightedName({ name, query }: { name: string; query: string }) {
  const q = query.trim().toLowerCase()
  const idx = q ? name.toLowerCase().indexOf(q) : -1
  if (idx < 0) return <>{name}</>
  return (
    <>
      {name.slice(0, idx)}
      <mark className="bg-transparent font-semibold text-estate-gold-dark dark:text-estate-gold">
        {name.slice(idx, idx + q.length)}
      </mark>
      {name.slice(idx + q.length)}
    </>
  )
}

function SuggestThumb({ src, alt }: { src?: string | null; alt: string }) {
  const [dead, setDead] = useState(false)
  const url = src || '/images/placeholder.jpg'
  if (!dead) {
    return (
      <Image
        src={url}
        alt={alt}
        width={40}
        height={40}
        loading="lazy"
        onError={() => setDead(true)}
        className="h-10 w-10 flex-shrink-0 rounded-2xl object-cover"
      />
    )
  }
  return (
    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-estate-navy text-[8px] font-bold tracking-widest text-estate-gold">
      GHAYA
    </span>
  )
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-estate-navy/10 px-2.5 py-1 text-xs font-medium text-estate-navy dark:bg-estate-gold/10 dark:text-estate-gold">
      {label}
      <button onClick={onRemove} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full hover:bg-estate-navy/10 md:min-h-0 md:min-w-0 md:p-0.5 dark:hover:bg-estate-gold/10">
        <X className="h-3 w-3" />
      </button>
    </span>
  )
}
