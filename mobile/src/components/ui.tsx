import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Estate, Radius, Spacing, type ThemeTokens } from '@/constants/brand';
import { useI18n } from '@/i18n';
import { useAppFonts } from '@/lib/fonts';
import { createStyles, useTheme, type ThemePreference } from '@/lib/theme';

/* ── Screen shell ──────────────────────────────────────────────────────── */

export function Screen({
  children,
  scroll = true,
  refreshing = false,
  onRefresh,
  padded = true,
  edges,
}: {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  padded?: boolean;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}) {
  const styles = useStyles();
  const { t } = useTheme();

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[padded && styles.padded, styles.scrollContent]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.primary} />
        ) : undefined
      }>
      {children}
    </ScrollView>
  ) : (
    <View style={[padded && styles.padded, styles.flex]}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={edges ?? ['bottom']}>
      {body}
    </SafeAreaView>
  );
}

/* ── Surfaces ──────────────────────────────────────────────────────────── */

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle | ViewStyle[] }) {
  const styles = useStyles();
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  const styles = useStyles();
  const { row, align } = useI18n();
  const fonts = useAppFonts();
  return (
    <View style={[styles.sectionTitleRow, row]}>
      <Text style={[styles.sectionTitle, align, fonts.display]}>{children}</Text>
      {action}
    </View>
  );
}

export function Divider() {
  const styles = useStyles();
  return <View style={styles.divider} />;
}

/* ── Luxury identity — the website's display/kicker/hairline, natively ──── */
/* `.display-*` → DisplayTitle (Amiri, editorial sizes, diacritic-safe leading).
   `.section-kicker` → Kicker (gold eyebrow; tracking reset in RTL so joined
   Arabic letters never disconnect). `.gold-hairline` → GoldDivider (RN has no
   gradient hairlines; a 45%-opacity gold rule reads the same at 1px). */

export function DisplayTitle({
  children,
  size = 'lg',
  bold,
  style,
}: {
  children: ReactNode;
  /** xl 32 · lg 28 · md 24 — mid-points of the site's display clamps. */
  size?: 'xl' | 'lg' | 'md';
  /** Amiri Bold instead of Regular (site display-1/2 are 700). */
  bold?: boolean;
  style?: TextStyle | TextStyle[];
}) {
  const { align } = useI18n();
  const fonts = useAppFonts();
  const sizing =
    size === 'xl'
      ? { fontSize: 32, lineHeight: 42 }
      : size === 'md'
        ? { fontSize: 24, lineHeight: 32 }
        : { fontSize: 28, lineHeight: 38 };
  return (
    <Text style={[sizing, align, bold ? fonts.displayBold : fonts.display, style]}>{children}</Text>
  );
}

export function Kicker({ children, centered }: { children: ReactNode; centered?: boolean }) {
  const styles = useStyles();
  const { isRtl, text } = useI18n();
  const fonts = useAppFonts();
  return (
    <Text
      style={[
        styles.kicker,
        text,
        centered && styles.kickerCentered,
        !isRtl && styles.kickerTracking,
        fonts.bodyMedium,
      ]}>
      {children}
    </Text>
  );
}

export function GoldDivider() {
  const styles = useStyles();
  return <View style={styles.goldDivider} />;
}

/* ── Feedback ──────────────────────────────────────────────────────────── */

export function Loading({ label }: { label?: string }) {
  const styles = useStyles();
  const { t: theme } = useTheme();
  const { t } = useI18n();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={theme.primary} size="large" />
      <Text style={styles.muted}>{label ?? t('common.loading')}</Text>
    </View>
  );
}

