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
  SearchBar,
  Stat,
} from '@/components/ui';
import { useRoleDenied } from '@/components/role-gate';
import { Spacing } from '@/constants/brand';
import { useApi, useMutation } from '@/hooks/use-api';
import { useI18n } from '@/i18n';
import { humanise, timeAgo } from '@/lib/format';
import { createStyles } from '@/lib/theme';

/**
 * Wire shape of `GET /api/ceo/staging`.
 *
 * Mismatch vs the brief's contract: `payload` and `messageIds` arrive as
 * JSON **strings** (the route returns raw `StagingItem` rows), not parsed
 * objects — both are parsed client-side below with a safe fallback.
 */
type StagingRow = {
  id: string;
  groupJid?: string | null;
  groupName?: string | null;
  senderName?: string | null;
  senderPhone?: string | null;
  messageIds: string | string[];
  payload: string | StagingPayload | null;
  status: string;
  targetProjectId?: string | null;
  reviewNote?: string | null;
  createdAt: string;
};

type StagingPayload = {
  raw?: string | null;
  extracted?: {
    name?: string | null;
    nameArabic?: string | null;
    description?: string | null;
    price?: number | null;
    area?: number | null;
    downPayment?: number | null;
    years?: number | null;
    city?: string | null;
    location?: string | null;
  } | null;
  mediaUrls?: string[];
  suggestedProjectId?: string | null;
  matchScore?: number | null;
};

type DeveloperOpt = { id: string; companyName?: string; name?: string };

type Filter = 'ALL' | 'NEW' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'MERGED';

const FILTERS: Filter[] = ['ALL', 'NEW', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'MERGED'];

/** JSON-safe parse — a corrupt payload must never blank the queue. */
function parsePayload(raw: StagingRow['payload']): StagingPayload | null {
  if (!raw) return null;
  if (typeof raw !== 'string') return raw;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as StagingPayload) : null;
  } catch {
    return { raw };
  }
}

function messageCount(raw: StagingRow['messageIds']): number {
  if (Array.isArray(raw)) return raw.length;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 1;
  } catch {
    return 1;
  }
}

/**
 * WhatsApp staging inbox: the CEO review queue for group messages.
 *
 * Reads `GET /api/ceo/staging?status?&group?`, decides via
 * `PATCH /api/ceo/staging` — APPROVED mints a project (name override when the
 * extraction missed it, optional owner pick when the sender phone matches no
 * account), MERGE applies onto a target (suggestion one tap away), REJECTED
 * needs a reason. Every decision goes through a confirm first.
 */
