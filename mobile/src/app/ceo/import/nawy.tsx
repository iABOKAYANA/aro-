import { Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import {
  Badge,
  Btn,
  Card,
  Empty,
  ErrorBar,
  Loading,
  Row,
  Screen,
  SectionTitle,
  Stat,
} from '@/components/ui';
import { useRoleDenied } from '@/components/role-gate';
import { Estate, Radius, Spacing } from '@/constants/brand';
import { useApi, useMutation } from '@/hooks/use-api';
import { useI18n } from '@/i18n';
import { formatMoney } from '@/lib/format';
import { useCurrency } from '@/lib/currency';
import { createStyles, useTheme } from '@/lib/theme';

type CatalogItem = { id: number; enUrl: string; arUrl: string | null };

type PreviewEntry = {
  url: string;
  slug: string | null;
  name: string | null;
  nameArabic: string | null;
  developer: string | null;
  area: string | null;
  startPrice: number | null;
  downPaymentPct: number | null;
  years: number | null;
  images: number;
  isLaunch: boolean;
  exists: boolean;
  error: string | null;
};

type NawyStatus = {
  catalog: { count: number; items: CatalogItem[] };
  stats: { imported: number; total: number };
};

type ImportBatch = {
  imported?: unknown[];
  skipped?: unknown[];
  errors?: { url: string; error: string }[];
};

type RunState = {
  running: boolean;
  finished: boolean;
  offset: number;
  imported: number;
  skipped: number;
  errors: string[];
  cancelled: boolean;
};

/** The server accepts at most 30 URLs per call; the site batches at 20. */
const BATCH = 20;
/** The website's preview button looks at the first eight catalog entries. */
const PREVIEW_COUNT = 8;

const initialRun: RunState = {
  running: false,
  finished: false,
  offset: 0,
  imported: 0,
  skipped: 0,
  errors: [],
  cancelled: false,
};

/**
 * Nawy bulk import — the mobile twin of src/app/ceo/import/nawy/page.tsx.
 *
 * The flow is the website's, step for step: `GET /api/ceo/import/nawy`
 * returns the live nawy.com sitemap catalog plus `{ imported, total }` stats,
 * `POST { mode: 'PREVIEW', urls, includeAr }` previews the first 8 entries,
 * and `POST { mode: 'IMPORT', urls, publish, includeAr }` runs the catalog in
 * batches of 20 — `imported` / `skipped` / `errors` accumulate exactly as the
 * site accumulates them, a failed batch stops the loop, and "stop after
 * current batch" flips a ref the loop checks between batches. Because the
 * import is duplicate-safe, an interrupted run simply resumes on the next
 * attempt.
 */
export default function CeoImportNawyScreen() {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const { currency, rates } = useCurrency();

  const [publish, setPublish] = useState(true);
  const [includeAr, setIncludeAr] = useState(true);
  const [preview, setPreview] = useState<PreviewEntry[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [run, setRun] = useState<RunState>(initialRun);
  const [errorsOpen, setErrorsOpen] = useState(false);
  const cancelRef = useRef(false);

  const { data, error, loading, refreshing, refresh } = useApi<NawyStatus>(
    '/api/ceo/import/nawy',
  );
  const mutation = useMutation();

  const catalog = data?.catalog?.items ?? null;
  const stats = data?.stats ?? null;
  const remaining = catalog && stats ? Math.max(0, catalog.length - stats.imported) : null;
  const progressPct =
    catalog && catalog.length ? Math.min(100, Math.round((run.offset / catalog.length) * 100)) : 0;

  async function runPreview() {
    if (!catalog?.length) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const result = (await mutation.run('/api/ceo/import/nawy', 'POST', {
        mode: 'PREVIEW',
        urls: catalog.slice(0, PREVIEW_COUNT).map((entry) => entry.enUrl),
        includeAr,
      })) as { entries?: PreviewEntry[] };
      setPreview(result.entries ?? []);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : t('ceoOps.previewFailed'));
    } finally {
      setPreviewLoading(false);
    }
  }

  async function startImport() {
    if (!catalog?.length || run.running) return;
    cancelRef.current = false;
    setRun({ ...initialRun, running: true });

    for (let offset = 0; offset < catalog.length; offset += BATCH) {
      if (cancelRef.current) {
        setRun((prev) => ({ ...prev, cancelled: true }));
        break;
      }
      const slice = catalog.slice(offset, offset + BATCH);
      try {
        const result = (await mutation.run('/api/ceo/import/nawy', 'POST', {
          mode: 'IMPORT',
          urls: slice.map((entry) => entry.enUrl),
          publish,
          includeAr,
        })) as ImportBatch;
        setRun((prev) => ({
          ...prev,
          imported: prev.imported + (result.imported?.length ?? 0),
          skipped: prev.skipped + (result.skipped?.length ?? 0),
          errors: [
            ...prev.errors,
            ...(result.errors ?? []).map((entry) => `${entry.url} — ${entry.error}`),
          ],
          offset: offset + slice.length,
        }));
      } catch (e) {
        const message = e instanceof Error ? e.message : t('common.error');
        setRun((prev) => ({
          ...prev,
          errors: [...prev.errors, `${t('ceoOps.batchAt')} ${offset}: ${message}`],
          offset: offset + slice.length,
        }));
        // Stop the loop on a failed batch so we don't hammer errors.
        break;
      }
    }

    setRun((prev) => ({ ...prev, running: false, finished: true }));
    refresh();
  }

  function confirmImport() {
    if (!catalog?.length) return;
    const title = `${t('ceoOps.importAll')} ${catalog.length} ${t('ceoOps.projectsWord')}`;
    const body = [
      `${t('ceoOps.confirmBody1')} (EN${includeAr ? ' + AR' : ''}) ${t('ceoOps.confirmBody2')}`,
      `${t('ceoOps.modeLabel')} ${
        publish ? t('ceoOps.modePublished') : t('ceoOps.modeDrafts')
      }`,
    ].join('\n\n');
    Alert.alert(title, body, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('ceoOps.startImport'), onPress: () => void startImport() },
    ]);
  }

  const denied = useRoleDenied('ceo.forbidden', ['CEO', 'ADMIN']);
  if (denied) return denied;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('ceoOps.importTitle') }} />

      <Text style={[styles.intro, align]}>{t('ceoOps.importSubtitle')}</Text>

      <Card style={[styles.kpis, row]}>
        <Stat value={catalog ? catalog.length : '—'} label={t('ceoOps.catalogStat')} />
        <Stat value={stats ? stats.imported : '—'} label={t('ceoOps.importedStat')} />
        <Stat value={remaining ?? '—'} label={t('ceoOps.remainingStat')} />
        <Stat value={stats ? stats.total : '—'} label={t('ceoOps.projectsInDb')} />
      </Card>

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}

      {/* 1 · Catalog */}
      <Card>
        <SectionTitle>{t('ceoOps.stepCatalog')}</SectionTitle>
        {loading ? (
          <Loading label={t('ceoOps.readingSitemap')} />
        ) : catalog && catalog.length ? (
          <>
            <Text style={[styles.paragraph, align]}>
              {`${catalog.length} ${t('ceoOps.catalogFound')}`}
            </Text>
            <View style={[styles.chipRow, row]}>
              {catalog.slice(0, PREVIEW_COUNT).map((entry) => (
                <Text key={entry.id} style={styles.slug}>
                  {entry.enUrl.split('/').pop()}
                </Text>
              ))}
            </View>
            <Text style={[styles.hint, align]}>{t('ceoOps.robotsNote')}</Text>
          </>
        ) : (
          <Empty title={t('ceoOps.noCatalog')} />
        )}
      </Card>

      {/* 2 · Options & preview */}
      <Card>
        <SectionTitle>{t('ceoOps.stepOptions')}</SectionTitle>
        <OptionToggle
          label={t('ceoOps.publishNow')}
          hint={t('ceoOps.publishOptionHint')}
          value={publish}
          onChange={setPublish}
        />
        <OptionToggle
          label={t('ceoOps.includeAr')}
          hint={t('ceoOps.includeArHint')}
          value={includeAr}
          onChange={setIncludeAr}
        />

        <Btn
          title={t('ceoOps.previewBtn')}
          variant="ghost"
          busy={previewLoading}
          disabled={!catalog?.length || run.running}
          onPress={() => void runPreview()}
        />

        {previewError ? <ErrorBar message={previewError} /> : null}

        {preview ? (
          <ScrollView style={styles.previewBox} nestedScrollEnabled>
            {preview.map((entry) =>
              entry.error ? (
                <Text key={entry.url} style={styles.previewError}>
                  {`${entry.url.split('/').pop()} — ${entry.error}`}
                </Text>
              ) : (
                <Row
                  key={entry.url}
                  title={[entry.name, entry.nameArabic].filter(Boolean).join(' · ')}
                  subtitle={[
                    entry.startPrice != null
                      ? formatMoney(entry.startPrice, currency, rates)
                      : '—',
                    entry.downPaymentPct != null
                      ? `${entry.downPaymentPct}% ${t('ceoOps.downPayment')} · ${
                          entry.years ?? '—'
                        }${t('ceoOps.yearsShort')}`
                      : entry.images > 0
                        ? `${entry.images} ${t('ceoOps.imagesCount')}`
                        : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  badge={
                    <Badge tone={entry.exists ? 'muted' : 'green'}>
                      {entry.exists ? t('ceoOps.exists') : t('ceoOps.isNew')}
                    </Badge>
                  }
                />
              ),
            )}
          </ScrollView>
        ) : null}
      </Card>

      {/* 3 · Import */}
      <Card>
        <SectionTitle>{t('ceoOps.stepImport')}</SectionTitle>

        {!run.running && !run.finished && catalog ? (
          <>
            <Text style={[styles.paragraph, align]}>
              {`${t('ceoOps.importIntroA')} ${BATCH} ${t('ceoOps.importIntroB')}`}
            </Text>
            <Btn
              title={`${t('ceoOps.importAll')} ${catalog.length} ${t('ceoOps.projectsWord')}`}
              disabled={catalog.length === 0}
              onPress={confirmImport}
            />
          </>
        ) : null}

        {run.running ? (
          <Btn
            title={t('ceoOps.stopAfterBatch')}
            variant="ghost"
            onPress={() => {
              cancelRef.current = true;
            }}
          />
        ) : null}

        {run.running || run.finished ? (
          <View style={styles.progressBlock}>
            <Text style={[styles.paragraph, align]}>
              {`${t('ceoOps.progress')}: ${run.offset}${
                catalog ? ` / ${catalog.length}` : ''
              } (${progressPct}%)`}
            </Text>

            <View style={[styles.counts, row]}>
              <Text style={[styles.countImported, align]}>
                {`${t('ceoOps.importedWord')} ${run.imported}`}
              </Text>
              <Text style={[styles.countSkipped, align]}>
                {`${t('ceoOps.skippedWord')} ${run.skipped}`}
              </Text>
              <Text style={[styles.countErrors, align]}>
                {`${t('ceoOps.errorsWord')} ${run.errors.length}`}
              </Text>
              {run.running ? (
                <Text style={[styles.countWorking, align]}>{t('ceoOps.working')}</Text>
              ) : null}
            </View>

            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  { width: `${progressPct}%` },
                  run.finished && !run.cancelled && run.errors.length === 0
                    ? styles.barDone
                    : null,
                ]}
              />
            </View>

            {run.finished ? (
              <Text
                style={[styles.paragraph, align, run.cancelled ? styles.noticeWarn : styles.noticeOk]}>
                {run.cancelled
                  ? `${t('ceoOps.stoppedPrefix')} ${run.imported} ${t('ceoOps.importedSoFar')}`
                  : `${t('ceoOps.done')} ${run.imported} ${t('ceoOps.importedWord')}, ${
                      run.skipped
                    } ${t('ceoOps.skippedWord')}, ${run.errors.length} ${t('ceoOps.errorsWord')}.`}
              </Text>
            ) : null}

            {run.errors.length > 0 ? (
              <>
                <Btn
                  title={`${run.errors.length} ${t('ceoOps.errorsTap')}`}
                  variant="ghost"
                  onPress={() => setErrorsOpen((prev) => !prev)}
                />
                {errorsOpen ? (
                  <ScrollView style={styles.errorBox} nestedScrollEnabled>
                    {run.errors.map((entry, index) => (
                      <Text key={`${entry}-${index}`} style={styles.errorLine}>
                        {entry}
                      </Text>
                    ))}
                  </ScrollView>
                ) : null}
              </>
            ) : null}
          </View>
        ) : null}
      </Card>
    </Screen>
  );
}

