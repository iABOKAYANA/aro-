import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';

import {
  Badge,
  Btn,
  Card,
  Divider,
  Empty,
  ErrorBar,
  Field,
  Loading,
  Row,
  Screen,
  SearchBar,
  SectionTitle,
  Stat,
} from '@/components/ui';
import { useRoleDenied } from '@/components/role-gate';
import { Estate, Radius, Spacing } from '@/constants/brand';
import { useApi, useMutation } from '@/hooks/use-api';
import { useI18n } from '@/i18n';
import { formatDate } from '@/lib/format';
import { useImageUpload } from '@/lib/image-upload';
import { createStyles, useTheme } from '@/lib/theme';

type BlogPost = {
  id: string;
  title: string;
  titleArabic: string | null;
  slug: string;
  excerpt: string | null;
  content: string;
  coverImage: string | null;
  author: string | null;
  tags: string;
  category: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
};

type BlogPage = { items?: BlogPost[]; total?: number };

const MAX_RENDER = 60;

/** Maps the upload helper's stable error codes onto failure-strip strings. */
const UPLOAD_ERROR_KEY = {
  'too-large': 'ceoOps.uploadTooLarge',
  'bad-type': 'ceoOps.uploadBadType',
  failed: 'ceoOps.uploadFailed',
} as const;

/** Same slug rule the website applies as you type the title. */
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/**
 * Blog management — the mobile twin of src/app/ceo/blog/page.tsx.
 *
 * Reads `GET /api/blog?limit=100&all=true`; that flag drops the
 * `isPublished` filter for a CEO/ADMIN session so drafts appear alongside
 * published posts, which is the whole point of a management console. Writes
 * are the same three the website fires: POST to create, PATCH
 * `{ id, isPublished }` to toggle the publication state, DELETE `?id=` to
 * remove a post for good (the server hard-deletes, so it is confirmed first).
 */
