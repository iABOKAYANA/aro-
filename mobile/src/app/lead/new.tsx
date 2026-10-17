import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';

import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/auth-context';
import { useRoleDenied } from '@/components/role-gate';
import { Btn, Card, Chip, ErrorBar, Field, Loading, Screen, SectionTitle } from '@/components/ui';
import { Radius, Spacing } from '@/constants/brand';
import { useApi, useMutation } from '@/hooks/use-api';
import { useI18n, type MessageKey } from '@/i18n';
import { useCurrency } from '@/lib/currency';
import { formatMoney, humanise } from '@/lib/format';
import { createStyles } from '@/lib/theme';

/**
 * Register a new lead — the same `POST /api/leads` the website's lead modal
 * calls, so a client registered in the app lands on the Leads page (and gets
 * the platform's protection window) at the same moment, with no mobile-only
 * code path.
 *
 * Two things this screen leans on the server for:
 *
 * - **Roles.** The route is `requireActor(['BROKER', 'CEO', 'ADMIN'])`, so a
 *   developer cannot register leads. `useRoleDenied` says so before the form
 *   is painted instead of letting the first save bounce off a 403.
 * - **Duplicates.** `POST /api/leads/detect-duplicate` answers with a neutral
 *   ownership verdict (never the other broker's client details), and the form
 *   only *reports* it — submission is never blocked, because `POST /api/leads`
 *   re-checks on its own: a same-broker match returns the existing lead, a
 *   cross-broker match opens a review case, an unassigned match gets claimed.
 */
type Project = { id: string; name: string; nameArabic?: string | null };

type DuplicateResult = {
  duplicate: boolean;
  sameBroker?: boolean;
  /** CEOs only — brokers get the neutral message with no id to open. */
  leadId?: string;
  leadCode?: string;
  message?: string;
};

/** The exact source values the website's lead form offers. */
const SOURCES = [
  'WEBSITE',
  'REFERRAL',
  'SOCIAL_MEDIA',
  'DIRECT_CALL',
  'WALK_IN',
  'PORTAL',
  'AI_CHATBOT',
  'EXHIBITION',
  'MEETING_BOOKING',
];

