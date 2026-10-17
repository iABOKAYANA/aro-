import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Badge, Btn, Card, Divider, Empty, ErrorBar, Field, Loading, Screen } from '@/components/ui';
import { Radius, Spacing } from '@/constants/brand';
import { useApi, useMutation } from '@/hooks/use-api';
import { useI18n, type MessageKey } from '@/i18n';
import { humanise } from '@/lib/format';
import { createStyles, useTheme } from '@/lib/theme';

/** Slug-only arrivals (deep links) resolve through one generous list page —
 *  the website's /careers/:slug has no id to read, and list rows are full
 *  `Job` records. Navigating from the list passes `id` and skips the lookup. */
const LIST_PATH = '/api/jobs?page=1&limit=100';

type Translate = (key: MessageKey) => string;

/** One `Job` — the Prisma model, as `GET /api/jobs/:id` returns it. */
type Job = {
  id: string;
  title: string;
  titleArabic?: string | null;
  slug: string;
  department: string;
  location: string;
  type?: string | null;
  description: string;
  descriptionArabic?: string | null;
  requirements?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  isPublished?: boolean;
};

type JobsResponse = {
  items?: Job[];
  total?: number;
  page?: number;
  totalPages?: number;
};

const TYPE_KEYS: Record<string, MessageKey> = {
  FULL_TIME: 'careers.typeFullTime',
  PART_TIME: 'careers.typePartTime',
  CONTRACT: 'careers.typeContract',
  INTERNSHIP: 'careers.typeInternship',
};

/** The site's `TYPE_LABELS` map, with `humanise` standing in for anything else. */
function typeLabel(type: string | null | undefined, t: Translate): string {
  const key = TYPE_KEYS[String(type ?? '')];
  return key ? t(key) : humanise(type);
}

/** `parseList` from the website's job page — JSON array, else split on
 *  newlines / bullets / commas. */