export default function CeoBlogScreen() {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [titleArabic, setTitleArabic] = useState('');
  const [slug, setSlug] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [isPublished, setIsPublished] = useState(false);

  const { data, error, loading, refreshing, refresh } = useApi<BlogPage>(
    '/api/blog?limit=100&all=true',
  );
  const mutation = useMutation();
  // Phone upload for the cover field — fills it with the stored path exactly
  // like the website's ImageInput does; URL paste below keeps working.
  const coverUpload = useImageUpload(setCoverImage);

  /** Mirrors the website: the slug follows the title until edited by hand. */
  function onTitleChange(value: string) {
    setTitle(value);
    setSlug((prev) =>
      prev === '' || prev === generateSlug(title) ? generateSlug(value) : prev,
    );
  }

  async function togglePublish(post: BlogPost) {
    setBusyId(post.id);
    setProblem(null);
    setNotice(null);
    try {
      await mutation.run('/api/blog', 'PATCH', { id: post.id, isPublished: !post.isPublished });
      refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(post: BlogPost) {
    setBusyId(post.id);
    setProblem(null);
    try {
      await mutation.run(`/api/blog?id=${post.id}`, 'DELETE');
      setExpanded(null);
      refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusyId(null);
    }
  }

  function confirmRemove(post: BlogPost) {
    Alert.alert(t('ceoOps.deletePostTitle'), t('ceoOps.deletePostBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.confirm'), style: 'destructive', onPress: () => void remove(post) },
    ]);
  }

  async function create() {
    if (!title.trim() || !content.trim()) {
      setProblem(t('ceoOps.titleContentRequired'));
      return;
    }
    setProblem(null);
    try {
      await mutation.run('/api/blog', 'POST', {
        title,
        titleArabic,
        slug,
        excerpt,
        content,
        coverImage,
        category,
        isPublished,
      });
      setCreating(false);
      setTitle('');
      setTitleArabic('');
      setSlug('');
      setExcerpt('');
      setContent('');
      setCategory('');
      setCoverImage('');
      setIsPublished(false);
      setNotice(t('ceoOps.postCreated'));
      refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    }
  }

  const denied = useRoleDenied('ceo.forbidden', ['CEO', 'ADMIN']);
  if (denied) return denied;

  if (loading) return <Loading label={t('common.loading')} />;

  const all = data?.items ?? [];
  const q = query.trim().toLowerCase();
  const filtered = q
    ? all.filter(
        (post) =>
          post.title.toLowerCase().includes(q) ||
          (post.titleArabic ?? '').toLowerCase().includes(q) ||
          (post.category ?? '').toLowerCase().includes(q),
      )
    : all;
  const rows = filtered.slice(0, MAX_RENDER);
  const publishedCount = all.filter((post) => post.isPublished).length;
  const totalViews = all.reduce((sum, post) => sum + (post.viewCount ?? 0), 0);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('ceoOps.blogTitle') }} />

      <Card style={[styles.kpis, row]}>
        <Stat value={all.length} label={t('ceoOps.kpiTotalPosts')} />
        <Stat value={publishedCount} label={t('ceoOps.kpiPublished')} />
        <Stat value={all.length - publishedCount} label={t('ceoOps.kpiDrafts')} />
        <Stat value={totalViews} label={t('ceoOps.kpiTotalViews')} />
      </Card>

      <Btn
        title={creating ? t('common.close') : t('ceoOps.newPost')}
        variant={creating ? 'ghost' : 'primary'}
        onPress={() => {
          setCreating((prev) => !prev);
          setProblem(null);
        }}
      />

      {creating ? (
        <Card style={styles.form}>
          <Field label={`${t('ceoOps.fieldTitle')} *`} value={title} onChangeText={onTitleChange} />
          <Field
            label={t('ceoOps.fieldTitleAr')}
            value={titleArabic}
            onChangeText={setTitleArabic}
          />
          <Field
            label={t('ceoOps.fieldSlug')}
            value={slug}
            onChangeText={setSlug}
            placeholder={t('ceoOps.slugPlaceholder')}
          />
          <Field label={t('ceoOps.fieldCategory')} value={category} onChangeText={setCategory} />
          <Field label={t('ceoOps.fieldExcerpt')} value={excerpt} onChangeText={setExcerpt} />
          <Field
            label={t('ceoOps.fieldCover')}
            value={coverImage}
            onChangeText={setCoverImage}
            autoCapitalize="none"
          />
          <Btn
            title={coverUpload.uploading ? t('ceoOps.uploading') : t('ceoOps.uploadImage')}
            variant="ghost"
            busy={coverUpload.uploading}
            disabled={mutation.busy}
            onPress={() => void coverUpload.pick()}
          />
          {coverUpload.errorCode ? (
            <Text style={[styles.uploadError, align]}>{t(UPLOAD_ERROR_KEY[coverUpload.errorCode])}</Text>
          ) : null}
          <Field
            label={`${t('ceoOps.fieldContent')} *`}
            value={content}
            onChangeText={setContent}
            multiline
            numberOfLines={6}
            style={[styles.body, align]}
          />
          <PublishToggle value={isPublished} onChange={setIsPublished} />
          <Btn
            title={creating && mutation.busy ? t('ceoOps.creating') : t('ceoOps.createPost')}
            busy={mutation.busy}
            onPress={() => void create()}
          />
        </Card>
      ) : null}

      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder={t('ceoOps.searchBlog')}
      />

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}
      {problem ? <ErrorBar message={problem} /> : null}
      {notice ? <Text style={[styles.notice, align]}>{`${notice} ✓`}</Text> : null}

      {!error && rows.length === 0 ? (
        <Empty
          title={t('ceoOps.noPosts')}
          message={q ? t('ceoOps.trySearch') : t('ceoOps.createFirstPost')}
        />
      ) : null}

      {filtered.length > MAX_RENDER ? (
        <Text style={[styles.count, align]}>
          {`${t('common.showingFirst')} ${MAX_RENDER} ${t('common.of')} ${filtered.length}`}
        </Text>
      ) : null}

      {rows.map((post, index) => {
        const isOpen = expanded === post.id;
        const busy = busyId === post.id;

        return (
          <View key={post.id}>
            {index > 0 ? <Divider /> : null}
            <Card style={styles.card}>
              <Row
                title={post.title}
                subtitle={[
                  post.titleArabic,
                  post.category,
                  `${post.viewCount} ${t('ceoOps.views')}`,
                  formatDate(post.createdAt),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                badge={
                  <Badge tone={post.isPublished ? 'green' : 'gold'}>
                    {post.isPublished ? t('ceoOps.published') : t('ceoOps.draft')}
                  </Badge>
                }
                onPress={() => {
                  setExpanded(isOpen ? null : post.id);
                  setProblem(null);
                  setNotice(null);
                }}
              />

              {isOpen ? (
                <View style={styles.editor}>
                  <Divider />
                  <SectionTitle>{t('ceoOps.postDetails')}</SectionTitle>
                  <Detail label={t('ceoOps.fieldSlug')} value={post.slug} />
                  <Detail label={t('ceoOps.fieldCategory')} value={post.category || '—'} />
                  <Detail label={t('ceoOps.fieldAuthor')} value={post.author || '—'} />
                  <Detail label={t('ceoOps.views')} value={String(post.viewCount ?? 0)} />
                  {post.publishedAt ? (
                    <Detail label={t('ceoOps.fieldPublished')} value={formatDate(post.publishedAt)} />
                  ) : null}

                  <SectionTitle>{t('ceoOps.contentPreview')}</SectionTitle>
                  {post.excerpt ? (
                    <Text style={[styles.excerpt, align]}>{post.excerpt}</Text>
                  ) : null}
                  <Text style={[styles.preview, align]} numberOfLines={8}>
                    {post.content}
                  </Text>

                  <View style={[styles.actions, row]}>
                    <Btn
                      title={post.isPublished ? t('ceo.unpublish') : t('ceo.publish')}
                      style={styles.action}
                      busy={busy}
                      onPress={() => void togglePublish(post)}
                    />
                    <Btn
                      title={t('common.delete')}
                      variant="danger"
                      style={styles.action}
                      disabled={busy}
                      onPress={() => confirmRemove(post)}
                    />
                  </View>
                </View>
              ) : null}
            </Card>
          </View>
        );
      })}
    </Screen>
  );
}

