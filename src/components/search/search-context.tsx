'use client'

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

// ─── Types ───────────────────────────────────────────────

export interface SearchState {
  q: string
  city: string
  governorate: string
  district: string
  propertyType: string
  listingType: string
  bedrooms: string
  bathrooms: string
  minPrice: string
  maxPrice: string
  minArea: string
  maxArea: string
  developer: string
  status: string
  amenities: string
  sortBy: string
  page: string
  limit: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  chips?: Array<{ label: string; value: string; field: string }>
  blocks?: ResponseBlock[]
  intent?: string
}

export interface TextBlock {
  type: 'text'
  content: string
}

export interface PropertyGridBlock {
  type: 'property_grid'
  title: string
  projects?: any[]
  units?: any[]
  total: number
}

export interface ComparisonBlock {
  type: 'comparison'
  title: string
  data: { projects: any[] }
}

export interface PaymentBlock {
  type: 'payment'
  title: string
  calculation: {
    unitPrice: number
    downPaymentPct: number
    downPaymentAmount: number
    financedAmount: number
    installmentYears: number
    totalInstallments: number
    semiAnnualPayment: number
    monthlyPayment: number
    pricePerSqm: number
    area: number
  }
}

export interface FilterUpdateBlock {
  type: 'filter_update'
  filters: Record<string, string | number>
  chips: Array<{ label: string; value: string; field: string }>
}

export type ResponseBlock = TextBlock | PropertyGridBlock | ComparisonBlock | PaymentBlock | FilterUpdateBlock

interface SearchContextValue {
  filters: SearchState
  messages: ChatMessage[]
  conversationId: string | null
  isTyping: boolean
  setFilter: (key: keyof SearchState, value: string) => void
  setFilters: (updates: Partial<SearchState>) => void
  clearFilters: () => void
  clearFilter: (key: keyof SearchState) => void
  applyParsedFilters: (filters: Record<string, unknown>, chips: Array<{ label: string; value: string; field: string }>, userQuery: string) => void
  addUserMessage: (content: string) => void
  addAssistantMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => string
  updateMessage: (id: string, patch: Partial<Pick<ChatMessage, 'content' | 'blocks' | 'intent'>>) => void
  setConversationId: (id: string) => void
  setIsTyping: (v: boolean) => void
  updateFiltersFromSearch: (filters: Record<string, string | number>) => void
  activeCount: number
  pushToURL: (overrides?: Partial<SearchState>) => void
}

// ─── Constants ───────────────────────────────────────────

const INITIAL_FILTERS: SearchState = {
  q: '', city: '', governorate: '', district: '', propertyType: '', listingType: '',
  bedrooms: '', bathrooms: '',
  minPrice: '', maxPrice: '', minArea: '', maxArea: '',
  developer: '', status: '', amenities: '',
  sortBy: 'newest', page: '1', limit: '',
}

const SearchContext = createContext<SearchContextValue | null>(null)

export function useSearch() {
  const ctx = useContext(SearchContext)
  if (!ctx) throw new Error('useSearch must be used within SearchProvider')
  return ctx
}

// ─── Helpers ─────────────────────────────────────────────

function filtersToParams(filters: SearchState): string {
  const params = new URLSearchParams()
  for (const [key, val] of Object.entries(filters)) {
    if (!val || val === '') continue
    // Defaults are omitted so bookmarked URLs stay clean.
    if (key === 'page' && val === '1') continue
    if (key === 'sortBy' && val === 'newest') continue
    if (key === 'limit' && (val === '' || val === '12')) continue
    params.set(key, val)
  }
  return params.toString()
}

function paramsToFilters(sp: URLSearchParams): SearchState {
  return {
    q: sp.get('q') || '',
    city: sp.get('city') || '',
    governorate: sp.get('governorate') || '',
    district: sp.get('district') || '',
    propertyType: sp.get('propertyType') || '',
    listingType: sp.get('listingType') || '',
    bedrooms: sp.get('bedrooms') || '',
    bathrooms: sp.get('bathrooms') || '',
    minPrice: sp.get('minPrice') || '',
    maxPrice: sp.get('maxPrice') || '',
    minArea: sp.get('minArea') || '',
    maxArea: sp.get('maxArea') || '',
    developer: sp.get('developer') || '',
    status: sp.get('status') || '',
    amenities: sp.get('amenities') || '',
    sortBy: sp.get('sortBy') || 'newest',
    page: sp.get('page') || '1',
    limit: sp.get('limit') || '',
  }
}

