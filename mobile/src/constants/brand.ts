/**
 * GHAYA design tokens for the mobile app.
 *
 * Every value here is lifted from the website so both clients read as one
 * product rather than two:
 *
 *  - `Estate`      → `theme.extend.colors.estate` in ../../tailwind.config.ts
 *  - `lightTheme`  → the `:root` block of src/app/globals.css
 *  - `darkTheme`   → the `.dark`  block of src/app/globals.css
 *  - `Radius`      → the `--radius` scale (`rounded-sm/md/lg`) plus Tailwind's
 *                    fixed `rounded-xl` / `rounded-2xl`
 *  - `Type`        → the `text-xs … text-2xl` scale
 *
 * The site's semantic colours are declared as HSL triples; they were converted
 * to hex channel-by-channel (rounded), e.g. `42 63% 55%` → `#D5A944`.
 *
 * There is deliberately **no** single exported `Theme`. Which palette is live is
 * a runtime decision (`@/lib/theme`), and baking one in at module scope is what
 * made a light mode impossible. Read tokens from `useTheme().t` instead.
 */

/** Brand palette — theme-independent, identical in light and dark. */
export const Estate = {
  // accents
  gold: '#D4A843',
  goldLight: '#E8C56D',
  goldDark: '#B8923A',
  copper: '#c9956a',
  copperDark: '#b8845a',

  // greens
  green: '#1a3a2a',
  greenDark: '#0D2818',
  greenLight: '#2d5a3d',
  greenHover: '#3a7050',

  // surfaces
  navy: '#0F1A2C',
  navyLight: '#1A2B44',
  bgDark: '#080E1A',
  bgInput: '#0a1220',
  bgCard: '#0f1a2e',
  bgDropdown: '#1a2535',

  // neutrals
  sand: '#F5F0E8',
  sandDark: '#E8DFD0',
} as const

export type ThemeMode = 'light' | 'dark';

/** Semantic roles. Mirrors the CSS custom properties of the website. */
export interface ThemeTokens {
  /** Which palette these tokens came from — used to key style caches. */
  mode: ThemeMode;

  // ── shadcn semantic roles ───────────────────────────────────────────────
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;

  // ── Tailwind greys ──────────────────────────────────────────────────────
  // The site leans on these directly (`text-gray-600`, `border-gray-200`, …)
  // and the `.dark` overrides in globals.css remap them onto the semantic
  // roles above. Keeping both lets a screen match a specific web component.
  gray50: string;
  gray100: string;
  gray200: string;
  gray300: string;
  gray400: string;
  gray500: string;
  gray600: string;
  gray700: string;
  gray800: string;
  gray900: string;
  gray950: string;

  // ── control surfaces (the site's filter pills and search field) ─────────
  /** Inactive outlined pill background — `bg-white` / `dark:bg-gray-900`. */
  controlBg: string;
  /** Inactive outlined pill border — `border-gray-200` / `dark:border-gray-700`. */
  controlBorder: string;
  /** Inactive outlined pill label — `text-gray-600` / `dark:text-gray-300`. */
  controlFg: string;
  /** Inactive filled pill background — `bg-gray-100` / `dark:bg-gray-800`. */
  chipBg: string;
  /** Search field background — `bg-gray-50` / `dark:bg-gray-900`. */
  searchBg: string;

  // ── status tints (Badge variants from src/components/ui/badge.tsx) ──────
  successBg: string;
  successFg: string;
  warningBg: string;
  warningFg: string;
  infoBg: string;
  infoFg: string;
  dangerBg: string;
  dangerFg: string;
  goldBg: string;
  goldFg: string;

  // ── luxury identity (website globals.css: .arch-card / .section-kicker) ──
  /** Hairline gold card frame — `rgba(184,146,58,0.35)` / `rgba(212,168,67,0.30)`. */
  archBorder: string;
  /** Gold eyebrow label — `#8a6d1f` on light (pure gold is ~2.2:1), `#e8c56d` on dark. */
  kicker: string;

  // ── chrome (navbar / tab bar) ───────────────────────────────────────────
  nav: string;
  navBorder: string;

  // ── elevation ───────────────────────────────────────────────────────────
  /** `shadow-sm` on the site; `null` in dark mode where the site has none. */
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffsetY: number;
  elevation: number;
}

