import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

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
} from '@/components/ui';
import { useRoleDenied } from '@/components/role-gate';
import { Spacing } from '@/constants/brand';
import { useApi, useMutation } from '@/hooks/use-api';
import { useI18n } from '@/i18n';
import { createStyles } from '@/lib/theme';

type Milestone = {
  id: string;
  name: string;
  nameArabic?: string | null;
  percentage: number;
  monthNumber?: number | null;
  description?: string | null;
  sortOrder: number;
};

type PaymentPlan = {
  id: string;
  name: string;
  description?: string | null;
  downPaymentPct: number;
  installmentYears: number;
  isActive: boolean;
  createdAt: string;
  project?: { id: string; name: string } | null;
  milestones?: Milestone[];
};

type Project = { id: string; name: string };

const MAX_RENDER = 60;

/** The subset of a milestone the create route's `milestones` array accepts. */
type MilestoneSeed = {
  name: string;
  nameArabic?: string;
  percentage: number;
  monthNumber?: number;
  description?: string;
};

/**
 * Payment plans: create and manage plans and their milestones, exactly the
 * surface of the website's payment-plans page.
 *
 * Reads `GET /api/ceo/payment-plans` (optional `?projectId=`) and writes
 * `POST` / `PATCH` / `DELETE` on the same route — with the field names the
 * route actually validates: `downPaymentPct` and `installmentYears` (the
 * website's form posts `downPaymentPercent`, which the handler would reject
 * as a missing field), and milestones as a whole `milestones: [...]` array,
 * which is the only shape `PATCH` accepts for adding or removing one.
 */
