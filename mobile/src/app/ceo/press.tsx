import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, StyleSheet, Switch, Text, View } from 'react-native';

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

type PressRelease = {
  id: string;
  title: string;
  titleArabic: string | null;
  slug: string;
  excerpt: string | null;
  content: string;
  coverImage: string | null;
  source: string | null;
  sourceUrl: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type PressPage = { items?: PressRelease[]; total?: number };

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
 * Press management — the mobile twin of src/app/ceo/press/page.tsx.
 *
 * Reads `GET /api/press?limit=100&all=true`, so a CEO/ADMIN session sees
 * drafts next to published releases. Writes are the website's three: POST to
 * create, PATCH `{ id, isPublished }` to flip publication, DELETE `?id=` to
 * remove a release for good (hard delete — confirmed before it fires).
 */
export default function CeoPressScreen() {
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
  const [source, setSource] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [content, setContent] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [isPublished, setIsPublished] = useState(false);

  const { data, error, loading, refreshing, refresh } = useApi<PressPage>(
    '/api/press?limit=100&all=true',
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

  async function togglePublish(release: PressRelease) {
    setBusyId(release.id);
    setProblem(null);
    setNotice(null);
    try {
      await mutation.run('/api/press', 'PATCH', {
        id: release.id,
        isPublished: !release.isPublished,
      });
      refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(release: PressRelease) {
    setBusyId(release.id);
    setProblem(null);
    try {
      await mutation.run(`/api/press?id=${release.id}`, 'DELETE');
      setExpanded(null);
      refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusyId(null);
    }
  }

  function confirmRemove(release: PressRelease) {
    Alert.alert(t('ceoOps.deleteReleaseTitle'), t('ceoOps.deleteReleaseBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.confirm'), style: 'destructive', onPress: () => void remove(release) },
    ]);
  }

  /** The website's "View source" link — the only place a URL is opened. */
  async function openSource(url: string) {
    try {
      await Linking.openURL(url);
    } catch {
      setProblem(t('common.error'));
    }
  }

  async function create() {
    if (!title.trim() || !content.trim()) {
      setProblem(t('ceoOps.titleContentRequired'));
      return;
    }
    setProblem(null);
    try {
      await mutation.run('/api/press', 'POST', {
        title,
        titleArabic,
        slug,
        excerpt,
        content,
        coverImage,
        source,
        sourceUrl,
        isPublished,
      });
      setCreating(false);
      setTitle('');
      setTitleArabic('');
      setSlug('');
      setSource('');
      setSourceUrl('');
      setExcerpt('');
      setContent('');
      setCoverImage('');
      setIsPublished(false);
      setNotice(t('ceoOps.releaseCreated'));
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
        (release) =>
          release.title.toLowerCase().includes(q) ||
          (release.source ?? '').toLowerCase().includes(q),
      )
    : all;
  const rows = filtered.slice(0, MAX_RENDER);
  const publishedCount = all.filter((release) => release.isPublished).length;
  const sources = new Set(all.map((release) => release.source).filter(Boolean)).size;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('ceoOps.pressTitle') }} />

      <Card style={[styles.kpis, row]}>
        <Stat value={all.length} label={t('ceoOps.kpiTotalReleases')} />
        <Stat value={publishedCount} label={t('ceoOps.kpiPublished')} />
        <Stat value={all.length - publishedCount} label={t('ceoOps.kpiDrafts')} />
        <Stat value={sources} label={t('ceoOps.kpiSources')} />
      </Card>

      <Btn
        title={creating ? t('common.close') : t('ceoOps.newRelease')}
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
          <Field label={t('press.source')} value={source} onChangeText={setSource} />
          <Field
            label={t('ceoOps.fieldSourceUrl')}
            value={sourceUrl}
            onChangeText={setSourceUrl}
            autoCapitalize="none"
            placeholder="https://example.com/article"
          />
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
            title={creating && mutation.busy ? t('ceoOps.creating') : t('ceoOps.createRelease')}
            busy={mutation.busy}
            onPress={() => void create()}
          />
        </Card>
      ) : null}

      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder={t('ceoOps.searchPress')}
      />

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}
      {problem ? <ErrorBar message={problem} /> : null}
      {notice ? <Text style={[styles.notice, align]}>{`${notice} ✓`}</Text> : null}

      {!error && rows.length === 0 ? (
        <Empty
          title={t('ceoOps.noReleases')}
          message={q ? t('ceoOps.trySearch') : t('ceoOps.createFirstRelease')}
        />
      ) : null}

      {filtered.length > MAX_RENDER ? (
        <Text style={[styles.count, align]}>
          {`${t('common.showingFirst')} ${MAX_RENDER} ${t('common.of')} ${filtered.length}`}
        </Text>
      ) : null}

      {rows.map((release, index) => {
        const isOpen = expanded === release.id;
        const busy = busyId === release.id;
        const dateLabel = release.publishedAt ? formatDate(release.publishedAt) : null;
        const subtitle = [release.source, dateLabel].filter(Boolean).join(' · ');

        return (
          <View key={release.id}>
            {index > 0 ? <Divider /> : null}
            <Card style={styles.card}>
              <Row
                title={release.title}
                subtitle={release.titleArabic ? `${release.titleArabic} · ${subtitle}` : subtitle}
                badge={
                  <Badge tone={release.isPublished ? 'green' : 'gold'}>
                    {release.isPublished ? t('ceoOps.published') : t('ceoOps.draft')}
                  </Badge>
                }
                onPress={() => {
                  setExpanded(isOpen ? null : release.id);
                  setProblem(null);
                  setNotice(null);
                }}
              />

              {isOpen ? (
                <View style={styles.editor}>
                  <Divider />
                  <SectionTitle>{t('ceoOps.releaseDetails')}</SectionTitle>
                  <Detail label={t('ceoOps.fieldSlug')} value={release.slug} />
                  <Detail label={t('ceoOps.fieldCreated')} value={formatDate(release.createdAt)} />
                  {release.source ? (
                    <Detail label={t('press.source')} value={release.source} />
                  ) : null}
                  {release.sourceUrl ? (
                    <Detail label={t('ceoOps.fieldSourceUrl')} value={release.sourceUrl} />
                  ) : null}

                  <SectionTitle>{t('ceoOps.contentPreview')}</SectionTitle>
                  {release.excerpt ? (
                    <Text style={[styles.excerpt, align]}>{release.excerpt}</Text>
                  ) : null}
                  <Text style={[styles.preview, align]} numberOfLines={8}>
                    {release.content}
                  </Text>

                  <View style={[styles.actions, row]}>
                    <Btn
                      title={release.isPublished ? t('ceo.unpublish') : t('ceo.publish')}
                      style={styles.action}
                      busy={busy}
                      onPress={() => void togglePublish(release)}
                    />
                    <Btn
                      title={t('common.delete')}
                      variant="danger"
                      style={styles.action}
                      disabled={busy}
                      onPress={() => confirmRemove(release)}
                    />
                  </View>
                  {release.sourceUrl ? (
                    <Btn
                      title={t('ceoOps.viewSource')}
                      variant="ghost"
                      onPress={() => void openSource(release.sourceUrl!)}
                    />
                  ) : null}
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
