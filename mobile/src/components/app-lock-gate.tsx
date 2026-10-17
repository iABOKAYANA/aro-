import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { Btn } from '@/components/ui';
import { Spacing, Radius } from '@/constants/brand';
import { useI18n } from '@/i18n';
import { useAppLock } from '@/lib/app-lock';
import { createStyles, useTheme } from '@/lib/theme';

/**
 * Fail-closed cover over the whole app while the app lock is engaged.
 *
 * Renders nothing unless ALL hold: opted in, device capable, a session exists,
 * and the gate is locked. A signed-out visitor is never gated (there is no
 * session to protect); a failed auth stays on this screen with "try again"
 * plus a "sign out" escape — never stranded, never a crash.
 *
 * The OS prompt fires automatically once per lock episode (cold start and
 * return-from-background); cancelling it simply leaves this screen up.
 */
export function AppLockGate() {
  const styles = useStyles();
  const { t: theme } = useTheme();
  const { t, align, text } = useI18n();
  const { status, signOut } = useAuth();
  const { enabled, supported, loading, locked, authenticating, lastError, unlock } = useAppLock();
  const prompted = useRef(false);

  const gated = !loading && enabled && supported && locked && status === 'signedIn';

  // Reset the once-per-episode guard when the gate opens, so the next
  // background→foreground lock prompts again on its own.
  useEffect(() => {
    if (!locked) prompted.current = false;
  }, [locked]);

  useEffect(() => {
    if (!gated || prompted.current || authenticating) return;
    prompted.current = true;
    void unlock(t('settings.appLockPrompt'));
  }, [gated, authenticating, unlock, t]);

  if (!gated) return null;

  return (
    <Modal visible animationType="fade" transparent={false} onRequestClose={() => {}}>
      <View style={styles.root}>
        <Ionicons name="lock-closed" size={48} color={theme.primary} />
        <Text style={[styles.title, align]}>{t('settings.appLockTitle')}</Text>
        <Text style={[styles.message, align]}>{t('settings.appLockMessage')}</Text>
        {lastError && !authenticating ? (
          <Text style={[styles.error, align]}>{t('settings.appLockFailed')}</Text>
        ) : null}
        <View style={styles.actions}>
          <Btn
            title={t('settings.appLockRetry')}
            busy={authenticating}
            onPress={() => {
              void unlock(t('settings.appLockPrompt'));
            }}
          />
          <Pressable
            onPress={() => {
              void signOut();
            }}
            style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.8 }]}>
            <Text style={[styles.signOutText, text]}>{t('settings.appLockSignOut')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: t.background,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Spacing.xl,
      gap: Spacing.md,
    },
    title: { color: t.foreground, fontSize: 22, fontWeight: '800' },
    message: { color: t.mutedForeground, fontSize: 15, lineHeight: 21 },
    error: { color: t.dangerFg, fontSize: 14, fontWeight: '600' },
    actions: { width: '100%', marginTop: Spacing.sm, gap: Spacing.sm },
    signOut: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: t.destructive,
      borderRadius: Radius.xl,
      paddingVertical: 14,
    },
    signOutText: { color: t.dangerFg, fontSize: 16, fontWeight: '700' },
  }),
);
