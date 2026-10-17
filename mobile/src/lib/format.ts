/**
 * Formatting helpers shared by every screen.
 *
 * Prices are **stored in EGP** everywhere (Prisma), same as the website — only
 * the display currency changes, using the rates published in
 * `settings.platform.currencyRates` so the app and the site always agree on the
 * number a user sees.
 */

export type CurrencyCode = 'EGP' | 'USD' | 'SAR';

export const CURRENCY_OPTIONS: { code: CurrencyCode; label: string; symbol: string }[] = [
  { code: 'EGP', label: 'Egyptian Pound', symbol: 'E£' },
  { code: 'USD', label: 'US Dollar', symbol: '$' },
  { code: 'SAR', label: 'Saudi Riyal', symbol: 'SR' },
];

/** Fallback matches the site's `src/lib/currency.ts` default. */
export const DEFAULT_RATES: Record<CurrencyCode, number> = { EGP: 1, USD: 48.5, SAR: 12.9 };

export function normaliseRates(raw: unknown): Record<CurrencyCode, number> {
  const out = { ...DEFAULT_RATES };
  if (raw && typeof raw === 'object') {
    for (const code of ['EGP', 'USD', 'SAR'] as const) {
      const value = Number((raw as Record<string, unknown>)[code]);
      if (Number.isFinite(value) && value > 0) out[code] = value;
    }
  }
  return out;
}

/** Convert a value stored in EGP into the display currency. */
export function fromEgp(valueInEgp: number, currency: CurrencyCode, rates = DEFAULT_RATES) {
  const rate = rates[currency] || 1;
  return currency === 'EGP' ? valueInEgp : valueInEgp / rate;
}

export function formatMoney(
  value: number | null | undefined,
  currency: CurrencyCode = 'EGP',
  rates = DEFAULT_RATES,
  opts: { compact?: boolean } = {}
): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const converted = fromEgp(Number(value), currency, rates);

  if (opts.compact) {
    const abs = Math.abs(converted);
    if (abs >= 1_000_000_000) return `${trim(converted / 1_000_000_000)}B ${currency}`;
    if (abs >= 1_000_000) return `${trim(converted / 1_000_000)}M ${currency}`;
    if (abs >= 1_000) return `${trim(converted / 1_000)}K ${currency}`;
  }

  const symbol = CURRENCY_OPTIONS.find((c) => c.code === currency)?.symbol ?? '';
  const rounded = Math.round(converted);
  return `${symbol} ${rounded.toLocaleString('en-US')}`;
}

function trim(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

/** Square metres, with the same `m²` the website prints. */
export function formatArea(sqm: number | null | undefined): string {
  if (sqm === null || sqm === undefined || !Number.isFinite(Number(sqm))) return '—';
  return `${Math.round(Number(sqm) * 10) / 10} m²`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${Math.round(Number(value))}%`;
}

export function formatDate(iso: string | number | Date | null | undefined, withTime = false): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

export function timeAgo(iso: string | number | Date | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(date);
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).slice(0, 2);
  const joined = parts.map((p) => p.charAt(0).toUpperCase()).join('');
  return joined || '?';
}

/** `NEW`, `UNDER_CONSTRUCTION`, `camelCase` → `New`, `Under construction`. */
export function humanise(value: string | null | undefined): string {
  if (!value) return '—';
  const spaced = value.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return phone;
  return `${phone.slice(0, 4)}•••${phone.slice(-3)}`;
}