/** Follow-up choices in days; `none` skips `nextFollowUp` altogether. */
const FOLLOW_UP: { value: string; labelKey: MessageKey }[] = [
  { value: 'none', labelKey: 'common.none' },
  { value: '1', labelKey: 'leads.followUpTomorrow' },
  { value: '3', labelKey: 'leads.followUpIn3' },
  { value: '7', labelKey: 'leads.followUpNextWeek' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DUP_DEBOUNCE_MS = 600;

/** Empty or junk → null, so "typed a real number?" is one comparison. */
function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[,\s]/g, '');
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * A follow-up at 10:00 *local* time, sent as ISO-with-offset because
 * `leadSchema` requires `datetime({ offset: true })`. Setting the hour in
 * local time first is the booking screen's trick for not slipping the date
 * back a day near midnight in UTC+2 (Egypt).
 */
function followUpAt(daysAhead: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  date.setHours(10, 0, 0, 0);
  return date.toISOString();
}

export default function NewLeadScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { t, row, align, localized } = useI18n();
  const { currency, rates } = useCurrency();
  const { session } = useAuth();
  const mutation = useMutation();
  const projects = useApi<{ projects?: Project[] }>('/api/projects?limit=100');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [source, setSource] = useState('WEBSITE');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [followUp, setFollowUp] = useState('none');
  const [notes, setNotes] = useState('');
  const [duplicate, setDuplicate] = useState<DuplicateResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Debounced duplicate check — advisory only. A failed check is swallowed
  // (the endpoint is a courtesy, not a gate) and a match never disables the
  // submit button: the server re-runs the same rule on POST and owns the
  // claim / review / re-registration decision.
  useEffect(() => {
    const phoneValue = phone.trim();
    const emailValue = email.trim();
    // The endpoint needs at least one of the two — skip until we have one.
    if (phoneValue.length < 7 && !emailValue) {
      setDuplicate(null);
      setChecking(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setChecking(true);
      apiFetch<DuplicateResult>('/api/leads/detect-duplicate', {
        method: 'POST',
        token: session?.token ?? null,
        body: JSON.stringify({ phone: phoneValue, email: emailValue }),
        signal: controller.signal,
      })
        .then((result) => {
          if (!controller.signal.aborted) setDuplicate(result);
        })
        .catch(() => {
          if (!controller.signal.aborted) setDuplicate(null);
        })
        .finally(() => {
          if (!controller.signal.aborted) setChecking(false);
        });
    }, DUP_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [phone, email, session?.token]);

  const denied = useRoleDenied('ceo.forbidden', ['BROKER', 'CEO', 'ADMIN']);
  if (denied) return denied;

  const projectList = projects.data?.projects ?? [];
  const minAmount = parseAmount(budgetMin);
  const maxAmount = parseAmount(budgetMax);
  const showDuplicate = Boolean(duplicate?.duplicate);
  const duplicateLeadId = duplicate?.duplicate ? duplicate.leadId ?? null : null;

  async function submit() {
    setProblem(null);

    const nameValue = name.trim();
    const phoneValue = phone.trim();
    const emailValue = email.trim();

    if (nameValue.length < 2) {
      setProblem(t(nameValue ? 'leads.nameTooShort' : 'leads.nameRequired'));
      return;
    }
    const digits = phoneValue.replace(/[\s\-().]/g, '');
    if (!digits) {
      setProblem(t('leads.phoneOrEmail'));
      return;
    }
    if (digits.length < 7) {
      setProblem(t('leads.phoneTooShort'));
      return;
    }
    if (emailValue && !EMAIL_RE.test(emailValue)) {
      setProblem(t('leads.emailInvalid'));
      return;
    }
    if (budgetMin.trim() && minAmount === null) {
      setProblem(t('leads.budgetInvalid'));
      return;
    }
    if (budgetMax.trim() && maxAmount === null) {
      setProblem(t('leads.budgetInvalid'));
      return;
    }

    try {
      const result = (await mutation.run('/api/leads', 'POST', {
        name: nameValue,
        phone: phoneValue,
        source,
        ...(emailValue ? { email: emailValue } : {}),
        ...(projectId ? { projectId } : {}),
        ...(minAmount !== null ? { budgetMin: minAmount } : {}),
        ...(maxAmount !== null ? { budgetMax: maxAmount } : {}),
        ...(followUp !== 'none' ? { nextFollowUp: followUpAt(Number(followUp)) } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      })) as { lead?: { id?: string } | null } | null;

      // Every success path — created, claimed, duplicate-routed — answers
      // `{ lead }`, so one destination covers them all.
      if (result?.lead?.id) {
        router.replace(`/lead/${result.lead.id}`);
        return;
      }
      Alert.alert(t('leads.createdOk'));
      router.back();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('leads.createFailed'));
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('leads.new') }} />

      <Text style={[styles.intro, align]}>{t('leads.newHint')}</Text>

      <Card>
        <SectionTitle>{t('leads.contact')}</SectionTitle>
        <Field
          label={t('common.name')}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />
        <Field
          label={t('common.phone')}
          value={phone}
          onChangeText={setPhone}
          placeholder={t('leads.phonePlaceholder')}
          keyboardType="phone-pad"
        />
        <Field
          label={t('common.email')}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        {showDuplicate ? (
          <View style={styles.dupBox}>
            <Text style={[styles.dupTitle, align]}>{t('leads.duplicate')}</Text>
            <Text style={[styles.hint, align]}>{t('leads.duplicateHint')}</Text>
            {duplicateLeadId ? (
              <Btn
                title={t('leads.openExisting')}
                variant="ghost"
                onPress={() => router.push(`/lead/${duplicateLeadId}`)}
              />
            ) : null}
          </View>
        ) : checking || duplicate ? (
          <Text style={[styles.hint, align]}>
            {checking ? t('leads.checkingDuplicate') : t('leads.noDuplicate')}
          </Text>
        ) : null}

        <Text style={[styles.groupLabel, align]}>{t('leads.source')}</Text>
        <View style={[styles.chips, row]}>
          {SOURCES.map((value) => (
            <Chip
              key={value}
              label={humanise(value)}
              selected={source === value}
              onPress={() => setSource(value)}
            />
          ))}
        </View>
      </Card>

      <Card>
        <SectionTitle>{t('leads.moreDetails')}</SectionTitle>

        <Text style={[styles.groupLabel, align]}>{t('leads.projectOptional')}</Text>
        {projects.loading ? <Loading /> : null}
        {projects.error ? <ErrorBar message={projects.error} onRetry={projects.refresh} /> : null}
        {!projects.loading && !projects.error && projectList.length === 0 ? (
          <Text style={[styles.hint, align]}>{t('common.none')}</Text>
        ) : null}
        <View style={[styles.chips, row]}>
          {projectList.map((project) => (
            <Chip
              key={project.id}
              label={localized(project.name, project.nameArabic)}
              selected={projectId === project.id}
              onPress={() => setProjectId(projectId === project.id ? null : project.id)}
            />
          ))}
        </View>

        <Field
          label={t('leads.budgetMin')}
          value={budgetMin}
          onChangeText={setBudgetMin}
          keyboardType="numeric"
        />
        <Field
          label={t('leads.budgetMax')}
          value={budgetMax}
          onChangeText={setBudgetMax}
          keyboardType="numeric"
        />
        {minAmount !== null || maxAmount !== null ? (
          <Text style={[styles.moneyHint, align]}>
            {formatMoney(minAmount, currency, rates)} – {formatMoney(maxAmount, currency, rates)}
          </Text>
        ) : null}

        <Text style={[styles.groupLabel, align]}>{t('leads.followUp')}</Text>
        <View style={[styles.chips, row]}>
          {FOLLOW_UP.map((option) => (
            <Chip
              key={option.value}
              label={t(option.labelKey)}
              selected={followUp === option.value}
              onPress={() => setFollowUp(option.value)}
            />
          ))}
        </View>

        <Field
          label={t('leads.notesOptional')}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
          style={[styles.notes, align]}
        />
      </Card>

      {problem ? <ErrorBar message={problem} /> : null}

      <Btn title={t('leads.create')} busy={mutation.busy} onPress={submit} />
    </Screen>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    intro: { color: t.mutedForeground, fontSize: 14, lineHeight: 20 },
    hint: { color: t.mutedForeground, fontSize: 12, lineHeight: 17 },
    groupLabel: { color: t.mutedForeground, fontSize: 14, fontWeight: '500' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    moneyHint: { color: t.primary, fontSize: 14, fontWeight: '600' },
    // Duplicate warning — the gold Badge palette, not a red error: a match
    // is a heads-up the server will adjudicate, not a failure.
    dupBox: {
      backgroundColor: t.goldBg,
      borderRadius: Radius.md,
      padding: Spacing.sm + 4,
      gap: Spacing.sm,
    },
    dupTitle: { color: t.goldFg, fontSize: 14, fontWeight: '700' },
    // `Field` spreads `style` *after* its own input rule, so a multiline box
    // restates the input chrome instead of inheriting it.
    notes: {
      minHeight: 88,
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
  }),
);
