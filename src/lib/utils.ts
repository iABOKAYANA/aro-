import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatMoney, getActiveCurrency } from '@/lib/currency'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Prices are stored in EGP; this renders them in whatever currency the visitor
 * picked in the navbar (EGP by default). Keeping the name means the ~100 call
 * sites across the app don't need to change.
 */
export function formatEGP(amount: number): string {
  return formatMoney(amount, getActiveCurrency())
}

export function formatSQM(area: number): string {
  // Explicit locale: the bare default differs between the server runtime and
  // the visitor's browser (e.g. Arabic-Indic digits), which hydrates to
  // different HTML on first paint. 'en-US' is deterministic on both sides.
  return `${area.toLocaleString('en-US')} sqm`
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str
  return str.slice(0, length) + '...'
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout
  return (...args: Parameters<T>) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

export function getInitials(name: string | null | undefined): string {
  if (!name) return '?'
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function classNames(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

/** JSON.parse that never throws — returns the fallback on bad/empty data. */
export function parseJsonSafe<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw) as T
    return parsed === null || parsed === undefined ? fallback : parsed
  } catch {
    return fallback
  }
}

export const EGYPT_GOVERNORATES = [
  'Cairo',
  'Alexandria',
  'Giza',
  'Luxor',
  'Aswan',
  'Port Said',
  'Suez',
  'Ismailia',
  'Damietta',
  'Dakahlia',
  'Sharqia',
  'Monufia',
  'Qalyubia',
  'Beheira',
  'Kafr El Sheikh',
  'Gharbia',
  'Mediterranean',
  'North Sinai',
  'South Sinai',
  'New Valley',
  'Matrouh',
  'Red Sea',
] as const

export const PROPERTY_TYPES = [
  'APARTMENT',
  'VILLA',
  'TOWNHOUSE',
  'PENTHOUSE',
  'STUDIO',
  'DUPLEX',
  'CHALET',
  'LAND',
  'COMMERCIAL',
  'ADMINISTRATIVE',
  'MEDICAL',
] as const

export const LISTING_TYPES = ['SALE', 'RENT', 'RESALE', 'INSTALLMENT'] as const
