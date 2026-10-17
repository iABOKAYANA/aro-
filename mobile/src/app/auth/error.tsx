import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Btn, Screen } from '@/components/ui';
import { useI18n } from '@/i18n';
import { createStyles } from '@/lib/theme';

/**
 * Auth failure landing — mirrors `src/app/auth/error/page.tsx` on the
 * website ("Authentication Error" + "Something went wrong…" + Back to
 * Login). Reached natively, never via `resolveLink` (which leaves `/auth/*`
 * unmapped); whitelisted in `AuthGate`'s `onAuthScreen` set so a signed-in
 * session bounces to `/` instead of lingering on it.
 */
export default function AuthErrorScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { t, text } = useI18n();

  return (
    <Screen>
      <View style={styles.wrap}>
        <Text style={[styles.title, text]}>{t('account.authErrorTitle')}</Text>
        <Text style={[styles.message, text]}>{t('account.authErrorMessage')}</Text>
        <View style={styles.actions}>
          <Btn title={t('account.backToLogin')} onPress={() => router.replace('/login')} />
        </View>
      </View>
    </Screen>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    wrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64, gap: 8 },
    // `text-4xl font-bold text-red-600` on the website's heading.
    title: { color: t.destructive, fontSize: 28, fontWeight: '800', textAlign: 'center', marginTop: 4 },
    message: {
      color: t.mutedForeground,
      fontSize: 14,
      textAlign: 'center',
      lineHeight: 20,
      paddingHorizontal: 24,
    },
    actions: { alignSelf: 'stretch', gap: 8, marginTop: 16 },
  }),
);