let msgId = 0
function nextMsgId() { return `msg-${++msgId}-${Date.now()}` }

// ─── Provider ────────────────────────────────────────────

export function SearchProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [filters, setFiltersState] = useState<SearchState>(() => paramsToFilters(searchParams))
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [isTyping, setIsTyping] = useState(false)
  const filtersRef = useRef(filters)
  filtersRef.current = filters

  useEffect(() => {
    const newFilters = paramsToFilters(searchParams)
    setFiltersState(prev => {
      const prevStr = JSON.stringify(prev)
      const newStr = JSON.stringify(newFilters)
      if (prevStr !== newStr) return newFilters
      return prev
    })
  }, [searchParams])

  // pushToURL always reads from filtersRef — never stale
  const pushToURL = useCallback((overrides?: Partial<SearchState>) => {
    const current = overrides
      ? { ...filtersRef.current, ...overrides }
      : filtersRef.current
    const qs = filtersToParams(current)
    router.push(`/projects${qs ? '?' + qs : ''}`, { scroll: false })
  }, [router])

  const setFilter = useCallback((key: keyof SearchState, value: string) => {
    setFiltersState(prev => ({ ...prev, [key]: value, page: '1' }))
  }, [])

  const setFilters = useCallback((updates: Partial<SearchState>) => {
    setFiltersState(prev => ({ ...prev, ...updates, page: updates.page || '1' }))
  }, [])

  const clearFilter = useCallback((key: keyof SearchState) => {
    setFiltersState(prev => ({ ...prev, [key]: '', page: '1' }))
  }, [])

  const clearFilters = useCallback(() => {
    setFiltersState(INITIAL_FILTERS)
  }, [])

  const applyParsedFilters = useCallback((
    parsedFilters: Record<string, unknown>,
    chips: Array<{ label: string; value: string; field: string }>,
    userQuery: string
  ) => {
    const updates: Partial<SearchState> = {}
    for (const [key, val] of Object.entries(parsedFilters)) {
      if (key in INITIAL_FILTERS && val !== undefined && val !== null) {
        (updates as Record<string, string>)[key] = String(val)
      }
    }
    updates.page = '1'
    setFiltersState(prev => ({ ...prev, ...updates }))

    const userMsg: ChatMessage = { id: nextMsgId(), role: 'user', content: userQuery, timestamp: Date.now() }
    const aiChips = chips.filter(c => c.field in INITIAL_FILTERS)
    const chipText = aiChips.map(c => `${c.label}: ${c.value}`).join('\n')
    const aiMsg: ChatMessage = {
      id: nextMsgId(), role: 'assistant',
      content: chipText ? `Found filters:\n${chipText}` : 'I understood your request. Try adjusting the filters on the left.',
      timestamp: Date.now(), chips: aiChips,
    }
    setMessages(prev => [...prev, userMsg, aiMsg])
  }, [])

  const addUserMessage = useCallback((content: string) => {
    const msg: ChatMessage = {
      id: nextMsgId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    }
    setMessages(prev => [...prev, msg])
  }, [])

  // Returns the new id so streaming senders can patch tokens in place.
  const addAssistantMessage = useCallback((msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const fullMsg: ChatMessage = {
      ...msg,
      id: nextMsgId(),
      timestamp: Date.now(),
    }
    setMessages(prev => [...prev, fullMsg])
    return fullMsg.id
  }, [])

  const updateMessage = useCallback((id: string, patch: Partial<Pick<ChatMessage, 'content' | 'blocks' | 'intent'>>) => {
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, ...patch } : m)))
  }, [])

  const updateFiltersFromSearch = useCallback((filterUpdates: Record<string, string | number>) => {
    const updates: Partial<SearchState> = {}
    for (const [key, val] of Object.entries(filterUpdates)) {
      if (key in INITIAL_FILTERS) {
        (updates as Record<string, string>)[key] = String(val)
      }
    }
    setFiltersState(prev => ({ ...prev, ...updates }))
  }, [])

  const activeCount = Object.entries(filters).filter(
    ([k, v]) => v && v !== '' && k !== 'page' && k !== 'limit' && k !== 'q' && !(k === 'sortBy' && v === 'newest')
  ).length

  const value: SearchContextValue = {
    filters, messages, conversationId, isTyping,
    setFilter, setFilters, clearFilters, clearFilter,
    applyParsedFilters, addUserMessage, addAssistantMessage, updateMessage,
    setConversationId, setIsTyping, updateFiltersFromSearch,
    activeCount, pushToURL,
  }

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>
}
