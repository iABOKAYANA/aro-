import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useFonts } from 'expo-font';

import { useI18n } from '@/i18n';

/**
 * Luxury identity fonts — the website's `src/app/fonts.ts`, natively.
 *
 * - Display: Amiri (Regular + Bold TTFs in `assets/fonts/`). Classical Naskh,
 *   ships real arabic+latin subsets, so EN headlines get the same editorial
 *   serif character as AR ones.
 * - Arabic body: IBM Plex Sans Arabic (Regular + Medium). Latin/Arabic designed
 *   as one system; Latin body text keeps the system face (the site keeps
 *   Inter for Latin), Plex applies to Arabic only.
 *
 * Family names: with `useFonts` the map key IS the `fontFamily` on every
 * platform (per the versioned expo-font docs), so the keys below are exact by
 * construction. The files' internal name tables were also parsed with a
 * stdlib TTF reader (no fc-query/fontTools on this machine): Amiri-Regular →
 * family "Amiri"/Regular, Amiri-Bold → "Amiri"/Bold, IBMPlexSansArabic-Regular
 * → "IBM Plex Sans Arabic"/Regular, IBMPlexSansArabic-Medium → "IBM Plex Sans
 * Arabic Medium"/Regular.
 *
 * Fallback: every style below resolves to `null` (system font) until the
 * fonts are loaded, and the splash gate releases on load *or* error — text
 * never renders blank.
 */

export const FontFamily = {
  display: 'Amiri',
  displayBold: 'Amiri-Bold',
  bodyAr: 'PlexArabic',
  bodyArMedium: 'PlexArabic-Medium',
} as const;

interface FontsStatus {
  /** True once all four files are loaded and usable as `fontFamily`. */
  loaded: boolean;
  /** Load finished (success or failure) — the splash gate waits on this. */
  done: boolean;
}

const FontsContext = createContext<FontsStatus>({ loaded: false, done: false });

export function FontsProvider({ children }: { children: ReactNode }) {
  const [fontsLoaded, fontsError] = useFonts({
    [FontFamily.display]: require('../../assets/fonts/Amiri-Regular.ttf'),
    [FontFamily.displayBold]: require('../../assets/fonts/Amiri-Bold.ttf'),
    [FontFamily.bodyAr]: require('../../assets/fonts/IBMPlexSansArabic-Regular.ttf'),
    [FontFamily.bodyArMedium]: require('../../assets/fonts/IBMPlexSansArabic-Medium.ttf'),
  });

  const value = useMemo<FontsStatus>(
    () => ({ loaded: fontsLoaded, done: fontsLoaded || !!fontsError }),
    [fontsLoaded, fontsError],
  );

  return <FontsContext.Provider value={value}>{children}</FontsContext.Provider>;
}

/** Raw gate flag for the splash hold in `_layout`. */
export function useFontsStatus(): FontsStatus {
  return useContext(FontsContext);
}

interface AppFonts {
  /** True once custom fonts are live. */
  loaded: boolean;
  /** Amiri Regular — editorial display, both languages. Null until loaded. */
  display: { fontFamily: string } | null;
  /** Amiri Bold — display headings. Null until loaded. */
  displayBold: { fontFamily: string } | null;
  /** Plex Sans Arabic — Arabic body copy only. Null for Latin or until loaded. */
  body: { fontFamily: string } | null;
  /** Plex Sans Arabic Medium — Arabic UI labels only. Null otherwise. */
  bodyMedium: { fontFamily: string } | null;
}

/**
 * Spread onto `style` arrays: `style={[styles.title, fonts.displayBold]}`.
 * Every entry is `null` when it must not apply, so call sites need no
 * branching and unloaded/error states silently use system fonts.
 */
export function useAppFonts(): AppFonts {
  const { loaded } = useContext(FontsContext);
  const { lang } = useI18n();
  return useMemo<AppFonts>(() => {
    const ar = loaded && lang === 'ar';
    return {
      loaded,
      display: loaded ? { fontFamily: FontFamily.display } : null,
      displayBold: loaded ? { fontFamily: FontFamily.displayBold } : null,
      body: ar ? { fontFamily: FontFamily.bodyAr } : null,
      bodyMedium: ar ? { fontFamily: FontFamily.bodyArMedium } : null,
    };
  }, [loaded, lang]);
}
