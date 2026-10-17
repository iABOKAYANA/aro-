import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';

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
} from '@/components/ui';
import { useRoleDenied } from '@/components/role-gate';
import { Spacing } from '@/constants/brand';
import { useApi, useMutation } from '@/hooks/use-api';
import { useI18n, type MessageKey } from '@/i18n';
import { formatDate, initials } from '@/lib/format';
import { imageUrl } from '@/lib/image';
import { createStyles } from '@/lib/theme';

type LaunchConfig = {
  enabled: boolean;
  windowDays: number;
  limit: number;
  pinnedIds: string[];
  hiddenIds: string[];
};

type LaunchProject = {
  id: string;
  name: string;
  nameArabic?: string | null;
  slug?: string;
  coverImage?: string | null;
  createdAt: string;
  developer?: { companyName?: string } | null;
  city?: { name?: string } | null;
  district?: { name?: string } | null;
};

type LaunchState = 'PINNED' | 'AUTO' | 'HIDDEN' | 'OUTDATED';

type Candidate = LaunchProject & {
  launchState: LaunchState;
  isActive: boolean;
};

type LaunchPayload = {
  config?: LaunchConfig;
  live?: LaunchProject[];
  candidates?: Candidate[];
};

type LaunchAction = 'PIN' | 'UNPIN' | 'HIDE' | 'SHOW';

const STATE_LABELS: Record<LaunchState, MessageKey> = {
  PINNED: 'ceoCat.pinnedCount',
  AUTO: 'ceoCat.autoInWindow',
  HIDDEN: 'ceoCat.hidden',
  OUTDATED: 'ceoCat.outOfWindow',
};

const STATE_TONES: Record<LaunchState, 'gold' | 'green' | 'red' | 'muted'> = {
  PINNED: 'gold',
  AUTO: 'green',
  HIDDEN: 'red',
  OUTDATED: 'muted',
};

/** Same flash the website shows after an action, prefixed with the name. */
const NOTICE_KEYS: Record<LaunchAction, MessageKey> = {
  PIN: 'ceoCat.donePinned',
  UNPIN: 'ceoCat.doneUnpinned',
  HIDE: 'ceoCat.doneHidden',
  SHOW: 'ceoCat.doneShown',
};

const MAX_RENDER = 60;

const locationOf = (project: LaunchProject) =>
  [project.district?.name, project.city?.name].filter(Boolean).join(', ');

/**
 * New launches control: the window, the limit, pinning and hiding behind the
 * homepage "New Launches" band — the website's control room, one list at a
 * time.
 *
 * Reads `GET /api/ceo/new-launches` (`{ config, live, candidates }`, optional
 * `?search=`) and writes everything through `POST /api/ceo/new-launches` with
 * the route's own discriminated body: `{ type: 'SETTINGS', config }` for the
 * section settings — zod-checked to windowDays 1–365 and limit 1–12 — and
 * `{ type: 'PIN' | 'UNPIN' | 'HIDE' | 'SHOW', projectId }` per project. Hiding
 * asks first, because it also strips the project's New badge site-wide.
 */