/** `:root` in src/app/globals.css. */
export const lightTheme: ThemeTokens = {
  mode: 'light',

  background: '#FFFFFF',
  foreground: '#0F1824',
  card: '#FFFFFF',
  cardForeground: '#0F1824',
  popover: '#FFFFFF',
  popoverForeground: '#0F1824',
  primary: '#D5A944',
  primaryForeground: '#0E1825',
  secondary: '#F0F2F5',
  secondaryForeground: '#151D28',
  muted: '#F0F2F5',
  mutedForeground: '#5A6472',
  accent: '#CBA54D',
  accentForeground: '#0E1825',
  destructive: '#EF4343',
  destructiveForeground: '#F9FBFA',
  border: '#E2E5E9',
  input: '#E2E5E9',
  ring: '#D5A944',

  gray50: '#F9FAFB',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray600: '#4B5563',
  gray700: '#374151',
  gray800: '#1F2937',
  gray900: '#111827',
  gray950: '#030712',

  controlBg: '#FFFFFF',
  controlBorder: '#E5E7EB',
  controlFg: '#4B5563',
  chipBg: '#F3F4F6',
  searchBg: '#F9FAFB',

  successBg: '#DCFCE7',
  successFg: '#166534',
  warningBg: '#FEF9C3',
  warningFg: '#854D0E',
  infoBg: '#DBEAFE',
  infoFg: '#1E40AF',
  dangerBg: '#FEE2E2',
  dangerFg: '#991B1B',
  goldBg: 'rgba(212,168,67,0.10)',
  goldFg: '#B8923A',

  archBorder: 'rgba(184,146,58,0.35)',
  kicker: '#8a6d1f',

  nav: '#FFFFFF',
  // `border-gray-200` on the navbar; globals.css's `.dark .border-gray-200`
  // override is what wins in dark mode, so the dark value is `--border`.
  navBorder: '#E5E7EB',

  shadowColor: '#000000',
  shadowOpacity: 0.05,
  shadowRadius: 2,
  shadowOffsetY: 1,
  elevation: 1,
};

/** `.dark` in src/app/globals.css. */
export const darkTheme: ThemeTokens = {
  mode: 'dark',

  background: '#080E16',
  foreground: '#F0F2F5',
  card: '#0C131D',
  cardForeground: '#F0F2F5',
  popover: '#0C131D',
  popoverForeground: '#F0F2F5',
  primary: '#D5A944',
  primaryForeground: '#0E1825',
  secondary: '#141D29',
  secondaryForeground: '#E0E6EB',
  muted: '#141D29',
  mutedForeground: '#8A96A8',
  accent: '#CBA54D',
  accentForeground: '#0E1825',
  destructive: '#811D1D',
  destructiveForeground: '#F0F5F2',
  border: '#172230',
  input: '#172230',
  ring: '#D5A944',

  // globals.css remaps the *light* greys onto the roles above (`.dark .bg-gray-50`,
  // `.dark .border-gray-200`, `.dark .text-gray-400/500/600`), so those entries
  // carry the remapped value. The darker steps are not overridden by anything
  // and keep their literal Tailwind value — `text-gray-700` is the exception,
  // which globals.css rewrites to `--foreground`; reach for `foreground` when
  // you mean text, and `gray700` when you mean a border or a fill.
  gray50: '#141D29',
  gray100: '#141D29',
  gray200: '#172230',
  gray300: '#D1D5DB',
  gray400: '#8A96A8',
  gray500: '#8A96A8',
  gray600: '#8A96A8',
  gray700: '#374151',
  gray800: '#1F2937',
  gray900: '#111827',
  gray950: '#030712',

  controlBg: '#111827',
  controlBorder: '#374151',
  controlFg: '#D1D5DB',
  chipBg: '#1F2937',
  searchBg: '#111827',

  successBg: 'rgba(34,197,94,0.15)',
  successFg: '#4ADE80',
  warningBg: 'rgba(234,179,8,0.15)',
  warningFg: '#FACC15',
  infoBg: 'rgba(59,130,246,0.15)',
  infoFg: '#60A5FA',
  dangerBg: 'rgba(239,68,68,0.15)',
  dangerFg: '#FCA5A5',
  goldBg: 'rgba(212,168,67,0.10)',
  goldFg: '#D4A843',

  archBorder: 'rgba(212,168,67,0.30)',
  kicker: '#E8C56D',

  nav: '#030712',
  navBorder: '#172230',

  // The site's cards carry `shadow-sm` only in light mode; `.dark` surfaces
  // are separated by their border instead.
  shadowColor: '#000000',
  shadowOpacity: 0,
  shadowRadius: 0,
  shadowOffsetY: 0,
  elevation: 0,
};

/** `--radius` scale from globals.css plus Tailwind's fixed steps. */
export const Radius = {
  sm: 4, // rounded-sm  (calc(var(--radius) - 4px))
  md: 6, // rounded-md  (calc(var(--radius) - 2px)) — buttons, inputs
  lg: 8, // rounded-lg  (var(--radius))             — Card, panels
  xl: 12, // rounded-xl                               — dialogs, feature cards
  xxl: 16, // rounded-2xl                              — project/unit cards
  full: 999, // rounded-full                          — badges, chips, pills
} as const

/** Tailwind's spacing scale (1 = 4px, 2 = 8px, …). */
export const Spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const

/** Tailwind's `text-*` scale, in px, with the matching line-height. */
export const Type = {
  xs: { fontSize: 12, lineHeight: 16 },
  sm: { fontSize: 14, lineHeight: 20 },
  base: { fontSize: 16, lineHeight: 24 },
  lg: { fontSize: 18, lineHeight: 28 },
  xl: { fontSize: 20, lineHeight: 28 },
  '2xl': { fontSize: 24, lineHeight: 32 },
  '3xl': { fontSize: 30, lineHeight: 36 },
} as const

/** `font-medium` / `semibold` / `bold` / `extrabold`, as used across the site. */
export const Weight = {
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
} as const