export function Empty({
  title,
  message,
  action,
}: {
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  const styles = useStyles();
  const { text, align } = useI18n();
  const fonts = useAppFonts();
  return (
    <View style={styles.center}>
      <View style={styles.emptyGlyph}>
        <Text style={styles.emptyGlyphText}>◎</Text>
      </View>
      <Text style={[styles.emptyTitle, align, fonts.displayBold]}>{title}</Text>
      {message ? <Text style={[styles.emptyMessage, text, fonts.body]}>{message}</Text> : null}
      {action ? <View style={{ marginTop: Spacing.md }}>{action}</View> : null}
    </View>
  );
}

/** Inline error strip. `onRetry` turns it into a tappable "Try again". */
export function ErrorBar({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const styles = useStyles();
  const { row, align, t } = useI18n();
  return (
    <View style={[styles.errorBox, row]}>
      <Text style={[styles.errorText, align]}>{message}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} hitSlop={8}>
          <Text style={styles.errorRetry}>{t('common.retry')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ── Indicators ────────────────────────────────────────────────────────── */

export type Tone = 'gold' | 'green' | 'red' | 'blue' | 'muted';

/** Badge fills. Matches the `success` / `warning` / `info` / `gold` Badge
 *  variants in the site's src/components/ui/badge.tsx, per mode. */
function useTones(): Record<Tone, { bg: string; fg: string }> {
  const { t } = useTheme();
  return {
    gold: { bg: t.goldBg, fg: t.goldFg },
    green: { bg: t.successBg, fg: t.successFg },
    red: { bg: t.dangerBg, fg: t.dangerFg },
    blue: { bg: t.infoBg, fg: t.infoFg },
    muted: { bg: t.secondary, fg: t.secondaryForeground },
  };
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: Tone }) {
  const styles = useStyles();
  const tones = useTones();
  const fonts = useAppFonts();
  const palette = tones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <Text style={[styles.badgeText, { color: palette.fg }, fonts.body]}>{children}</Text>
    </View>
  );
}

/** Map a domain status string onto a tone — one place instead of per screen. */
export function toneForStatus(status: string | null | undefined): Tone {
  const s = (status ?? '').toUpperCase();
  if (['ACTIVE', 'APPROVED', 'PUBLISHED', 'SOLD', 'PAID', 'QUALIFIED', 'WON', 'VERIFIED', 'ACCEPTED'].includes(s))
    return 'green';
  if (['SUSPENDED', 'REJECTED', 'LOST', 'CANCELLED', 'ARCHIVED', 'BLOCKED', 'DISABLED', 'FAILED'].includes(s))
    return 'red';
  if (['PENDING', 'REVIEW', 'IN_PROGRESS', 'NEGOTIATION', 'CONTACTED', 'RESERVED', 'DRAFT', 'NEW', 'READ'].includes(s))
    return 'gold';
  if (['OPEN', 'AVAILABLE', 'INTERESTED', 'QUALIFIED_LEAD', 'REPLIED'].includes(s)) return 'blue';
  return 'muted';
}

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function Avatar({ text, size = 44 }: { text: string; size?: number }) {
  const styles = useStyles();
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.3 }]}>{text}</Text>
    </View>
  );
}

/* ── Controls ──────────────────────────────────────────────────────────── */

export function Btn({
  title,
  onPress,
  variant = 'primary',
  disabled,
  busy,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  busy?: boolean;
  style?: ViewStyle | ViewStyle[];
}) {
  const styles = useStyles();
  const { t } = useTheme();
  const isDisabled = disabled || busy;
  const { row, text } = useI18n();
  const fonts = useAppFonts();

  const spinnerColor =
    variant === 'primary' ? t.primaryForeground : variant === 'danger' ? t.destructiveForeground : t.primary;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.btn,
        row,
        variant === 'primary' && styles.btnPrimary,
        variant === 'ghost' && styles.btnGhost,
        variant === 'danger' && styles.btnDanger,
        isDisabled && styles.btnDisabled,
        pressed && !isDisabled && styles.btnPressed,
        style,
      ]}>
      {busy ? (
        <ActivityIndicator color={spinnerColor} />
      ) : (
        <Text
          style={[
            styles.btnText,
            text,
            variant === 'primary' && styles.btnTextPrimary,
            variant === 'ghost' && styles.btnTextGhost,
            variant === 'danger' && styles.btnTextDanger,
            fonts.body,
          ]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  ...props
}: TextInputProps & { label?: string }) {
  const styles = useStyles();
  const { t } = useTheme();
  const { align } = useI18n();
  const fonts = useAppFonts();
  return (
    <View style={styles.field}>
      {label ? <Text style={[styles.label, align]}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={t.mutedForeground}
        style={[styles.input, align, fonts.body]}
        {...props}
      />
    </View>
  );
}

export function Chip({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected?: boolean;
  /** Greys the pill out and swallows taps (e.g. the status it already has). */
  disabled?: boolean;
  onPress?: () => void;
}) {
  const styles = useStyles();
  const fonts = useAppFonts();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        disabled && styles.chipDisabled,
        pressed && !disabled && { opacity: 0.8 },
      ]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected, fonts.body]}>{label}</Text>
    </Pressable>
  );
}

