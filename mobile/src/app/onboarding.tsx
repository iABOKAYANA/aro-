import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Btn, Screen } from '@/components/ui';
import { useI18n, type MessageKey } from '@/i18n';
import { GUIDE_SEEN_KEY } from '@/i18n/messages/guide';
import { useAppFonts } from '@/lib/fonts';
import { setItemAsync } from '@/lib/storage';
import { createStyles } from '@/lib/theme';

/**
 * First-run intro — four plain steps, no carousel library. A public screen:
 * it renders signed-out and signed-in alike; AuthGate carries a signed-in
 * session that already saw it back to `/`, like the auth forms.
 */
const STEPS: { icon: keyof typeof Ionicons.glyphMap; title: MessageKey; body: MessageKey }[] = [
  { icon: 'home-outline', title: 'guide.step1Title', body: 'guide.step1Body' },
  { icon: 'git-compare-outline', title: 'guide.step2Title', body: 'guide.step2Body' },
  { icon: 'chatbubble-ellipses-outline', title: 'guide.step3Title', body: 'guide.step3Body' },
  { icon: 'language-outline', title: 'guide.step4Title', body: 'guide.step4Body' },
];

export default function OnboardingScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { t, text, row } = useI18n();
  const fonts = useAppFonts();
  const [step, setStep] = useState(0);

  const current = STEPS[step] ?? STEPS[0];
  const last = step === STEPS.length - 1;

  // Mark seen, then leave. Storage is fail-soft and the `finally` navigates
  // regardless — a write that refuses must never trap the user here.
  async function finish() {
    try {
      await setItemAsync(GUIDE_SEEN_KEY, '1');
    } catch {
      // Fall through to navigation either way.
    } finally {
      router.replace('/');
    }
  }

  return (
    <Screen scroll={false}>
      <View style={styles.wrap}>
        <View style={styles.glyph}>
          <Ionicons name={current.icon} size={56} color={styles.glyphColor.color} />
        </View>
        <Text style={[styles.title, text, fonts.displayBold]}>{t(current.title)}</Text>
        <Text style={[styles.body, text]}>{t(current.body)}</Text>

        <View style={[styles.dots, row]}>
          {STEPS.map((item, index) => (
            <View key={item.title} style={[styles.dot, index === step && styles.dotActive]} />
          ))}
        </View>

        <View style={[styles.actions, row]}>
          <Btn title={t('guide.skip')} variant="ghost" onPress={() => void finish()} style={styles.action} />
          {last ? (
            <Btn title={t('guide.start')} onPress={() => void finish()} style={styles.action} />
          ) : (
            <Btn
              title={t('guide.next')}
              onPress={() => setStep((prev) => Math.min(prev + 1, STEPS.length - 1))}
              style={styles.action}
            />
          )}
        </View>
      </View>
    </Screen>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    glyph: {
      width: 120,
      height: 120,
      borderRadius: 60,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.goldBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    // `color` only — handed to the Ionicon so the glyph follows the palette.
    glyphColor: { color: t.primary },
    title: {
      color: t.foreground,
      fontSize: 28,
      lineHeight: 38,
      fontWeight: '700',
      textAlign: 'center',
    },
    body: {
      color: t.mutedForeground,
      fontSize: 16,
      lineHeight: 26,
      textAlign: 'center',
      paddingHorizontal: 8,
    },
    dots: { gap: 8, justifyContent: 'center', marginTop: 8 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.controlBorder },
    dotActive: { width: 24, backgroundColor: t.primary },
    actions: { gap: 12, marginTop: 16, alignSelf: 'stretch' },
    action: { flex: 1 },
  }),
);
