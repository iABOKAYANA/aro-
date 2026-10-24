'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import Link from 'next/link'
import { GitCompareArrows, X, ArrowRight } from 'lucide-react'

export type CompareItem = { id: string; slug: string; name: string }

export const COMPARE_MAX = 4
const STORAGE_KEY = 'ghaya.compare'

type Ctx = {
  items: CompareItem[]
  /** Full — a 5th project cannot be added. */
  full: boolean
  has: (id: string) => boolean
  toggle: (item: CompareItem) => void
  remove: (id: string) => void
  clear: () => void
  /** Set by toggle() so the button can flash an explanation instead of failing silently. */
  notice: string | null
}

const CompareContext = createContext<Ctx | null>(null)

export function CompareProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CompareItem[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      const parsed: unknown = raw ? JSON.parse(raw) : []
      if (Array.isArray(parsed)) {
        setItems(
          parsed
            .filter(
              (x): x is CompareItem =>
                !!x && typeof x === 'object' &&
                typeof (x as CompareItem).id === 'string' &&
                typeof (x as CompareItem).slug === 'string' &&
                typeof (x as CompareItem).name === 'string'
            )
            .slice(0, COMPARE_MAX)
        )
      }
    } catch {
      /* corrupted storage — start empty */
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      /* private mode */
    }
  }, [items, hydrated])

  const has = useCallback((id: string) => items.some((i) => i.id === id || i.slug === id), [items])

  const toggle = useCallback(
    (item: CompareItem) => {
      if (items.some((i) => i.id === item.id || i.slug === item.slug)) {
        setNotice(null)
        setItems((prev) => prev.filter((i) => i.id !== item.id && i.slug !== item.slug))
        return
      }
      if (items.length >= COMPARE_MAX) {
        setNotice(`You can compare up to ${COMPARE_MAX} projects at once.`)
        return
      }
      setNotice(null)
      setItems((prev) => [...prev, item])
    },
    [items]
  )

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id && i.slug !== id))
  }, [])

  const clear = useCallback(() => setItems([]), [])

  // Auto-dismiss the notice.
  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(() => setNotice(null), 3500)
    return () => window.clearTimeout(t)
  }, [notice])

  const value = useMemo<Ctx>(
    () => ({ items, full: items.length >= COMPARE_MAX, has, toggle, remove, clear, notice }),
    [items, has, toggle, remove, clear, notice]
  )

  return (
    <CompareContext.Provider value={value}>
      {children}
      <CompareTray />
    </CompareContext.Provider>
  )
}

export function useCompare(): Ctx {
  const ctx = useContext(CompareContext)
  if (!ctx) throw new Error('useCompare must be used inside <CompareProvider>')
  return ctx
}

/** Small "+ Compare" chip used on project cards and the project detail page. */
export function CompareToggle({ project }: { project: CompareItem }) {
  const { has, toggle, full } = useCompare()
  const active = has(project.id)

  return (
    <button
      type="button"
      onClick={() => toggle(project)}
      aria-pressed={active}
      title={
        active
          ? 'Remove from comparison'
          : full
            ? `Compare is full (${COMPARE_MAX})`
            : 'Add to comparison'
      }
      className={
        active
          ? 'inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-full bg-estate-gold px-2.5 text-[11px] font-semibold text-[#0F1A2C] shadow-sm transition-colors max-sm:min-h-11 max-sm:px-4'
          : 'inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-full bg-white/85 px-2.5 text-[11px] font-semibold text-gray-700 backdrop-blur-sm transition-colors hover:bg-estate-gold hover:text-[#0F1A2C] dark:bg-black/50 dark:text-gray-200 max-sm:min-h-11 max-sm:px-4'
      }
    >
      <GitCompareArrows className="h-3 w-3 max-sm:h-4 max-sm:w-4" />
      {active ? 'Added' : 'Compare'}
    </button>
  )
}

/** Floating bar that appears once at least one project is picked. */
function CompareTray() {
  const { items, remove, clear, notice } = useCompare()
  if (items.length === 0) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex justify-center px-4 pb-4">
      <div className="pointer-events-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-[#0d1428]/95 shadow-2xl backdrop-blur">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-estate-gold">
            <GitCompareArrows className="h-4 w-4" />
            Compare
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white">
              {items.length}/{COMPARE_MAX}
            </span>
          </span>

          <div className="flex flex-1 flex-wrap gap-2">
            {items.map((item) => (
              <span
                key={item.id}
                className="inline-flex max-w-[10rem] items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs text-gray-200"
              >
                <span className="truncate">{item.name}</span>
                <button
                  type="button"
                  onClick={() => remove(item.id)}
                  aria-label={`Remove ${item.name}`}
                  className="-mx-1.5 -my-1 flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={clear}
              className="-my-1 flex min-h-[36px] items-center rounded-lg px-3 text-xs text-gray-400 transition-colors hover:text-white"
            >
              Clear
            </button>
            <Link
              href={`/compare?ids=${items.map((i) => i.slug).join(',')}`}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-estate-gold px-4 text-xs font-semibold text-[#0F1A2C] transition-colors hover:brightness-110"
            >
              Compare now
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {notice && (
          <p className="border-t border-white/10 bg-amber-500/10 px-4 py-2 text-xs text-amber-300">
            {notice}
          </p>
        )}
      </div>
    </div>
  )
}
