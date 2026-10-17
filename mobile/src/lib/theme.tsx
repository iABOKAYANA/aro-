import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  StyleSheet,
  useColorScheme,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { darkTheme, lightTheme, type ThemeMode, type ThemeTokens } from '@/constants/brand';
import { getItemAsync, setItemAsync } from '@/lib/storage';

/**
 * Runtime theming for the app.
 *
 * The website picks a palette with `next-themes` (`light` | `dark` | `system`,
 * persisted in `localStorage`) and repaints by swapping the `.dark` class. RN
 * has no equivalent — styles are plain objects frozen into `StyleSheet` at
 * module scope — so the app repaints by handing components a *fresh* sheet for
 * the active palette. `createStyles` below is the bridge: it turns a factory
 * into a hook that memoises one sheet per mode.
 *
 * The user's choice is stored under `ghaya.theme`, mirroring the website's
 * `localStorage` key, and defaults to `dark` (a stored choice always wins).
 */

export type ThemePreference = ThemeMode | 'system';

const STORAGE_KEY = 'ghaya.theme';

interface ThemeValue {
  /** What the user chose: `light`, `dark`, or follow the OS. */
  preference: ThemePreference;
  /** What is actually painted right now. */
  mode: ThemeMode;
  /** The live tokens. The only thing a component should read for colour. */
  t: ThemeTokens;
  setPreference(next: ThemePreference): void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

function isPreference(value: string | null | undefined): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('dark');

  // Hydrate after mount so the first frame already paints with the OS palette
  // instead of flashing white on a dark device.
  useEffect(() => {
    let cancelled = false;
    void getItemAsync(STORAGE_KEY).then((stored) => {
      if (!cancelled && isPreference(stored)) setPreferenceState(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void setItemAsync(STORAGE_KEY, next);
  }, []);

  const mode: ThemeMode =
    preference === 'system' ? (system === 'light' ? 'light' : 'dark') : preference;

  const value = useMemo<ThemeValue>(
    () => ({ preference, mode, t: mode === 'light' ? lightTheme : darkTheme, setPreference }),
    [preference, mode, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Live palette + the user's choice. Throws outside `ThemeProvider`. */
export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}

/**
 * Turns a `(tokens) => StyleSheet` factory into a hook.
 *
 * ```tsx
 * const useStyles = createStyles((t) => StyleSheet.create({ card: { backgroundColor: t.card } }));
 * function Screen() { const styles = useStyles(); … }
 * ```
 *
 * Sheets are cached per mode, so a repaint costs one factory call and never a
 * re-allocation per render. Because the hook reads context, calling it is what
 * makes a component repaint when the theme changes — a component that reads a
 * module-scope sheet will keep the old colours.
 */
export function createStyles<S extends { [K in keyof S]: ViewStyle | TextStyle | ImageStyle }>(
  factory: (t: ThemeTokens) => S,
): () => S {
  const cache = new Map<ThemeMode, S>();

  return function useStyles(): S {
    const { mode, t } = useTheme();
    const cached = cache.get(mode);
    if (cached !== undefined) return cached;

    const sheet = StyleSheet.create(factory(t));
    cache.set(mode, sheet);
    return sheet;
  };
}
