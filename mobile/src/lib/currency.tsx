import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { apiFetch } from '@/api/client';
import { getItemAsync, setItemAsync } from '@/lib/storage';
import {
  DEFAULT_RATES,
  normaliseRates,
  type CurrencyCode,
  type CurrencyCode as Currency,
} from '@/lib/format';

/**
 * Display-currency switcher.
 *
 * Rates come from `GET /api/settings` (`platform.currencyRates`) — the exact
 * source the website uses — so a price shown in the app and the same price
 * shown on the site always convert identically. The choice itself is personal
 * and lives in the Keychain/Keystore, not on the server, so it survives a
 * sign-out and needs no backend work.
 */

const KEY = 'ghaya.currency';

type CurrencyContextValue = {
  currency: CurrencyCode;
  rates: Record<CurrencyCode, number>;
  setCurrency: (next: CurrencyCode) => void;
  /** True once server rates have been read (or failed soft to the defaults). */
  ratesReady: boolean;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<CurrencyCode>('EGP');
  const [rates, setRates] = useState<Record<CurrencyCode, number>>(DEFAULT_RATES);
  const [ratesReady, setRatesReady] = useState(false);

  // Restore the saved preference first — before any network, so the first
  // render never flashes EGP to a user who chose USD.
  useEffect(() => {
    getItemAsync(KEY)
      .then((raw) => {
        if (raw === 'USD' || raw === 'SAR' || raw === 'EGP') setCurrencyState(raw);
      })
      .catch(() => {});
  }, []);

  const loadRates = useCallback(async () => {
    try {
      const settings = await apiFetch<{ platform?: { currencyRates?: unknown } }>('/api/settings');
      setRates(normaliseRates(settings?.platform?.currencyRates));
    } catch {
      // Offline: keep whatever we have (defaults on first run).
    } finally {
      setRatesReady(true);
    }
  }, []);

  useEffect(() => {
    loadRates();
  }, [loadRates]);

  const setCurrency = useCallback((next: CurrencyCode) => {
    setCurrencyState(next);
    setItemAsync(KEY, next).catch(() => {});
  }, []);

  const value = useMemo<CurrencyContextValue>(
    () => ({ currency, rates, setCurrency, ratesReady }),
    [currency, rates, setCurrency, ratesReady]
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used inside <CurrencyProvider>');
  return ctx;
}

export type { Currency };
