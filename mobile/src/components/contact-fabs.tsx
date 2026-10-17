import { Ionicons } from '@expo/vector-icons';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApi } from '@/hooks/use-api';
import { useI18n } from '@/i18n';
import { createStyles, useTheme } from '@/lib/theme';

/**
 * Floating sales-call CTA — the phone sibling of the WhatsApp FAB.
 *
 * Reads the CEO-set number from `GET /api/public-config` (`cta.phone`,
 * empty until the CEO sets it) and dials it with `tel:…`. Renders nothing
 * while loading, on error, on an old backend without the key, or when the
 * number is empty — the button stays hidden until there is a number to call.
 *
 * Mounted once in the root layout so it floats above every screen. The
 * column below is the shared FAB stack: the WhatsApp FAB mounts as the next
 * child of `styles.stack` (below the call button, closer to the thumb) and
 * the `gap` keeps the two buttons from ever overlapping, whichever renders.
 */
export function ContactFabs() {
  const styles = useStyles();
  const { t: theme } = useTheme();
  const { t, row, isRtl } = useI18n();
  // All hooks unconditional and top-level: the visibility decision further
  // down is plain data, never an early return before a hook.
  const config = useApi<PublicConfig>('/api/public-config');
  const insets = useSafeAreaInsets();

  // Defensive read of the mandated contract: `cta` (or `cta.phone`) missing
  // on an old backend, `null`, or a non-string all collapse to '' → hidden.
  const raw =
    typeof config.data?.cta?.phone === 'string' ? config.data.cta.phone.trim() : '';
  const phone = sanitizePhone(raw);
  // Fail-soft: no spinner, no error strip over the user's screen — and a
  // number with nothing dialable left after sanitising hides the button too.
  if (!/[0-9]/.test(phone)) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.stack, { bottom: insets.bottom + STACK_CLEARANCE }, isRtl ? styles.stackRtl : styles.stackLtr]}>
      <Pressable
        onPress={() => {
          void Linking.openURL(`tel:${phone}`).catch(() => {});
        }}
        accessibilityRole="button"
        accessibilityLabel={t('contact.call')}
        style={({ pressed }) => [
          styles.fab,
          // Direction-neutral here: a single centred child paints identically
          // under `row` and `row-reverse`, so the button mirrors itself in
          // RTL instead of flipping.
          row,
          pressed && styles.pressed,
        ]}>
        <Ionicons name="call" size={24} color={theme.primaryForeground} />
      </Pressable>
      {/* WhatsApp FAB docks here, below the call button. */}
    </View>
  );
}

/** `GET /api/public-config` — only the slice this component reads. */
type PublicConfig = {
  cta?: { phone?: string | null } | null;
};

/** `tel:` dial string — digits and `+` only, everything else stripped. */
function sanitizePhone(raw: string): string {
  return raw.replace(/[^0-9+]/g, '');
}

/** Bottom offset above the screen edge: clears the tab bar on tab screens. */
const STACK_CLEARANCE = 80;

const useStyles = createStyles((t) =>
  StyleSheet.create({
    stack: {
      position: 'absolute',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 12,
    },
    stackLtr: { right: 16 },
    stackRtl: { left: 16 },
    // Gold coin: the kit's primary button surface, circular, lifted off the
    // content. The shadow is literal (like the kit popover) rather than theme
    // tokens so the button floats in dark mode too, where the site carries
    // no shadows.
    fab: {
      width: 56,
      height: 56,
      borderRadius: 999,
      backgroundColor: t.primary,
      borderWidth: 1,
      borderColor: t.primaryForeground,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000000',
      shadowOpacity: 0.25,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    pressed: { opacity: 0.85 },
  })
);
