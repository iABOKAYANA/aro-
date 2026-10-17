import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { getItemAsync, setItemAsync } from '@/lib/storage';

/** Mirrors src/lib/compare.tsx on the web — same cap, same storage key. */
export type CompareItem = { id: string; slug: string; name: string };

export const COMPARE_MAX = 4;
const STORAGE_KEY = 'ghaya.compare';

type CompareContextValue = {
  items: CompareItem[];
  full: boolean;
  has: (idOrSlug: string) => boolean;
  /** Returns a message when the list is full, `null` otherwise. */
  toggle: (item: CompareItem) => string | null;
  remove: (idOrSlug: string) => void;
  clear: () => void;
  ready: boolean;
};

const CompareContext = createContext<CompareContextValue | null>(null);

function parse(raw: string | null): CompareItem[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x): x is CompareItem =>
          !!x &&
          typeof x === 'object' &&
          typeof (x as CompareItem).id === 'string' &&
          typeof (x as CompareItem).slug === 'string' &&
          typeof (x as CompareItem).name === 'string'
      )
      .slice(0, COMPARE_MAX);
  } catch {
    return [];
  }
}

export function CompareProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CompareItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getItemAsync(STORAGE_KEY)
      .then((raw) => setItems(parse(raw)))
      .catch(() => setItems([]))
      .finally(() => setReady(true));
  }, []);

  const persist = useCallback((next: CompareItem[]) => {
    setItems(next);
    // Storage failures must never block a tap — the in-memory list still works.
    setItemAsync(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const value = useMemo<CompareContextValue>(() => {
    const matches = (item: CompareItem, key: string) => item.id === key || item.slug === key;
    return {
      items,
      ready,
      full: items.length >= COMPARE_MAX,
      has: (key) => items.some((item) => matches(item, key)),
      toggle: (item) => {
        if (items.some((entry) => matches(entry, item.id) || matches(entry, item.slug))) {
          persist(items.filter((entry) => !matches(entry, item.id) && !matches(entry, item.slug)));
          return null;
        }
        if (items.length >= COMPARE_MAX) return `You can compare up to ${COMPARE_MAX} projects.`;
        persist([...items, item]);
        return null;
      },
      remove: (key) => persist(items.filter((entry) => !matches(entry, key))),
      clear: () => persist([]),
    };
  }, [items, ready, persist]);

  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}

export function useCompare(): CompareContextValue {
  const ctx = useContext(CompareContext);
  if (!ctx) throw new Error('useCompare must be used inside <CompareProvider>');
  return ctx;
}
