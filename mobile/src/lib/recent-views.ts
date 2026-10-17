import { getItemAsync, setItemAsync } from '@/lib/storage';

/**
 * Recently viewed projects/units — the mobile twin of the website's
 * `ghaya:recent-projects` list in `src/lib/saved-projects.ts`.
 *
 * Storage goes through `@/lib/storage` (Keychain/Keystore on native,
 * `localStorage` on web) instead of AsyncStorage directly: that package is
 * not installed and no new dependencies may be added, and the shim already
 * gives the same fail-soft, never-throws semantics on every platform.
 */
export type RecentView = {
  id: string;
  slug: string;
  name: string;
  nameArabic?: string | null;
  coverImage?: string | null;
  startPrice?: number | null;
  /** Epoch ms of the view — stamped by `recordRecentView`; older rows lack it. */
  savedAt?: number;
};

const KEY = 'ghaya.recentViews';
const MAX = 10;

function isValid(v: unknown): v is RecentView {
  if (!v || typeof v !== 'object') return false;
  const row = v as Partial<RecentView>;
  return typeof row.id === 'string' && typeof row.slug === 'string' && typeof row.name === 'string';
}

function parse(raw: string | null): RecentView[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValid).slice(0, MAX);
  } catch {
    return [];
  }
}

/** Record a view: dedupe by id (move-to-front), stamp `savedAt`, cap 10. Never throws. */
export async function recordRecentView(v: RecentView): Promise<void> {
  try {
    if (!isValid(v)) return;
    const current = parse(await getItemAsync(KEY));
    const rest = current.filter((row) => row.id !== v.id);
    await setItemAsync(KEY, JSON.stringify([{ ...v, savedAt: Date.now() }, ...rest].slice(0, MAX)));
  } catch {
    // A view that fails to persist must never break the screen showing it.
  }
}

/** Recent views, newest first. `[]` on first run or corrupt data. */
export async function getRecentViews(): Promise<RecentView[]> {
  try {
    return parse(await getItemAsync(KEY));
  } catch {
    return [];
  }
}