export default function CeoPaymentPlansScreen() {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const [creating, setCreating] = useState(false);
  const [newProjectId, setNewProjectId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDown, setNewDown] = useState('');
  const [newYears, setNewYears] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDown, setEditDown] = useState('');
  const [editYears, setEditYears] = useState('');
  const [addingId, setAddingId] = useState<string | null>(null);
  const [milestoneName, setMilestoneName] = useState('');
  const [milestonePercent, setMilestonePercent] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, error, loading, refreshing, refresh } = useApi<{ plans?: PaymentPlan[] }>(
    '/api/ceo/payment-plans',
  );
  const { data: projectData } = useApi<{ projects?: Project[] }>(
    creating ? '/api/ceo/projects?limit=100' : null,
  );
  const mutation = useMutation();

  const plans = data?.plans ?? [];
  const projects = projectData?.projects ?? [];

  async function write(key: string, run: () => Promise<void>, success?: string): Promise<boolean> {
    setBusyId(key);
    setProblem(null);
    setNotice(null);
    try {
      await run();
      if (success) setNotice(success);
      refresh();
      return true;
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function create() {
    const down = Number(newDown.replace(/[^\d.]/g, ''));
    const years = Number(newYears.replace(/\D/g, ''));
    if (!newProjectId || !newName.trim() || !Number.isFinite(down) || !newDown.trim() || !newYears.trim() || !Number.isFinite(years)) {
      setProblem(t('ceoCat.planNameRequired'));
      return;
    }
    const ok = await write(
      'create',
      async () => {
        await mutation.run('/api/ceo/payment-plans', 'POST', {
          projectId: newProjectId,
          name: newName.trim(),
          description: newDescription.trim() || null,
          downPaymentPct: down,
          installmentYears: years,
        });
      },
      t('ceoCat.planCreated'),
    );
    if (ok) {
      setCreating(false);
      setNewProjectId(null);
      setNewName('');
      setNewDescription('');
      setNewDown('');
      setNewYears('');
    }
  }

  function toggleActive(plan: PaymentPlan) {
    void write(
      plan.id,
      async () => {
        await mutation.run('/api/ceo/payment-plans', 'PATCH', {
          id: plan.id,
          isActive: !plan.isActive,
        });
      },
      t('ceoCat.planUpdated'),
    );
  }

  function openEdit(plan: PaymentPlan) {
    setEditingId(plan.id);
    setAddingId(null);
    setProblem(null);
    setNotice(null);
    setEditName(plan.name);
    setEditDescription(plan.description ?? '');
    setEditDown(String(plan.downPaymentPct));
    setEditYears(String(plan.installmentYears));
  }

  async function saveEdit(plan: PaymentPlan) {
    const down = Number(editDown.replace(/[^\d.]/g, ''));
    const years = Number(editYears.replace(/\D/g, ''));
    if (!editName.trim()) {
      setProblem(t('ceoCat.planNameRequired'));
      return;
    }
    if (!Number.isFinite(down) || !Number.isFinite(years)) {
      setProblem(t('ceoCat.numberRequired'));
      return;
    }
    const ok = await write(
      plan.id,
      async () => {
        await mutation.run('/api/ceo/payment-plans', 'PATCH', {
          id: plan.id,
          name: editName.trim(),
          description: editDescription.trim() || null,
          downPaymentPct: down,
          installmentYears: years,
        });
      },
      t('ceoCat.planUpdated'),
    );
    if (ok) setEditingId(null);
  }

  /** `PATCH` replaces the whole milestone set — send it back plus the new one. */
  async function addMilestone(plan: PaymentPlan) {
    const percent = Number(milestonePercent.replace(/[^\d.]/g, ''));
    if (!milestoneName.trim() || !milestonePercent.trim() || !Number.isFinite(percent)) {
      setProblem(t('ceoCat.milestoneRequired'));
      return;
    }
    const existing: MilestoneSeed[] = (plan.milestones ?? []).map((m) => ({
      name: m.name,
      ...(m.nameArabic ? { nameArabic: m.nameArabic } : {}),
      percentage: m.percentage,
      ...(m.monthNumber != null ? { monthNumber: m.monthNumber } : {}),
      ...(m.description ? { description: m.description } : {}),
    }));
    const ok = await write(
      plan.id,
      async () => {
        await mutation.run('/api/ceo/payment-plans', 'PATCH', {
          id: plan.id,
          milestones: [...existing, { name: milestoneName.trim(), percentage: percent }],
        });
      },
      t('ceoCat.milestonesSaved'),
    );
    if (ok) {
      setAddingId(null);
      setMilestoneName('');
      setMilestonePercent('');
    }
  }

  async function removeMilestone(plan: PaymentPlan, milestone: Milestone) {
    const remaining: MilestoneSeed[] = (plan.milestones ?? [])
      .filter((m) => m.id !== milestone.id)
      .map((m) => ({
        name: m.name,
        ...(m.nameArabic ? { nameArabic: m.nameArabic } : {}),
        percentage: m.percentage,
        ...(m.monthNumber != null ? { monthNumber: m.monthNumber } : {}),
        ...(m.description ? { description: m.description } : {}),
      }));
    await write(
      plan.id,
      async () => {
        await mutation.run('/api/ceo/payment-plans', 'PATCH', {
          id: plan.id,
          milestones: remaining,
        });
      },
      t('ceoCat.milestonesSaved'),
    );
  }

  async function removePlan(plan: PaymentPlan) {
    await write(
      plan.id,
      async () => {
        await mutation.run(`/api/ceo/payment-plans?id=${plan.id}`, 'DELETE');
        setExpanded(null);
        setEditingId(null);
      },
      t('ceoCat.planDeleted'),
    );
  }

  function confirmRemove(plan: PaymentPlan) {
    Alert.alert(t('ceoCat.deletePlanTitle'), t('ceoCat.deletePlanBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => void removePlan(plan) },
    ]);
  }

  const denied = useRoleDenied('ceo.forbidden', ['CEO', 'ADMIN']);
  if (denied) return denied;

  if (loading) return <Loading label={t('common.loading')} />;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('ceoCat.paymentPlansTitle') }} />

      <Text style={[styles.hint, align]}>{t('ceoCat.plansHint')}</Text>

      <Btn
        title={creating ? t('common.close') : t('ceoCat.newPlan')}
        variant={creating ? 'ghost' : 'primary'}
        onPress={() => {
          setCreating((prev) => !prev);
          setProblem(null);
          setNotice(null);
        }}
      />

      {creating ? (
        <Card style={styles.form}>
          <Text style={[styles.sectionLabel, align]}>{t('ceoCat.createPlan')}</Text>

          <Text style={[styles.formLabel, align]}>{t('common.project')}</Text>
          <View style={[styles.chipRow, row]}>
            <Chip
              label={t('ceoCat.selectProject')}
              selected={newProjectId === null}
              onPress={() => setNewProjectId(null)}
            />
            {projects.slice(0, MAX_RENDER).map((project) => (
              <Chip
                key={project.id}
                label={project.name}
                selected={newProjectId === project.id}
                onPress={() => setNewProjectId(project.id)}
              />
            ))}
          </View>

          <Field
            label={t('ceoCat.planName')}
            placeholder={t('ceoCat.planNamePlaceholder')}
            value={newName}
            onChangeText={setNewName}
          />
          <Field
            label={t('ceoCat.description')}
            placeholder={t('ceoCat.descriptionPlaceholder')}
            value={newDescription}
            onChangeText={setNewDescription}
          />
          <Field
            label={t('ceoCat.downPayment')}
            placeholder={t('ceoCat.downPaymentPlaceholder')}
            value={newDown}
            onChangeText={setNewDown}
            keyboardType="numeric"
          />
          <Field
            label={t('ceoCat.installmentYears')}
            placeholder={t('ceoCat.installmentPlaceholder')}
            value={newYears}
            onChangeText={setNewYears}
            keyboardType="numeric"
          />
          <Btn title={t('ceoCat.createPlanAction')} busy={mutation.busy} onPress={() => void create()} />
        </Card>
      ) : null}

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}
      {problem ? <ErrorBar message={problem} /> : null}
      {notice ? <Text style={[styles.notice, align]}>{`${notice} ✓`}</Text> : null}

      {!error && plans.length === 0 ? (
        <Empty title={t('ceoCat.plansNone')} message={t('ceoCat.plansNoneHint')} />
      ) : null}

      {plans.slice(0, MAX_RENDER).map((plan, index) => {
        const isOpen = expanded === plan.id;
        const busy = busyId === plan.id;
        const milestones = [...(plan.milestones ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
        const isEditing = editingId === plan.id;
        const isAdding = addingId === plan.id;

        return (
          <View key={plan.id}>
            {index > 0 ? <Divider /> : null}
            <Card style={styles.card}>
              <Row
                title={plan.name}
                subtitle={[
                  plan.description ?? undefined,
                  plan.project?.name || t('ceoCat.allProjects'),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                badge={
                  <Badge tone={plan.isActive ? 'green' : 'muted'}>
                    {plan.isActive ? t('ceoCat.active') : t('ceoCat.inactive')}
                  </Badge>
                }
                onPress={() => {
                  setExpanded(isOpen ? null : plan.id);
                  setEditingId(null);
                  setAddingId(null);
                  setProblem(null);
                  setNotice(null);
                }}
              />

              <View style={[styles.stats, row]}>
                <View style={styles.statCell}>
                  <Text style={[styles.statLabel, align]}>
                    {t('ceoCat.downPaymentLabel')}
                  </Text>
                  <Text style={[styles.statGold, align]}>{`${plan.downPaymentPct}%`}</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={[styles.statLabel, align]}>{t('ceoCat.duration')}</Text>
                  <Text style={[styles.statValue, align]}>
                    {`${plan.installmentYears} ${t('ceoCat.years')}`}
                  </Text>
                </View>
              </View>

              <Btn
                title={plan.isActive ? t('ceoCat.active') : t('ceoCat.inactive')}
                variant="ghost"
                busy={busy}
                onPress={() => toggleActive(plan)}
              />

              {isOpen ? (
                <View style={styles.editor}>
                  <Divider />

                  <View style={[styles.titleRow, row]}>
                    <Text style={[styles.sectionLabel, align]}>
                      {`${t('ceoCat.milestones')} (${milestones.length})`}
                    </Text>
                    <Btn
                      title={t('ceoCat.add')}
                      variant="ghost"
                      busy={busy && isAdding}
                      onPress={() => {
                        setAddingId(isAdding ? null : plan.id);
                        setMilestoneName('');
                        setMilestonePercent('');
                        setProblem(null);
                      }}
                    />
                  </View>

                  {isAdding ? (
                    <View style={styles.form}>
                      <Field
                        label={t('ceoCat.milestoneName')}
                        value={milestoneName}
                        onChangeText={setMilestoneName}
                      />
                      <Field
                        label={t('ceoCat.percent')}
                        value={milestonePercent}
                        onChangeText={setMilestonePercent}
                        keyboardType="numeric"
                      />
                      <Btn
                        title={t('ceoCat.add')}
                        busy={busy}
                        onPress={() => void addMilestone(plan)}
                      />
                    </View>
                  ) : null}

                  {milestones.length === 0 ? (
                    <Text style={[styles.hint, align]}>{t('ceoCat.milestonesNone')}</Text>
                  ) : (
                    milestones.map((milestone, milestoneIndex) => (
                      <View key={milestone.id} style={[styles.milestone, row]}>
                        <View style={styles.rank}>
                          <Text style={styles.rankText}>{milestoneIndex + 1}</Text>
                        </View>
                        <Text style={[styles.milestoneName, align]} numberOfLines={1}>
                          {milestone.name}
                        </Text>
                        <Text style={styles.milestonePct}>{`${milestone.percentage}%`}</Text>
                        <Btn
                          title={t('common.delete')}
                          variant="ghost"
                          disabled={busy}
                          onPress={() => void removeMilestone(plan, milestone)}
                        />
                      </View>
                    ))
                  )}

                  {isEditing ? (
                    <View style={styles.editBox}>
                      <Field
                        label={t('ceoCat.planName')}
                        value={editName}
                        onChangeText={setEditName}
                      />
                      <Field
                        label={t('ceoCat.description')}
                        value={editDescription}
                        onChangeText={setEditDescription}
                      />
                      <Field
                        label={t('ceoCat.downPayment')}
                        value={editDown}
                        onChangeText={setEditDown}
                        keyboardType="numeric"
                      />
                      <Field
                        label={t('ceoCat.installmentYears')}
                        value={editYears}
                        onChangeText={setEditYears}
                        keyboardType="numeric"
                      />
                      <View style={[styles.actions, row]}>
                        <Btn
                          title={t('common.cancel')}
                          variant="ghost"
                          onPress={() => setEditingId(null)}
                        />
                        <Btn
                          title={t('common.save')}
                          busy={busy}
                          onPress={() => void saveEdit(plan)}
                        />
                      </View>
                    </View>
                  ) : (
                    <View style={[styles.actions, row]}>
                      <Btn title={t('ceoCat.edit')} variant="ghost" onPress={() => openEdit(plan)} />
                      <Btn
                        title={t('common.delete')}
                        variant="danger"
                        disabled={busy}
                        onPress={() => confirmRemove(plan)}
                      />
                    </View>
                  )}
                </View>
              ) : null}
            </Card>
          </View>
        );
      })}

    </Screen>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    hint: { color: t.mutedForeground, fontSize: 13, lineHeight: 18 },
    notice: { color: t.successFg, fontSize: 14, fontWeight: '700' },
    card: { gap: 8, marginTop: Spacing.xs },
    form: { gap: 8, marginTop: Spacing.sm },
    formLabel: { color: t.mutedForeground, fontSize: 14, fontWeight: '500' },
    sectionLabel: {
      color: t.mutedForeground,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    chipRow: { flexWrap: 'wrap', gap: 8 },
    stats: { gap: 8 },
    statCell: {
      flex: 1,
      gap: 2,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 8,
      padding: Spacing.sm,
      backgroundColor: t.muted,
    },
    statLabel: { color: t.mutedForeground, fontSize: 12 },
    statValue: { color: t.foreground, fontSize: 16, fontWeight: '700' },
    statGold: { color: t.primary, fontSize: 16, fontWeight: '700' },
    editor: { gap: 8, marginTop: Spacing.sm },
    titleRow: {
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Spacing.sm,
      flexWrap: 'wrap',
    },
    milestone: {
      alignItems: 'center',
      gap: Spacing.sm,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 8,
      padding: Spacing.sm,
      backgroundColor: t.muted,
    },
    rank: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: t.goldBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rankText: { color: t.goldFg, fontSize: 11, fontWeight: '700' },
    milestoneName: { flex: 1, color: t.foreground, fontSize: 14, fontWeight: '500' },
    milestonePct: { color: t.primary, fontSize: 14, fontWeight: '700' },
    editBox: {
      gap: 8,
      marginTop: Spacing.sm,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 8,
      padding: Spacing.sm,
      backgroundColor: t.goldBg,
    },
    actions: { flexWrap: 'wrap', gap: 8 },
  }),
);
