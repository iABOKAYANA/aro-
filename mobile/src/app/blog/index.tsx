import { useEffect, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { API_URL } from '@/api/config';
import { Badge, Btn, Card, Empty, ErrorBar, Loading, Screen } from '@/components/ui';
import { Spacing } from '@/constants/brand';
import { useApi } from '@/hooks/use-api';
import { useI18n, type MessageKey } from '@/i18n';
import type { BlogKey } from '@/i18n/messages/blog';
import { formatDate } from '@/lib/format';
import { createStyles } from '@/lib/theme';

/** Same page size the site's API defaults to: GET /api/blog?page&limit&category */
const PAGE_SIZE = 12;

type BlogPost = {
  id: string;
  title: string;
  titleArabic?: string | null;
  slug: string;
  excerpt?: string | null;
  coverImage?: string | null;
  author?: string | null;
  category?: string | null;
  publishedAt?: string | null;
};

/** `src/app/api/blog/route.ts` response. */
type BlogListResponse = {
  items?: BlogPost[];
  total?: number;
  page?: number;
  totalPages?: number;
};

/**
 * The CMS stores image paths site-relative (`/images/…`), which the browser
 * resolves against the Next.js origin — the app has to do the same against
 * the API host, or the cover never loads.
 */
function imageUrl(src: string): string {
  if (/^https?:\/\//i.test(src) || src.startsWith('file://')) return src;
  if (src.startsWith('//')) return `https:${src}`;
  return `${API_URL}${src.startsWith('/') ? '' : '/'}${src}`;
}

/**
 * The website's /blog: a centred page heading, then every published post as a
 * card — cover, category pill, title, two-line excerpt, author and date — each
 * one linking to /blog/:slug. The API pages the list, so posts accumulate here
 * as the reader asks for more instead of being cut off at the first page.
 */
export default function BlogScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { t: translate, row, text, align, localized } = useI18n();
  // Widen `t` over this namespace — the shared MessageKey union has not picked
  // it up yet (see BlogKey). Runtime lookup already knows these keys.
  const t = translate as (key: MessageKey | BlogKey) => string;

  const [page, setPage] = useState(1);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  // Dead remote covers fall back to the EA block — same as the home city card.
  const [deadImgs, setDeadImgs] = useState<Record<string, boolean>>({});
  const list = useApi<BlogListResponse>(`/api/blog?page=${page}&limit=${PAGE_SIZE}`);

  // Append the next page onto what is already on screen; page 1 (first load
  // and pull-to-refresh) replaces it. Merging on `id` keeps a superseded
  // response from ever duplicating a card.
  useEffect(() => {
    const items = list.data?.items;
    if (!items) return;
    setPosts((prev) =>
      page === 1 ? items : [...prev, ...items.filter((item) => !prev.some((seen) => seen.id === item.id))]
    );
  }, [list.data, page]);

  const reload = () => {
    // A refresh from page 1 keeps the pull-to-refresh spinner; from a deeper
    // page the path change alone re-issues the fetch.
    if (page === 1) list.refresh();
    else setPage(1);
  };

  if (list.loading) {
    return (
      <>
        <Stack.Screen options={{ title: t('blog.title') }} />
        <Loading label={t('blog.loading')} />
      </>
    );
  }

  // Server page behind the local one → the next request is still in flight.
  const pending = list.data != null && (list.data.page ?? 1) < page;
  const hasMore = list.data != null && (list.data.page ?? 1) < (list.data.totalPages ?? 0);

  return (
    <Screen refreshing={list.refreshing} onRefresh={reload}>
      <Stack.Screen options={{ title: t('blog.title') }} />

      <View style={styles.head}>
        <Text style={[styles.title, text]}>{t('blog.title')}</Text>
        <Text style={[styles.subtitle, text]}>{t('blog.subtitle')}</Text>
      </View>

      {list.error ? <ErrorBar message={list.error} onRetry={reload} /> : null}

      {posts.length === 0 ? (
        <Empty title={t('blog.empty')} message={t('blog.emptyHint')} />
      ) : (
        <>
          {posts.map((post) => (
            <Pressable
              key={post.id}
              onPress={() => router.push(`/blog/${post.slug}`)}
              style={({ pressed }) => pressed && styles.pressed}>
              <Card style={styles.card}>
                <View style={styles.coverWrap}>
                  {post.coverImage && !deadImgs[imageUrl(post.coverImage)] ? (
                    <Image
                      source={{ uri: imageUrl(post.coverImage) }}
                      style={styles.cover}
                      onError={() =>
                        setDeadImgs((prev) => {
                          const key = imageUrl(post.coverImage!);
                          return prev[key] ? prev : { ...prev, [key]: true };
                        })
                      }
                    />
                  ) : (
                    <View style={[styles.cover, styles.coverFallback]}>
                      <Text style={styles.coverFallbackText}>EA</Text>
                    </View>
                  )}
                  {post.category ? (
                    <View style={styles.category}>
                      <Badge tone="gold">{post.category}</Badge>
                    </View>
                  ) : null}
                </View>

                <View style={styles.cardBody}>
                  <Text style={[styles.cardTitle, align]}>
                    {localized(post.title, post.titleArabic)}
                  </Text>

                  {post.excerpt ? (
                    <Text style={[styles.excerpt, align]} numberOfLines={2}>
                      {post.excerpt}
                    </Text>
                  ) : null}

                  <View style={[styles.meta, row]}>
                    {post.author ? (
                      <Text style={[styles.metaText, align]} numberOfLines={1}>
                        {post.author}
                      </Text>
                    ) : null}
                    {post.publishedAt ? (
                      <Text style={[styles.metaText, align]}>{formatDate(post.publishedAt)}</Text>
                    ) : null}
                  </View>
                </View>
              </Card>
            </Pressable>
          ))}

          {hasMore ? (
            <Btn title={t('blog.loadMore')} variant="ghost" busy={pending} onPress={() => setPage(page + 1)} />
          ) : null}
        </>
      )}
    </Screen>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    head: { alignItems: 'center', gap: 6, paddingTop: Spacing.xs, paddingHorizontal: 4 },
    title: { color: t.foreground, fontSize: 28, fontWeight: '800', textAlign: 'center' },
    subtitle: {
      color: t.mutedForeground,
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
      paddingHorizontal: Spacing.sm,
    },

    pressed: { opacity: 0.85 },
    // Image bleeds to the card edge, exactly like the site's rounded card.
    card: { padding: 0, gap: 0, overflow: 'hidden' },
    coverWrap: { width: '100%' },
    cover: { width: '100%', aspectRatio: 16 / 10, backgroundColor: t.muted },
    coverFallback: { alignItems: 'center', justifyContent: 'center' },
    coverFallbackText: { color: t.primary, fontSize: 26, fontWeight: '800', letterSpacing: 4 },
    category: { position: 'absolute', left: 12, top: 12 },
    cardBody: { padding: Spacing.md, gap: 8 },
    cardTitle: { color: t.foreground, fontSize: 17, fontWeight: '600', lineHeight: 24 },
    excerpt: { color: t.mutedForeground, fontSize: 14, lineHeight: 20 },
    meta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      marginTop: 2,
    },
    metaText: { color: t.mutedForeground, fontSize: 12, flexShrink: 1 },
  })
);