/** One labelled switch — the website's checkbox, in the app's control style. */
function OptionToggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  const styles = useStyles();
  const { t: theme } = useTheme();
  const { row, align } = useI18n();

  return (
    <View style={[styles.toggleRow, row]}>
      <View style={styles.toggleText}>
        <Text style={[styles.toggleLabel, align]}>{label}</Text>
        <Text style={[styles.toggleHint, align]}>{hint}</Text>
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

const useStyles = createStyles((t) =>
  StyleSheet.create({
    intro: { color: t.mutedForeground, fontSize: 14, lineHeight: 20 },
    kpis: {
      justifyContent: 'space-around',
      alignItems: 'center',
      paddingVertical: Spacing.md,
      flexWrap: 'wrap',
      gap: Spacing.sm,
    },
    paragraph: { color: t.foreground, fontSize: 14, lineHeight: 21 },
    hint: { color: t.mutedForeground, fontSize: 12, lineHeight: 17 },
    chipRow: { flexWrap: 'wrap', gap: 8 },
    slug: {
      color: t.mutedForeground,
      fontSize: 11,
      fontFamily: 'monospace',
      backgroundColor: t.muted,
      borderRadius: Radius.sm,
      paddingHorizontal: 6,
      paddingVertical: 3,
      overflow: 'hidden',
    },
    toggleRow: {
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Spacing.sm,
      paddingVertical: 6,
    },
    toggleText: { flex: 1, gap: 2 },
    toggleLabel: { color: t.foreground, fontSize: 14, fontWeight: '600' },
    toggleHint: { color: t.mutedForeground, fontSize: 12, lineHeight: 17 },
    previewBox: { maxHeight: 240, borderRadius: Radius.md, borderWidth: 1, borderColor: t.border },
    previewError: { color: t.dangerFg, fontSize: 12, lineHeight: 18, padding: 8 },
    progressBlock: { gap: Spacing.sm },
    counts: { flexWrap: 'wrap', gap: Spacing.md },
    countImported: { color: t.successFg, fontSize: 13, fontWeight: '700' },
    countSkipped: { color: t.mutedForeground, fontSize: 13, fontWeight: '700' },
    countErrors: { color: t.dangerFg, fontSize: 13, fontWeight: '700' },
    countWorking: { color: t.goldFg, fontSize: 13, fontWeight: '700' },
    barTrack: {
      height: 8,
      borderRadius: Radius.full,
      backgroundColor: t.muted,
      overflow: 'hidden',
    },
    barFill: { height: 8, borderRadius: Radius.full, backgroundColor: Estate.gold },
    barDone: { backgroundColor: t.successFg },
    noticeOk: { color: t.successFg, fontWeight: '700' },
    noticeWarn: { color: t.goldFg, fontWeight: '700' },
    errorBox: {
      maxHeight: 180,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: t.destructive,
      backgroundColor: t.dangerBg,
      padding: Spacing.sm,
      gap: 4,
    },
    errorLine: { color: t.dangerFg, fontSize: 12, lineHeight: 17 },
  }),
);
