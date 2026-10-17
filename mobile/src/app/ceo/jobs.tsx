import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';

import {
  Badge,
  Btn,
  Card,
  Chip,
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
import { useI18n, type MessageKey } from '@/i18n';
import { formatDate, formatMoney, humanise } from '@/lib/format';
import { useCurrency } from '@/lib/currency';
import { createStyles, useTheme } from '@/lib/theme';

type Job = {
  id: string;
  title: string;
  titleArabic: string | null;
  slug: string;
  department: string;
  location: string;
  type: string;
  description: string;
  descriptionArabic: string | null;
  requirements: string;
  salaryMin: number | null;
  salaryMax: number | null;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  applications?: { id: string }[];
};

type JobsPage = { items?: Job[]; total?: number };

/** The four values the website's select offers, with the site's own labels. */
const JOB_TYPES: { value: string; label: MessageKey }[] = [
  { value: 'FULL_TIME', label: 'careers.typeFullTime' },
  { value: 'PART_TIME', label: 'careers.typePartTime' },
  { value: 'CONTRACT', label: 'careers.typeContract' },
  { value: 'INTERNSHIP', label: 'careers.typeInternship' },
];

const MAX_RENDER = 60;

/** Same slug rule the website applies as you type the title. */
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function typeLabel(value: string): string {
  return JOB_TYPES.find((entry) => entry.value === value)?.label ?? value;
}

/**
 * Jobs management — the mobile twin of src/app/ceo/jobs/page.tsx.
 *
 * Reads `GET /api/jobs?limit=100&all=true` so drafts show up for a
 * CEO/ADMIN session, and posts the same payload the website builds:
 * requirements are split on commas and JSON-stringified, salaries are numbers
 * or null. Publish toggle is PATCH `{ id, isPublished }`; DELETE answers 409
 * when applications still reference the job and that message lands in the
 * error strip.
 */
export default function CeoJobsScreen() {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const { currency, rates } = useCurrency();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [titleArabic, setTitleArabic] = useState('');
  const [slug, setSlug] = useState('');
  const [department, setDepartment] = useState('');
  const [location, setLocation] = useState('');
  const [type, setType] = useState(JOB_TYPES[0].value);
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [requirements, setRequirements] = useState('');
  const [description, setDescription] = useState('');
  const [descriptionArabic, setDescriptionArabic] = useState('');
  const [isPublished, setIsPublished] = useState(false);

  const { data, error, loading, refreshing, refresh } = useApi<JobsPage>(
    '/api/jobs?limit=100&all=true',
  );
  const mutation = useMutation();

  /** Mirrors the website: the slug follows the title until edited by hand. */
  function onTitleChange(value: string) {
    setTitle(value);
    setSlug((prev) =>
      prev === '' || prev === generateSlug(title) ? generateSlug(value) : prev,
    );
  }

  async function togglePublish(job: Job) {
    setBusyId(job.id);
    setProblem(null);
    setNotice(null);
    try {
      await mutation.run('/api/jobs', 'PATCH', { id: job.id, isPublished: !job.isPublished });
      refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(job: Job) {
    setBusyId(job.id);
    setProblem(null);
    try {
      await mutation.run(`/api/jobs?id=${job.id}`, 'DELETE');
      setExpanded(null);
      refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusyId(null);
    }
  }

  function confirmRemove(job: Job) {
    Alert.alert(t('ceoOps.deleteJobTitle'), t('ceoOps.deleteJobBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.confirm'), style: 'destructive', onPress: () => void remove(job) },
    ]);
  }

  async function create() {
    if (!title.trim() || !department.trim() || !location.trim() || !description.trim()) {
      setProblem(t('ceoOps.jobRequired'));
      return;
    }
    const min = salaryMin.trim() ? Number.parseFloat(salaryMin) : null;
    const max = salaryMax.trim() ? Number.parseFloat(salaryMax) : null;
    const requirementsArray = requirements
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    setProblem(null);
    try {
      await mutation.run('/api/jobs', 'POST', {
        title,
        titleArabic,
        slug,
        department,
        location,
        type,
        description,
        descriptionArabic,
        requirements: JSON.stringify(requirementsArray),
        salaryMin: min !== null && Number.isFinite(min) ? min : null,
        salaryMax: max !== null && Number.isFinite(max) ? max : null,
        isPublished,
      });
      setCreating(false);
      setTitle('');
      setTitleArabic('');
      setSlug('');
      setDepartment('');
      setLocation('');
      setType(JOB_TYPES[0].value);
      setSalaryMin('');
      setSalaryMax('');
      setRequirements('');
      setDescription('');
      setDescriptionArabic('');
      setIsPublished(false);
      setNotice(t('ceoOps.jobCreated'));
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
        (job) =>
          job.title.toLowerCase().includes(q) ||
          job.department.toLowerCase().includes(q) ||
          job.location.toLowerCase().includes(q),
      )
    : all;
  const rows = filtered.slice(0, MAX_RENDER);
  const publishedCount = all.filter((job) => job.isPublished).length;
  const applications = all.reduce((sum, job) => sum + (job.applications?.length || 0), 0);
  const departments = new Set(all.map((job) => job.department).filter(Boolean)).size;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('ceoOps.jobsTitle') }} />

      <Card style={[styles.kpis, row]}>
        <Stat value={all.length} label={t('ceoOps.kpiTotalJobs')} />
        <Stat value={publishedCount} label={t('ceoOps.kpiPublished')} />
        <Stat value={applications} label={t('ceoOps.kpiApplications')} />
        <Stat value={departments} label={t('ceoOps.kpiDepartments')} />
      </Card>

      <Btn
        title={creating ? t('common.close') : t('ceoOps.newJob')}
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
          <Field label={t('careers.department')} value={department} onChangeText={setDepartment} />
          <Field label={t('careers.location')} value={location} onChangeText={setLocation} />

          <Text style={[styles.formLabel, align]}>{t('ceoOps.fieldJobType')}</Text>
          <View style={[styles.chipRow, row]}>
            {JOB_TYPES.map((entry) => (
              <Chip
                key={entry.value}
                label={t(entry.label)}
                selected={type === entry.value}
                onPress={() => setType(entry.value)}
              />
            ))}
          </View>

          <Field
            label={t('ceoOps.salaryMin')}
            value={salaryMin}
            onChangeText={setSalaryMin}
            keyboardType="numeric"
          />
          <Field
            label={t('ceoOps.salaryMax')}
            value={salaryMax}
            onChangeText={setSalaryMax}
            keyboardType="numeric"
          />
          <Field
            label={t('ceoOps.fieldRequirements')}
            value={requirements}
            onChangeText={setRequirements}
          />
          <Field
            label={`${t('ceoOps.fieldDescription')} *`}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={5}
            style={[styles.body, align]}
          />
          <Field
            label={t('ceoOps.fieldDescriptionAr')}
            value={descriptionArabic}
            onChangeText={setDescriptionArabic}
            multiline
            numberOfLines={3}
            style={[styles.body, align]}
          />
          <PublishToggle value={isPublished} onChange={setIsPublished} />
          <Btn
            title={creating && mutation.busy ? t('ceoOps.creating') : t('ceoOps.createJob')}
            busy={mutation.busy}
            onPress={() => void create()}
          />
        </Card>
      ) : null}

      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder={t('ceoOps.searchJobs')}
      />

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}
      {problem ? <ErrorBar message={problem} /> : null}
      {notice ? <Text style={[styles.notice, align]}>{`${notice} ✓`}</Text> : null}

      {!error && rows.length === 0 ? (
        <Empty
          title={t('ceoOps.noJobs')}
          message={q ? t('ceoOps.trySearch') : t('ceoOps.createFirstJob')}
        />
      ) : null}

      {filtered.length > MAX_RENDER ? (
        <Text style={[styles.count, align]}>
          {`${t('common.showingFirst')} ${MAX_RENDER} ${t('common.of')} ${filtered.length}`}
        </Text>
      ) : null}

      {rows.map((job, index) => {
        const isOpen = expanded === job.id;
        const busy = busyId === job.id;
        const requirementList = parseRequirements(job.requirements);
        const typeText = JOB_TYPES.some((entry) => entry.value === job.type)
          ? typeLabel(job.type)
          : humanise(job.type);
        const salaryRange =
          job.salaryMin != null && job.salaryMax != null
            ? `${formatMoney(job.salaryMin, currency, rates, { compact: true })} – ${formatMoney(
                job.salaryMax,
                currency,
                rates,
                { compact: true },
              )}`
            : t('ceoOps.notSpecified');

        return (
          <View key={job.id}>
            {index > 0 ? <Divider /> : null}
            <Card style={styles.card}>
              <Row
                title={job.title}
                subtitle={[
                  job.titleArabic,
                  job.department,
                  job.location,
                  typeText,
                  `${job.applications?.length || 0} ${t('ceoOps.applicationsShort')}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                badge={
                  <Badge tone={job.isPublished ? 'green' : 'gold'}>
                    {job.isPublished ? t('ceoOps.published') : t('ceoOps.draft')}
                  </Badge>
                }
                onPress={() => {
                  setExpanded(isOpen ? null : job.id);
                  setProblem(null);
                  setNotice(null);
                }}
              />

              {isOpen ? (
                <View style={styles.editor}>
                  <Divider />
                  <SectionTitle>{t('ceoOps.jobDetails')}</SectionTitle>
                  <Detail label={t('ceoOps.fieldSlug')} value={job.slug} />
                  <Detail label={t('ceoOps.salaryRange')} value={salaryRange} />
                  <Detail label={t('ceoOps.fieldCreated')} value={formatDate(job.createdAt)} />

                  {requirementList.length > 0 ? (
                    <>
                      <Text style={[styles.formLabel, align]}>{t('careers.requirements')}</Text>
                      <View style={[styles.chipRow, row]}>
                        {requirementList.map((entry, position) => (
                          <Chip key={`${entry}-${position}`} label={entry} />
                        ))}
                      </View>
                    </>
                  ) : null}

                  <SectionTitle>{t('ceoOps.fieldDescription')}</SectionTitle>
                  <Text style={[styles.preview, align]} numberOfLines={10}>
                    {job.description}
                  </Text>

                  <View style={[styles.actions, row]}>
                    <Btn
                      title={job.isPublished ? t('ceo.unpublish') : t('ceo.publish')}
                      style={styles.action}
                      busy={busy}
                      onPress={() => void togglePublish(job)}
                    />
                    <Btn
                      title={t('common.delete')}
                      variant="danger"
                      style={styles.action}
                      disabled={busy}
                      onPress={() => confirmRemove(job)}
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

/** `requirements` is stored as a JSON array string — same parse as the site. */
function parseRequirements(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === 'string') : [];
  } catch {
    return [];
  }
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
    formLabel: { color: t.mutedForeground, fontSize: 14, fontWeight: '500' },
    chipRow: { flexWrap: 'wrap', gap: 8 },
    body: {
      minHeight: 96,
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
    preview: { color: t.foreground, fontSize: 14, lineHeight: 21 },
    actions: { gap: 8, marginTop: Spacing.xs },
    action: { flex: 1 },
  }),
);