function parseList(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string')
      : [];
  } catch {
    return raw
      .split(/\r?\n|\u2022|,/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
}

/** Same client check the browser applies via `required` + `type="email"`. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * The website's ApplyButton: a dialog over the job with name / email / phone /
 * cover letter, client-side validation, `POST /api/jobs/:id/apply` on submit
 * and a confirmation state on success. The site attaches the CV as a file —
 * no file picker may be added to the app, and the endpoint's JSON path takes
 * the same application without one, so every other field and message is ported
 * as-is.
 */
function ApplyDialog({
  visible,
  jobId,
  jobTitle,
  onClose,
}: {
  visible: boolean;
  jobId: string;
  jobTitle: string;
  onClose: () => void;
}) {
  const styles = useStyles();
  const { t: theme } = useTheme();
  const { t, row, align } = useI18n();
  const mutation = useMutation();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [coverLetter, setCoverLetter] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function close() {
    setName('');
    setEmail('');
    setPhone('');
    setCoverLetter('');
    setProblem(null);
    setDone(false);
    onClose();
  }

  async function submit() {
    setProblem(null);

    const nameValue = name.trim();
    const emailValue = email.trim();
    if (!nameValue) {
      setProblem(t('careers.nameRequired'));
      return;
    }
    if (!EMAIL_RE.test(emailValue)) {
      setProblem(t('careers.emailInvalid'));
      return;
    }

    try {
      await mutation.run(`/api/jobs/${encodeURIComponent(jobId)}/apply`, 'POST', {
        name: nameValue,
        email: emailValue,
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(coverLetter.trim() ? { coverLetter: coverLetter.trim() } : {}),
      });
      // The site resets the form the moment the server answers.
      setName('');
      setEmail('');
      setPhone('');
      setCoverLetter('');
      setDone(true);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('careers.applyFailed'));
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdropWrap}>
        {/* Tapping the backdrop closes, exactly like the site's `onClick === currentTarget`. */}
        <Pressable style={styles.backdrop} onPress={close}>
          {/* …but taps inside the dialog stop here. */}
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <ScrollView
              contentContainerStyle={styles.sheetBody}
              keyboardShouldPersistTaps="handled">
              <View style={[styles.sheetHead, row]}>
                <View style={styles.sheetHeadText}>
                  <Text style={[styles.sheetTitle, align]}>{`${t('careers.applyFor')} ${jobTitle}`}</Text>
                  <Text style={[styles.sheetNote, align]}>{t('careers.requiredNote')}</Text>
                </View>
                <Pressable onPress={close} hitSlop={8} accessibilityLabel={t('common.close')}>
                  <Ionicons name="close" size={20} color={theme.mutedForeground} />
                </Pressable>
              </View>

              {done ? (
                <View style={styles.doneBox}>
                  <View style={styles.doneGlyph}>
                    <Ionicons name="checkmark" size={28} color={theme.successFg} />
                  </View>
                  <Text style={[styles.doneTitle, align]}>{t('careers.applied')}</Text>
                  <Text style={[styles.doneBody, align]}>{t('careers.successBody')}</Text>
                  <Btn title={t('common.close')} onPress={close} style={styles.doneClose} />
                </View>
              ) : (
                <>
                  <Field
                    label={t('careers.fullName')}
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                  />
                  <Field
                    label={t('careers.email')}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Field
                    label={t('common.phone')}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                  />
                  <Field
                    label={t('careers.coverLetter')}
                    value={coverLetter}
                    onChangeText={setCoverLetter}
                    placeholder={t('careers.coverPlaceholder')}
                    maxLength={4000}
                    multiline
                    numberOfLines={4}
                    style={[styles.cover, align]}
                  />

                  {problem ? <ErrorBar message={problem} /> : null}

                  <View style={[styles.sheetActions, row]}>
                    <Btn title={t('common.cancel')} variant="ghost" style={styles.actionHalf} onPress={close} />
                    <Btn title={t('careers.submit')} busy={mutation.busy} style={styles.actionHalf} onPress={submit} />
                  </View>
                </>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * The website's /careers/:slug: back link, then the job card — pills, title,
 * salary line, Apply Now — a rule, the description and the requirements list,
 * with the apply dialog one tap away.
 */
export default function JobDetailScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { t: theme } = useTheme();
  const { t, row, align, localized } = useI18n();
  const params = useLocalSearchParams<{ slug?: string; id?: string; apply?: string }>();
  const slug = typeof params.slug === 'string' ? params.slug : null;
  const id = typeof params.id === 'string' ? params.id : null;
  const [applyOpen, setApplyOpen] = useState(params.apply === '1');

  const byId = useApi<{ job?: Job }>(id ? `/api/jobs/${encodeURIComponent(id)}` : null);
  const bySlug = useApi<JobsResponse>(!id && slug ? LIST_PATH : null);

  const job = id
    ? (byId.data?.job ?? null)
    : (bySlug.data?.items ?? []).find((item) => item.slug === slug) ?? null;
  const loading = id ? byId.loading : bySlug.loading;
  const error = id ? byId.error : bySlug.error;
  const refreshing = id ? byId.refreshing : bySlug.refreshing;
  const reload = id ? byId.refresh : bySlug.refresh;

  function goBack() {
    // The site's "Back to Careers" link; the header back button covers the
    // same move, so fall back to pushing the list only when there is no stack.
    if (router.canGoBack()) router.back();
    else router.push('/careers');
  }

  if (loading) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('careers.title') }} />
        <Loading label={t('careers.loading')} />
      </Screen>
    );
  }

  if (error || !job) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('careers.title') }} />
        {error ? <ErrorBar message={error} onRetry={reload} /> : <Empty title={t('careers.notFound')} />}
        <Btn title={t('careers.back')} variant="ghost" onPress={goBack} />
      </Screen>
    );
  }

  const title = localized(job.title, job.titleArabic);
  const requirements = parseList(job.requirements ?? '');
  // The site prints `12,000 – 20,000 EGP / month`, and only when both bounds exist.
  const salary =
    job.salaryMin && job.salaryMax
      ? `${job.salaryMin.toLocaleString('en-US')} – ${job.salaryMax.toLocaleString('en-US')} ${t('careers.perMonth')}`
      : null;

  return (
    <Screen refreshing={refreshing} onRefresh={reload}>
      <Stack.Screen options={{ title }} />

      <Btn title={t('careers.back')} variant="ghost" onPress={goBack} />

      <Card>
        <View style={[styles.pills, row]}>
          <Badge tone="gold">{job.department}</Badge>
          <Badge tone="muted">{job.location}</Badge>
          <Badge tone="muted">{typeLabel(job.type, t)}</Badge>
        </View>

        <Text style={[styles.title, align]}>{title}</Text>

        {salary ? (
          <Text style={[styles.salary, align]} accessibilityLabel={`${t('careers.salary')}: ${salary}`}>
            {salary}
          </Text>
        ) : null}

        <Btn title={t('careers.apply')} variant="ghost" onPress={() => setApplyOpen(true)} />

        <Divider />

        {job.description || job.descriptionArabic ? (
          <Text style={[styles.paragraph, align]}>
            {localized(job.description, job.descriptionArabic)}
          </Text>
        ) : null}

        {requirements.length > 0 ? (
          <View style={styles.requirements}>
            <Text style={[styles.reqTitle, align]}>{t('careers.requirements')}</Text>
            {requirements.map((req, index) => (
              <View key={index} style={[styles.reqRow, row]}>
                <Ionicons name="checkmark" size={16} color={theme.primary} />
                <Text style={[styles.reqText, align]}>{req}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </Card>

      <ApplyDialog visible={applyOpen} jobId={job.id} jobTitle={title} onClose={() => setApplyOpen(false)} />
    </Screen>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    title: { color: t.foreground, fontSize: 24, lineHeight: 32, fontWeight: '800' },
    salary: { color: t.mutedForeground, fontSize: 14, lineHeight: 20, fontWeight: '600' },
    paragraph: { color: t.mutedForeground, fontSize: 15, lineHeight: 24 },

    requirements: { gap: 8, marginTop: 4 },
    reqTitle: { color: t.foreground, fontSize: 18, fontWeight: '600' },
    reqRow: { alignItems: 'flex-start', gap: 8 },
    reqText: { color: t.foreground, fontSize: 14, lineHeight: 20, flex: 1 },

    // Apply dialog — the site's `bg-black/70` overlay and rounded sheet.
    backdropWrap: { flex: 1 },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: Spacing.md,
    },
    sheet: {
      width: '100%',
      maxWidth: 440,
      backgroundColor: t.popover,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: Radius.xl,
      overflow: 'hidden',
      shadowColor: '#000000',
      shadowOpacity: 0.35,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
      elevation: 24,
    },
    sheetBody: { padding: Spacing.md + 4, gap: Spacing.sm },
    sheetHead: { alignItems: 'flex-start', gap: Spacing.sm, justifyContent: 'space-between' },
    sheetHeadText: { flex: 1, gap: 2 },
    sheetTitle: { color: t.foreground, fontSize: 17, lineHeight: 24, fontWeight: '700' },
    sheetNote: { color: t.mutedForeground, fontSize: 12, lineHeight: 16 },

    // `Field` spreads `style` *after* its own input rule, so a multiline box
    // restates the input chrome instead of inheriting it.
    cover: {
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

    sheetActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: 4 },
    actionHalf: { flex: 1 },

    doneBox: { alignItems: 'center', gap: 8, paddingVertical: Spacing.lg },
    doneGlyph: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: t.successBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    doneTitle: { color: t.foreground, fontSize: 16, fontWeight: '700' },
    doneBody: { color: t.mutedForeground, fontSize: 14, lineHeight: 20, textAlign: 'center' },
    doneClose: { minWidth: 180, marginTop: Spacing.sm },
  })
);
