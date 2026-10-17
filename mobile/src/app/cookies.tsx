import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, Screen, SectionTitle } from '@/components/ui';
import { useI18n, type MessageKey } from '@/i18n';
import { createStyles } from '@/lib/theme';

/** `section` on the site: a `text-2xl font-bold` heading over a prose block. */
function Section({ title, children }: { title: MessageKey; children: ReactNode }) {
  const styles = useStyles();
  const { t } = useI18n();
  return (
    <View style={styles.section}>
      <SectionTitle>{t(title)}</SectionTitle>
      <Card>{children}</Card>
    </View>
  );
}

export default function CookiesScreen() {
  const styles = useStyles();
  const { t, align } = useI18n();

  /** The three bold-labelled paragraphs inside "2. Types of Cookies We Use". */
  const cookieType = (label: MessageKey, body: MessageKey) => (
    <Text style={[styles.body, align]}>
      <Text style={styles.strong}>{t(label)}</Text>
      {' '}
      {t(body)}
    </Text>
  );

  return (
    <Screen>
      <Text style={[styles.title, align]}>{t('content.cookies.h1' as MessageKey)}</Text>
      <Text style={[styles.updated, align]}>{t('content.legal.updated' as MessageKey)}</Text>

      <Section title={'content.cookies.s1Title' as MessageKey}>
        <Text style={[styles.body, align]}>{t('content.cookies.s1Body' as MessageKey)}</Text>
      </Section>

      <Section title={'content.cookies.s2Title' as MessageKey}>
        {cookieType(
          'content.cookies.essentialLabel' as MessageKey,
          'content.cookies.essentialBody' as MessageKey,
        )}
        {cookieType(
          'content.cookies.preferenceLabel' as MessageKey,
          'content.cookies.preferenceBody' as MessageKey,
        )}
        {cookieType(
          'content.cookies.analyticsLabel' as MessageKey,
          'content.cookies.analyticsBody' as MessageKey,
        )}
      </Section>

      <Section title={'content.cookies.s3Title' as MessageKey}>
        <Text style={[styles.body, align]}>{t('content.cookies.s3Body' as MessageKey)}</Text>
      </Section>

      <Section title={'content.cookies.s4Title' as MessageKey}>
        <Text style={[styles.body, align]}>{t('content.cookies.s4Body' as MessageKey)}</Text>
      </Section>

      <Section title={'content.cookies.s5Title' as MessageKey}>
        <Text style={[styles.body, align]}>{t('content.cookies.s5Body' as MessageKey)}</Text>
      </Section>

      <Section title={'content.cookies.s6Title' as MessageKey}>
        <Text style={[styles.body, align]}>{t('content.cookies.s6Body' as MessageKey)}</Text>
      </Section>
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
    // `<strong>` inside the cookie-type paragraphs.
    strong: { color: t.foreground, fontWeight: '700' },
  })
);