/** The website's "Publish immediately" switch, in the app's control style. */
function PublishToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  const styles = useStyles();
  const { t: theme } = useTheme();
  const { t, align, row } = useI18n();

  return (
    <View style={[styles.toggleRow, row]}>
      <View style={styles.toggleText}>
        <Text style={[styles.toggleLabel, align]}>{t('ceoOps.publishNow')}</Text>
        <Text style={[styles.toggleHint, align]}>{t('ceoOps.publishNowHint')}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: Estate.gold, false: theme.muted }}
        thumbColor={value ? Estate.navy : theme.card}
      />
    </View>
  );
}

/** Label / value line used by the expanded detail block. */
function Detail({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  const { row, align } = useI18n();
  return (
    <View style={[styles.detailRow, row]}>
      <Text style={[styles.detailLabel, align]}>{label}</Text>
      <Text style={[styles.detailValue, align]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    kpis: {
      justifyContent: 'space-around',
      alignItems: 'center',
      paddingVertical: Spacing.md,
      flexWrap: 'wrap',
      gap: Spacing.sm,
    },
    notice: { color: t.successFg, fontSize: 14, fontWeight: '700' },
    count: { color: t.mutedForeground, fontSize: 13 },
    card: { gap: 6, marginTop: Spacing.xs },
    form: { gap: 8 },
    uploadError: { color: t.dangerFg, fontSize: 13, lineHeight: 18 },
    body: {
      minHeight: 120,
      textAlignVertical: 'top',
      paddingTop: 10,
      backgroundColor: t.background,
      borderWidth: 1,
      borderColor: t.input,
      borderRadius: Radius.md,
      paddingHorizontal: Spacing.sm + 6,
      color: t.foreground,
      fontSize: 16,
    },
    toggleRow: {
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Spacing.sm,
      paddingVertical: 6,
      marginBottom: Spacing.sm,
    },
    toggleText: { flex: 1, gap: 2 },
    toggleLabel: { color: t.foreground, fontSize: 14, fontWeight: '600' },
    toggleHint: { color: t.mutedForeground, fontSize: 12, lineHeight: 17 },
    editor: { gap: 8, marginTop: 8 },
    detailRow: { justifyContent: 'space-between', gap: Spacing.sm },
    detailLabel: { color: t.mutedForeground, fontSize: 13, flexShrink: 1 },
    detailValue: { color: t.foreground, fontSize: 13, fontWeight: '600', flexShrink: 1 },
    excerpt: { color: t.mutedForeground, fontSize: 13, fontStyle: 'italic', lineHeight: 19 },
    preview: { color: t.foreground, fontSize: 14, lineHeight: 21 },
    actions: { gap: 8, marginTop: Spacing.xs },
    action: { flex: 1 },
  }),
);
