import { useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';

import { useAuth } from '@/auth/auth-context';
import {
  Badge,
  Btn,
  Card,
  Chip,
  Empty,
  ErrorBar,
  Field,
  Loading,
  Row,
  Screen,
  SearchBar,
} from '@/components/ui';
import { useRoleDenied } from '@/components/role-gate';
import { Radius, Spacing } from '@/constants/brand';
import { useApi, useMutation } from '@/hooks/use-api';
import { useI18n, type MessageKey } from '@/i18n';
import { formatDate, formatMoney, humanise } from '@/lib/format';
import { useCurrency } from '@/lib/currency';
import { createStyles, useTheme } from '@/lib/theme';

type Project = {
  id: string;
  name: string;
  slug: string;
  status: string;
  startPrice: number | null;
  totalUnits: number | null;
  completionPercent: number | null;
  viewCount: number;
  isFeatured: boolean;
  governorate?: { name: string } | null;
  city?: { name: string } | null;
  developer: { companyName: string };
};

type Milestone = {
  id: string;
  type: string;
  title: string;
  description?: string | null;
  date?: string | null;
  status: string;
  progressPercent?: number | null;
  approvalStatus: string;
  rejectionReason?: string | null;
};

/** Same vocabulary as `src/components/projects/milestone-dialog.tsx`. */
const MILESTONE_TYPES = ['LAUNCH', 'CONSTRUCTION', 'PROGRESS', 'DELIVERY', 'HANDOVER', 'CUSTOM'];
const MILESTONE_STATUSES = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'DELAYED'];

/** `approvalStatus` → the bilingual label + the badge tone it earns. */
const APPROVAL: Record<string, { key: MessageKey; tone: 'green' | 'gold' | 'red' }> = {
  APPROVED: { key: 'dash.approved', tone: 'green' },
  PENDING: { key: 'dash.pending', tone: 'gold' },
  REJECTED: { key: 'dash.rejected', tone: 'red' },
};

/**
 * The website's `/dashboard/projects`: the same list (search, status and
 * featured badges, city · developer, start price, unit/view counts, completion
 * bar) plus the milestone dialog the site opens from the "Timeline" button.
 *
 * `GET /api/projects` is the list — it filters on `isActive` server-side and
 * paginates with `limit`, so this screen sends the same request the site does.
 * Milestones are read with `GET /api/milestones?projectId=` and submitted with
 * `POST /api/milestones`; a developer's submission lands as PENDING until a
 * CEO/ADMIN approves it — the approval workflow the app used to only render.
 */
