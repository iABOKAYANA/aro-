import { useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image, StyleSheet, Text, View } from 'react-native';

import { API_URL } from '@/api/config';
import { Badge, Btn, Card, Chip, Empty, ErrorBar, Loading, Screen, SectionTitle } from '@/components/ui';
import { Spacing } from '@/constants/brand';
import { useApi } from '@/hooks/use-api';
import { useI18n, type MessageKey } from '@/i18n';
import type { BlogKey } from '@/i18n/messages/blog';
import { formatDate } from '@/lib/format';
import { createStyles } from '@/lib/theme';

type BlogPost = {
  id: string;
  title: string;
  titleArabic?: string | null;
  slug: string;
  excerpt?: string | null;
  content?: string | null;
  coverImage?: string | null;
  author?: string | null;
  tags?: string | null;
  category?: string | null;
  publishedAt?: string | null;
  viewCount?: number;
};

type ContentBlock = { type: 'text'; text: string } | { type: 'image'; uri: string };

/**
 * The website's /blog/[slug]: back link, cover, meta (category · author ·
 * date), title, excerpt, a gold hairline, then the article body — which is
 * HTML on the server. React Native has no HTML view, so the markup is broken
 * into ordered blocks (paragraphs and images) and rendered natively, keeping
 * the same reading order as the page.
 */
export default function BlogPostScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t: translate, row, align, localized } = useI18n();
  // Widen `t` over this namespace — the shared MessageKey union has not picked
  // it up yet (see BlogKey). Runtime lookup already knows these keys.
  const t = translate as (key: MessageKey | BlogKey) => string;

  const { data, error, loading, refreshing, refresh } = useApi<{ blog?: BlogPost }>(
    slug ? `/api/blog/${encodeURIComponent(String(slug))}` : null
  );
  // Dead remote images hide — same pattern as the home city card.
  const [deadImgs, setDeadImgs] = useState<Record<string, boolean>>({});
  const markDead = (uri: string) =>
    setDeadImgs((prev) => (prev[uri] ? prev : { ...prev, [uri]: true }));

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: t('blog.title') }} />
        <Loading label={t('blog.loadingPost')} />
      </>
    );
  }

  const post = data?.blog;

  if (error || !post) {
    return (
      <Screen refreshing={refreshing} onRefresh={refresh}>
        <Stack.Screen options={{ title: t('blog.title') }} />
        {error ? <ErrorBar message={error} onRetry={refresh} /> : <Empty title={t('blog.notFound')} />}
      </Screen>
    );
  }

  const tags = parseTags(post.tags);
  const blocks = contentBlocks(post.content);

  return (
    <Screen padded={false} refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: localized(post.title, post.titleArabic) }} />

      {post.coverImage && !deadImgs[imageUrl(post.coverImage)] ? (
        <Image
          source={{ uri: imageUrl(post.coverImage) }}
          style={styles.cover}
          onError={() => markDead(imageUrl(post.coverImage!))}
        />
      ) : null}

      <View style={styles.body}>
        <Btn title={t('blog.backToBlog')} variant="ghost" onPress={() => router.push('/blog')} />

        <View style={[styles.meta, row]}>
          {post.category ? <Badge tone="gold">{post.category}</Badge> : null}
          {post.author ? (
            <Text style={[styles.metaText, align]} numberOfLines={1}>
              {post.author}
            </Text>
          ) : null}
          {post.publishedAt ? (
            <Text style={[styles.metaText, align]}>{formatDate(post.publishedAt)}</Text>
          ) : null}
        </View>

        <Text style={[styles.title, align]}>{localized(post.title, post.titleArabic)}</Text>

        {post.excerpt ? <Text style={[styles.excerpt, align]}>{post.excerpt}</Text> : null}

        <View style={styles.rule} />

        {blocks.map((block, index) => {
          if (block.type !== 'image') {
            return (
              <Text key={index} style={[styles.paragraph, align]}>
                {block.text}
              </Text>
            );
          }
          const uri = imageUrl(block.uri);
          // Dead content images hide instead of leaving a blank hole.
          if (deadImgs[uri]) return null;
          return (
            <Image
              key={index}
              source={{ uri }}
              style={styles.contentImage}
              onError={() => markDead(uri)}
            />
          );
        })}

        {tags.length > 0 ? (
          <Card>
            <SectionTitle>{t('blog.tags')}</SectionTitle>
            <View style={[styles.tags, row]}>
              {tags.map((tag) => (
                <Chip key={tag} label={tag} selected={false} />
              ))}
            </View>
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}

/**
 * The CMS stores image paths site-relative (`/images/…`), which the browser
 * resolves against the Next.js origin — the app has to do the same against
 * the API host, or the picture never loads.
 */
function imageUrl(src: string): string {
  if (/^https?:\/\//i.test(src) || src.startsWith('file://')) return src;
  if (src.startsWith('//')) return `https:${src}`;
  return `${API_URL}${src.startsWith('/') ? '' : '/'}${src}`;
}

/** The Blog model stores tags as a JSON array string ("[]"). */
function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const unique = (tags: string[]) => [...new Set(tags)];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return unique(parsed.map((tag) => String(tag).trim()).filter(Boolean));
  } catch {
    // Not JSON — fall through to the comma-separated fallback below.
  }
  return unique(
    raw
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
  );
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_all, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_all, dec: string) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (all, name: string) => ENTITIES[name.toLowerCase()] ?? all);
}

/** Strip tags from one HTML chunk and keep the paragraph breaks. */
function textFromHtml(raw: string): string {
  const withBreaks = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote|tr|pre|ul|ol)>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]*>/g, '');
  return decodeEntities(withBreaks)
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Walk the article HTML once, emitting text and `<img>` blocks in document
 * order so the post reads the same as the prose column on the website.
 */
function contentBlocks(html: string | null | undefined): ContentBlock[] {
  if (!html) return [];
  const blocks: ContentBlock[] = [];

  const pushText = (chunk: string) => {
    const text = textFromHtml(chunk);
    if (!text) return;
    for (const paragraph of text.split(/\n{2,}/)) {
      const value = paragraph.trim();
      if (value) blocks.push({ type: 'text', text: value });
    }
  };

  const imagePattern = /<img[^>]*?src\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = imagePattern.exec(html)) !== null) {
    pushText(html.slice(cursor, match.index));
    if (match[1]) blocks.push({ type: 'image', uri: match[1] });
    cursor = imagePattern.lastIndex;
  }
  pushText(html.slice(cursor));

  return blocks;
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    cover: { width: '100%', aspectRatio: 2, backgroundColor: t.muted },
    body: { padding: Spacing.md, gap: 12, paddingBottom: Spacing.xl },
    meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
    metaText: { color: t.mutedForeground, fontSize: 13, flexShrink: 1 },
    title: { color: t.foreground, fontSize: 26, lineHeight: 34, fontWeight: '800' },
    excerpt: { color: t.mutedForeground, fontSize: 16, lineHeight: 24 },
    // The site's `h-px bg-gradient-to-r via-estate-gold/30` divider.
    rule: { height: 1, backgroundColor: t.primary, opacity: 0.35, marginVertical: 6 },
    paragraph: { color: t.mutedForeground, fontSize: 15, lineHeight: 24 },
    contentImage: {
      width: '100%',
      aspectRatio: 16 / 10,
      borderRadius: 12,
      backgroundColor: t.muted,
    },
    tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  })
);
