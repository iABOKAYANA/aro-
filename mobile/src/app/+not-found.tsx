import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Btn, Screen } from '@/components/ui';
import { useI18n } from '@/i18n';
import { createStyles } from '@/lib/theme';

/**
 * Catch-all for any URL the router cannot resolve (a stale deep link, a
 * mistyped push). `_layout.tsx` already declares this screen by name, so the
 * file has to exist for the stack to be able to render it.
 */
export default function NotFoundScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { t, text } = useI18n();

  return (
    <Screen>
      <View style={styles.wrap}>
        <Text style={styles.code}>404</Text>
        <Text style={[styles.title, text]}>{t('account.notFoundTitle')}</Text>
        <Text style={[styles.message, text]}>{t('account.notFoundMessage')}</Text>
        <View style={styles.actions}>
          <Btn title={t('account.goHome')} onPress={() => router.replace('/')} />
          <Btn title={t('account.exploreProjects')} variant="ghost" onPress={() => router.replace('/(tabs)/explore')} />
        </View>
      </View>
    </Screen>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    wrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64, gap: 8 },
    code: { color: t.primary, fontSize: 56, fontWeight: '800', letterSpacing: 4 },
    title: { color: t.foreground, fontSize: 18, fontWeight: '700', marginTop: 4 },
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