export default function DashboardProjectsScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { t, row, align } = useI18n();
  const { currency, rates } = useCurrency();
  const { hasRole } = useAuth();
  const [query, setQuery] = useState('');
  const [openProject, setOpenProject] = useState<Project | null>(null);

  const { data, error, loading, refreshing, refresh } = useApi<{ projects?: Project[] }>(
    '/api/projects'
  );

  // The site shows the Timeline button to DEVELOPER/CEO/ADMIN; reaching this
  // screen at all already requires the sidebar grant (DEVELOPER, ADMIN + the
  // super roles), so the two conditions agree.
  const canSubmitMilestones = hasRole('DEVELOPER', 'CEO', 'ADMIN');

  const denied = useRoleDenied('dash.forbidden', ['DEVELOPER', 'ADMIN']);
  if (denied) return denied;

  if (loading) return <Loading label={t('dash.loading')} />;

  const projects = data?.projects ?? [];
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? projects.filter((project) => project.name.toLowerCase().includes(needle))
    : projects;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('dash.projectsTitle') }} />

      <Text style={[styles.lead, align]}>{t('dash.projectsSubtitle')}</Text>

      <SearchBar value={query} onChangeText={setQuery} placeholder={t('dash.searchProjects')} />

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}

      {!error && filtered.length === 0 ? (
        <Empty title={t('dash.noProjects')} message={t('dash.emptyHint')} />
      ) : null}

      {filtered.map((project) => {
        const place = project.city?.name || project.governorate?.name || t('dash.na');
        const completion = Math.max(0, Math.min(100, project.completionPercent ?? 0));

        return (
          <Card key={project.id} style={styles.card}>
            <View style={[styles.badgeRow, row]}>
              <Badge tone={statusTone(project.status)}>{project.status.replace(/_/g, ' ')}</Badge>
              {project.isFeatured ? <Badge tone="gold">{t('dash.featured')}</Badge> : null}
            </View>

            <Row title={project.name} onPress={() => router.push(`/project/${project.slug}`)} />

            <Text style={[styles.place, align]}>{`${place} · ${project.developer.companyName}`}</Text>

            <View style={[styles.numbers, row]}>
              <Text style={[styles.price, align]}>
                {project.startPrice
                  ? formatMoney(project.startPrice, currency, rates)
                  : t('dash.na')}
              </Text>
              <View style={[styles.meta, row]}>
                <Text style={styles.metaText}>
                  {`${project.totalUnits || 0} ${t('dash.totalUnits')}`}
                </Text>
                <Text style={styles.metaText}>·</Text>
                <Text style={styles.metaText}>
                  {`${(project.viewCount ?? 0).toLocaleString('en-US')} ${t('dash.views')}`}
                </Text>
              </View>
            </View>

            {project.completionPercent !== null ? (
              <View style={styles.completion}>
                <View style={[styles.completionHead, row]}>
                  <Text style={[styles.completionLabel, align]}>{t('dash.completion')}</Text>
                  <Text style={styles.completionValue}>{`${project.completionPercent}%`}</Text>
                </View>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${completion}%` }]} />
                </View>
              </View>
            ) : null}

            {canSubmitMilestones ? (
              <Btn title={t('dash.timeline')} variant="ghost" onPress={() => setOpenProject(project)} />
            ) : null}
          </Card>
        );
      })}

      {openProject ? <TimelineSheet project={openProject} onClose={() => setOpenProject(null)} /> : null}
    </Screen>
  );
}

function statusTone(status: string): 'green' | 'blue' | 'muted' {
  if (status === 'AVAILABLE') return 'green';
  if (status === 'UNDER_CONSTRUCTION') return 'blue';
  return 'muted';
}

/* ── Timeline dialog ──────────────────────────────────────────────────────── */

/**
 * The site's `MilestoneDialog`: milestones for one project plus the submit
 * form, fetched only while the sheet is open.
 *
 * The list endpoint already scopes by role — a developer sees their own
 * project's submissions in any approval state, a CEO/ADMIN sees everything,
 * everyone else only APPROVED — so nothing is filtered here.
 */
function TimelineSheet({ project, onClose }: { project: Project; onClose: () => void }) {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const { t: theme } = useTheme();
  const [title, setTitle] = useState('');
  const [type, setType] = useState('CONSTRUCTION');
  const [status, setStatus] = useState('PLANNED');
  const [date, setDate] = useState('');
  const [progress, setProgress] = useState('');
  const [description, setDescription] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, error, loading, refresh } = useApi<{ milestones?: Milestone[] }>(
    `/api/milestones?projectId=${encodeURIComponent(project.id)}`
  );
  const mutation = useMutation();

  const milestones = data?.milestones ?? [];

  async function submit() {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setProblem(t('dash.milestoneRequired'));
      return;
    }
    if (date.trim() && Number.isNaN(Date.parse(date.trim()))) {
      setProblem(t('dash.milestoneDateBad'));
      return;
    }
    const progressValue =
      progress.trim() === '' ? null : Number(progress.replace(/[^\d.]/g, ''));
    if (
      progressValue !== null &&
      (!Number.isFinite(progressValue) || progressValue < 0 || progressValue > 100)
    ) {
      setProblem(t('dash.milestoneProgressBad'));
      return;
    }

    setProblem(null);
    setNotice(null);
    try {
      const result = (await mutation.run('/api/milestones', 'POST', {
        projectId: project.id,
        title: cleanTitle,
        type,
        status,
        date: date.trim() || null,
        description: description.trim() || null,
        progressPercent: progressValue,
      })) as { milestone?: Milestone } | undefined;

      setNotice(
        result?.milestone?.approvalStatus === 'PENDING'
          ? t('dash.milestoneSent')
          : t('dash.milestonePublished')
      );
      setTitle('');
      setDate('');
      setProgress('');
      setDescription('');
      refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('dash.milestoneFailed'));
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdropWrap}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <ScrollView
              contentContainerStyle={styles.sheetBody}
              keyboardShouldPersistTaps="handled">
              <View style={[styles.sheetHead, row]}>
                <View style={styles.sheetHeadText}>
                  <Text style={[styles.sheetTitle, align]}>
                    {`${t('dash.timelineTitle')} — ${project.name}`}
                  </Text>
                  <Text style={[styles.sheetNote, align]}>{t('dash.timelineHint')}</Text>
                </View>
                <Pressable onPress={onClose} hitSlop={8} accessibilityLabel={t('common.close')}>
                  <Ionicons name="close" size={20} color={theme.mutedForeground} />
                </Pressable>
              </View>

              {error ? <ErrorBar message={error} onRetry={refresh} /> : null}
              {problem ? <ErrorBar message={problem} /> : null}
              {notice ? <Text style={[styles.notice, align]}>{`${notice} ✓`}</Text> : null}

              {loading ? (
                <Loading label={t('dash.loading')} />
              ) : milestones.length === 0 ? (
                <Empty title={t('dash.timelineEmpty')} message={t('dash.timelineEmptyHint')} />
              ) : (
                milestones.map((milestone, index) => {
                  const approval = APPROVAL[milestone.approvalStatus];
                  return (
                    <View key={milestone.id} style={styles.item}>
                      {index > 0 ? <View style={styles.itemDivider} /> : null}
                      <View style={[styles.itemHead, row]}>
                        <Text style={styles.itemType}>{humanise(milestone.type)}</Text>
                        {approval ? <Badge tone={approval.tone}>{t(approval.key)}</Badge> : null}
                        <Text style={styles.itemMeta}>{humanise(milestone.status)}</Text>
                        {milestone.progressPercent !== null &&
                        milestone.progressPercent !== undefined ? (
                          <Text style={styles.itemMeta}>{`${milestone.progressPercent}%`}</Text>
                        ) : null}
                      </View>
                      <Text style={[styles.itemTitle, align]}>{milestone.title}</Text>
                      {milestone.description ? (
                        <Text style={[styles.itemNote, align]}>{milestone.description}</Text>
                      ) : null}
                      {milestone.date ? (
                        <Text style={[styles.itemNote, align]}>{formatDate(milestone.date)}</Text>
                      ) : null}
                      {milestone.approvalStatus === 'REJECTED' && milestone.rejectionReason ? (
                        <Text style={[styles.rejection, align]}>{milestone.rejectionReason}</Text>
                      ) : null}
                    </View>
                  );
                })
              )}

              <View style={styles.form}>
                <Text style={[styles.formTitle, align]}>{t('dash.submitMilestone')}</Text>

                <Field
                  label={`${t('dash.milestoneTitle')} *`}
                  value={title}
                  onChangeText={setTitle}
                  placeholder={t('dash.milestoneTitlePlaceholder')}
                />

                <Text style={[styles.formLabel, align]}>{t('dash.milestoneType')}</Text>
                <View style={[styles.chipRow, row]}>
                  {MILESTONE_TYPES.map((value) => (
                    <Chip
                      key={value}
                      label={value.replace(/_/g, ' ')}
                      selected={type === value}
                      onPress={() => setType(value)}
                    />
                  ))}
                </View>

                <Text style={[styles.formLabel, align]}>{t('dash.milestoneStatus')}</Text>
                <View style={[styles.chipRow, row]}>
                  {MILESTONE_STATUSES.map((value) => (
                    <Chip
                      key={value}
                      label={value.replace(/_/g, ' ')}
                      selected={status === value}
                      onPress={() => setStatus(value)}
                    />
                  ))}
                </View>

                <Field
                  label={t('dash.milestoneDate')}
                  value={date}
                  onChangeText={setDate}
                  placeholder={t('dash.milestoneDatePlaceholder')}
                  autoCapitalize="none"
                />
                <Field
                  label={t('dash.milestoneProgress')}
                  value={progress}
                  onChangeText={setProgress}
                  placeholder={t('dash.milestoneProgressPlaceholder')}
                  keyboardType="numeric"
                />
                <Field
                  label={t('dash.milestoneDescription')}
                  value={description}
                  onChangeText={setDescription}
                  placeholder={t('dash.milestoneDescriptionPlaceholder')}
                  multiline
                  numberOfLines={3}
                  style={[styles.description, align]}
                />

                <Btn
                  title={t('dash.submitForReview')}
                  busy={mutation.busy}
                  onPress={() => void submit()}
                />
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    lead: { color: t.mutedForeground, fontSize: 14, lineHeight: 20 },
    card: { gap: 6 },
    badgeRow: { flexWrap: 'wrap', gap: 6 },
    place: { color: t.mutedForeground, fontSize: 13 },
    numbers: { alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
    price: { color: t.primary, fontSize: 16, fontWeight: '800' },
    meta: { alignItems: 'center', gap: 6 },
    metaText: { color: t.mutedForeground, fontSize: 13 },

    completion: { gap: 4, marginTop: 2 },
    completionHead: { alignItems: 'center', justifyContent: 'space-between' },
    completionLabel: { color: t.mutedForeground, fontSize: 12 },
    completionValue: { color: t.mutedForeground, fontSize: 12, fontWeight: '700' },
    track: {
      height: 6,
      borderRadius: Radius.full,
      backgroundColor: t.muted,
      overflow: 'hidden',
    },
    fill: { height: 6, borderRadius: Radius.full, backgroundColor: t.primary },

    // Timeline sheet — the site's `fixed inset-0 bg-black/70` + rounded sheet.
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
      maxWidth: 460,
      maxHeight: '90%',
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
    notice: { color: t.successFg, fontSize: 14, fontWeight: '700' },

    item: { gap: 4, paddingVertical: Spacing.sm },
    itemDivider: { height: 1, backgroundColor: t.border },
    itemHead: { alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    itemType: { color: t.mutedForeground, fontSize: 11, fontWeight: '700' },
    itemMeta: { color: t.mutedForeground, fontSize: 11 },
    itemTitle: { color: t.foreground, fontSize: 15, fontWeight: '600' },
    itemNote: { color: t.mutedForeground, fontSize: 13, lineHeight: 18 },
    rejection: { color: t.dangerFg, fontSize: 13, lineHeight: 18 },

    form: {
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: t.border,
      borderRadius: Radius.lg,
      padding: Spacing.sm + 4,
      gap: 4,
      marginTop: Spacing.xs,
    },
    formTitle: { color: t.foreground, fontSize: 15, fontWeight: '700', marginBottom: 4 },
    formLabel: { color: t.mutedForeground, fontSize: 14, fontWeight: '500' },
    chipRow: { flexWrap: 'wrap', gap: 8, marginBottom: Spacing.sm },
    description: {
      minHeight: 84,
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
  })
);
