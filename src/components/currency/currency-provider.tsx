'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import { useRouter } from 'next/navigation'
import {
  CURRENCIES,
  type Currency,
  DEFAULT_RATES,
  formatMoney,
  getActiveCurrency,
  getRates,
  normaliseRates,
  setActiveCurrency,
  setRates,
  subscribeCurrency,
} from '@/lib/currency'

const STORAGE_KEY = 'ghaya.currency'

type Ctx = {
  currency: Currency
  rates: Record<Currency, number>
  setCurrency: (c: Currency) => void
  /** Format a value stored in EGP, in the active currency. */
  format: (amountEgp: number) => string
}

const CurrencyContext = createContext<Ctx | null>(null)

/** Re-render whenever the shared store changes (any source). */
function useStoreSnapshot() {
  return useSyncExternalStore(subscribeCurrency, getActiveCurrency, () => 'EGP' as Currency)
}

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const currency = useStoreSnapshot()
  const [, bump] = useState(0)
  const [rates, setRatesState] = useState<Record<Currency, number>>(() => ({ ...DEFAULT_RATES }))

  const refresh = useCallback(() => bump((n) => n + 1), [])

  // Subscribe so a `setRates()` coming from anywhere re-renders consumers too.
  useEffect(() => subscribeCurrency(refresh), [refresh])

  // Hydrate from localStorage after mount (avoids SSR/client mismatch).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY) as Currency | null
      if (saved && CURRENCIES.includes(saved)) setActiveCurrency(saved)
    } catch {
      /* private mode */
    }
  }, [])

  // Pull the CEO-editable rates from system settings, once.
  useEffect(() => {
    let cancelled = false
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        const raw = data?.platform?.currencyRates
        if (raw) {
          const next = normaliseRates(raw)
          setRates(next)
          setRatesState(next)
        }
      })
      .catch(() => {
        /* keep defaults */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const setCurrency = useCallback(
    (next: Currency) => {
      setActiveCurrency(next)
      try {
        window.localStorage.setItem(STORAGE_KEY, next)
      } catch {
        /* ignore */
      }
      // Re-render server components so every server-rendered price (project
      // lists, detail pages…) picks up the new currency immediately.
      router.refresh()
    },
    [router]
  )

  const value = useMemo<Ctx>(
    () => ({
      currency,
      rates: rates || getRates(),
      setCurrency,
      format: (amountEgp: number) => formatMoney(amountEgp, getActiveCurrency()),
    }),
    [currency, rates, setCurrency]
  )

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}

export function useCurrency(): Ctx {
  const ctx = useContext(CurrencyContext)
  if (!ctx) throw new Error('useCurrency must be used inside <CurrencyProvider>')
  return ctx
}
