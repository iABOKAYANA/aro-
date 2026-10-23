'use client'

import { useEffect, useRef, useState } from 'react'
import { Banknote } from 'lucide-react'
import { CURRENCIES, CURRENCY_META, type Currency } from '@/lib/currency'
import { useCurrency } from '@/components/currency/currency-provider'
import { useLanguage } from '@/lib/language-context'

/**
 * Navbar currency switcher: EGP ⇄ USD ⇄ SAR.
 *
 * Changing it flips the shared store, so `formatEGP()` everywhere (cards,
 * project detail, dashboards) reformats on the next render.
 */
export default function CurrencySwitcher() {
  const { currency, setCurrency } = useCurrency()
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Change currency — ${currency}`}
        className="flex min-h-[44px] min-w-[52px] items-center justify-center gap-1.5 rounded-full border border-gray-200 px-3 py-0 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-[#262626] dark:text-gray-300 dark:hover:bg-[#0A0A0A]"
      >
        <Banknote className="h-3.5 w-3.5" />
        <span>{currency}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            aria-label="Currency"
            className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-2xl border bg-white shadow-lg dark:border-[#262626] dark:bg-[#0A0A0A]"
          >
            {CURRENCIES.map((c: Currency) => (
              <button
                key={c}
                role="option"
                aria-selected={currency === c}
                onClick={() => {
                  setCurrency(c)
                  setOpen(false)
                }}
                className={`flex w-full items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-[#1a1a1a] ${
                  currency === c
                    ? 'font-medium text-estate-gold'
                    : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="w-9 font-mono text-xs text-gray-500">{c}</span>
                  {CURRENCY_META[c].label}
                </span>
                {currency === c && <span className="text-estate-gold">✓</span>}
              </button>
            ))}
            <p className="border-t border-gray-100 px-3 py-2 text-[11px] leading-relaxed text-gray-500 dark:border-[#262626] dark:text-gray-400">
              {ar ? 'الأسعار متسجلة بالجنيه وبتتحوّل للعرض بس.' : 'Prices are stored in EGP and converted for display only.'}
            </p>
          </div>
        </>
      )}
    </div>
  )
}