/** Pill switcher used for in-screen tabs (e.g. Brokers | Developers | Users). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  const styles = useStyles();
  const { row } = useI18n();
  const fonts = useAppFonts();
  return (
    <View style={[styles.segmented, row]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[styles.segment, active && styles.segmentActive]}>
            <Text style={[styles.segmentText, active && styles.segmentTextActive, fonts.body]} numberOfLines={1}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search…',
}: {
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
}) {
  const styles = useStyles();
  const { t: theme } = useTheme();
  const { row, align, t } = useI18n();
  const fonts = useAppFonts();
  return (
    <View style={[styles.searchBar, row]}>
      <Ionicons name="search" size={16} color={theme.gray400} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder || t('common.search')}
        placeholderTextColor={theme.mutedForeground}
        style={[styles.searchInput, align, fonts.body]}
        autoCorrect={false}
        returnKeyType="search"
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={10}>
          <Ionicons name="close" size={16} color={theme.gray400} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Pressable list row with an optional chevron. */
export function Row({
  title,
  subtitle,
  left,
  right,
  badge,
  onPress,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  badge?: ReactNode;
  onPress?: () => void;
}) {
  const styles = useStyles();
  const { t: theme } = useTheme();
  const { row, align, isRtl } = useI18n();
  const fonts = useAppFonts();
  const content = (
    <View style={[styles.row, row]}>
      {left ? <View>{left}</View> : null}
      <View style={styles.rowMain}>
        <View style={[styles.rowTitleLine, row]}>
          <Text style={[styles.rowTitle, align, fonts.body]} numberOfLines={1}>
            {title}
          </Text>
          {badge}
        </View>
        {subtitle ? (
          <Text style={[styles.rowSubtitle, align, fonts.body]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ??
        (onPress ? (
          <Ionicons
            name="chevron-forward"
            size={18}
            color={theme.gray400}
            style={isRtl ? styles.chevronRtl : undefined}
          />
        ) : null)}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.rowPressed}>
      {content}
    </Pressable>
  );
}

/* ── Theme switcher ────────────────────────────────────────────────────── */

const PREFERENCES: { value: ThemePreference; icon: keyof typeof Ionicons.glyphMap; labelKey: 'common.themeLight' | 'common.themeDark' | 'common.themeSystem' }[] = [
  { value: 'light', icon: 'sunny', labelKey: 'common.themeLight' },
  { value: 'dark', icon: 'moon', labelKey: 'common.themeDark' },
  { value: 'system', icon: 'desktop', labelKey: 'common.themeSystem' },
];

/**
 * The website's navbar theme control, restated for a header bar: a round
 * bordered icon button that drops the same Light / Dark / System menu, with
 * the active row in estate gold.
 *
 * The menu anchors to the reading edge of the header — in RTL that is the
 * left — which is where the trigger sits, so it lines up without measuring
 * the button's window position.
 */
export function ThemeToggle() {
  const styles = useStyles();
  const { t: theme, preference, setPreference } = useTheme();
  const { isRtl, t } = useI18n();
  const fonts = useAppFonts();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  const current = PREFERENCES.find((option) => option.value === preference) ?? PREFERENCES[2];

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('common.theme')}
        style={({ pressed }) => [styles.themeTrigger, pressed && styles.themeTriggerPressed]}>
        <Ionicons name={current.icon} size={16} color={theme.mutedForeground} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.themeBackdrop} onPress={() => setOpen(false)}>
          <View
            style={[
              styles.themeMenu,
              { top: insets.top + 52 + 8 },
              isRtl ? { left: 16 } : { right: 16 },
            ]}>
            <Pressable onPress={() => {}} style={styles.themeMenuInner}>
              {PREFERENCES.map((option) => {
                const active = option.value === preference;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      setPreference(option.value);
                      setOpen(false);
                    }}
                    style={({ pressed }) => [styles.themeRow, pressed && styles.themeRowPressed]}>
                    <Ionicons
                      name={option.icon}
                      size={16}
                      color={active ? theme.primary : theme.mode === 'light' ? theme.gray700 : theme.gray300}
                    />
                    <Text style={[styles.themeRowLabel, active && styles.themeRowLabelActive, fonts.body]}>
                      {t(option.labelKey)}
                    </Text>
                  </Pressable>
                );
              })}
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

