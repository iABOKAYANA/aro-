import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Btn, Card, Screen, SectionTitle } from '@/components/ui';
import { useI18n, type MessageKey } from '@/i18n';
import { GUIDE_SEEN_KEY } from '@/i18n/messages/guide';
import { deleteItemAsync } from '@/lib/storage';
import { createStyles } from '@/lib/theme';

/** One Title + Card per section — all `guide.*` copy, each 1–3 lines. */
const SECTIONS: { title: MessageKey; body: MessageKey }[] = [
  { title: 'guide.tabsTitle', body: 'guide.tabsBody' },
  { title: 'guide.searchTitle', body: 'guide.searchBody' },
  { title: 'guide.compareTitle', body: 'guide.compareBody' },
  { title: 'guide.calcTitle', body: 'guide.calcBody' },
  { title: 'guide.aynTitle', body: 'guide.aynBody' },
  { title: 'guide.accountTitle', body: 'guide.accountBody' },
  { title: 'guide.langTitle', body: 'guide.langBody' },
  { title: 'guide.notifTitle', body: 'guide.notifBody' },
  { title: 'guide.stuckTitle', body: 'guide.stuckBody' },
];

export default function HelpScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { t, align } = useI18n();

  // Clear the seen flag first so AuthGate's first-run redirect does not
  // instantly bounce the user back here — replay must actually replay.
  async function replay() {
    try {
      await deleteItemAsync(GUIDE_SEEN_KEY);
    } catch {
      // Fall through to navigation either way.
    } finally {
      router.push('/onboarding');
    }
  }

  return (
    <Screen>
      <Text style={[styles.subtitle, align]}>{t('guide.helpSubtitle')}</Text>

      {SECTIONS.map((section) => (
        <View key={section.title} style={styles.section}>
          <SectionTitle>{t(section.title)}</SectionTitle>
          <Card>
            <Text style={[styles.body, align]}>{t(section.body)}</Text>
          </Card>
        </View>
      ))}

      <Btn title={t('guide.contactCta')} onPress={() => router.push('/contact')} />
      <Btn title={t('guide.replay')} variant="ghost" onPress={() => void replay()} />
    </Screen>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    subtitle: { color: t.mutedForeground, fontSize: 15, lineHeight: 22 },
    section: { gap: 8 },
    body: { color: t.mutedForeground, fontSize: 15, lineHeight: 24 },
  }),
);
