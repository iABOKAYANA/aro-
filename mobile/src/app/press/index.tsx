import { useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';

import { Card, Empty, ErrorBar, Loading, Screen } from '@/components/ui';
import { Radius } from '@/constants/brand';
import { useApi } from '@/hooks/use-api';
import { useI18n, type MessageKey } from '@/i18n';
import type { press } from '@/i18n/messages/press';
import { formatDate } from '@/lib/format';
import { imageUrl } from '@/lib/image';
import { createStyles } from '@/lib/theme';

type PressKey = keyof typeof press;

/** One row of `GET /api/press` — mirrors the website's PressRelease card. */
type PressRelease = {
  id: string;
  title: string;
  titleArabic?: string | null;
  slug: string;
  excerpt?: string | null;
  content?: string;
  coverImage?: string | null;
  source?: string | null;
  sourceUrl?: string | null;
  isPublished?: boolean;
  publishedAt?: string | null;
};

type PressListResponse = {
  items?: PressRelease[];
  total?: number;
  page?: number;
  totalPages?: number;
};

/**
 * The website's /press reads every published release in one query and has no
 * pager, so the app asks for one generous page instead of inventing one — the
 * same `?limit=` shape /api/projects, /api/leads and /api/notifications use.
 */
const LIST_PATH = '/api/press?limit=100';

export default function PressScreen() {
  const styles = useStyles();
  const { t: translate, row, align, localized } = useI18n();
  // `MessageKey` (src/i18n/index.tsx, lead-owned) unions this app's message
  // tables but not yet `press`, so `t()` would reject every `press.*` key.
  // Widening the parameter keeps all copy flowing through `t('press.…')` and
  // stays typo-checked against this namespace until that union picks it up.
  const t = translate as (key: MessageKey | PressKey) => string;
  const router = useRouter();
  const { data, error, loading, refreshing, refresh } = useApi<PressListResponse>(LIST_PATH);
  // Dead remote covers hide — same pattern as the home city card.
  const [deadImgs, setDeadImgs] = useState<Record<string, boolean>>({});

  if (loading) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('press.title') }} />
        <Loading label={t('press.loading')} />
      </Screen>
    );
  }

  const items = data?.items ?? [];

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('press.title') }} />

      <View style={styles.header}>
        <Text style={[styles.heading, align]}>{t('press.title')}</Text>
        <Text style={[styles.subtitle, align]}>{t('press.subtitle')}</Text>
      </View>

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}

      {!error && items.length === 0 ? (
        <Empty title={t('press.empty')} message={t('press.emptyHint')} />
      ) : null}

      {items.map((release) => {
        const date = release.publishedAt ? formatDate(release.publishedAt) : null;
        const src = imageUrl(release.coverImage);
        return (
          <Pressable
            key={release.id}
            onPress={() => router.push(`/press/${release.slug}`)}
            style={({ pressed }) => pressed && styles.pressed}>
            <Card>
              {src && !deadImgs[src] ? (
                <Image
                  source={{ uri: src }}
                  style={styles.cover}
                  onError={() =>
                    setDeadImgs((prev) => (prev[src] ? prev : { ...prev, [src]: true }))
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
                      release.sourceUrl
                        ? () => void Linking.openURL(String(release.sourceUrl))
                        : undefined
                    }
                    accessibilityRole={release.sourceUrl ? 'link' : undefined}
                    accessibilityLabel={`${t('press.source')}: ${release.source}`}
                    accessibilityHint={release.sourceUrl ? t('press.viewOriginal') : undefined}>
                    {release.source}
                  </Text>
                ) : null}
              </View>

              <Text style={[styles.title, align]} numberOfLines={2}>
                {localized(release.title, release.titleArabic)}
              </Text>

              {release.excerpt ? (
                <Text style={[styles.excerpt, align]} numberOfLines={2}>
                  {release.excerpt}
                </Text>
              ) : null}

              <Text style={[styles.readMore, align]}>{t('press.readMore')}</Text>
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    header: { gap: 4 },
    heading: { color: t.foreground, fontSize: 26, lineHeight: 32, fontWeight: '800' },
    subtitle: { color: t.mutedForeground, fontSize: 15, lineHeight: 21 },
    pressed: { opacity: 0.85 },
    // `flex flex-col gap-4 sm:flex-row` — the phone is below `sm`, so the
    // cover sits above the text at full width, as the site renders it.
    cover: {
      width: '100%',
      height: 172,
      borderRadius: Radius.xl,
      backgroundColor: t.muted,
    },
    meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
    metaText: { color: t.mutedForeground, fontSize: 13, lineHeight: 18 },
    metaLink: { color: t.primary, fontWeight: '600' },
    dot: { color: t.mutedForeground, fontSize: 13, lineHeight: 18 },
    title: { color: t.foreground, fontSize: 17, lineHeight: 24, fontWeight: '700' },
    excerpt: { color: t.mutedForeground, fontSize: 14, lineHeight: 20 },
    readMore: { color: t.primary, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  })
);
