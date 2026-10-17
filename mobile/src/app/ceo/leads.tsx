import { Stack } from 'expo-router';
import { useState, type ReactNode } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  Avatar,
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
import { Radius, Spacing } from '@/constants/brand';
import { useApi, useMutation } from '@/hooks/use-api';
import { useI18n, type MessageKey } from '@/i18n';
import { formatDate, formatMoney, humanise, initials } from '@/lib/format';
import { useCurrency } from '@/lib/currency';
import { createStyles, useTheme } from '@/lib/theme';

type Lead = {
  id: string;
  leadCode: string | null;
  name: string;
  email: string | null;
  phone: string;
  source: string;
  status: string;
  reviewStatus: string;
  protectionExpiresAt: string | null;
  protectionStatus?: 'PROTECTED' | 'EXPIRING_SOON' | 'EXPIRED' | 'NONE';
  budgetMin: number | null;
  budgetMax: number | null;
  preferredPropertyTypes: string;
  preferredAreas: string;
  notes: string | null;
  score: number | null;
  lostReason: string | null;
  contactedAt: string | null;
  createdAt: string;
  broker: { id: string; user: { name: string | null; email: string | null } } | null;
  activities: { id: string; type: string; content: string | null; createdAt: string }[];
};

type Broker = { id: string; user: { name: string | null; email: string | null } };

type Status = 'ALL' | 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'VIEWING' | 'INTERESTED' | 'RESERVATION' | 'CONTRACT' | 'SOLD' | 'LOST';

/** The exact tab vocabulary the website's lead page offers. */
const STATUS_TABS: Status[] = ['ALL', 'NEW', 'CONTACTED', 'QUALIFIED', 'VIEWING', 'INTERESTED', 'RESERVATION', 'CONTRACT', 'SOLD', 'LOST'];

/** The status menu in the table's Actions column (no ALL). */
const STATUS_CHOICES = STATUS_TABS.filter((value): value is Exclude<Status, 'ALL'> => value !== 'ALL');

const MAX_RENDER = 60;

/** Source chips for the add-lead form — the server takes COLD_CALL plus any ≤40-char label. */
const SOURCE_OPTIONS = [
  { value: 'COLD_CALL', labelKey: 'ceoPpl.add.srcColdCall' },
  { value: 'WEBSITE', labelKey: 'ceoPpl.add.srcWebsite' },
  { value: 'REFERRAL', labelKey: 'ceoPpl.add.srcReferral' },
  { value: 'SOCIAL', labelKey: 'ceoPpl.add.srcSocial' },
  { value: 'WALK_IN', labelKey: 'ceoPpl.add.srcWalkIn' },
] as const satisfies { value: string; labelKey: MessageKey }[];

