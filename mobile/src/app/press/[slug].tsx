import { useState } from 'react';
import { Image, Linking, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { Btn, Card, Divider, Empty, ErrorBar, Loading, Screen } from '@/components/ui';
import { Radius } from '@/constants/brand';
import { useApi } from '@/hooks/use-api';
import { useI18n, type MessageKey } from '@/i18n';
import type { press } from '@/i18n/messages/press';
import { formatDate } from '@/lib/format';
import { imageUrl } from '@/lib/image';
import { createStyles } from '@/lib/theme';

type PressKey = keyof typeof press;

type PressRelease = {
  id?: string;
  title: string;
  titleArabic?: string | null;
  slug?: string;
  excerpt?: string | null;
  content?: string;
  coverImage?: string | null;
  source?: string | null;
  sourceUrl?: string | null;
  isPublished?: boolean;
  publishedAt?: string | null;
};

export default function PressReleaseScreen() {
  const styles = useStyles();
  const { t: translate, row, align, localized } = useI18n();
  // `MessageKey` (src/i18n/index.tsx, lead-owned) unions this app's message
  // tables but not yet `press`, so `t()` would reject every `press.*` key.
  // Widening the parameter keeps all copy flowing through `t('press.…')` and
  // stays typo-checked against this namespace until that union picks it up.
  const t = translate as (key: MessageKey | PressKey) => string;
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const { data, error, loading, refreshing, refresh } = useApi<{ pressRelease?: PressRelease }>(
    slug ? `/api/press/${encodeURIComponent(String(slug))}` : null
  );
  // Dead remote cover hides — same pattern as the home city card.
  const [deadImgs, setDeadImgs] = useState<Record<string, boolean>>({});

  const release = data?.pressRelease;

  if (loading) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('press.title') }} />
        <Loading label={t('press.loading')} />
      </Screen>
    );
  }

  if (error || !release) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('press.title') }} />
        {error ? <ErrorBar message={error} onRetry={refresh} /> : <Empty title={t('press.notFound')} />}
        <Btn title={t('press.back')} variant="ghost" onPress={() => router.push('/press')} />
      </Screen>
    );
  }

  const date = release.publishedAt ? formatDate(release.publishedAt) : null;
  const paragraphs = toParagraphs(release.content ?? '');
  const coverSrc = imageUrl(release.coverImage);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: localized(release.title, release.titleArabic) }} />

      <Btn title={t('press.back')} variant="ghost" onPress={() => router.push('/press')} />

      <View style={styles.body}>
        {coverSrc && !deadImgs[coverSrc] ? (
          <Image
            source={{ uri: coverSrc }}
            style={styles.cover}
            onError={() =>
              setDeadImgs((prev) => (prev[coverSrc] ? prev : { ...prev, [coverSrc]: true }))
            }
          />
        ) : null}

        <View style={[styles.meta, row]}>
          {date ? (
            <Text
              style={[styles.metaText, align]}
              accessibilityLabel={`${t('press.published')} ${date}`}>
              {date}
            </Text>
          ) : null}
          {date && release.source ? <Text style={styles.dot}>·</Text> : null}
          {release.source ? (
            <Text
              style={[styles.metaText, align, release.sourceUrl ? styles.metaLink : undefined]}
              onPress={
                release.sourceUrl ? () => void Linking.openURL(String(release.sourceUrl)) : undefined
              }
              accessibilityRole={release.sourceUrl ? 'link' : undefined}
              accessibilityLabel={`${t('press.source')}: ${release.source}`}
              accessibilityHint={release.sourceUrl ? t('press.viewOriginal') : undefined}>
              {release.source}
            </Text>
          ) : null}
        </View>

        <Text style={[styles.title, align]}>{localized(release.title, release.titleArabic)}</Text>

        {release.excerpt ? (
          <Text style={[styles.excerpt, align]}>{localized(release.excerpt)}</Text>
        ) : null}

        <Divider />

        {paragraphs.length > 0 ? (
          <Card style={styles.article}>
            {paragraphs.map((paragraph, index) => (
              <Text key={index} style={[styles.paragraph, align]}>
                {paragraph}
              </Text>
            ))}
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}

/**
 * The site pipes `content` through `dangerouslySetInnerHTML` inside a `prose`
 * container. React Native cannot render HTML, and no new dependency may be
 * added, so the fragment is flattened to plain paragraphs — the same words in
 * the same order, without the styling the HTML carries.
 */
function toParagraphs(html: string): string[] {
  const text = html
    .replace(/<\s*(script|style)[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|h[1-6]|li|blockquote|tr|ul|ol|table|figure|figcaption)\s*>/gi, '\n\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    // Out-of-range code points would throw from `fromCodePoint` mid-render.
    .replace(/&#(\d+);/g, (_, code: string) => {
      const point = Number(code);
      return point <= 0x10ffff ? String.fromCodePoint(point) : '';
    })
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&amp;/gi, '&');

  return text
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .split('\n')
        .map((line) => line.replace(/[ \t]+/g, ' ').trim())
        .join('\n')
        .trim()
    )
    .filter(Boolean);
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    body: { gap: 10 },
    cover: {
      width: '100%',
      aspectRatio: 2,
      borderRadius: Radius.xxl,
      backgroundColor: t.muted,
    },
    meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
    metaText: { color: t.mutedForeground, fontSize: 13, lineHeight: 18 },
    metaLink: { color: t.primary, fontWeight: '600' },
    dot: { color: t.mutedForeground, fontSize: 13, lineHeight: 18 },
    title: { color: t.foreground, fontSize: 24, lineHeight: 32, fontWeight: '800' },
    excerpt: { color: t.mutedForeground, fontSize: 16, lineHeight: 24 },
    article: { gap: 12 },
    paragraph: { color: t.foreground, fontSize: 16, lineHeight: 26 },
  })
);
