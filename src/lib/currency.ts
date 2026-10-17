/**
 * Multi-currency display.
 *
 * Every price in the database is stored in EGP. This module keeps a single
 * process-wide "active currency" that `formatEGP()` in `lib/utils.ts` reads on
 * every render — so the ~100 existing call sites switch currency without any of
 * them changing.
 *
 * Rates are `EGP per 1 unit` (CEO-editable via Settings → platform →
 * currencyRates): { EGP: 1, USD: 48.5, SAR: 12.9 }.
 */

export const CURRENCIES = ['EGP', 'USD', 'SAR'] as const
export type Currency = (typeof CURRENCIES)[number]

export const CURRENCY_META: Record<Currency, { label: string; symbol: string; locale: string }> = {
  EGP: { label: 'Egyptian Pound', symbol: 'EGP', locale: 'en-EG' },
  USD: { label: 'US Dollar', symbol: 'USD', locale: 'en-US' },
  SAR: { label: 'Saudi Riyal', symbol: 'SAR', locale: 'en-SA' },
}

export const DEFAULT_RATES: Record<Currency, number> = { EGP: 1, USD: 48.5, SAR: 12.9 }

let active: Currency = 'EGP'
let rates: Record<Currency, number> = { ...DEFAULT_RATES }
const listeners = new Set<() => void>()

function emit() {
  for (const fn of listeners) {
    try {
      fn()
    } catch {
      /* a broken subscriber must not break the switch */
    }
  }
}

export function getActiveCurrency(): Currency {
  return active
}

export function subscribeCurrency(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function setActiveCurrency(next: Currency) {
  if (!CURRENCIES.includes(next) || next === active) return
  active = next
  emit()
}

export function getRates(): Record<Currency, number> {
  return rates
}

/** Merge only known currencies and only sane values — never trust the payload. */
export function setRates(raw: unknown) {
  if (!raw || typeof raw !== 'object') return
  const source = raw as Record<string, unknown>
  let changed = false
  const next = { ...rates }
  for (const key of CURRENCIES) {
    const value = Number(source[key])
    if (Number.isFinite(value) && value > 0 && Math.abs(Math.log10(value)) < 6) {
      if (next[key] !== value) {
        next[key] = value
        changed = true
      }
    }
  }
  if (changed) {
    rates = next
    emit()
  }
}

/** EGP → target currency. */
export function convertFromEGP(amountEgp: number, to: Currency = active): number {
  if (to === 'EGP' || !Number.isFinite(amountEgp)) return amountEgp
  const perUnit = rates[to]
  if (!perUnit) return amountEgp
  return amountEgp / perUnit
}

/** Format a value that is stored in EGP, in the active (or given) currency. */
export function formatMoney(amountEgp: number, to: Currency = active): string {
  if (!Number.isFinite(amountEgp)) return '—'
  const meta = CURRENCY_META[to]
  const converted = convertFromEGP(amountEgp, to)
  try {
    return new Intl.NumberFormat(meta.locale, {
      style: 'currency',
      currency: to,
      minimumFractionDigits: 0,
      maximumFractionDigits: to === 'EGP' ? 0 : 2,
    }).format(converted)
  } catch {
    return `${converted.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${meta.symbol}`
  }
}

/** Normalise whatever the settings row contains into a rates object. */
export function normaliseRates(raw: unknown): Record<Currency, number> {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_RATES }
  const source = raw as Record<string, unknown>
  const out = { ...DEFAULT_RATES }
  for (const key of CURRENCIES) {
    const value = Number(source[key])
    if (Number.isFinite(value) && value > 0) out[key] = value
  }
  return out
}