const PHONE_RE = /^\+?[\d\s\-().]{7,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** The website parses these two columns as a JSON array of strings. */
function parseJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function protectionTone(status: string | undefined): 'green' | 'gold' | 'red' | 'muted' {
  const s = (status ?? 'NONE').toUpperCase();
  if (s === 'PROTECTED') return 'green';
  if (s === 'EXPIRING_SOON') return 'gold';
  if (s === 'EXPIRED') return 'red';
  return 'muted';
}

function protectionLabel(status: string | undefined, t: (key: MessageKey) => string): string {
  const s = (status ?? 'NONE').toUpperCase();
  if (s === 'PROTECTED') return t('ceoPpl.protected');
  if (s === 'EXPIRING_SOON') return t('ceoPpl.expiringSoon');
  if (s === 'EXPIRED') return t('ceoPpl.expired');
  return t('ceoPpl.noProtection');
}

function statusTone(status: string): 'green' | 'red' | 'gold' | 'blue' | 'muted' {
  const s = status.toUpperCase();
  if (s === 'SOLD' || s === 'QUALIFIED' || s === 'CONVERTED') return 'green';
  if (s === 'LOST' || s === 'CANCELLED') return 'red';
  if (s === 'CONTACTED' || s === 'RESERVATION' || s === 'CONTRACT') return 'gold';
  if (s === 'NEW' || s === 'VIEWING' || s === 'INTERESTED') return 'blue';
  return 'muted';
}

/**
 * Lead management: the website's /ceo/leads table restated as a card list —
 * search, the status tabs with their live counts, and the expanded row that
 * carries details, preferences, broker assignment, notes, the status menu and
 * delete.
 *
 * Every write is the same call the site makes: `PATCH /api/ceo/leads` with
 * `{ id, status | brokerId | notes }` (status changes go through the server's
 * lifecycle state machine, which answers 409 with the reason when a jump is
 * not allowed) and `DELETE /api/ceo/leads?id=…`.
 */
export default function CeoLeadsScreen() {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const { currency, rates } = useCurrency();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>('ALL');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<'assign' | 'status' | 'delete'>('assign');
  const [bulkBrokerId, setBulkBrokerId] = useState('');
  const [bulkStatus, setBulkStatus] = useState<string>('CONTACTED');
  const [bulkReason, setBulkReason] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  const params = new URLSearchParams();
  if (query.trim()) params.set('search', query.trim());
  if (status !== 'ALL') params.set('status', status);
  const qs = params.toString();

  const { data, error, loading, refreshing, refresh } = useApi<{ leads?: Lead[] }>(
    qs ? `/api/ceo/leads?${qs}` : '/api/ceo/leads',
  );
  const { data: brokerData } = useApi<{ brokers?: Broker[] }>('/api/ceo/brokers');
  const mutation = useMutation();

  const brokers = brokerData?.brokers ?? [];

  /** Returns whether the write landed, so callers can confirm success. */
  async function patch(lead: Lead, body: Record<string, unknown>): Promise<boolean> {
    setBusyId(lead.id);
    setProblem(null);
    setNotice(null);
    try {
      await mutation.run('/api/ceo/leads', 'PATCH', { id: lead.id, ...body });
      refresh();
      return true;
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
      return false;
    } finally {
      setBusyId(null);
    }
  }

  function changeStatus(lead: Lead, next: string) {
    if (lead.status === next) return;
    void patch(lead, { status: next }).then((ok) => {
      if (ok) setNotice(t('ceo.statusUpdated'));
    });
  }

  function assignBroker(lead: Lead, brokerId: string) {
    void patch(lead, { brokerId }).then((ok) => {
      if (ok) {
        setAssigning(false);
        setNotice(t('ceoPpl.lead.brokerAssigned'));
      }
    });
  }

  async function saveNotes(lead: Lead) {
    if (await patch(lead, { notes })) {
      setEditingNotes(false);
      setNotice(t('ceoPpl.saved'));
    }
  }

  function remove(lead: Lead) {
    setBusyId(lead.id);
    setProblem(null);
    setNotice(null);
    void (async () => {
      try {
        await mutation.run(`/api/ceo/leads?id=${lead.id}`, 'DELETE');
        setExpanded(null);
        refresh();
      } catch (e) {
        setProblem(e instanceof Error ? e.message : t('common.error'));
      } finally {
        setBusyId(null);
      }
    })();
  }

  function confirmRemove(lead: Lead) {
    Alert.alert(t('ceoPpl.lead.deleteTitle'), t('ceoPpl.lead.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.confirm'), style: 'destructive', onPress: () => remove(lead) },
    ]);
  }

  function toggleLead(lead: Lead) {
    if (expanded === lead.id) {
      setExpanded(null);
      return;
    }
    setExpanded(lead.id);
    setNotes(lead.notes ?? '');
    setEditingNotes(false);
    setAssigning(false);
    setProblem(null);
    setNotice(null);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  /** POST /api/ceo/leads/bulk — per-row failures come back, never throw. */
  async function submitBulk() {
    if (selected.length === 0) return;
    const body: Record<string, unknown> = { ids: selected, action: bulkAction };
    if (bulkAction === 'assign') {
      if (!bulkBrokerId) {
        setProblem(t('ceoPpl.lead.selectBroker'));
        return;
      }
      body.brokerId = bulkBrokerId;
    }
    if (bulkAction === 'status') body.status = bulkStatus;
    if (bulkReason.trim()) body.reason = bulkReason.trim();
    setBulkBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      const res = (await mutation.run('/api/ceo/leads/bulk', 'POST', body)) as {
        updated?: number;
        failed?: { id: string; error: string }[];
      };
      const failed = res?.failed ?? [];
      setNotice(
        `${res?.updated ?? 0} ${t('ceoPpl.bulk.updated')}${failed.length > 0 ? ` · ${failed.length} ${t('ceoPpl.bulk.failed')}` : ''}`,
      );
      if (failed.length > 0) setProblem(failed.slice(0, 3).map((f) => f.error).join(' · '));
      setSelected([]);
      setBulkReason('');
      refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBulkBusy(false);
    }
  }

  function confirmBulkDelete() {
    if (selected.length === 0) return;
    setBulkAction('delete');
    Alert.alert(t('ceoPpl.bulk.deleteTitle'), t('ceoPpl.bulk.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const body: Record<string, unknown> = { ids: selected, action: 'delete' };
            if (bulkReason.trim()) body.reason = bulkReason.trim();
            setBulkBusy(true);
            setProblem(null);
            setNotice(null);
            try {
              const res = (await mutation.run('/api/ceo/leads/bulk', 'POST', body)) as {
                updated?: number;
                failed?: { id: string; error: string }[];
              };
              const failed = res?.failed ?? [];
              setNotice(
                `${res?.updated ?? 0} ${t('ceoPpl.bulk.updated')}${failed.length > 0 ? ` · ${failed.length} ${t('ceoPpl.bulk.failed')}` : ''}`,
              );
              setSelected([]);
              setBulkReason('');
              refresh();
            } catch (e) {
              setProblem(e instanceof Error ? e.message : t('common.error'));
            } finally {
              setBulkBusy(false);
            }
          })();
        },
      },
    ]);
  }

  const denied = useRoleDenied('ceo.forbidden', ['CEO', 'ADMIN']);
  if (denied) return denied;

  if (loading) return <Loading label={t('common.loading')} />;

  const all = data?.leads ?? [];
  const counts: Record<string, number> = {};
  for (const lead of all) counts[lead.status] = (counts[lead.status] ?? 0) + 1;
  const rows = all.slice(0, MAX_RENDER);
  const searching = query.trim().length > 0;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('ceoPpl.leadsTitle') }} />

      <Card style={[styles.kpis, row]}>
        <Stat value={all.length} label={t('ceo.leads')} />
        <Stat value={counts.NEW ?? 0} label={t('ceo.status.new')} />
        <Stat value={counts.LOST ?? 0} label={t('ceo.lost')} />
      </Card>

      <Btn title={t('ceoPpl.add.open')} onPress={() => setShowAdd(true)} />
      <Btn
        title={bulkMode ? t('ceoPpl.bulk.done') : t('ceoPpl.bulk.open')}
        variant="ghost"
        onPress={() => {
          setBulkMode(!bulkMode);
          setSelected([]);
        }}
      />

      {bulkMode ? (
        <Card>
          <SectionTitle>{`${t('ceoPpl.bulk.open')} (${selected.length} ${t('ceoPpl.bulk.selected')})`}</SectionTitle>
          <View style={[styles.chipRow, row]}>
            <Btn
              title={t('ceoPpl.bulk.selectAll')}
              variant="ghost"
              disabled={rows.length === 0}
              onPress={() => setSelected(rows.map((lead) => lead.id))}
            />
            <Btn title={t('ceoPpl.bulk.clear')} variant="ghost" onPress={() => setSelected([])} />
          </View>
          {selected.length > 0 ? (
            <>
              <View style={[styles.chipRow, row]}>
                <Chip
                  label={t('ceoPpl.bulk.assign')}
                  selected={bulkAction === 'assign'}
                  onPress={() => setBulkAction('assign')}
                />
                <Chip
                  label={t('ceoPpl.bulk.setStatus')}
                  selected={bulkAction === 'status'}
                  onPress={() => setBulkAction('status')}
                />
                <Chip
                  label={t('ceoPpl.bulk.delete')}
                  selected={bulkAction === 'delete'}
                  onPress={() => setBulkAction('delete')}
                />
              </View>
              {bulkAction === 'assign' ? (
                <>
                  <Text style={[styles.prefLabel, align]}>{t('ceoPpl.lead.selectBroker')}</Text>
                  <View style={[styles.chipRow, row]}>
                    {brokers.map((broker) => (
                      <Chip
                        key={broker.id}
                        label={broker.user.name || broker.user.email || broker.id}
                        selected={bulkBrokerId === broker.id}
                        onPress={() => setBulkBrokerId(bulkBrokerId === broker.id ? '' : broker.id)}
                      />
                    ))}
                  </View>
                </>
              ) : null}
              {bulkAction === 'status' ? (
                <View style={[styles.chipRow, row]}>
                  {STATUS_CHOICES.map((value) => (
                    <Chip
                      key={value}
                      label={humanise(value)}
                      selected={bulkStatus === value}
                      onPress={() => setBulkStatus(value)}
                    />
                  ))}
                </View>
              ) : null}
              <Field
                label={t('ceoPpl.bulk.reason')}
                value={bulkReason}
                onChangeText={setBulkReason}
              />
              {bulkAction === 'delete' ? (
                <Btn
                  title={`${t('ceoPpl.bulk.delete')} (${selected.length})`}
                  variant="danger"
                  busy={bulkBusy || mutation.busy}
                  onPress={confirmBulkDelete}
                />
              ) : (
                <Btn
                  title={`${t('common.confirm')} (${selected.length})`}
                  busy={bulkBusy || mutation.busy}
                  onPress={() => void submitBulk()}
                />
              )}
            </>
          ) : null}
        </Card>
      ) : null}

      <SearchBar value={query} onChangeText={setQuery} placeholder={t('ceoPpl.leads.search')} />

      <View style={[styles.filters, row]}>
        {STATUS_TABS.map((value) => (
          <Chip
            key={value}
            label={
              value === 'ALL'
                ? `${t('common.all')} (${all.length})`
                : `${humanise(value)} (${counts[value] ?? 0})`
            }
            selected={status === value}
            onPress={() => setStatus(value)}
          />
        ))}
      </View>

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}
      {problem ? <ErrorBar message={problem} /> : null}
      {notice ? <Text style={[styles.notice, align]}>{`${notice} ✓`}</Text> : null}

      {!error && rows.length === 0 ? (
        <Empty
          title={t('ceoPpl.leads.none')}
          message={searching ? t('ceoPpl.leads.trySearch') : t('ceoPpl.leads.noneHint')}
        />
      ) : null}

      {all.length > MAX_RENDER ? (
        <Text style={[styles.count, align]}>
          {`${t('common.showingFirst')} ${MAX_RENDER} ${t('common.of')} ${all.length}`}
        </Text>
      ) : null}

      {rows.map((lead, index) => {
        const isOpen = expanded === lead.id;
        const busy = busyId === lead.id;
        const picked = bulkMode && selected.includes(lead.id);
        const areas = parseJsonArray(lead.preferredAreas);
        const types = parseJsonArray(lead.preferredPropertyTypes);
        const budget =
          lead.budgetMin != null && lead.budgetMax != null
            ? `${formatMoney(lead.budgetMin, currency, rates, { compact: true })} - ${formatMoney(lead.budgetMax, currency, rates, { compact: true })}`
            : lead.budgetMin != null
              ? `${t('ceoPpl.lead.from')} ${formatMoney(lead.budgetMin, currency, rates, { compact: true })}`
              : lead.budgetMax != null
                ? `${t('ceoPpl.lead.upTo')} ${formatMoney(lead.budgetMax, currency, rates, { compact: true })}`
                : null;

        return (
          <View key={lead.id}>
            {index > 0 ? <Divider /> : null}
            <Card style={styles.card}>
              <Row
                left={<Avatar text={initials(lead.name)} />}
                title={lead.name}
                subtitle={[
                  lead.leadCode,
                  lead.phone,
                  lead.email,
                  budget ? `${t('ceoPpl.lead.budget')} ${budget}` : null,
                  lead.broker
                    ? lead.broker.user.name || lead.broker.user.email || t('ceo.unassigned')
                    : t('ceo.unassigned'),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                badge={
                  <View style={[styles.badges, row]}>
                    <Badge tone={statusTone(lead.status)}>{humanise(lead.status)}</Badge>
                    {lead.reviewStatus === 'DUPLICATE_REVIEW' ? (
                      <Badge tone="gold">{t('ceoPpl.lead.duplicate')}</Badge>
                    ) : null}
                    {bulkMode ? (
                      <Badge tone={picked ? 'gold' : 'muted'}>{picked ? '✓' : '○'}</Badge>
                    ) : null}
                  </View>
                }
                onPress={() => (bulkMode ? toggleSelect(lead.id) : toggleLead(lead))}
              />

              {!bulkMode && isOpen ? (
                <View style={styles.editor}>
                  <Divider />

                  <Text style={[styles.sectionLabel, align]}>{t('ceoPpl.lead.details')}</Text>
                  <Detail label={t('common.phone')} value={lead.phone} />
                  {lead.email ? <Detail label={t('common.email')} value={lead.email} /> : null}
                  <Detail label={t('ceoPpl.lead.source')} value={humanise(lead.source)} />
                  <Detail
                    label={t('ceoPpl.lead.score')}
                    value={lead.score != null ? String(lead.score) : '—'}
                  />
                  {lead.lostReason ? (
                    <Detail label={t('ceoPpl.lead.lostReason')} value={lead.lostReason} danger />
                  ) : null}
                  <Detail label={t('ceoPpl.lead.created')} value={formatDate(lead.createdAt)} />
                  {lead.contactedAt ? (
                    <Detail
                      label={t('ceoPpl.lead.firstContacted')}
                      value={formatDate(lead.contactedAt)}
                    />
                  ) : null}

                  <View style={[styles.protection, row]}>
                    <Badge tone={protectionTone(lead.protectionStatus)}>
                      {protectionLabel(lead.protectionStatus, t)}
                    </Badge>
                    {lead.protectionExpiresAt ? (
                      <Text style={[styles.meta, align]}>
                        {`→ ${formatDate(lead.protectionExpiresAt)}`}
                      </Text>
                    ) : null}
                  </View>

                  <Text style={[styles.sectionLabel, align]}>{t('ceoPpl.lead.preferences')}</Text>
                  <Detail
                    label={t('ceoPpl.lead.budgetRange')}
                    value={budget ?? t('ceoPpl.lead.notSpecified')}
                  />
                  {areas.length > 0 ? (
                    <View style={styles.prefBlock}>
                      <Text style={[styles.prefLabel, align]}>{t('ceoPpl.lead.areas')}</Text>
                      <View style={[styles.chipRow, row]}>
                        {areas.map((area) => (
                          <Chip key={area} label={area} />
                        ))}
                      </View>
                    </View>
                  ) : null}
                  {types.length > 0 ? (
                    <View style={styles.prefBlock}>
                      <Text style={[styles.prefLabel, align]}>{t('ceoPpl.lead.types')}</Text>
                      <View style={[styles.chipRow, row]}>
                        {types.map((type) => (
                          <Chip key={type} label={humanise(type)} />
                        ))}
                      </View>
                    </View>
                  ) : null}

                  <Text style={[styles.sectionLabel, align]}>{t('common.status')}</Text>
                  <View style={[styles.chipRow, row]}>
                    {STATUS_CHOICES.map((value) => (
                      <Chip
                        key={value}
                        label={humanise(value)}
                        disabled={busy}
                        selected={lead.status === value}
                        onPress={() => changeStatus(lead, value)}
                      />
                    ))}
                  </View>

                  <Text style={[styles.sectionLabel, align]}>{t('ceoPpl.lead.assignedBroker')}</Text>
                  {assigning ? (
                    <View style={styles.chipRow}>
                      <Text style={[styles.prefLabel, align]}>{t('ceoPpl.lead.selectBroker')}</Text>
                      <View style={[styles.chipRow, row]}>
                        {brokers.map((broker) => (
                          <Chip
                            key={broker.id}
                            label={broker.user.name || broker.user.email || broker.id}
                            disabled={busy}
                            selected={lead.broker?.id === broker.id}
                            onPress={() => assignBroker(lead, broker.id)}
                          />
                        ))}
                      </View>
                      <Btn
                        title={t('common.cancel')}
                        variant="ghost"
                        disabled={busy}
                        onPress={() => setAssigning(false)}
                      />
                    </View>
                  ) : (
                    <Btn
                      title={
                        lead.broker
                          ? lead.broker.user.name || lead.broker.user.email || t('ceo.unassigned')
                          : t('ceo.assignBroker')
                      }
                      variant="ghost"
                      disabled={busy}
                      onPress={() => setAssigning(true)}
                    />
                  )}

                  <Text style={[styles.sectionLabel, align]}>{t('common.notes')}</Text>
                  {editingNotes ? (
                    <View style={styles.notesBlock}>
                      <Field
                        value={notes}
                        onChangeText={setNotes}
                        placeholder={t('ceoPpl.lead.notesPlaceholder')}
                        multiline
                      />
                      <View style={[styles.chipRow, row]}>
                        <Btn
                          title={t('common.save')}
                          disabled={busy}
                          onPress={() => void saveNotes(lead)}
                        />
                        <Btn
                          title={t('common.cancel')}
                          variant="ghost"
                          disabled={busy}
                          onPress={() => {
                            setNotes(lead.notes ?? '');
                            setEditingNotes(false);
                          }}
                        />
                      </View>
                    </View>
                  ) : (
                    <View style={styles.notesBlock}>
                      <Text style={[styles.notes, align]}>
                        {lead.notes || t('ceoPpl.lead.noNotes')}
                      </Text>
                      <Btn
                        title={t('action.edit')}
                        variant="ghost"
                        disabled={busy}
                        onPress={() => setEditingNotes(true)}
                      />
                    </View>
                  )}

                  <Btn
                    title={t('common.delete')}
                    variant="danger"
                    disabled={busy}
                    onPress={() => confirmRemove(lead)}
                  />

                  {lead.activities.length > 0 ? (
                    <View style={styles.activityBlock}>
                      <Text style={[styles.sectionLabel, align]}>{t('ceoPpl.lead.activity')}</Text>
                      {lead.activities.map((activity) => (
                        <View key={activity.id} style={[styles.activity, row]}>
                          <View style={styles.dot} />
                          <View style={styles.activityMain}>
                            <Text style={[styles.activityType, align]}>
                              {humanise(activity.type)}
                              {activity.content ? ` — ${activity.content}` : ''}
                            </Text>
                            <Text style={[styles.meta, align]}>
                              {formatDate(activity.createdAt, true)}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </Card>
          </View>
        );
      })}

      {showAdd ? (
        <AddLeadSheet
          brokers={brokers}
          onClose={() => setShowAdd(false)}
          onDone={(message) => {
            setShowAdd(false);
            setNotice(message);
            refresh();
          }}
        />
      ) : null}

      <DuplicateGroupsPanel />
    </Screen>
  );
}

/* ─── Suspected duplicates + merge ─────────────────────────────── */
// GET /api/ceo/leads/duplicates → {groups:[{key, leads:[...]}]}; merge via
// POST /api/ceo/leads/merge {keepId, mergeIds[]} behind a confirm — merged
// rows are hard-deleted, their deals/viewings/notes move to the kept lead.

type DupLead = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  broker: string | null;
  status: string;
  createdAt: string;
};

type DupGroup = { key: string; leads: DupLead[] };

function DuplicateGroupsPanel() {
  const styles = useStyles();
  const { t, align } = useI18n();
  const mutation = useMutation();
  const [keepByGroup, setKeepByGroup] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, error, loading, refresh } = useApi<{ groups?: DupGroup[] }>(
    '/api/ceo/leads/duplicates',
  );
  const groups = data?.groups ?? [];

  function merge(group: DupGroup) {
    const keepId = keepByGroup[group.key] ?? group.leads[0]?.id;
    if (!keepId) return;
    const mergeIds = group.leads.map((lead) => lead.id).filter((id) => id !== keepId);
    if (mergeIds.length === 0) {
      setProblem(t('ceoPpl.dup.pickKeep'));
      return;
    }
    Alert.alert(t('ceoPpl.dup.mergeTitle'), t('ceoPpl.dup.mergeBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusyKey(group.key);
            setProblem(null);
            setNotice(null);
            try {
              await mutation.run('/api/ceo/leads/merge', 'POST', { keepId, mergeIds });
              setNotice(t('ceoPpl.dup.merged'));
              setKeepByGroup((prev) => {
                const next = { ...prev };
                delete next[group.key];
                return next;
              });
              refresh();
            } catch (e) {
              setProblem(e instanceof Error ? e.message : t('common.error'));
            } finally {
              setBusyKey(null);
            }
          })();
        },
      },
    ]);
  }

  return (
    <>
      <SectionTitle>{t('ceoPpl.dup.title')}</SectionTitle>
      <Text style={[styles.hint, align]}>{t('ceoPpl.dup.hint')}</Text>
      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}
      {problem ? <ErrorBar message={problem} /> : null}
      {notice ? <Text style={[styles.notice, align]}>{`${notice} ✓`}</Text> : null}
      {loading ? (
        <Loading label={t('common.loading')} />
      ) : !error && groups.length === 0 ? (
        <Empty title={t('ceoPpl.dup.none')} message={t('ceoPpl.dup.noneHint')} />
      ) : (
        groups.map((group) => {
          const keepId = keepByGroup[group.key] ?? group.leads[0]?.id ?? '';
          const busy = busyKey === group.key;
          return (
            <Card key={group.key} style={styles.card}>
              <Text style={[styles.prefLabel, align]}>{`${t('ceoPpl.dup.title')}: ${group.key}`}</Text>
              {group.leads.map((lead) => {
                const kept = keepId === lead.id;
                return (
                  <Pressable
                    key={lead.id}
                    onPress={() => setKeepByGroup((prev) => ({ ...prev, [group.key]: lead.id }))}
                    style={[styles.pickRow, kept && styles.pickRowOn]}>
                    <View style={styles.leadMain}>
                      <Text style={[styles.leadName, align]} numberOfLines={1}>
                        {lead.name}
                      </Text>
                      <Text style={[styles.leadSub, align]} numberOfLines={1}>
                        {[lead.phone, lead.email, humanise(lead.status), formatDate(lead.createdAt)]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                    <Badge tone={kept ? 'gold' : 'muted'}>
                      {kept ? `✓ ${t('ceoPpl.dup.keep')}` : t('ceoPpl.dup.keep')}
                    </Badge>
                  </Pressable>
                );
              })}
              <Btn
                title={t('ceoPpl.dup.mergeBtn')}
                variant="danger"
                busy={busy || mutation.busy}
                onPress={() => merge(group)}
              />
            </Card>
          );
        })
      )}
    </>
  );
}

/* ─── Add lead — POST /api/ceo/leads ─────────────────────────────────── */

type ProjectOpt = { id: string; name: string };
type DeveloperOpt = { id: string; companyName: string };
type UnitOpt = { id: string; name: string; projectId?: string };

type CreateLeadResult = {
  lead?: { id: string; leadCode: string | null } | null;
  duplicate?: boolean;
  sameBroker?: boolean;
  claimed?: boolean;
  message?: string;
};

function Sheet({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const styles = useStyles();
  const { row, align } = useI18n();
  const { t: theme } = useTheme();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            <View style={[styles.sheetHead, row]}>
              <View style={styles.sheetTitles}>
                <Text style={[styles.sheetTitle, align]}>{title}</Text>
                {subtitle ? <Text style={[styles.sheetSubtitle, align]}>{subtitle}</Text> : null}
              </View>
              <Pressable onPress={onClose} hitSlop={8} accessibilityLabel={title}>
                <Ionicons name="close" size={20} color={theme.mutedForeground} />
              </Pressable>
            </View>
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * The CEO add-lead form: name/phone required, source chips plus a custom
 * label, broker/project/unit/developer pickers, budgets, status, a
 * log-only priority and the assignment reason. Writes through
 * `POST /api/ceo/leads` and surfaces the server's duplicate/claimed
 * outcomes instead of treating them as errors.
 */
function AddLeadSheet({
  brokers,
  onClose,
  onDone,
}: {
  brokers: Broker[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const styles = useStyles();
  const { t, row, align } = useI18n();
  const mutation = useMutation();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [source, setSource] = useState<string>('WEBSITE');
  const [customSource, setCustomSource] = useState('');
  const [brokerId, setBrokerId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [developerId, setDeveloperId] = useState('');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [status, setStatus] = useState('NEW');
  const [priority, setPriority] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: projectData } = useApi<{ projects?: ProjectOpt[] }>('/api/projects?limit=100');
  const { data: developerData } = useApi<{ developers?: DeveloperOpt[] }>('/api/ceo/developers');
  const { data: unitData } = useApi<{ units?: UnitOpt[] }>(
    projectId ? `/api/ceo/units?projectId=${encodeURIComponent(projectId)}` : null,
  );

  const projects = projectData?.projects ?? [];
  const developers = developerData?.developers ?? [];
  const units = unitData?.units ?? [];
  const usingCustomSource = customSource.trim().length > 0;

  function validate(): MessageKey | null {
    if (name.trim().length < 2 || name.trim().length > 100) return 'ceoPpl.add.nameRequired';
    const p = phone.trim();
    if (!p) return 'ceoPpl.add.phoneRequired';
    if (p.length > 30 || !PHONE_RE.test(p)) return 'ceoPpl.add.phoneInvalid';
    const em = email.trim();
    if (em && !EMAIL_RE.test(em.slice(0, 254))) return 'ceoPpl.add.emailInvalid';
    for (const raw of [budgetMin.trim(), budgetMax.trim()]) {
      if (!raw) continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000_000) return 'ceoPpl.add.budgetInvalid';
    }
    return null;
  }

  async function submit() {
    const bad = validate();
    if (bad) {
      setFormError(t(bad));
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const src = usingCustomSource ? customSource.trim().slice(0, 40) : source;
      const body: Record<string, unknown> = {
        name: name.trim(),
        phone: phone.trim(),
        source: src,
        status,
      };
      const em = email.trim();
      if (em) body.email = em;
      if (brokerId) body.brokerId = brokerId;
      if (projectId) body.projectId = projectId;
      if (unitId) body.unitId = unitId;
      if (developerId) body.developerId = developerId;
      if (budgetMin.trim()) body.budgetMin = Number(budgetMin.trim());
      if (budgetMax.trim()) body.budgetMax = Number(budgetMax.trim());
      if (priority !== null) body.priority = priority;
      if (reason.trim()) body.reason = reason.trim();
      if (notes.trim()) body.notes = notes.trim();
      const res = (await mutation.run('/api/ceo/leads', 'POST', body)) as CreateLeadResult;
      const code = res?.lead?.leadCode ? ` — ${res.lead.leadCode}` : '';
      if (res?.duplicate && res?.sameBroker) onDone(`${t('ceoPpl.add.duplicateSame')}${code}`);
      else if (res?.claimed) onDone(`${t('ceoPpl.add.claimed')}${code}`);
      else if (res?.duplicate) onDone(`${t('ceoPpl.add.duplicateReview')}${code}`);
      else onDone(`${t('ceoPpl.add.created')}${code}`);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet title={t('ceoPpl.add.title')} onClose={onClose}>
      <Field label={t('ceoPpl.add.name')} value={name} onChangeText={setName} autoCapitalize="words" />
      <Field
        label={t('ceoPpl.add.phone')}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoCapitalize="none"
      />
      <Field
        label={t('ceoPpl.add.email')}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <Text style={[styles.groupLabel, align]}>{t('ceoPpl.add.source')}</Text>
      <View style={[styles.chipRow, row]}>
        {SOURCE_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            label={t(option.labelKey)}
            selected={!usingCustomSource && source === option.value}
            onPress={() => {
              setSource(option.value);
              setCustomSource('');
            }}
          />
        ))}
      </View>
      <Field
        value={customSource}
        onChangeText={setCustomSource}
        placeholder={t('ceoPpl.add.customSource')}
        maxLength={40}
        autoCapitalize="none"
      />

      <Text style={[styles.groupLabel, align]}>{t('ceoPpl.add.broker')}</Text>
      <View style={[styles.chipRow, row]}>
        <Chip
          label={t('ceoPpl.add.noBroker')}
          selected={!brokerId}
          onPress={() => setBrokerId('')}
        />
        {brokers.map((broker) => (
          <Chip
            key={broker.id}
            label={broker.user.name || broker.user.email || broker.id}
            selected={brokerId === broker.id}
            onPress={() => setBrokerId(brokerId === broker.id ? '' : broker.id)}
          />
        ))}
      </View>

      <Text style={[styles.groupLabel, align]}>{t('ceoPpl.add.project')}</Text>
      <View style={[styles.chipRow, row]}>
        <Chip
          label={t('ceoPpl.add.noProject')}
          selected={!projectId}
          onPress={() => {
            setProjectId('');
            setUnitId('');
          }}
        />
        {projects.map((project) => (
          <Chip
            key={project.id}
            label={project.name}
            selected={projectId === project.id}
            onPress={() => {
              setProjectId(projectId === project.id ? '' : project.id);
              setUnitId('');
            }}
          />
        ))}
      </View>

      {projectId ? (
        <>
          <Text style={[styles.groupLabel, align]}>{t('ceoPpl.add.unit')}</Text>
          <View style={[styles.chipRow, row]}>
            <Chip
              label={t('ceoPpl.add.noUnit')}
              selected={!unitId}
              onPress={() => setUnitId('')}
            />
            {units.map((unit) => (
              <Chip
                key={unit.id}
                label={unit.name}
                selected={unitId === unit.id}
                onPress={() => setUnitId(unitId === unit.id ? '' : unit.id)}
              />
            ))}
          </View>
        </>
      ) : null}

      <Text style={[styles.groupLabel, align]}>{t('ceoPpl.add.developer')}</Text>
      <View style={[styles.chipRow, row]}>
        <Chip
          label={t('ceoPpl.add.noDeveloper')}
          selected={!developerId}
          onPress={() => setDeveloperId('')}
        />
        {developers.map((developer) => (
          <Chip
            key={developer.id}
            label={developer.companyName}
            selected={developerId === developer.id}
            onPress={() => setDeveloperId(developerId === developer.id ? '' : developer.id)}
          />
        ))}
      </View>

      <Field
        label={t('ceoPpl.add.budgetMin')}
        value={budgetMin}
        onChangeText={setBudgetMin}
        keyboardType="decimal-pad"
      />
      <Field
        label={t('ceoPpl.add.budgetMax')}
        value={budgetMax}
        onChangeText={setBudgetMax}
        keyboardType="decimal-pad"
      />

      <Text style={[styles.groupLabel, align]}>{t('common.status')}</Text>
      <View style={[styles.chipRow, row]}>
        {STATUS_CHOICES.map((value) => (
          <Chip
            key={value}
            label={humanise(value)}
            selected={status === value}
            onPress={() => setStatus(value)}
          />
        ))}
      </View>

      <Text style={[styles.groupLabel, align]}>{t('ceoPpl.add.priority')}</Text>
      <Text style={[styles.hint, align]}>{t('ceoPpl.add.priorityNote')}</Text>
      <View style={[styles.chipRow, row]}>
        {[0, 1, 2, 3, 4, 5].map((value) => (
          <Chip
            key={value}
            label={String(value)}
            selected={priority === value}
            onPress={() => setPriority(priority === value ? null : value)}
          />
        ))}
      </View>

      <Field label={t('ceoPpl.add.reason')} value={reason} onChangeText={setReason} />
      <Field
        label={t('ceoPpl.add.notes')}
        value={notes}
        onChangeText={setNotes}
        multiline
        placeholder={t('ceoPpl.lead.notesPlaceholder')}
      />

      {formError ? <ErrorBar message={formError} /> : null}
      <Btn
        title={t('ceoPpl.add.submit')}
        busy={saving || mutation.busy}
        onPress={() => void submit()}
      />
      <Btn title={t('common.cancel')} variant="ghost" onPress={onClose} />
    </Sheet>
  );
}

/** Label/value line used by the expanded lead detail block. */
function Detail({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  const styles = useStyles();
  const { row, align } = useI18n();
  return (
    <View style={[styles.detailRow, row]}>
      <Text style={[styles.detailLabel, align]}>{label}</Text>
      <Text style={[styles.detailValue, danger && styles.detailDanger, align]}>{value}</Text>
    </View>
  );
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    kpis: { justifyContent: 'space-around', paddingVertical: Spacing.md },
    filters: { flexWrap: 'wrap', gap: 8 },
    count: { color: t.mutedForeground, fontSize: 13 },
    notice: { color: t.successFg, fontSize: 14, fontWeight: '700' },
    card: { gap: 0, marginTop: Spacing.xs },
    badges: { flexWrap: 'wrap', gap: 6 },
    editor: { gap: 8, marginTop: 8 },
    sectionLabel: {
      color: t.primary,
      fontSize: 14,
      fontWeight: '700',
      marginTop: 4,
    },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    detailLabel: { color: t.mutedForeground, fontSize: 14, flexShrink: 1 },
    detailValue: { color: t.foreground, fontSize: 14, flexShrink: 1 },
    detailDanger: { color: t.dangerFg },
    protection: { flexWrap: 'wrap', gap: 8 },
    meta: { color: t.mutedForeground, fontSize: 12 },
    prefBlock: { gap: 6 },
    prefLabel: { color: t.mutedForeground, fontSize: 12, fontWeight: '600' },
    chipRow: { flexWrap: 'wrap', gap: 8 },
    notesBlock: { gap: 8 },
    notes: { color: t.mutedForeground, fontSize: 14, lineHeight: 20 },
    activityBlock: { gap: 6, marginTop: 4 },
    activity: { alignItems: 'flex-start', gap: 8 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: t.primary, marginTop: 7 },
    activityMain: { flex: 1, gap: 2 },
    activityType: { color: t.foreground, fontSize: 13, lineHeight: 18 },

    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 12,
    },
    sheet: {
      width: '100%',
      maxWidth: 480,
      maxHeight: '92%',
      backgroundColor: t.popover,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: Radius.xl,
      overflow: 'hidden',
    },
    sheetBody: { padding: 16, gap: 8 },
    sheetHead: { alignItems: 'flex-start', gap: 8, justifyContent: 'space-between' },
    sheetTitles: { flex: 1, gap: 2 },
    sheetTitle: { color: t.foreground, fontSize: 17, lineHeight: 24, fontWeight: '700' },
    sheetSubtitle: { color: t.mutedForeground, fontSize: 13, lineHeight: 18 },
    groupLabel: { color: t.mutedForeground, fontSize: 13, fontWeight: '600', marginTop: 4 },
    hint: { color: t.mutedForeground, fontSize: 13, lineHeight: 18 },
    pickRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 8,
      padding: 10,
    },
    pickRowOn: { borderColor: t.primary, backgroundColor: t.muted },
    leadMain: { flex: 1, gap: 2 },
    leadName: { color: t.foreground, fontSize: 15, fontWeight: '600' },
    leadSub: { color: t.mutedForeground, fontSize: 12, lineHeight: 16 },
  }),
);
