import { StyleSheet, Text, View } from 'react-native';

import { Card, Screen, SectionTitle } from '@/components/ui';
import { useI18n, type MessageKey } from '@/i18n';
import { createStyles } from '@/lib/theme';

/** The six numbered sections of the website's privacy page, in order. */
const SECTIONS: { title: MessageKey; body: MessageKey }[] = [
  { title: 'content.privacy.s1Title' as MessageKey, body: 'content.privacy.s1Body' as MessageKey },
  { title: 'content.privacy.s2Title' as MessageKey, body: 'content.privacy.s2Body' as MessageKey },
  { title: 'content.privacy.s3Title' as MessageKey, body: 'content.privacy.s3Body' as MessageKey },
  { title: 'content.privacy.s4Title' as MessageKey, body: 'content.privacy.s4Body' as MessageKey },
  { title: 'content.privacy.s5Title' as MessageKey, body: 'content.privacy.s5Body' as MessageKey },
  { title: 'content.privacy.s6Title' as MessageKey, body: 'content.privacy.s6Body' as MessageKey },
];

export default function PrivacyScreen() {
  const styles = useStyles();
  const { t, align } = useI18n();

  return (
    <Screen>
      <Text style={[styles.title, align]}>{t('content.privacy.h1' as MessageKey)}</Text>
      <Text style={[styles.updated, align]}>{t('content.legal.updated' as MessageKey)}</Text>

      {SECTIONS.map((section) => (
        <View key={section.title} style={styles.section}>
          <SectionTitle>{t(section.title)}</SectionTitle>
          <Card>
            <Text style={[styles.body, align]}>{t(section.body)}</Text>
          </Card>
        </View>
      ))}
    </Screen>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    // `text-4xl font-bold` page heading.
    title: { color: t.foreground, fontSize: 28, lineHeight: 34, fontWeight: '700' },
    // `text-sm text-muted-foreground` — "Last updated" line.
    updated: { color: t.mutedForeground, fontSize: 13, lineHeight: 18 },
    section: { gap: 8 },
    // `text-muted-foreground` — the prose colour used by every section.
    body: { color: t.mutedForeground, fontSize: 15, lineHeight: 24 },
  })
);
