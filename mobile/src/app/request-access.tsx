import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Btn, Card, Screen } from '@/components/ui';
import { Radius, Spacing } from '@/constants/brand';
import { useI18n, type MessageKey } from '@/i18n';
import { type ContactMessageKey } from '@/i18n/messages/contact';
import { createStyles, useTheme } from '@/lib/theme';

/**
 * The website's /auth/request-access screen — src/app/auth/request-access/
 * page.tsx — carried over: the "Invitation Only" headline, the private
 * platform blurb and the two "How to get access" steps, verbatim.
 *
 * Public access requests are CLOSED: this screen renders a closed notice and
 * a Contact button instead of the old intake form. The route file stays so
 * stale links do not 404, and the invitation flow (/register) stays one tap
 * away for whoever already holds a token.
 */
export default function RequestAccessScreen() {
  const styles = useStyles();
  const { t: theme } = useTheme();
  const router = useRouter();
  const { t: translate, row, text, align } = useI18n();
  // `MessageKey` in i18n/index.tsx — a file this screen does not own — does not
  // list the `request.*` namespace yet, so `t` is widened once, here, to the
  // keys the namespace actually declares plus the app-wide union. Typos stay
  // compile errors on both sides.
  const t = translate as (key: ContactMessageKey | MessageKey) => string;

  return (
    <Screen>
      <Stack.Screen options={{ title: t('request.title') }} />

      <View style={styles.head}>
        <View style={styles.lock}>
          <Ionicons name="lock-closed-outline" size={22} color={theme.primary} />
        </View>
        <Text style={[styles.title, text]}>{t('request.invitationOnly')}</Text>
        <Text style={[styles.blurb, text]}>{t('request.blurb')}</Text>
      </View>

      <Card>
        <Text style={[styles.howTo, align]}>{t('request.howTo')}</Text>
        <View style={[styles.bullet, row]}>
          <Ionicons name="mail-outline" size={15} color={theme.primary} />
          <Text style={[styles.bulletText, align]}>{t('request.step1')}</Text>
        </View>
        <View style={[styles.bullet, row]}>
          <Ionicons name="mail-outline" size={15} color={theme.primary} />
          <Text style={[styles.bulletText, align]}>{t('request.step2')}</Text>
        </View>
      </Card>

      <Card>
        <Text style={[styles.closedTitle, align]}>{t('account.accessClosedTitle')}</Text>
        <Text style={[styles.closedBody, align]}>{t('account.accessClosedBody')}</Text>
        <Btn title={t('account.contactUs')} onPress={() => router.push('/contact')} />
      </Card>

      <Btn title={t('request.signIn')} variant="ghost" onPress={() => router.push('/login')} />

      <View style={styles.tokenBlock}>
        <Text style={[styles.tokenText, text]}>{t('request.hasToken')}</Text>
        <Btn
          title={t('request.goRegister')}
          variant="ghost"
          onPress={() => router.push('/register')}
        />
      </View>
    </Screen>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    // `CardHeader text-center` — lock chip, title, description
    head: { alignItems: 'center', gap: Spacing.sm },
    lock: {
      width: 48,
      height: 48,
      borderRadius: Radius.md,
      backgroundColor: t.goldBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { color: t.foreground, fontSize: 24, fontWeight: '700', textAlign: 'center' },
    blurb: {
      color: t.mutedForeground,
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
    },

    // `rounded-lg bg-muted p-4 text-sm`
    howTo: { color: t.foreground, fontSize: 14, fontWeight: '600' },
    bullet: { alignItems: 'flex-start', gap: 8 },
    bulletText: { color: t.mutedForeground, fontSize: 14, lineHeight: 20, flex: 1 },

    closedTitle: { color: t.foreground, fontSize: 16, fontWeight: '700' },
    closedBody: { color: t.mutedForeground, fontSize: 14, lineHeight: 20 },

    tokenBlock: { gap: Spacing.sm, alignItems: 'stretch' },
    tokenText: { color: t.mutedForeground, fontSize: 14, textAlign: 'center' },
  })
);
