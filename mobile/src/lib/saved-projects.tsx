import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { getItemAsync, setItemAsync } from '@/lib/storage';

/**
 * Saved (bookmarked) projects — the mobile twin of the website's
 * `src/lib/saved-projects.ts`, which keeps the same list in localStorage.
 *
 * The website persists per-user, the app persists per-device: the API
 * deliberately has no saved-projects endpoint (the web owns that list), so the
 * list lives in `@/lib/storage` — Keychain/Keystore on native, `localStorage`
 * on web — and it survives a sign-out like the currency choice does.
 */
export type SavedProject = {
  id: string;
  slug: string;
  name: string;
  nameArabic?: string | null;
  coverImage?: string | null;
  startPrice?: number | null;
  status?: string | null;
  savedAt: number;
};

const STORAGE_KEY = 'ghaya.saved-projects';

/** Same shape the web writes, so a project is recognised by id *or* slug. */
export const SAVED_MAX = 50;

function parse(raw: string | null): SavedProject[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x): x is SavedProject =>
          !!x &&
          typeof x === 'object' &&
          typeof (x as SavedProject).id === 'string' &&
          typeof (x as SavedProject).slug === 'string' &&
          typeof (x as SavedProject).name === 'string'
      )
      .sort((a, b) => b.savedAt - a.savedAt)
      .slice(0, SAVED_MAX);
  } catch {
    return [];
  }
}

type SavedProjectsContextValue = {
  items: SavedProject[];
  ready: boolean;
  has: (idOrSlug: string) => boolean;
  /** Adds/removes the project and returns the *new* saved state. */
  toggle: (project: SavedProject) => boolean;
  remove: (idOrSlug: string) => void;
};

const SavedProjectsContext = createContext<SavedProjectsContextValue | null>(null);

export function SavedProjectsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<SavedProject[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getItemAsync(STORAGE_KEY)
      .then((raw) => setItems(parse(raw)))
      .catch(() => setItems([]))
      .finally(() => setReady(true));
  }, []);

  const persist = useCallback((next: SavedProject[]) => {
    setItems(next);
    // A storage failure must never swallow the tap — memory still works.
    setItemAsync(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const has = useCallback(
    (idOrSlug: string) => items.some((x) => x.id === idOrSlug || x.slug === idOrSlug),
    [items]
  );

  const toggle = useCallback(
    (project: SavedProject) => {
      const exists = items.some((x) => x.id === project.id || x.slug === project.slug);
      if (exists) {
        persist(items.filter((x) => x.id !== project.id && x.slug !== project.slug));
        return false;
      }
      persist([{ ...project, savedAt: Date.now() }, ...items].slice(0, SAVED_MAX));
      return true;
    },
    [items, persist]
  );

  const remove = useCallback(
    (idOrSlug: string) => {
      persist(items.filter((x) => x.id !== idOrSlug && x.slug !== idOrSlug));
    },
    [items, persist]
  );

  const value = useMemo<SavedProjectsContextValue>(
    () => ({ items, ready, has, toggle, remove }),
    [items, ready, has, toggle, remove]
  );

  return <SavedProjectsContext.Provider value={value}>{children}</SavedProjectsContext.Provider>;
}

export function useSavedProjects(): SavedProjectsContextValue {
  const ctx = useContext(SavedProjectsContext);
  if (!ctx) throw new Error('useSavedProjects must be used inside <SavedProjectsProvider>');
  return ctx;
}