/* ── Styles ────────────────────────────────────────────────────────────── */

const useStyles = createStyles((t: ThemeTokens) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: t.background },
    flex: { flex: 1 },
    padded: { padding: Spacing.md },
    scrollContent: { gap: Spacing.md, paddingBottom: Spacing.xl },

    // Card — `rounded-lg border bg-card shadow-sm` from src/components/ui/card.tsx
    card: {
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: Radius.lg,
      padding: Spacing.md,
      gap: Spacing.sm,
      shadowColor: t.shadowColor,
      shadowOpacity: t.shadowOpacity,
      shadowRadius: t.shadowRadius,
      shadowOffset: { width: 0, height: t.shadowOffsetY },
      elevation: t.elevation,
    },

    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: Spacing.sm,
      marginBottom: 0,
    },
    // `text-lg font-semibold` — the site's card/section title step.
    // Display face: Amiri via `fonts.display` at the call site (kept out of
    // the cached sheet so the per-mode cache never pins an unloaded family).
    sectionTitle: { color: t.foreground, fontSize: 20, fontWeight: '600', lineHeight: 28 },

    // Section eyebrow — the site's `.section-kicker` (gold, tracked in Latin,
    // untracked in RTL; tracking applied at the call site via useI18n).
    kicker: {
      color: t.kicker,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    kickerTracking: { letterSpacing: 2.5 },
    kickerCentered: { textAlign: 'center' },

    // Gold hairline — the site's `.gold-hairline` gradient, restated as a
    // 45%-opacity solid rule (RN has no gradient hairlines).
    goldDivider: { height: 1, backgroundColor: t.primary, opacity: 0.45 },

    divider: { height: 1, backgroundColor: t.border },
    center: { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.xl, gap: 8 },
    muted: { color: t.mutedForeground, fontSize: 14, marginTop: Spacing.sm },
    emptyGlyph: {
      width: 56,
      height: 56,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: t.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyGlyphText: { color: t.primary, fontSize: 24 },
    emptyTitle: { color: t.foreground, fontSize: 18, fontWeight: '600', marginTop: 4, lineHeight: 26 },
    emptyMessage: {
      color: t.mutedForeground,
      fontSize: 14,
      textAlign: 'center',
      paddingHorizontal: Spacing.lg,
      lineHeight: 20,
    },

    errorBox: {
      backgroundColor: t.dangerBg,
      borderColor: t.destructive,
      borderWidth: 1,
      borderRadius: Radius.md,
      padding: Spacing.sm + 4,
      flexDirection: 'row',
      gap: Spacing.sm,
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    errorText: { color: t.dangerFg, fontSize: 14, flex: 1, lineHeight: 20 },
    errorRetry: { color: t.dangerFg, fontSize: 14, fontWeight: '700' },

    // Badge — `rounded-full border px-2.5 py-0.5 text-xs font-semibold`
    badge: {
      borderWidth: 1,
      borderColor: 'transparent',
      borderRadius: Radius.full,
      paddingHorizontal: 10,
      paddingVertical: 2,
      alignSelf: 'flex-start',
    },
    badgeText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },

    stat: { alignItems: 'center', gap: 2 },
    statValue: { color: t.foreground, fontSize: 24, lineHeight: 30, fontWeight: '700' },
    statLabel: { color: t.mutedForeground, fontSize: 12, lineHeight: 16 },

    // Avatar — `rounded-full bg-estate-gold text-xs font-bold text-[#0F1A2C]`
    avatar: {
      backgroundColor: Estate.gold,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: Estate.navy, fontWeight: '700' },

    // Button — `rounded-md text-sm font-medium h-10 px-4`
    btn: {
      borderRadius: Radius.md,
      minHeight: 40,
      paddingHorizontal: Spacing.md,
      paddingVertical: 8,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
    },
    btnPrimary: { backgroundColor: t.primary },
    btnGhost: { backgroundColor: t.background, borderWidth: 1, borderColor: t.input },
    btnDanger: { backgroundColor: t.destructive },
    btnDisabled: { opacity: 0.5 },
    btnPressed: { opacity: 0.9 },
    btnText: { fontSize: 14, fontWeight: '500', color: t.foreground },
    btnTextPrimary: { color: t.primaryForeground },
    btnTextGhost: { color: t.foreground },
    btnTextDanger: { color: t.destructiveForeground },

    field: { gap: 6, marginBottom: Spacing.sm },
    label: { color: t.mutedForeground, fontSize: 14, fontWeight: '500' },
    // Input — `h-10 rounded-md border border-input bg-background px-3`
    input: {
      backgroundColor: t.background,
      borderWidth: 1,
      borderColor: t.input,
      borderRadius: Radius.md,
      paddingHorizontal: Spacing.sm + 4,
      paddingVertical: 10,
      minHeight: 40,
      color: t.foreground,
      fontSize: 16,
      textAlignVertical: 'center',
    },

    // Filter pill — `rounded-full border px-3.5 py-1.5 text-xs font-medium`
    chip: {
      borderWidth: 1,
      borderColor: t.controlBorder,
      backgroundColor: t.controlBg,
      borderRadius: Radius.full,
      paddingHorizontal: 14,
      paddingVertical: 7,
      minHeight: 32,
      justifyContent: 'center',
    },
    // Active filter — `border-estate-gold bg-estate-gold text-[#0F1A2C]`
    chipSelected: { backgroundColor: Estate.gold, borderColor: Estate.gold },
    chipDisabled: { opacity: 0.45 },
    chipText: { color: t.controlFg, fontSize: 12, fontWeight: '500' },
    chipTextSelected: { color: Estate.navy },

    // Tabs — `inline-flex h-9 items-center rounded-lg bg-muted p-1`
    segmented: {
      flexDirection: 'row',
      backgroundColor: t.muted,
      borderRadius: Radius.lg,
      padding: 4,
      gap: 4,
    },
    segment: {
      flex: 1,
      paddingVertical: 6,
      borderRadius: Radius.md,
      alignItems: 'center',
      minHeight: 28,
      justifyContent: 'center',
    },
    // Active trigger — `rounded-md bg-background text-foreground shadow-sm`
    segmentActive: {
      backgroundColor: t.background,
      shadowColor: t.shadowColor,
      shadowOpacity: t.shadowOpacity,
      shadowRadius: t.shadowRadius,
      shadowOffset: { width: 0, height: t.shadowOffsetY },
      elevation: t.elevation,
    },
    segmentText: { color: t.mutedForeground, fontSize: 14, fontWeight: '500' },
    segmentTextActive: { color: t.foreground, fontWeight: '500' },

    // Search — `rounded-lg border border-gray-200 bg-gray-50 py-2.5 ps-10 text-sm`
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: t.searchBg,
      borderWidth: 1,
      borderColor: t.controlBorder,
      borderRadius: Radius.lg,
      paddingHorizontal: Spacing.sm + 4,
      minHeight: 40,
    },
    searchInput: {
      flex: 1,
      color: t.foreground,
      fontSize: 16,
      paddingVertical: 0,
      textAlignVertical: 'center',
    },

    row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm + 4 },
    rowPressed: { opacity: 0.7 },
    rowMain: { flex: 1, gap: 2 },
    rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rowTitle: { color: t.foreground, fontSize: 16, fontWeight: '600', flexShrink: 1 },
    rowSubtitle: { color: t.mutedForeground, fontSize: 14, lineHeight: 20 },
    chevronRtl: { transform: [{ scaleX: -1 }] },

    // Theme control — `rounded-full border border-gray-200 p-2` in the navbar
    themeTrigger: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: t.controlBorder,
      alignItems: 'center',
      justifyContent: 'center',
      marginHorizontal: 4,
    },
    themeTriggerPressed: { backgroundColor: t.muted },
    themeBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
    themeMenu: { position: 'absolute', width: 152 },
    // `rounded-lg border bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900`
    themeMenuInner: {
      backgroundColor: t.popover,
      borderWidth: 1,
      borderColor: t.mode === 'light' ? t.gray200 : t.gray700,
      borderRadius: Radius.lg,
      paddingVertical: 4,
      overflow: 'hidden',
      shadowColor: '#000000',
      shadowOpacity: 0.15,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
    themeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    themeRowPressed: { backgroundColor: t.muted },
    themeRowLabel: { color: t.mode === 'light' ? t.gray700 : t.gray300, fontSize: 14 },
    themeRowLabelActive: { color: t.primary, fontWeight: '500' },
  }),
);