export default function CeoNewLaunchesScreen() {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<LaunchConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const needle = search.trim();
  const path = needle
    ? `/api/ceo/new-launches?search=${encodeURIComponent(needle)}`
    : '/api/ceo/new-launches';

  const { data, error, loading, refreshing, refresh } = useApi<LaunchPayload>(path);
  const mutation = useMutation();

  const live = data?.live ?? [];
  const candidates = data?.candidates ?? [];

  // Server state wins on every successful fetch — the same way the site does
  // `setForm(data.config)` after each load and save.
  useEffect(() => {
    setDraft(data?.config ?? null);
  }, [data?.config]);

  async function saveSettings() {
    if (!draft) return;
    const windowDays = Number(draft.windowDays);
    const limit = Number(draft.limit);
    if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 365) {
      setProblem(t('ceoCat.windowDaysRange'));
      return;
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 12) {
      setProblem(t('ceoCat.limitRange'));
      return;
    }
    setSaving(true);
    setProblem(null);
    setNotice(null);
    try {
      await mutation.run('/api/ceo/new-launches', 'POST', {
        type: 'SETTINGS',
        config: { ...draft, windowDays, limit },
      });
      setNotice(t('ceoCat.settingsSaved'));
      refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function runAction(type: LaunchAction, project: LaunchProject) {
    setBusyId(project.id);
    setProblem(null);
    setNotice(null);
    try {
      await mutation.run('/api/ceo/new-launches', 'POST', { type, projectId: project.id });
      setNotice(`${t(NOTICE_KEYS[type])} — ${project.name}`);
      refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusyId(null);
    }
  }

  /** Hiding is the destructive one — it drops the New badge, so it asks. */
  function act(type: LaunchAction, project: LaunchProject) {
    if (type !== 'HIDE') {
      void runAction(type, project);
      return;
    }
    Alert.alert(t('ceoCat.hideTitle'), `${project.name}\n\n${t('ceoCat.hideBody')}`, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.confirm'), onPress: () => void runAction('HIDE', project) },
    ]);
  }

  const denied = useRoleDenied('ceo.forbidden', ['CEO', 'ADMIN']);
  if (denied) return denied;

  if (loading) return <Loading label={t('ceoCat.loading')} />;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('ceoCat.newLaunchesTitle') }} />

      <Text style={[styles.hint, align]}>{t('ceoCat.newLaunchesHint')}</Text>
      <Btn
        title={t('ceoCat.viewHomepage')}
        variant="ghost"
        onPress={() => router.push('/')}
      />

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}
      {problem ? <ErrorBar message={problem} /> : null}
      {notice ? <Text style={[styles.notice, align]}>{`${notice} ✓`}</Text> : null}

      {/* ── Section settings ─────────────────────────────── */}
      <Card style={styles.card}>
        <Text style={[styles.title, align]}>{t('ceoCat.sectionSettings')}</Text>
        <Text style={[styles.hint, align]}>{t('ceoCat.sectionSettingsHint')}</Text>

        {draft ? (
          <>
            <View style={[styles.switchRow, row]}>
              <View style={styles.switchText}>
                <Text style={[styles.label, align]}>
                  {draft.enabled ? t('ceoCat.sectionEnabled') : t('ceoCat.sectionDisabled')}
                </Text>
                <Text style={[styles.hint, align]}>
                  {draft.enabled ? t('ceoCat.enabledHint') : t('ceoCat.disabledHint')}
                </Text>
              </View>
              <Btn
                title={draft.enabled ? t('common.yes') : t('common.no')}
                variant={draft.enabled ? 'primary' : 'ghost'}
                disabled={saving}
                onPress={() => setDraft({ ...draft, enabled: !draft.enabled })}
              />
            </View>

            <Field
              label={t('ceoCat.windowDays')}
              value={String(draft.windowDays)}
              onChangeText={(v) =>
                setDraft({ ...draft, windowDays: Number(v.replace(/\D/g, '')) || 1 })
              }
              keyboardType="numeric"
              editable={!saving}
            />
            <Text style={[styles.hint, align]}>{t('ceoCat.windowDaysHint')}</Text>

            <Field
              label={t('ceoCat.limit')}
              value={String(draft.limit)}
              onChangeText={(v) =>
                setDraft({ ...draft, limit: Number(v.replace(/\D/g, '')) || 1 })
              }
              keyboardType="numeric"
              editable={!saving}
            />
            <Text style={[styles.hint, align]}>{t('ceoCat.limitHint')}</Text>

            <View style={[styles.counts, row]}>
              <Text style={[styles.count, align]}>
                {`${t('ceoCat.pinnedCount')}: ${draft.pinnedIds.length}`}
              </Text>
              <Text style={[styles.countBad, align]}>
                {`${t('ceoCat.hiddenCount')}: ${draft.hiddenIds.length}`}
              </Text>
              <Text style={[styles.count, align]}>
                {`${t('ceoCat.liveCards')}: ${live.length}`}
              </Text>
            </View>

            <Btn title={t('ceoCat.saveSettings')} busy={saving} onPress={() => void saveSettings()} />
          </>
        ) : null}
      </Card>

      {/* ── Live band ────────────────────────────────────── */}
      <Card style={styles.card}>
        <View style={[styles.titleRow, row]}>
          <Text style={[styles.title, align]}>{t('ceoCat.liveOnHomepage')}</Text>
          <Badge tone="muted">{`${live.length} / ${draft?.limit ?? '—'}`}</Badge>
        </View>
        <Text style={[styles.hint, align]}>{t('ceoCat.liveHint')}</Text>

        {!draft?.enabled ? (
          <Text style={[styles.note, align]}>{t('ceoCat.liveDisabled')}</Text>
        ) : live.length === 0 ? (
          <Text style={[styles.note, align]}>{t('ceoCat.liveEmpty')}</Text>
        ) : (
          live.slice(0, MAX_RENDER).map((project, index) => {
            const isPinned = draft?.pinnedIds.includes(project.id) ?? false;
            const busy = busyId === project.id;
            const name = project.nameArabic || project.name;
            return (
              <View key={project.id}>
                {index > 0 ? <Divider /> : null}
                <View style={[styles.itemRow, row]}>
                  <View style={styles.rank}>
                    <Text style={styles.rankText}>{index + 1}</Text>
                  </View>
                  <Thumb uri={project.coverImage} name={name} />
                  <View style={styles.itemMain}>
                    <Text style={[styles.itemTitle, align]} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={[styles.itemMeta, align]} numberOfLines={1}>
                      {[locationOf(project), `${t('ceoCat.added')} ${formatDate(project.createdAt)}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <Badge tone={isPinned ? 'gold' : 'green'}>
                    {isPinned ? t('ceoCat.pinnedCount') : t('ceoCat.auto')}
                  </Badge>
                </View>
                <View style={[styles.actions, row]}>
                  <Btn
                    title={isPinned ? t('ceoCat.unpin') : t('ceoCat.pin')}
                    variant="ghost"
                    busy={busy}
                    onPress={() => act(isPinned ? 'UNPIN' : 'PIN', project)}
                  />
                  <Btn
                    title={t('ceoCat.hide')}
                    variant="danger"
                    busy={busy}
                    onPress={() => act('HIDE', project)}
                  />
                </View>
              </View>
            );
          })
        )}
      </Card>

      {/* ── Manage every project ─────────────────────────── */}
      <Card style={styles.card}>
        <Text style={[styles.title, align]}>{t('ceoCat.manageProjects')}</Text>
        <Text style={[styles.hint, align]}>{t('ceoCat.manageHint')}</Text>

        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder={t('ceoCat.searchLaunches')}
        />
      </Card>

      {candidates.length === 0 ? (
        <Empty
          title={t('ceoCat.noProjectsFound')}
          message={needle ? `“${needle}”` : t('ceoCat.emptyHint')}
        />
      ) : (
        candidates.slice(0, MAX_RENDER).map((project, index) => {
          const busy = busyId === project.id;
          const name = project.nameArabic || project.name;
          const state = project.launchState;
          return (
            <View key={project.id}>
              {index > 0 ? <Divider /> : null}
              <Card style={styles.card}>
                <Row
                  left={<Thumb uri={project.coverImage} name={name} />}
                  title={name}
                  subtitle={`/projects/${project.slug} · ${formatDate(project.createdAt)}`}
                  badge={
                    <View style={[styles.badges, row]}>
                      <Badge tone={STATE_TONES[state]}>{t(STATE_LABELS[state])}</Badge>
                      {!project.isActive ? <Badge tone="muted">{t('ceoCat.inactive')}</Badge> : null}
                    </View>
                  }
                />

                <View style={[styles.actions, row]}>
                  {state === 'HIDDEN' ? (
                    <Btn
                      title={t('ceoCat.show')}
                      variant="ghost"
                      busy={busy}
                      onPress={() => act('SHOW', project)}
                    />
                  ) : (
                    <>
                      {state === 'PINNED' ? (
                        <Btn
                          title={t('ceoCat.unpin')}
                          variant="ghost"
                          busy={busy}
                          onPress={() => act('UNPIN', project)}
                        />
                      ) : (
                        <Btn
                          title={t('ceoCat.pin')}
                          variant="ghost"
                          busy={busy}
                          onPress={() => act('PIN', project)}
                        />
                      )}
                      {state === 'AUTO' || state === 'PINNED' ? (
                        <Btn
                          title={t('ceoCat.hide')}
                          variant="danger"
                          busy={busy}
                          onPress={() => act('HIDE', project)}
                        />
                      ) : null}
                    </>
                  )}
                </View>
              </Card>
            </View>
          );
        })
      )}
    </Screen>
  );
}

/** Cover thumbnail with the website's initials fallback. */
function Thumb({ uri, name }: { uri?: string | null; name: string }) {
  const styles = useStyles();
  // Dead remote covers fall back to initials — home city-card pattern.
  const [dead, setDead] = useState(false);
  const src = imageUrl(uri);
  if (src && !dead)
    return <Image source={{ uri: src }} style={styles.thumb} onError={() => setDead(true)} />;
  return (
    <View style={styles.thumbFallback}>
      <Text style={styles.thumbText}>{initials(name)}</Text>
    </View>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    card: { gap: 8, marginTop: Spacing.xs },
    title: { color: t.foreground, fontSize: 17, fontWeight: '700' },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Spacing.sm,
    },
    label: { color: t.foreground, fontSize: 15, fontWeight: '600' },
    hint: { color: t.mutedForeground, fontSize: 13, lineHeight: 18 },
    note: {
      color: t.mutedForeground,
      fontSize: 14,
      lineHeight: 20,
      borderWidth: 1,
      borderColor: t.border,
      borderStyle: 'dashed',
      borderRadius: 8,
      padding: Spacing.sm + 4,
      textAlign: 'center',
    },
    notice: { color: t.successFg, fontSize: 14, fontWeight: '700' },
    switchRow: { alignItems: 'center', gap: Spacing.sm },
    switchText: { flex: 1, gap: 2 },
    counts: { flexWrap: 'wrap', gap: Spacing.sm },
    count: { color: t.mutedForeground, fontSize: 13, fontWeight: '500' },
    countBad: { color: t.dangerFg, fontSize: 13, fontWeight: '500' },
    itemRow: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
    rank: {
      width: 26,
      height: 26,
      borderRadius: 6,
      backgroundColor: t.goldBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rankText: { color: t.goldFg, fontSize: 12, fontWeight: '700' },
    itemMain: { flex: 1, gap: 2 },
    itemTitle: { color: t.foreground, fontSize: 15, fontWeight: '600' },
    itemMeta: { color: t.mutedForeground, fontSize: 12 },
    actions: { flexWrap: 'wrap', gap: 8 },
    badges: { flexWrap: 'wrap', gap: 6 },
    thumb: { width: 48, height: 34, borderRadius: 6, backgroundColor: t.muted },
    thumbFallback: {
      width: 48,
      height: 34,
      borderRadius: 6,
      backgroundColor: t.muted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    thumbText: { color: t.mutedForeground, fontSize: 12, fontWeight: '700' },
  }),
);