export default function CeoStagingScreen() {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const [filter, setFilter] = useState<Filter>('NEW');
  const [group, setGroup] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [nameOverride, setNameOverride] = useState('');
  const [developerId, setDeveloperId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (filter !== 'ALL') params.set('status', filter);
  if (group.trim()) params.set('group', group.trim());
  const qs = params.toString();

  const { data, error, loading, refreshing, refresh } = useApi<{
    items?: StagingRow[];
    counts?: Record<string, number>;
  }>(`/api/ceo/staging${qs ? `?${qs}` : ''}`);
  // Owner picker only matters while an APPROVE panel is open.
  const pickingOwner = expanded !== null;
  const { data: devData } = useApi<{ developers?: DeveloperOpt[] }>(
    pickingOwner ? '/api/ceo/developers' : null,
  );
  const mutation = useMutation();

  const denied = useRoleDenied('ceo.forbidden', ['CEO', 'ADMIN']);
  if (denied) return denied;

  if (loading) return <Loading label={t('common.loading')} />;

  const items = data?.items ?? [];
  const counts = data?.counts ?? {};
  const developers = devData?.developers ?? [];

  function resetForm() {
    setReason('');
    setNameOverride('');
    setDeveloperId(null);
    setTargetId('');
    setProblem(null);
  }

  async function send(
    item: StagingRow,
    body: Record<string, unknown>,
    okKey: 'ceoSt.approvedOk' | 'ceoSt.mergedOk' | 'ceoSt.rejectedOk',
  ) {
    setBusyId(item.id);
    setProblem(null);
    setNotice(null);
    try {
      await mutation.run('/api/ceo/staging', 'PATCH', body);
      setNotice(t(okKey));
      setExpanded(null);
      resetForm();
      refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusyId(null);
    }
  }

  function confirmApprove(item: StagingRow) {
    const payload = parsePayload(item.payload);
    const name = nameOverride.trim() || payload?.extracted?.name?.trim() || '';
    if (!name) {
      setProblem(t('ceo.nameRequired'));
      return;
    }
    const body: Record<string, unknown> = { id: item.id, decision: 'APPROVED' };
    if (nameOverride.trim()) body.editedPayload = { name: nameOverride.trim() };
    if (developerId) body.developerId = developerId;
    if (reason.trim()) body.reason = reason.trim();
    Alert.alert(t('ceoSt.approveTitle'), t('ceoSt.approveBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('ceo.approve'), onPress: () => void send(item, body, 'ceoSt.approvedOk') },
    ]);
  }

  function confirmMerge(item: StagingRow, target: string) {
    const targetProjectId = target.trim();
    if (!targetProjectId) {
      setProblem(t('ceoSt.targetRequired'));
      return;
    }
    const body: Record<string, unknown> = { id: item.id, decision: 'MERGE', targetProjectId };
    if (reason.trim()) body.reason = reason.trim();
    Alert.alert(t('ceoSt.mergeTitle'), t('ceoSt.mergeBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.confirm'), onPress: () => void send(item, body, 'ceoSt.mergedOk') },
    ]);
  }

  function confirmReject(item: StagingRow) {
    if (!reason.trim()) {
      setProblem(t('ceoSt.reasonRequired'));
      return;
    }
    Alert.alert(t('ceoSt.rejectTitle'), t('ceoSt.rejectBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('ceo.reject'),
        style: 'destructive',
        onPress: () =>
          void send(
            item,
            { id: item.id, decision: 'REJECTED', reason: reason.trim() },
            'ceoSt.rejectedOk',
          ),
      },
    ]);
  }

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('ceoSt.stagingTitle') }} />

      <Card style={[styles.kpis, row]}>
        <Stat
          value={Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0)}
          label={t('ceoSt.stagingTitle')}
        />
        <Stat value={counts.NEW ?? 0} label={humanise('NEW')} />
        <Stat value={counts.IN_REVIEW ?? 0} label={humanise('IN_REVIEW')} />
      </Card>

      <Text style={[styles.hint, align]}>{t('ceoSt.stagingHint')}</Text>

      <SearchBar
        value={group}
        onChangeText={setGroup}
        placeholder={t('ceoSt.searchGroup')}
      />

      <View style={[styles.filters, row]}>
        {FILTERS.map((value) => {
          const count =
            value === 'ALL'
              ? Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0)
              : (counts[value] ?? 0);
          return (
            <Chip
              key={value}
              label={value === 'ALL' ? `${t('common.all')} (${count})` : `${humanise(value)} (${count})`}
              selected={filter === value}
              onPress={() => setFilter(value)}
            />
          );
        })}
      </View>

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}
      {problem ? <ErrorBar message={problem} /> : null}
      {notice ? <Text style={[styles.notice, align]}>{`${notice} ✓`}</Text> : null}

      {!error && items.length === 0 ? (
        <Empty title={t('ceoSt.empty')} message={t('ceoSt.emptyHint')} />
      ) : null}

      {items.map((item, index) => {
        const payload = parsePayload(item.payload);
        const extracted = payload?.extracted ?? null;
        const isOpen = expanded === item.id;
        const busy = busyId === item.id;
        const decided = item.status !== 'NEW' && item.status !== 'IN_REVIEW';
        const sender = [item.senderName, item.senderPhone].filter(Boolean).join(' · ');
        const groupLabel = item.groupName || item.groupJid || '—';
        const media = payload?.mediaUrls ?? [];

        return (
          <View key={item.id}>
            {index > 0 ? <Divider /> : null}
            <Card style={styles.card}>
              <Row
                title={groupLabel}
                subtitle={[
                  sender || t('ceoSt.noSender'),
                  timeAgo(item.createdAt),
                  `${messageCount(item.messageIds)} ✉`,
                  media.length > 0 ? `${media.length} ${t('ceoSt.photos')}` : undefined,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                badge={
                  <View style={[styles.badges, row]}>
                    <Badge tone={decided ? 'muted' : 'gold'}>{humanise(item.status)}</Badge>
                    {payload?.matchScore != null ? (
                      <Badge tone="blue">{`${t('ceoSt.matchScore')} ${Math.round(payload.matchScore * 100)}%`}</Badge>
                    ) : null}
                  </View>
                }
                onPress={() => {
                  setExpanded(isOpen ? null : item.id);
                  resetForm();
                  if (!isOpen && payload?.suggestedProjectId) setTargetId(payload.suggestedProjectId);
                }}
              />

              {isOpen ? (
                <View style={styles.editor}>
                  <Divider />

                  {payload?.raw ? (
                    <View style={styles.quote}>
                      <Text style={[styles.quoteLabel, align]}>{t('ceoSt.rawMessage')}</Text>
                      <Text style={[styles.quoteText, align]}>{payload.raw}</Text>
                    </View>
                  ) : (
                    <Text style={[styles.hint, align]}>{t('ceoSt.noPayload')}</Text>
                  )}

                  {extracted ? (
                    <View style={styles.facts}>
                      <Text style={[styles.formLabel, align]}>{t('ceoSt.extracted')}</Text>
                      {(
                        [
                          [extracted.name, extracted.nameArabic].filter(Boolean).join(' / '),
                          extracted.description,
                          extracted.city || extracted.location,
                          extracted.price != null ? `${extracted.price.toLocaleString()}` : null,
                          extracted.area != null ? `${extracted.area} m²` : null,
                        ] as (string | null | undefined)[]
                      )
                        .filter(Boolean)
                        .map((line) => (
                          <Text key={line as string} style={[styles.fact, align]}>
                            {`• ${line}`}
                          </Text>
                        ))}
                    </View>
                  ) : null}

                  {item.targetProjectId ? (
                    <Text style={[styles.hint, align]}>
                      {`${t('ceoSt.suggested')}: ${item.targetProjectId}`}
                    </Text>
                  ) : null}
                  {item.reviewNote ? (
                    <Text style={[styles.hint, align]}>
                      {`${t('ceoSt.reviewedNote')}: ${item.reviewNote}`}
                    </Text>
                  ) : null}

                  {!decided ? (
                    <View style={styles.form}>
                      <Field
                        label={t('ceoSt.reasonLabel')}
                        value={reason}
                        onChangeText={setReason}
                        multiline
                        numberOfLines={2}
                      />

                      <Text style={[styles.formLabel, align]}>{t('ceo.approve')}</Text>
                      <Field
                        label={t('ceoSt.nameOverride')}
                        value={nameOverride}
                        onChangeText={setNameOverride}
                        placeholder={extracted?.name ?? ''}
                      />
                      <Text style={[styles.formLabel, align]}>{t('ceoSt.developerPick')}</Text>
                      <View style={[styles.chipRow, row]}>
                        <Chip
                          label={t('common.all')}
                          selected={developerId === null}
                          onPress={() => setDeveloperId(null)}
                        />
                        {developers.slice(0, 30).map((dev) => (
                          <Chip
                            key={dev.id}
                            label={dev.companyName || dev.name || dev.id}
                            selected={developerId === dev.id}
                            onPress={() => setDeveloperId(dev.id)}
                          />
                        ))}
                      </View>
                      <Btn
                        title={t('ceo.approve')}
                        busy={busy}
                        disabled={busy}
                        onPress={() => confirmApprove(item)}
                      />

                      <Text style={[styles.formLabel, align]}>{t('ceoSt.targetField')}</Text>
                      <Text style={[styles.hint, align]}>{t('ceoSt.targetHint')}</Text>
                      {payload?.suggestedProjectId ? (
                        <View style={[styles.chipRow, row]}>
                          <Chip
                            label={`${t('ceoSt.suggested')} · ${payload.suggestedProjectId.slice(0, 8)}…`}
                            selected={targetId === payload.suggestedProjectId}
                            onPress={() => setTargetId(payload.suggestedProjectId ?? '')}
                          />
                        </View>
                      ) : null}
                      <Field
                        label={t('ceoSt.targetField')}
                        value={targetId}
                        onChangeText={setTargetId}
                        autoCapitalize="none"
                      />
                      <View style={[styles.actions, row]}>
                        <Btn
                          title={t('common.confirm')}
                          variant="ghost"
                          style={styles.actionBtn}
                          disabled={busy}
                          busy={busy}
                          onPress={() => confirmMerge(item, targetId)}
                        />
                        <Btn
                          title={t('ceo.reject')}
                          variant="danger"
                          style={styles.actionBtn}
                          disabled={busy}
                          onPress={() => confirmReject(item)}
                        />
                      </View>
                    </View>
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

const useStyles = createStyles((t) =>
  StyleSheet.create({
    kpis: { justifyContent: 'space-around', paddingVertical: Spacing.md },
    hint: { color: t.mutedForeground, fontSize: 13, lineHeight: 18 },
    filters: { flexWrap: 'wrap', gap: 8 },
    notice: { color: t.successFg, fontSize: 14, fontWeight: '700' },
    card: { gap: 0, marginTop: Spacing.xs },
    badges: { gap: 6, flexWrap: 'wrap' },
    editor: { gap: 8, marginTop: Spacing.sm },
    quote: {
      gap: 2,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 8,
      padding: Spacing.sm,
      backgroundColor: t.muted,
    },
    quoteLabel: {
      color: t.mutedForeground,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    quoteText: { color: t.foreground, fontSize: 14, lineHeight: 20 },
    facts: { gap: 2 },
    formLabel: { color: t.mutedForeground, fontSize: 14, fontWeight: '500' },
    fact: { color: t.foreground, fontSize: 14, lineHeight: 20 },
    form: { gap: 8 },
    chipRow: { flexWrap: 'wrap', gap: 8 },
    actions: { gap: 8 },
    actionBtn: { flex: 1 },
  }),
);
