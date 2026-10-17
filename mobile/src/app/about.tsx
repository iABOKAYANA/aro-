import { StyleSheet, Text, View } from 'react-native';

import { Card, Screen, SectionTitle } from '@/components/ui';
import { useI18n, type MessageKey } from '@/i18n';
import { createStyles } from '@/lib/theme';

/**
 * "What We Offer" — six bordered cards in a two-column grid on the website,
 * stacked full width here (same order, same copy).
 *
 * `content.*` keys sit outside the typed `MessageKey` union, so they are cast
 * at the table the same way src/app/blog/index.tsx casts them.
 */
const OFFERS: { title: MessageKey; desc: MessageKey }[] = [
  { title: 'content.about.offer1Title' as MessageKey, desc: 'content.about.offer1Desc' as MessageKey },
  { title: 'content.about.offer2Title' as MessageKey, desc: 'content.about.offer2Desc' as MessageKey },
  { title: 'content.about.offer3Title' as MessageKey, desc: 'content.about.offer3Desc' as MessageKey },
  { title: 'content.about.offer4Title' as MessageKey, desc: 'content.about.offer4Desc' as MessageKey },
  { title: 'content.about.offer5Title' as MessageKey, desc: 'content.about.offer5Desc' as MessageKey },
  { title: 'content.about.offer6Title' as MessageKey, desc: 'content.about.offer6Desc' as MessageKey },
];

export default function AboutScreen() {
  const styles = useStyles();
  const { t, align, text } = useI18n();

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={[styles.title, text]}>{t('content.about.h1' as MessageKey)}</Text>
        <Text style={[styles.subtitle, text]}>{t('content.about.tagline' as MessageKey)}</Text>
      </View>

      <View style={styles.section}>
        <SectionTitle>{t('content.about.missionTitle' as MessageKey)}</SectionTitle>
        <Card>
          <Text style={[styles.body, align]}>{t('content.about.missionBody' as MessageKey)}</Text>
        </Card>
      </View>

      <View style={styles.section}>
        <SectionTitle>{t('content.about.offerTitle' as MessageKey)}</SectionTitle>
        {OFFERS.map((item) => (
          <Card key={item.title}>
            <Text style={[styles.itemTitle, align]}>{t(item.title)}</Text>
            <Text style={[styles.body, align]}>{t(item.desc)}</Text>
          </Card>
        ))}
      </View>

      <View style={styles.section}>
        <SectionTitle>{t('content.about.whyEgyptTitle' as MessageKey)}</SectionTitle>
        <Card>
          <Text style={[styles.body, align]}>{t('content.about.whyEgyptBody' as MessageKey)}</Text>
        </Card>
      </View>
    </Screen>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    // Site hero: `mb-12 text-center` with `text-4xl font-bold` + `text-lg`.
    hero: { alignItems: 'center', gap: 6, marginBottom: 8 },
    title: {
      color: t.foreground,
      fontSize: 28,
      lineHeight: 34,
      fontWeight: '700',
      textAlign: 'center',
    },
    subtitle: {
      color: t.mutedForeground,
      fontSize: 16,
      lineHeight: 24,
      textAlign: 'center',
    },
    section: { gap: 8 },
    // `text-muted-foreground` — the prose colour used by every page section.
    body: { color: t.mutedForeground, fontSize: 15, lineHeight: 24 },
    // `font-semibold` offer card heading.
    itemTitle: { color: t.foreground, fontSize: 16, fontWeight: '600' },
  })
);
